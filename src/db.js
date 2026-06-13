// ─── Almacenamiento local por scope (localStorage + IndexedDB) ────────────────
// El navegador es la copia de trabajo: rápida y disponible sin internet.
// Extraído de App.jsx para aislar la capa de persistencia y poder probarla.
//
// El "scope" decide de quién es la memoria y el historial:
//   • Empresa (Clerk Organization) activa → `org_<idEmpresa>`: todo el equipo
//     comparte memoria.
//   • Sin empresa → la cuenta del usuario: memoria personal.
// Las claves de localStorage y la base de IndexedDB llevan ese scope, así dos
// equipos/usuarios en el mismo navegador no comparten datos.

// ─── Storage shim (localStorage) ────────────────────────────────────────────
export const storage = {
  async get(key) {
    const v = localStorage.getItem(key);
    return v == null ? null : { key, value: v };
  },
  async set(key, value) { localStorage.setItem(key, value); return { key, value }; },
};

let SCOPE = "anon";
export function setScope(id) { SCOPE = id || "anon"; }

// Claves de localStorage (dependen del usuario activo).
export const kbKey        = () => `cotizador_kb_${SCOPE}`;
export const kbBackupKey  = () => `cotizador_kb_${SCOPE}_backup`;
export const sessionKey   = () => `cotizador_sesion_${SCOPE}`;
export const backupTsKey  = () => `cotizador_kb_backup_ts_${SCOPE}`;
export const tombsKey     = () => `cotizador_kb_tombs_${SCOPE}`; // borrados pendientes de subir (☁)
export const migratedKey  = () => `cotizador_migrado_${SCOPE}`;  // bandera de migración única

// Claves antiguas (globales, antes de tener cuentas) — solo para migrar una vez.
export const OLD_KB_KEY = "cotizador_kb_legacy_v1";
export const OLD_SESSION_KEY = "cotizador_sesion_v1";
const OLD_IDB_NAME = "cotizador_sesion";

// IndexedDB: una base de datos por usuario. Los nombres de los almacenes (store)
// son los mismos dentro de cada base.
const IDB_STORE = "archivo";
const IDB_KEY = "actual";
const HIST_META = "historial";       // { id, fileName, ts, total, answered, pending }
const HIST_DATA = "historial_data";  // { id, sheets, bytes }

function idbDbName() { return `cotizador_${SCOPE}`; }

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(idbDbName(), 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(HIST_META)) db.createObjectStore(HIST_META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(HIST_DATA)) db.createObjectStore(HIST_DATA, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function idbSet(value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, IDB_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function idbGet() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const r = tx.objectStore(IDB_STORE).get(IDB_KEY);
    r.onsuccess = () => { db.close(); resolve(r.result || null); };
    r.onerror = () => { db.close(); reject(r.error); };
  });
}
export async function idbClear() {
  try {
    const db = await idbOpen();
    await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch { /* sin IndexedDB */ }
}

// ─── Historial de archivos ──────────────────────────────────────────────────
export async function histSave(entry) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([HIST_META, HIST_DATA], "readwrite");
    tx.objectStore(HIST_META).put({
      id: entry.id, fileName: entry.fileName, ts: entry.ts,
      total: entry.total, answered: entry.answered, pending: entry.pending,
      // Estadísticas para el panel de resultados (ROI). Los archivos guardados
      // antes de esta versión no las traen: el panel las aproxima.
      auto: entry.auto ?? null, ia: entry.ia ?? null,
      review: entry.review ?? null, savedMin: entry.savedMin ?? null,
    });
    tx.objectStore(HIST_DATA).put({ id: entry.id, sheets: entry.sheets, bytes: entry.bytes || null });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function histList() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIST_META, "readonly");
    const r = tx.objectStore(HIST_META).getAll();
    r.onsuccess = () => { db.close(); resolve(r.result || []); };
    r.onerror = () => { db.close(); reject(r.error); };
  });
}
export async function histGet(id) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIST_DATA, "readonly");
    const r = tx.objectStore(HIST_DATA).get(id);
    r.onsuccess = () => { db.close(); resolve(r.result || null); };
    r.onerror = () => { db.close(); reject(r.error); };
  });
}
export async function histDelete(id) {
  const db = await idbOpen();
  return new Promise((resolve) => {
    const tx = db.transaction([HIST_META, HIST_DATA], "readwrite");
    tx.objectStore(HIST_META).delete(id);
    tx.objectStore(HIST_DATA).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}

// Copia (una sola vez) la base de datos global antigua a la del usuario actual:
// el archivo de sesión y todo el historial. No borra la antigua.
export async function migrateOldIdb() {
  const oldDb = await new Promise((resolve) => {
    const req = indexedDB.open(OLD_IDB_NAME, 2);
    req.onupgradeneeded = () => { try { req.transaction.abort(); } catch { /* no existía */ } }; // no crear si no existía
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  }).catch(() => null);
  if (!oldDb) return;
  const has = (n) => oldDb.objectStoreNames.contains(n);
  try {
    // Sesión (archivo actual)
    if (has(IDB_STORE)) {
      const rec = await new Promise((res) => {
        const tx = oldDb.transaction(IDB_STORE, "readonly");
        const r = tx.objectStore(IDB_STORE).get(IDB_KEY);
        r.onsuccess = () => res(r.result || null); r.onerror = () => res(null);
      });
      if (rec) await idbSet(rec);
    }
    // Historial
    if (has(HIST_META) && has(HIST_DATA)) {
      const metas = await new Promise((res) => {
        const tx = oldDb.transaction(HIST_META, "readonly");
        const r = tx.objectStore(HIST_META).getAll();
        r.onsuccess = () => res(r.result || []); r.onerror = () => res([]);
      });
      for (const m of metas) {
        const d = await new Promise((res) => {
          const tx = oldDb.transaction(HIST_DATA, "readonly");
          const r = tx.objectStore(HIST_DATA).get(m.id);
          r.onsuccess = () => res(r.result || null); r.onerror = () => res(null);
        });
        await histSave({ ...m, sheets: d && d.sheets ? d.sheets : null, bytes: d && d.bytes ? d.bytes : null });
      }
    }
  } finally {
    oldDb.close();
  }
}
