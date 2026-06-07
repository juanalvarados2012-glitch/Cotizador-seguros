import { useState, useRef, useEffect, useCallback, Fragment } from "react";
import { UserButton, OrganizationSwitcher, useUser, useOrganization } from "@clerk/clerk-react";
import { STR, detectLang, saveLang } from "./i18n";

// xlsx se carga bajo demanda (code-splitting) para aligerar la carga inicial.
let _xlsx = null;
async function getXLSX() {
  if (!_xlsx) _xlsx = await import("xlsx");
  return _xlsx;
}

// Descarga un objeto como archivo JSON (para respaldo de memoria).
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
// ─── Storage shim (localStorage) ────────────────────────────────────────────
const storage = {
  async get(key) {
    const v = localStorage.getItem(key);
    return v == null ? null : { key, value: v };
  },
  async set(key, value) { localStorage.setItem(key, value); return { key, value }; },
};

// ─── Almacenamiento por empresa o por usuario (scope) ───────────────────────
// El "scope" decide de quién es la memoria y el historial:
//   • Si el usuario pertenece a una EMPRESA (Clerk Organization) activa, el
//     scope es `org_<idEmpresa>`: TODO el equipo de esa agencia comparte la
//     misma memoria. Lo que aprende uno, lo aprovechan todos.
//   • Si no hay empresa activa (uso individual), el scope es la cuenta del
//     usuario: cada persona tiene su propia memoria (comportamiento de siempre).
// Las claves de localStorage y la base de IndexedDB llevan ese scope, así dos
// equipos/usuarios en el mismo navegador no comparten datos.
let SCOPE = "anon";
function setScope(id) { SCOPE = id || "anon"; }

// Claves de localStorage (dependen del usuario activo).
const kbKey        = () => `cotizador_kb_${SCOPE}`;
const kbBackupKey  = () => `cotizador_kb_${SCOPE}_backup`;
const sessionKey   = () => `cotizador_sesion_${SCOPE}`;
const backupTsKey  = () => `cotizador_kb_backup_ts_${SCOPE}`;

// Claves antiguas (globales, antes de tener cuentas) — solo para migrar una vez.
const OLD_KB_KEY = "cotizador_kb_legacy_v1";
const OLD_SESSION_KEY = "cotizador_sesion_v1";
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
async function idbSet(value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, IDB_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function idbGet() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const r = tx.objectStore(IDB_STORE).get(IDB_KEY);
    r.onsuccess = () => { db.close(); resolve(r.result || null); };
    r.onerror = () => { db.close(); reject(r.error); };
  });
}
async function idbClear() {
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
async function histSave(entry) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([HIST_META, HIST_DATA], "readwrite");
    tx.objectStore(HIST_META).put({
      id: entry.id, fileName: entry.fileName, ts: entry.ts,
      total: entry.total, answered: entry.answered, pending: entry.pending,
    });
    tx.objectStore(HIST_DATA).put({ id: entry.id, sheets: entry.sheets, bytes: entry.bytes || null });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function histList() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIST_META, "readonly");
    const r = tx.objectStore(HIST_META).getAll();
    r.onsuccess = () => { db.close(); resolve(r.result || []); };
    r.onerror = () => { db.close(); reject(r.error); };
  });
}
async function histGet(id) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIST_DATA, "readonly");
    const r = tx.objectStore(HIST_DATA).get(id);
    r.onsuccess = () => { db.close(); resolve(r.result || null); };
    r.onerror = () => { db.close(); reject(r.error); };
  });
}
async function histDelete(id) {
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
async function migrateOldIdb() {
  if (!indexedDB.databases) {
    // Algunos navegadores no listan bases; intentamos abrir la antigua igual.
  }
  const oldDb = await new Promise((resolve) => {
    const req = indexedDB.open(OLD_IDB_NAME, 2);
    req.onupgradeneeded = () => { try { req.transaction.abort(); } catch {} }; // no crear si no existía
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

// ¿La respuesta conviene que un humano la revise? (baja confianza, REVISAR, match flojo)
function needsReview(c) {
  if (!c || !c.respuesta) return false;
  const r = normalize(c.respuesta);
  if (r.includes("revisar")) return true;
  if (c.tipo === "IA" && c.confianza === "baja") return true;
  if (c.tipo === "Similar" && typeof c.score === "number" && c.score < 0.7) return true;
  return false;
}


// ─── BASE DE CONOCIMIENTO SEMILLA (genérica de ramos generales) ───────────────
// Base ILUSTRATIVA con coberturas estándar del mercado y respuestas neutras, solo
// para que la app funcione en la demo. NO contiene el criterio de ninguna
// aseguradora en particular: cada cliente afina su propio criterio durante el uso
// (la memoria aprende de sus correcciones). Las respuestas reales —límites,
// deducibles, exclusiones— las define el suscriptor de cada compañía.
const SEED_KB = [
  { cobertura: "Incendio y/o rayo y/o humo", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "HMACC AMIT Huelga Motín Asonada Conmoción Civil Actos Malintencionados de Terceros", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Terremoto tsunami temblor erupción volcánica maremoto convulsión de la naturaleza", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Tifón huracán tornado ciclón granizada perturbación atmosférica", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Lluvia e Inundación", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Explosión", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Daños por agua", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Colapso", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Desprendimiento de tierra o rocas alud", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Daños por fuego subterráneo", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Choque con un vehículo terrestre o animal", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Contaminación de producto", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Todo riesgo de rotura de maquinaria", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Lucro cesante por interrupción del negocio incendio", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Robo y/o Asalto a primer riesgo absoluto", respuesta: "Cubierto a primer riesgo (límite a definir)" },
  { cobertura: "Remoción de escombros", respuesta: "Cubierto (sublímite a definir)" },
  { cobertura: "Honorarios de Profesionales gastos de viaje y estadía", respuesta: "Cubierto (sublímite a definir)" },
  { cobertura: "Documentos y modelos", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Rotura de vidrios y cristales", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Gastos de extinción de incendio", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Gastos para aminorar la pérdida", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Terrorismo y Sabotaje", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Combustión espontánea", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Arrendamientos alquiler", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Extintores y Otros Medios de Extinción", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Refrigeración", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Suspensión de los servicios de energía eléctrica agua o gas", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Hurto excepto Mercaderías y Dinero", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Gastos por Anulación y Duplicación de Documentos", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Saqueo", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Ajustadores", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Cláusula de Cobertura de Alteraciones y Reparaciones", respuesta: "Cubierto (sublímite a definir)" },
  { cobertura: "Amparo automático nuevos predios propiedades y activos", respuesta: "Cubierto (plazo y límite a definir)" },
  { cobertura: "Autoridad civil", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Avisos y letreros", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Bienes a la intemperie", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Bienes del asegurado bajo responsabilidad de terceros", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Equipos móviles y portátiles", respuesta: "Cubierto mediante endoso (a definir)" },
  { cobertura: "Obras civiles en curso", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Propiedad Horizontal", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Reposición o reemplazo ramos técnicos", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Restitución Automática del Valor Asegurado", respuesta: "Sujeto a evaluación del suscriptor" },
  { cobertura: "Salvamento", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Equipo Electrónico Todo riesgo", respuesta: "Cubierto según condiciones generales de la póliza" },
  { cobertura: "Responsabilidad Civil frente a terceros", respuesta: "Cubierto (límite a definir)" },
  { cobertura: "Transporte de mercadería", respuesta: "Sujeto a evaluación del suscriptor" },
  // Deducibles (genéricos: el valor real lo define cada aseguradora)
  { cobertura: "Deducible terremoto lluvia inundación colapso eventos naturaleza", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible otros eventos caída accidental", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible vidrios", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible robo asalto", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible hurto", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible rotura de maquinaria", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible equipo electrónico", respuesta: "Según tabla de deducibles de la póliza" },
  { cobertura: "Deducible responsabilidad civil", respuesta: "Según tabla de deducibles de la póliza" },
].map(k => ({ ...k, count: 1 }));

// ─── Colores ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#0B0F1A", surface: "#131929", border: "#1E2D45", accent: "#1A6FD8",
  accentLight: "#3A8EF8", gold: "#C4975A", green: "#2ECC71", red: "#E74C3C",
  yellow: "#F39C12", text: "#E8EDF5", muted: "#6B7FA0", card: "#0E1828",
};

// ─── Normalización + matching ──────────────────────────────────────────────────
const STOP = new Set(["de","la","el","los","las","y","o","del","en","por","para","un","una","a","con","que","se","su","al","como","es","si","no","aplicable","suma","asegurable","requerida","clausula","cláusula","opcional"]);

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokens(s) {
  return normalize(s).split(" ").filter(w => w.length > 2 && !STOP.has(w));
}
function jaccard(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}
// Devuelve {respuesta, score, tipo} o null
// Combina Jaccard con un score de "contención": el texto del broker suele ser
// más largo que la clave en memoria, y Jaccard lo penaliza injustamente. La
// contención mide qué fracción de la clave aparece en el texto, lo que autollena
// muchas más coberturas. Las coincidencias flojas (0.5–0.7) quedan marcadas
// como "por revisar" para que un humano las confirme.
function matchKB(texto, kb) {
  const nTexto = normalize(texto);
  const tSet = new Set(tokens(texto));
  let best = null;
  for (const k of kb) {
    const nK = normalize(k.cobertura);
    if (nK === nTexto) return { respuesta: k.respuesta, score: 1, tipo: "Exacta" };
    const kSet = new Set(tokens(k.cobertura));
    if (kSet.size === 0 || tSet.size === 0) continue;
    let inter = 0;
    kSet.forEach(x => { if (tSet.has(x)) inter++; });
    const jac = inter / (kSet.size + tSet.size - inter);   // similitud simétrica
    const cont = inter / kSet.size;                          // cuánto de la clave está en el texto
    const subset = kSet.size <= 6 && inter === kSet.size;    // clave corta totalmente contenida
    let eff = Math.max(jac, cont * 0.9);
    if (subset) eff = Math.max(eff, 0.8);
    if (!best || eff > best.score) best = { respuesta: k.respuesta, score: eff, tipo: eff >= 0.85 ? "Exacta" : "Similar" };
  }
  if (best && best.score >= 0.5) return best;
  return null;
}

// ─── Detectar columna de respuesta en una hoja ─────────────────────────────────
function findResponseCol(data, coverageCol) {
  // Busca en las primeras 6 filas un encabezado tipo COTIZACIÓN / CÓNDOR / RESPUESTA
  for (let r = 0; r < Math.min(8, data.length); r++) {
    const row = data[r] || [];
    for (let c = row.length - 1; c >= 0; c--) {
      const v = normalize(row[c]);
      if (c > coverageCol && /(cotizacion|respuesta|oferta|aseguradora)/.test(v)) return c;
    }
  }
  // fallback: una columna a la derecha del bloque de coberturas
  let maxCol = coverageCol;
  data.forEach(row => { if (row.length - 1 > maxCol) maxCol = row.length - 1; });
  return Math.max(coverageCol + 1, maxCol);
}

// ─── Extraer coberturas del workbook ───────────────────────────────────────────
const RELEVANT = ["multirriesgo","multiriesgo","deducible","dinero","valores","equipo","maquinaria",
  "vehiculo","vehículo","veh ","responsabilidad","transporte","garantia","garantía","incendio","robo"];

function extractCoverages(wb, kb, XLSX) {
  const results = {};
  for (const sheetName of wb.SheetNames) {
    const clean = normalize(sheetName);
    if (!RELEVANT.some(r => clean.includes(normalize(r)))) continue;
    // saltar hojas de listados/inventarios
    if (clean.includes("listado") || clean.includes("list ") || clean.startsWith("list")) continue;

    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (data.length === 0) continue;

    const coverages = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      // columna de cobertura = primera celda con texto descriptivo
      let covCol = -1, texto = "";
      for (let j = 0; j <= 2 && j < row.length; j++) {
        const val = String(row[j]).trim();
        if (val.length > 7 && /[a-záéíóúñ]/i.test(val) &&
          !/^(nan|cotizacion|coberturas|condiciones base|presentacion|aseguradora|aseguradob|ramo|total|valor asegurado)/i.test(normalize(val)) &&
          !/^\d+$/.test(val)) {
          covCol = j; texto = val; break;
        }
      }
      if (covCol === -1) continue;

      const respCol = findResponseCol(data, covCol);
      const match = matchKB(texto, kb);
      coverages.push({
        fila: i, covCol, respCol,
        texto,
        respuesta: match ? match.respuesta : "",
        tipo: match ? match.tipo : "Pendiente",
        score: match ? match.score : 0,
        editado: false,
      });
    }
    if (coverages.length > 0) results[sheetName] = { coverages, respCol: coverages[0].respCol };
  }
  return results;
}

// ─── Archivo base (key): construir memoria desde un archivo ya respondido ──────
// Recorre TODAS las hojas y extrae pares "cobertura → respuesta" de las filas que
// YA traen una respuesta escrita. Detección flexible: el usuario puede subir un
// archivo de pares pregunta/respuesta o una cotización vieja completa, y la app
// localiza sola la columna de respuestas. Devuelve un arreglo tipo KB.
function kbFromWorkbook(wb, XLSX) {
  const pairs = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (data.length === 0) continue;
    for (let i = 0; i < data.length; i++) {
      const row = data[i] || [];
      // columna de cobertura = primera celda con texto descriptivo
      let covCol = -1, texto = "";
      for (let j = 0; j <= 2 && j < row.length; j++) {
        const val = String(row[j]).trim();
        if (val.length > 7 && /[a-záéíóúñ]/i.test(val) &&
          !/^(nan|cotizacion|coberturas|condiciones base|presentacion|aseguradora|aseguradob|ramo|total|valor asegurado)/i.test(normalize(val)) &&
          !/^\d+$/.test(val)) { covCol = j; texto = val; break; }
      }
      if (covCol === -1) continue;
      const respCol = findResponseCol(data, covCol);
      const resp = String(row[respCol] != null ? row[respCol] : "").trim();
      // solo sirve si la fila YA tiene una respuesta distinta a la cobertura
      if (!resp || respCol === covCol) continue;
      if (normalize(resp) === normalize(texto)) continue;
      if (resp.length > 160) continue; // descarta párrafos largos (no son respuestas)
      pairs.push({ cobertura: texto, respuesta: resp, count: 1 });
    }
  }
  // dedup por cobertura normalizada (gana la última aparición)
  const map = new Map();
  for (const p of pairs) map.set(normalize(p.cobertura), p);
  return [...map.values()];
}

// ─── IA solo para pendientes (vía proxy serverless /api/quote) ──────────────────
// La API key vive en el servidor (Groq), nunca en el navegador.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Selecciona los ejemplos de memoria más parecidos al lote (menos tokens por llamada).
function relevantKB(items, kb, max = 12) {
  const itemTokens = new Set(items.flatMap(it => tokens(it.texto)));
  if (itemTokens.size === 0 || kb.length <= max) return kb.slice(0, max);
  return kb
    .map(k => {
      const kt = tokens(k.cobertura);
      let overlap = 0;
      for (const t of kt) if (itemTokens.has(t)) overlap++;
      return { k, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, max)
    .map(s => s.k);
}

async function callAI(pendientes, hoja, kb, instrucciones = "") {
  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000); // 30s de timeout por lote
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          hoja,
          instrucciones: (instrucciones || "").slice(0, 1200),
          pendientes: pendientes.map(p => ({ texto: p.texto })),
          kb: kb.slice(0, 15).map(k => ({ cobertura: k.cobertura, respuesta: k.respuesta })),
        }),
      });

      // 429 = límite de velocidad de Groq → espera y reintenta
      if (res.status === 429) {
        let retryAfter = 0;
        try { const j = await res.json(); retryAfter = Number(j.retryAfter) || 0; } catch {}
        clearTimeout(timer);
        if (attempt < MAX_RETRIES) {
          const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 20000);
          await sleep(waitMs);
          continue;
        }
        throw new Error("Groq está saturado (429). Espera un momento y vuelve a intentar.");
      }

      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try { const j = await res.json(); msg = j.error || msg; } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      return Array.isArray(data.respuestas) ? data.respuestas : [];
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") throw new Error("La IA tardó demasiado (timeout de 30s).");
      // error de red puntual → reintenta con espera
      if (attempt < MAX_RETRIES && /network|fetch|failed/i.test(e.message || "")) {
        await sleep(Math.min(2000 * 2 ** attempt, 20000));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("No se pudo contactar la IA tras varios intentos.");
}

// ─── Estilos ────────────────────────────────────────────────────────────────────
const F = "'IBM Plex Mono','Courier New',monospace";
const sx = {
  app: {
    minHeight: "100vh", color: C.text, fontFamily: F,
    background: `radial-gradient(900px circle at 12% -8%, rgba(26,111,216,.16), transparent 45%), radial-gradient(760px circle at 96% -2%, rgba(196,151,90,.11), transparent 46%), ${C.bg}`,
    backgroundAttachment: "fixed",
  },
  header: { background: `linear-gradient(135deg,${C.surface},#0A1628)`, borderBottom: `1px solid ${C.border}`, padding: "18px 28px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  logo: { width: 38, height: 38, background: `linear-gradient(135deg,${C.gold},#E8B96A)`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, color: C.bg },
  body: { padding: "24px 28px", maxWidth: 1400, margin: "0 auto" },
  btn: { background: `linear-gradient(135deg,${C.accent},#1555B0)`, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontFamily: F, fontWeight: 600 },
  btnGold: { background: `linear-gradient(135deg,${C.gold},#A8813E)`, color: C.bg, border: "none", borderRadius: 8, padding: "11px 22px", cursor: "pointer", fontSize: 13, fontFamily: F, fontWeight: 700 },
  btnSm: { background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 11px", cursor: "pointer", fontSize: 11, fontFamily: F },
  drop: { border: `2px dashed ${C.border}`, borderRadius: 12, padding: 48, textAlign: "center", cursor: "pointer", background: C.surface },
  card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 },
  th: { background: C.surface, color: C.muted, padding: "9px 11px", textAlign: "left", fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0 },
  td: { padding: "9px 11px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top", lineHeight: 1.55 },
  ta: { background: "#0A1425", border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: 8, fontSize: 12, fontFamily: F, width: "100%", resize: "vertical", minHeight: 54, outline: "none" },
  stat: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "13px 18px", flex: 1, minWidth: 130 },
  statLabel: { fontSize: 10, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase" },
};
function badge(tipo) {
  const map = {
    Exacta: [C.green, "#1A4020", "#0F2614"],
    Similar: [C.accentLight, "#1A4070", "#0D2440"],
    IA: [C.accentLight, "#1A4070", "#0D2440"],
    Manual: [C.gold, "#4A3A1A", "#241B0D"],
    Pendiente: [C.yellow, "#4A3000", "#241800"],
    Aprendida: [C.green, "#1A4020", "#0F2614"],
  };
  const [col, bd, bg] = map[tipo] || [C.muted, C.border, C.surface];
  return { display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: col, border: `1px solid ${bd}`, background: bg };
}

// ─── Componente ─────────────────────────────────────────────────────────────────
export default function AutoCotizador() {
  const { user, isLoaded: userLoaded } = useUser();
  const { organization, membership, isLoaded: orgLoaded } = useOrganization();
  const userId = user?.id || null;
  // Scope = empresa si hay una activa; si no, la cuenta personal del usuario.
  const orgId = organization?.id || null;
  const scopeId = orgId ? `org_${orgId}` : userId;
  const isCompany = !!orgId; // ¿la memoria es compartida por una empresa?
  // Rol dentro de la empresa: solo el admin puede modificar el "cerebro"
  // compartido (vaciar/resetear/importar). En uso personal hay control total.
  const isOrgAdmin = (membership?.role || "").includes("admin");
  const canManageKB = !organization || isOrgAdmin;
  const [lang, setLang] = useState(detectLang);
  const tr = STR[lang]; // textos del idioma activo (ES/EN)
  const L = (es, en) => (lang === "en" ? en : es); // textos nuevos del asistente
  // El Asistente (subir archivo base + instrucciones + llenado automático con IA y
  // memoria) está disponible para TODOS como pantalla de inicio: tanto la página
  // personalizada de Gina como la página normal. El correo de Gina solo cambia el
  // saludo personalizado.
  const userEmail = (user?.primaryEmailAddress?.emailAddress || "").trim().toLowerCase();
  const isGina = userEmail === "galvarado@seguroscondor.com";
  const canUseAssistant = true;     // visible para todos
  const effView = view;
  const toggleLang = useCallback(() => {
    setLang(prev => { const next = prev === "es" ? "en" : "es"; saveLang(next); return next; });
  }, []);
  const [step, setStep] = useState("upload");
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState({});
  const [wb, setWb] = useState(null);
  const [active, setActive] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState(""); // "X de Y coberturas"
  const [dragOver, setDragOver] = useState(false);
  const [kb, setKb] = useState(SEED_KB);
  const [kbReady, setKbReady] = useState(false);
  const [toast, setToast] = useState(null);   // { type: "error|ok|info", msg }
  const [parsing, setParsing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas"); // todas | pendientes | respondidas
  const [showKB, setShowKB] = useState(false);   // panel de memoria
  const [kbSearch, setKbSearch] = useState("");
  const [histSearch, setHistSearch] = useState(""); // buscar en el historial
  const [showHist, setShowHist] = useState(false); // panel de historial
  const [histItems, setHistItems] = useState([]);  // lista de archivos guardados
  const [showPriv, setShowPriv] = useState(false); // panel de privacidad
  const [kbBackupTs, setKbBackupTs] = useState(0);
  const [rowLoading, setRowLoading] = useState(null); // "sName::idx" mientras la IA responde una fila
  const [narrow, setNarrow] = useState(typeof window !== "undefined" && window.innerWidth < 640);
  const kbRef = useRef(SEED_KB);
  const fileRef = useRef();
  const kbFileRef = useRef();
  const backupFileRef = useRef();
  const sessionBytesRef = useRef(null); // bytes del archivo original (para exportar tras recargar)
  // ─── Asistente guiado (archivo base + instrucciones + voz) ──────────────────
  const [view, setView] = useState("asistente");      // "clasico" | "asistente" (inicia en el asistente si está autorizado)
  const [instrucciones, setInstrucciones] = useState(""); // guía libre para la IA
  const [baseFileName, setBaseFileName] = useState("");   // archivo base cargado
  const [baseCount, setBaseCount] = useState(0);          // pares cargados del base
  const [baseLoading, setBaseLoading] = useState(false);
  const [listening, setListening] = useState(false);      // dictado por voz activo
  const instruccionesRef = useRef("");
  const recognitionRef = useRef(null);
  const autoRunRef = useRef(false);   // tras subir archivo nuevo en el asistente, llena solo
  const baseFileRef = useRef();
  const assistFileRef = useRef();

  // Responsive: detecta pantallas angostas
  useEffect(() => {
    const f = () => setNarrow(window.innerWidth < 640);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  // Aviso al salir mientras la IA procesa, para no perder una corrida larga.
  useEffect(() => {
    if (!processing) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [processing]);

  // Toast con auto-cierre
  const notify = useCallback((type, msg, ms = 4500) => {
    setToast({ type, msg });
    if (ms) setTimeout(() => setToast(t => (t && t.msg === msg ? null : t)), ms);
  }, []);

  // Cargar memoria + sesión del USUARIO activo (se re-ejecuta al cambiar de
  // cuenta). La primera vez de cada usuario migra los datos antiguos (globales).
  useEffect(() => {
    if (!userLoaded || !orgLoaded) return;
    setScope(scopeId);
    let cancelled = false;
    (async () => {
      // Reinicia el estado visible antes de cargar el del scope nuevo (al
      // cambiar de cuenta o de empresa se recarga la memoria correspondiente).
      setKbReady(false);
      try {
        // ── Migración única de los datos antiguos (sin cuenta) ──
        // Solo en uso personal: una empresa no hereda datos sueltos de un
        // navegador, arranca con la base de conocimiento semilla.
        const migFlag = `cotizador_migrado_${SCOPE}`;
        if (!orgId && !localStorage.getItem(migFlag)) {
          try {
            const oldKb = localStorage.getItem(OLD_KB_KEY);
            if (oldKb && !localStorage.getItem(kbKey())) localStorage.setItem(kbKey(), oldKb);
            const oldSes = localStorage.getItem(OLD_SESSION_KEY);
            if (oldSes && !localStorage.getItem(sessionKey())) localStorage.setItem(sessionKey(), oldSes);
            await migrateOldIdb().catch(() => {});
          } catch { /* la migración es best-effort */ }
          localStorage.setItem(migFlag, "1");
        }

        // ── Memoria del usuario ──
        const r = await storage.get(kbKey());
        if (!cancelled) {
          if (r && r.value) {
            // La memoria guardada es la fuente de verdad: se usa tal cual, sin
            // volver a mezclar la base semilla. Así, si el usuario la vació o
            // editó, se respeta y no "reviven" las respuestas de la base.
            const stored = JSON.parse(r.value);
            setKb(stored); kbRef.current = stored;
          } else {
            setKb(SEED_KB); kbRef.current = SEED_KB;
            await storage.set(kbKey(), JSON.stringify(SEED_KB));
          }
          try { setKbBackupTs(Number(localStorage.getItem(backupTsKey())) || 0); } catch {}
        }
      } catch { /* primera vez o sin storage */ }
      if (!cancelled) setKbReady(true);

      // ── Recuperar sesión anterior del usuario ──
      try {
        const raw = localStorage.getItem(sessionKey());
        if (raw && !cancelled) {
          const meta = JSON.parse(raw);
          if (meta && meta.sheets && Object.keys(meta.sheets).length > 0) {
            setSheets(meta.sheets);
            setFileName(meta.fileName || "");
            setActive(meta.active || Object.keys(meta.sheets)[0] || null);
            setStep("review");
            const rec = await idbGet().catch(() => null);
            if (rec && rec.bytes && !cancelled) {
              const XLSX = await getXLSX();
              setWb(XLSX.read(rec.bytes, { type: "array", cellStyles: true, cellNF: true }));
              sessionBytesRef.current = rec.bytes;
            }
            notify("info", tr.msgSessionRestored(meta.fileName), 7000);
          }
        }
      } catch { /* no había sesión previa */ }
      if (!cancelled) refreshHist();
    })();
    return () => { cancelled = true; };
  }, [userLoaded, orgLoaded, scopeId, notify, tr]);

  // ── Autoguardado de las respuestas (se dispara al cambiar la sesión) ──────
  useEffect(() => {
    if (step !== "review" || !fileName || Object.keys(sheets).length === 0) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(sessionKey(), JSON.stringify({ fileName, active, sheets, ts: Date.now() }));
      } catch { /* cuota llena: se omite el guardado */ }
    }, 800);
    return () => clearTimeout(t);
  }, [sheets, active, step, fileName]);

  const clearSession = useCallback(() => {
    try { localStorage.removeItem(sessionKey()); } catch {}
    sessionBytesRef.current = null;
    idbClear();
  }, []);

  // ── Historial de archivos completados ────────────────────────────────────
  const refreshHist = useCallback(async () => {
    try {
      const items = await histList();
      items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      setHistItems(items);
    } catch { /* sin historial */ }
  }, []);

  // Guarda (o actualiza) el archivo actual en el historial. id = nombre, para
  // que reprocesar el mismo archivo actualice su entrada en vez de duplicarla.
  const saveToHistory = useCallback(async (snapSheets, snapName) => {
    try {
      const sh = snapSheets || sheets;
      const name = snapName || fileName;
      if (!name || Object.keys(sh).length === 0) return;
      const cov = Object.values(sh).flatMap(s => s.coverages);
      const totalC = cov.length;
      const ans = cov.filter(c => c.respuesta).length;
      let bytes = sessionBytesRef.current;
      if (!bytes) { const rec = await idbGet().catch(() => null); bytes = rec && rec.bytes; }
      await histSave({
        id: name, fileName: name, ts: Date.now(),
        total: totalC, answered: ans, pending: totalC - ans,
        sheets: sh, bytes: bytes || null,
      });
      refreshHist();
    } catch { /* no se pudo guardar en historial */ }
  }, [sheets, fileName, refreshHist]);

  const openFromHistory = useCallback(async (id) => {
    try {
      const data = await histGet(id);
      if (!data || !data.sheets) { notify("error", tr.msgHistOpenError); return; }
      setSheets(data.sheets);
      setFileName(id);
      setActive(Object.keys(data.sheets)[0] || null);
      setSearch(""); setFilter("todas");
      setStep("review");
      setShowHist(false);
      if (data.bytes) {
        sessionBytesRef.current = data.bytes;
        const XLSX = await getXLSX();
        setWb(XLSX.read(data.bytes, { type: "array", cellStyles: true, cellNF: true }));
        idbSet({ fileName: id, bytes: data.bytes, ts: Date.now() }).catch(() => {});
      } else {
        setWb(null);
      }
      notify("ok", tr.msgHistOpened(id));
    } catch (e) {
      notify("error", tr.msgHistOpenFail(e.message));
    }
  }, [notify, tr]);

  const deleteFromHistory = useCallback(async (id) => {
    await histDelete(id).catch(() => {});
    refreshHist();
    notify("info", tr.msgHistRemoved);
  }, [refreshHist, notify, tr]);

  const persistKB = useCallback(async (newKb) => {
    kbRef.current = newKb; setKb(newKb);
    try {
      await storage.set(kbKey(), JSON.stringify(newKb));
      // Respaldo automático rolling (protege ante corrupción accidental).
      localStorage.setItem(kbBackupKey(), JSON.stringify({ ts: Date.now(), kb: newKb }));
    } catch {}
  }, []);

  // Aprender una respuesta
  const learn = useCallback((texto, respuesta) => {
    if (!respuesta || respuesta.trim().length === 0) return;
    const n = normalize(texto);
    const cur = kbRef.current;
    const idx = cur.findIndex(k => normalize(k.cobertura) === n);
    let next;
    if (idx >= 0) {
      next = [...cur];
      next[idx] = { ...next[idx], respuesta, count: (next[idx].count || 1) + 1 };
    } else {
      next = [...cur, { cobertura: texto, respuesta, count: 1 }];
    }
    persistKB(next);
  }, [persistKB]);

  // Aprender varias respuestas de una sola vez (una sola escritura en disco).
  // Se usa para guardar automáticamente lo que respondió la IA, así la próxima
  // vez ese archivo (o uno parecido) se llena solo, sin volver a usar la IA.
  const learnMany = useCallback((pairs) => {
    if (!pairs || pairs.length === 0) return;
    const map = new Map(kbRef.current.map(k => [normalize(k.cobertura), k]));
    pairs.forEach(({ texto, respuesta }) => {
      if (!texto || !texto.trim() || !respuesta || !respuesta.trim()) return;
      const n = normalize(texto);
      const ex = map.get(n);
      if (ex) map.set(n, { ...ex, respuesta, count: (ex.count || 1) + 1 });
      else map.set(n, { cobertura: texto, respuesta, count: 1 });
    });
    persistKB(Array.from(map.values()));
  }, [persistKB]);

  // ── Respaldo de memoria ──────────────────────────────────────────────────
  const exportKB = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10);
    downloadJSON(`cotizador_memoria_${date}.json`, kbRef.current);
    const now = Date.now();
    try { localStorage.setItem(backupTsKey(), String(now)); } catch {}
    setKbBackupTs(now);
    notify("ok", tr.msgKBExported(kbRef.current.length));
  }, [notify, tr]);

  const importKB = useCallback(async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const incoming = Array.isArray(data) ? data : data.kb;
      if (!Array.isArray(incoming) || !incoming.every(k => k && k.cobertura && "respuesta" in k)) {
        throw new Error(tr.errBadStructure);
      }
      // Une con la actual (prioriza lo importado).
      const map = new Map(kbRef.current.map(k => [normalize(k.cobertura), k]));
      incoming.forEach(k => map.set(normalize(k.cobertura), { count: 1, ...k }));
      const merged = [...map.values()];
      persistKB(merged);
      notify("ok", tr.msgKBImported(incoming.length, merged.length));
    } catch (e) {
      notify("error", tr.msgKBImportError(e.message));
    }
  }, [persistKB, notify, tr]);

  // Respaldo completo en un clic: memoria + historial (respuestas) en un JSON.
  // No incluye los bytes del Excel original (pesados); sí toda la memoria y el
  // detalle de respuestas de cada archivo, que es el conocimiento valioso.
  const backupAll = useCallback(async () => {
    try {
      const metas = await histList().catch(() => []);
      const history = [];
      for (const m of metas) {
        const d = await histGet(m.id).catch(() => null);
        history.push({ meta: m, sheets: d && d.sheets ? d.sheets : null });
      }
      const date = new Date().toISOString().slice(0, 10);
      downloadJSON(`cotizador_respaldo_${date}.json`, { v: 1, ts: Date.now(), kb: kbRef.current, history });
      const now = Date.now();
      try { localStorage.setItem(backupTsKey(), String(now)); } catch {}
      setKbBackupTs(now);
      notify("ok", tr.msgBackupDone(kbRef.current.length, history.length));
    } catch (e) {
      notify("error", tr.msgBackupError(e.message));
    }
  }, [notify, tr]);

  const restoreAll = useCallback(async (file) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.kb)) throw new Error(tr.errBadStructure);
      const map = new Map(kbRef.current.map(k => [normalize(k.cobertura), k]));
      data.kb.forEach(k => { if (k && k.cobertura) map.set(normalize(k.cobertura), { count: 1, ...k }); });
      persistKB([...map.values()]);
      let nFiles = 0;
      for (const h of (data.history || [])) {
        if (h && h.meta && h.sheets) {
          await histSave({ ...h.meta, sheets: h.sheets, bytes: null }).catch(() => {});
          nFiles++;
        }
      }
      refreshHist();
      notify("ok", tr.msgRestoreDone(nFiles));
    } catch (e) {
      notify("error", tr.msgRestoreError(e.message));
    } finally {
      if (backupFileRef.current) backupFileRef.current.value = "";
    }
  }, [notify, persistKB, refreshHist, tr]);

  // ── Gestión de memoria (editar/borrar) ───────────────────────────────────
  const updateKBEntry = useCallback((cobertura, respuesta) => {
    const n = normalize(cobertura);
    const next = kbRef.current.map(k => normalize(k.cobertura) === n ? { ...k, respuesta } : k);
    persistKB(next);
  }, [persistKB]);

  const deleteKBEntry = useCallback((cobertura) => {
    const n = normalize(cobertura);
    persistKB(kbRef.current.filter(k => normalize(k.cobertura) !== n));
  }, [persistKB]);

  // ── IA para una sola cobertura ───────────────────────────────────────────
  const aiSingle = async (sName, idx) => {
    const c = sheets[sName].coverages[idx];
    setRowLoading(`${sName}::${idx}`);
    try {
      const items = [{ texto: c.texto }];
      const ans = await callAI(items, sName, relevantKB(items, kbRef.current));
      const r = ans[0];
      if (r && r.respuesta) {
        setSheets(prev => {
          const u = { ...prev };
          const t = u[sName].coverages[idx];
          t.respuesta = r.respuesta; t.tipo = "IA"; t.confianza = r.confianza || "media";
          return u;
        });
        // Auto-aprende si es confiable (igual que el llenado por lotes).
        const conf = (r.confianza || "media").toLowerCase();
        if (conf !== "baja" && !/^\s*revisar\s*$/i.test(r.respuesta)) learn(c.texto, r.respuesta);
        notify("ok", tr.msgAISingleOk);
      } else {
        notify("info", tr.msgAISingleNone);
      }
    } catch (e) {
      notify("error", tr.msgAIError(e.message));
    } finally {
      setRowLoading(null);
    }
  };

  // Cargar el "archivo base" (key): lo convierte en memoria de respuestas. Las
  // respuestas del base tienen prioridad sobre la memoria previa. Beneficia tanto
  // al asistente como a la app clásica (es la misma memoria).
  const loadBaseFile = useCallback(async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) { notify("error", tr.msgBadFormat); return; }
    setBaseLoading(true);
    try {
      const XLSX = await getXLSX();
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array" });
      const pairs = kbFromWorkbook(workbook, XLSX);
      if (pairs.length === 0) {
        notify("info", L("No encontré pares pregunta/respuesta en ese archivo. ¿Tiene una columna con respuestas ya escritas?",
          "I couldn't find question/answer pairs in that file. Does it have a column with answers already filled in?"));
        return;
      }
      const map = new Map();
      for (const k of kbRef.current) map.set(normalize(k.cobertura), k);
      for (const p of pairs) map.set(normalize(p.cobertura), p); // el base gana
      await persistKB([...map.values()]);
      setBaseFileName(file.name);
      setBaseCount(pairs.length);
      notify("ok", L(`Archivo base cargado: ${pairs.length} respuestas listas para usar.`,
        `Base file loaded: ${pairs.length} answers ready to use.`));
    } catch (e) {
      console.error(e);
      notify("error", tr.msgFileError(e.message));
    } finally {
      setBaseLoading(false);
    }
  }, [notify, persistKB, tr, lang]);

  // Dictado por voz para las instrucciones (Web Speech API, si el navegador la tiene).
  const toggleVoice = useCallback(() => {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) {
      notify("info", L("Tu navegador no soporta dictado por voz. Usa Chrome de escritorio o escribe las instrucciones.",
        "Your browser doesn't support voice dictation. Use desktop Chrome or type the instructions."));
      return;
    }
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} recognitionRef.current = null; setListening(false); return; }
    const rec = new SR();
    rec.lang = lang === "en" ? "en-US" : "es-ES";
    rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      let txt = "";
      for (let i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript;
      txt = txt.trim();
      if (!txt) return;
      setInstrucciones(prev => { const next = (prev ? prev + " " : "") + txt; instruccionesRef.current = next; return next; });
    };
    rec.onend = () => { setListening(false); recognitionRef.current = null; };
    rec.onerror = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = rec; setListening(true);
    try { rec.start(); } catch { setListening(false); recognitionRef.current = null; }
  }, [lang, notify]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
      notify("error", tr.msgBadFormat);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      notify("error", tr.msgTooBig);
      return;
    }
    setParsing(true);
    try {
      const XLSX = await getXLSX();
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array", cellStyles: true, cellNF: true });
      if (!workbook.SheetNames?.length) throw new Error(tr.msgNoSheetsInFile);
      const extracted = extractCoverages(workbook, kbRef.current, XLSX);
      // Guardar el archivo original para poder exportar aunque se recargue la página.
      sessionBytesRef.current = buf.slice(0);
      idbSet({ fileName: file.name, bytes: buf.slice(0), ts: Date.now() }).catch(() => {});
      setWb(workbook);
      setFileName(file.name);
      setSheets(extracted);
      setSearch("");
      setFilter("todas");
      setActive(Object.keys(extracted)[0] || null);
      setStep("review");
      const nHojas = Object.keys(extracted).length;
      if (nHojas === 0) {
        notify("info", tr.msgNoSheets);
      } else {
        notify("ok", tr.msgFileLoaded(nHojas));
      }
    } catch (e) {
      console.error(e);
      notify("error", tr.msgFileError(e.message));
    } finally {
      setParsing(false);
    }
  }, [notify, tr]);

  // Modo demo: genera un Excel de ejemplo en memoria y lo carga por el flujo
  // normal, para presentar la app sin usar un archivo real de un cliente.
  const loadDemo = useCallback(async () => {
    setParsing(true);
    try {
      const XLSX = await getXLSX();
      const mk = (rows) => XLSX.utils.aoa_to_sheet([["COBERTURA / ÍTEM", "RESPUESTA ASEGURADORA"], ...rows.map(r => [r, ""])]);
      const wbk = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wbk, mk([
        "Incendio y/o rayo y/o humo y/o explosión",
        "Terremoto temblor erupción volcánica maremoto",
        "Lluvia e inundación por desbordamiento",
        "Robo y/o asalto con violencia a las instalaciones",
        "Responsabilidad civil frente a terceros",
        "Rotura accidental de vidrios y cristales",
        "Daños por agua a mercadería almacenada",
        "Gastos de remoción de escombros tras siniestro",
      ]), "Multirriesgo");
      XLSX.utils.book_append_sheet(wbk, mk([
        "Deducible para rotura de vidrios",
        "Deducible robo y asalto",
        "Deducible terremoto y eventos de la naturaleza",
        "Deducible responsabilidad civil",
      ]), "Deducibles");
      const arr = XLSX.write(wbk, { bookType: "xlsx", type: "array" });
      const workbook = XLSX.read(arr, { type: "array", cellStyles: true, cellNF: true });
      const extracted = extractCoverages(workbook, kbRef.current, XLSX);
      // XLSX.write con type:"array" devuelve un ArrayBuffer (no un Uint8Array),
      // así que se copia con slice() directamente, sin .buffer.
      const demoBytes = arr.slice(0);
      sessionBytesRef.current = demoBytes;
      idbSet({ fileName: "DEMO - Ejemplo.xlsx", bytes: demoBytes, ts: Date.now() }).catch(() => {});
      setWb(workbook);
      setFileName("DEMO - Ejemplo.xlsx");
      setSheets(extracted);
      setSearch(""); setFilter("todas");
      setActive(Object.keys(extracted)[0] || null);
      setStep("review");
      notify("ok", tr.msgDemoLoaded);
    } catch (e) {
      console.error(e);
      notify("error", tr.msgDemoError(e.message));
    } finally {
      setParsing(false);
    }
  }, [notify, tr]);

  const processAI = async () => {
    const names = Object.keys(sheets);
    const sheetsConPend = names.filter(n =>
      sheets[n].coverages.some(c => c.tipo === "Pendiente" && !c.editado));
    if (sheetsConPend.length === 0) {
      notify("info", tr.msgNoPending);
      return;
    }

    setProcessing(true); setProgress(0);
    const updated = { ...sheets };
    let resueltas = 0, fallidas = 0;
    let firstError = null;
    let rateLimited = false;
    const learned = []; // respuestas de la IA a guardar en memoria al terminar

    // Lotes grandes = menos llamadas a la IA (cada llamada repite el contexto de
    // memoria, así que menos llamadas = mucho menos trabajo total y más rápido).
    const BATCH_SIZE = 30;
    const batches = [];
    for (const sName of sheetsConPend) {
      const pend = updated[sName].coverages.filter(c => c.tipo === "Pendiente" && !c.editado);
      for (let i = 0; i < pend.length; i += BATCH_SIZE) {
        batches.push({ sName, items: pend.slice(i, i + BATCH_SIZE) });
      }
    }

    // Varios lotes en paralelo (concurrencia controlada) para terminar antes
    // sin disparar el límite 429 de Groq. Cada lote que termina refresca la UI.
    const CONCURRENCY = Math.min(4, batches.length);
    const total = batches.length;
    const totalPend = batches.reduce((n, b) => n + b.items.length, 0);
    let done = 0;
    let nextIdx = 0;
    let stop = false;
    setProgressText(tr.progressCoverages(0, totalPend));

    const worker = async () => {
      while (!stop) {
        const myIdx = nextIdx++;
        if (myIdx >= batches.length) return;
        const { sName, items } = batches[myIdx];
        try {
          const ans = await callAI(items, sName, relevantKB(items, kbRef.current), instruccionesRef.current);
          ans.forEach(({ idx, respuesta, confianza }) => {
            const target = items[idx - 1];
            if (target && respuesta) {
              target.respuesta = respuesta;
              target.tipo = "IA";
              target.confianza = confianza || "media";
              resueltas++;
              // Auto-aprender: guarda en memoria solo respuestas confiables
              // (no "baja" ni "REVISAR") para no ensuciarla con posibles errores.
              const conf = (confianza || "media").toLowerCase();
              if (conf !== "baja" && !/^\s*revisar\s*$/i.test(respuesta)) {
                learned.push({ texto: target.texto, respuesta });
              }
            }
          });
          setSheets({ ...updated }); // refresca el avance en pantalla lote a lote
        } catch (e) {
          console.error(e);
          fallidas += items.length;
          if (!firstError) firstError = e.message;
          // Si Groq sigue saturado tras los reintentos, no insistas con el resto.
          if (/429|satur/i.test(e.message || "")) { rateLimited = true; stop = true; }
        } finally {
          done++;
          setProgress(Math.round((done / total) * 100));
          setProgressText(tr.progressCoverages(resueltas, totalPend));
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // Guarda en memoria las respuestas confiables de la IA (una sola escritura).
    // Así la próxima vez este archivo (o uno parecido) se llena solo, sin IA.
    learnMany(learned);

    setProgress(100);
    setProgressText("");
    setSheets({ ...updated });
    setProcessing(false);

    if (rateLimited) {
      notify("error", tr.msgRateLimited(resueltas), 9000);
    } else if (fallidas > 0 && resueltas === 0) {
      notify("error", tr.msgAINone(firstError), 8000);
    } else if (fallidas > 0) {
      notify("info", tr.msgAIPartial(resueltas, fallidas, firstError), 7000);
    } else {
      const apr = learned.length;
      notify("ok", tr.msgAIDone(resueltas, apr));
    }
  };

  const editResp = (sName, idx, value) => {
    setSheets(prev => {
      const u = { ...prev };
      u[sName].coverages[idx].respuesta = value;
      u[sName].coverages[idx].tipo = "Manual";
      u[sName].coverages[idx].editado = true;
      return u;
    });
  };
  const onBlurLearn = (sName, idx) => {
    const c = sheets[sName].coverages[idx];
    if (c.editado && c.respuesta) {
      learn(c.texto, c.respuesta);
      setSheets(prev => {
        const u = { ...prev };
        u[sName].coverages[idx].tipo = "Aprendida";
        return u;
      });
    }
  };

  // Exportar: llena el archivo original + hoja resumen
  const exportFile = async () => {
    let workbook = wb;
    if (!workbook) {
      // Reconstruir desde la sesión guardada (p. ej. tras recargar la página).
      try {
        const rec = await idbGet();
        const bytes = (rec && rec.bytes) || sessionBytesRef.current;
        if (bytes) {
          const XLSXr = await getXLSX();
          workbook = XLSXr.read(bytes, { type: "array", cellStyles: true, cellNF: true });
          setWb(workbook);
        }
      } catch { /* no se pudo recuperar */ }
    }
    if (!workbook) {
      notify("error", tr.msgNoFile);
      return;
    }
    const totalResp = Object.values(sheets)
      .flatMap(s => s.coverages).filter(c => c.respuesta).length;
    if (totalResp === 0) {
      notify("info", tr.msgNothingToExport);
      return;
    }
    try {
    const XLSX = await getXLSX();
    // 1) escribir respuestas en las celdas originales
    Object.entries(sheets).forEach(([sName, { coverages }]) => {
      const ws = workbook.Sheets[sName];
      if (!ws) return;
      coverages.forEach(c => {
        if (!c.respuesta) return;
        const addr = XLSX.utils.encode_cell({ r: c.fila, c: c.respCol });
        ws[addr] = { t: "s", v: c.respuesta };
        // extender el rango si hace falta
        const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
        if (c.respCol > ref.e.c) ref.e.c = c.respCol;
        if (c.fila > ref.e.r) ref.e.r = c.fila;
        ws["!ref"] = XLSX.utils.encode_range(ref);
      });
    });
    // 2) hoja resumen con encabezado y resumen ejecutivo (imagen de producto)
    const allCov = Object.values(sheets).flatMap(s => s.coverages);
    const stTotal = allCov.length;
    const stAuto = allCov.filter(c => ["Exacta", "Similar", "IA", "Aprendida"].includes(c.tipo) && c.respuesta).length;
    const stIA = allCov.filter(c => c.tipo === "IA" && c.respuesta).length;
    const stPend = allCov.filter(c => c.tipo === "Pendiente" || !c.respuesta).length;
    const stRev = allCov.filter(needsReview).length;
    const stMin = Math.round((stAuto * 40) / 60);
    const stSaved = stMin >= 60 ? `${Math.floor(stMin / 60)} h ${stMin % 60} min` : `${stMin} min`;
    const stPct = stTotal ? Math.round((allCov.filter(c => c.respuesta).length / stTotal) * 100) : 0;

    const summary = [
      [tr.rpTitle],
      [tr.rpFile(fileName)],
      [tr.rpGenerated(new Date().toLocaleString())],
      [],
      [tr.rpExecutive, ""],
      [tr.rpTotal, stTotal],
      [tr.rpAuto, stAuto],
      [tr.rpByAI, stIA],
      [tr.rpPending, stPend],
      [tr.rpReview, stRev],
      [tr.rpComplete, `${stPct}%`],
      [tr.rpTimeSaved, stSaved],
      [],
      [tr.rpDetail],
      [tr.rpColSheet, tr.rpColCoverage, tr.rpColAnswer, tr.rpColOrigin, tr.rpColReview],
    ];
    Object.entries(sheets).forEach(([sName, { coverages }]) => {
      coverages.forEach(c => summary.push([sName, c.texto, c.respuesta || tr.rpEmpty, tr.tipoLabel[c.tipo] || c.tipo, needsReview(c) ? tr.rpReviewMark : ""]));
    });
    const wsS = XLSX.utils.aoa_to_sheet(summary);
    wsS["!cols"] = [{ wch: 24 }, { wch: 65 }, { wch: 65 }, { wch: 12 }, { wch: 12 }];
    // Une el título y los encabezados de sección a lo ancho para que se vean limpios.
    wsS["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 13, c: 0 }, e: { r: 13, c: 4 } },
    ];
    const SUMMARY_NAME = lang === "en" ? "✓ Answers" : "✓ Respuestas";
    // Quita una hoja resumen previa de AMBOS lugares (Sheets y SheetNames);
    // si solo se borra de Sheets, book_append_sheet lanza "already exists".
    // Considera los nombres en ambos idiomas por si se cambió el idioma entre
    // exportaciones, para no dejar dos hojas resumen.
    ["✓ Respuestas", "✓ Answers"].forEach(prev => {
      if (workbook.SheetNames.includes(prev)) {
        workbook.SheetNames = workbook.SheetNames.filter(n => n !== prev);
        delete workbook.Sheets[prev];
      }
    });
    XLSX.utils.book_append_sheet(workbook, wsS, SUMMARY_NAME);

    // 3) descargar — Blob + ancla en vez de XLSX.writeFile: es el método más
    // robusto en el navegador (writeFile fallaba en silencio con archivos
    // grandes o cuando el navegador bloqueaba la descarga interna).
    const out = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(fileName || "cotizacion").replace(/\.[^.]+$/, "")}${tr.rpSuffix}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    notify("ok", tr.msgExported);
    saveToHistory(); // queda en el historial como archivo completado
    } catch (e) {
      console.error(e);
      notify("error", tr.msgExportError(e.message));
    }
  };

  const all = Object.values(sheets).flatMap(s => s.coverages);
  const total = all.length;
  const answered = all.filter(c => c.respuesta).length;
  const auto = all.filter(c => ["Exacta", "Similar", "IA", "Aprendida"].includes(c.tipo) && c.respuesta).length;
  const pend = all.filter(c => c.tipo === "Pendiente" || !c.respuesta).length;
  const revisar = all.filter(needsReview).length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  // Ahorro de tiempo estimado: ~40 s por cobertura resuelta a mano (buscar
  // precedente, redactar y escribir). Solo cuenta lo que la app llenó sola.
  const SECS_PER_ITEM = 40;
  const savedMin = Math.round((auto * SECS_PER_ITEM) / 60);
  const savedLabel = savedMin >= 60
    ? `${Math.floor(savedMin / 60)} h ${savedMin % 60} min`
    : `${savedMin} min`;

  // En el asistente, al terminar de cargar el archivo nuevo (step="review"),
  // dispara la IA una sola vez para que "se llene solo".
  useEffect(() => {
    if (!autoRunRef.current || step !== "review" || processing) return;
    const hasPend = Object.values(sheets).some(s => s.coverages.some(c => c.tipo === "Pendiente" && !c.editado));
    autoRunRef.current = false;
    if (hasPend) processAI();
  }, [step, sheets, processing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={sx.app}>
      <div style={{ ...sx.header, padding: narrow ? "14px 16px" : "18px 28px" }}>
        <div style={sx.logo}>C</div>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.5 }}>AUTO-COTIZADOR</div>
          <div style={{ fontSize: 10, color: isCompany ? C.gold : C.muted, letterSpacing: isCompany ? 1 : 2, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
            {isCompany ? <>🏢 {organization.name}{isOrgAdmin ? " · Admin" : ""}</> : tr.appSubtitle}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {canUseAssistant && (
            <button onClick={() => setView(v => (v === "asistente" ? "clasico" : "asistente"))}
              title={L("Asistente guiado paso a paso", "Step-by-step guided assistant")}
              style={{ background: view === "asistente" ? `linear-gradient(135deg,${C.gold},#A8813E)` : "transparent", border: `1px solid ${view === "asistente" ? C.gold : C.border}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", textAlign: "center", fontFamily: F }}>
              <div style={{ fontSize: 10, color: view === "asistente" ? C.bg : C.muted, letterSpacing: 1 }}>{L("MODO", "MODE")}</div>
              <div style={{ fontSize: 13, color: view === "asistente" ? C.bg : C.gold, fontWeight: 700 }}>🪄 {view === "asistente" ? L("Clásico", "Classic") : L("Asistente", "Assistant")}</div>
            </button>
          )}
          <button onClick={toggleLang} title={tr.switchTo}
            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", textAlign: "center", fontFamily: F }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>🌐</div>
            <div style={{ fontSize: 13, color: C.gold, fontWeight: 700 }}>{lang === "es" ? "EN" : "ES"}</div>
          </button>
          <button onClick={() => setShowPriv(true)} title={tr.hdrPrivacyTitle}
            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", textAlign: "right", fontFamily: F }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>{tr.hdrData}</div>
            <div style={{ fontSize: 13, color: C.green }}>{tr.hdrPrivacy}</div>
          </button>
          <button onClick={() => { refreshHist(); setShowHist(true); }} title={tr.hdrHistoryTitle}
            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", textAlign: "right", fontFamily: F }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>{tr.hdrHistory}</div>
            <div style={{ fontSize: 13, color: C.accentLight }}>📁 {tr.filesN(histItems.length)}</div>
          </button>
          <button onClick={() => setShowKB(true)}
            title={isCompany ? tr.memTitleTeam(organization?.name) : tr.memTitlePersonal}
            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", textAlign: "right", fontFamily: F }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>{isCompany ? tr.hdrMemoryTeam : tr.hdrMemory}</div>
            <div style={{ fontSize: 13, color: C.green }}>{isCompany ? "👥" : "🧠"} {tr.answersN(kb.length)}</div>
          </button>
          {fileName && step === "review" && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>{tr.hdrFile}</div>
              <div style={{ fontSize: 12, color: C.accentLight, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</div>
            </div>
          )}
          <OrganizationSwitcher
            hidePersonal={false}
            afterCreateOrganizationUrl="/"
            afterSelectOrganizationUrl="/"
            afterLeaveOrganizationUrl="/"
          />
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>

      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 50, maxWidth: 380,
          padding: "12px 16px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
          display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
          boxShadow: "0 8px 30px rgba(0,0,0,.45)",
          background: toast.type === "error" ? "#2A1212" : toast.type === "ok" ? "#0F2614" : "#0A1F3A",
          border: `1px solid ${toast.type === "error" ? C.red : toast.type === "ok" ? C.green : C.accent}`,
          color: toast.type === "error" ? "#FFB3AB" : toast.type === "ok" ? "#A8E6BC" : "#A8C8F0",
        }} onClick={() => setToast(null)}>
          <span style={{ fontSize: 15 }}>{toast.type === "error" ? "⚠️" : toast.type === "ok" ? "✅" : "ℹ️"}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {showPriv && (
        <div onClick={() => setShowPriv(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: narrow ? 10 : 40 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{tr.privTitle}</span>
              <button onClick={() => setShowPriv(false)} style={{ ...sx.btnSm, fontSize: 16, padding: "2px 10px" }}>✕</button>
            </div>
            <div style={{ padding: "16px 18px", overflowY: "auto", fontSize: 12.5, lineHeight: 1.7, color: C.text }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: C.green, fontWeight: 700, marginBottom: 4 }}>{tr.privWhereTitle}</div>
                {isCompany ? tr.privWhereTeam(organization?.name) : tr.privWherePersonal}
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: C.accentLight, fontWeight: 700, marginBottom: 4 }}>{tr.privAITitle}</div>
                {tr.privAIBody}
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: C.gold, fontWeight: 700, marginBottom: 4 }}>{tr.privNoTitle}</div>
                {tr.privNoBody}
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: C.text, fontWeight: 700, marginBottom: 4 }}>{tr.privKeyTitle}</div>
                {tr.privKeyBody}
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 11.5, color: C.muted }}>
                <b style={{ color: C.yellow }}>{tr.privEnterprise}</b>{tr.privEnterpriseBody}
              </div>
            </div>
          </div>
        </div>
      )}

      {showHist && (
        <div onClick={() => setShowHist(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: narrow ? 10 : 40 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 720, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.accentLight }}>{tr.histTitle(histItems.length)}</span>
              <button onClick={() => setShowHist(false)} style={{ ...sx.btnSm, fontSize: 16, padding: "2px 10px" }}>✕</button>
            </div>
            {histItems.length > 0 && (
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
                <input value={histSearch} onChange={e => setHistSearch(e.target.value)} placeholder={tr.histSearch}
                  style={{ width: "100%", background: "#0A1425", border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "7px 11px", fontSize: 12, fontFamily: F, outline: "none" }} />
              </div>
            )}
            <div style={{ padding: "10px 14px", overflowY: "auto" }}>
              {histItems.length === 0 && (
                <div style={{ textAlign: "center", color: C.muted, fontSize: 12, padding: 28, lineHeight: 1.6 }}>
                  {tr.histEmpty1}<br />
                  {tr.histEmpty2}
                </div>
              )}
              {histItems.filter(h => normalize(h.fileName || "").includes(normalize(histSearch))).map(h => {
                const pctH = h.total ? Math.round((h.answered / h.total) * 100) : 0;
                const fecha = h.ts ? new Date(h.ts).toLocaleString() : "";
                return (
                  <div key={h.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {h.fileName}</div>
                        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>
                          {fecha} · {tr.histAnswered(h.answered, h.total, pctH)}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openFromHistory(h.id)} style={{ ...sx.btn, padding: "7px 12px" }}>{tr.histOpen}</button>
                        <button onClick={() => { if (confirm(tr.histRemoveConfirm(h.fileName))) deleteFromHistory(h.id); }}
                          style={{ ...sx.btnSm, color: C.red, borderColor: C.border }}>🗑</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {histItems.length > 0 && histItems.filter(h => normalize(h.fileName || "").includes(normalize(histSearch))).length === 0 && (
                <div style={{ textAlign: "center", color: C.muted, fontSize: 12, padding: 20 }}>
                  {tr.histNoMatch(histSearch)}
                </div>
              )}
            </div>
            <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button style={sx.btnSm} onClick={backupAll}>{tr.histBackupAll}</button>
              <button style={sx.btnSm} onClick={() => backupFileRef.current?.click()}>{tr.histRestore}</button>
              <input ref={backupFileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
                onChange={e => restoreAll(e.target.files[0])} />
              <span style={{ fontSize: 10.5, color: C.muted, flex: 1, minWidth: 160, lineHeight: 1.5 }}>
                {tr.histBackupHint}
              </span>
            </div>
          </div>
        </div>
      )}

      {showKB && (
        <div onClick={() => setShowKB(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: narrow ? 10 : 40 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 760, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>{tr.kbTitle(kb.length)}</span>
              <button onClick={() => setShowKB(false)} style={{ ...sx.btnSm, fontSize: 14 }}>✕</button>
            </div>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input value={kbSearch} onChange={e => setKbSearch(e.target.value)} placeholder={tr.kbSearch}
                style={{ flex: 1, minWidth: 160, background: "#0A1425", border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "7px 11px", fontSize: 12, fontFamily: F, outline: "none" }} />
              <button style={sx.btnSm} onClick={exportKB}>{tr.kbExport}</button>
              {canManageKB && <button style={sx.btnSm} onClick={() => kbFileRef.current?.click()}>{tr.kbImport}</button>}
              <span style={{ fontSize: 10.5, color: kbBackupTs ? C.muted : C.yellow }}>
                {kbBackupTs ? tr.kbLastBackup(new Date(kbBackupTs).toLocaleDateString()) : tr.kbNoBackup}
              </span>
              {canManageKB ? (
                <>
                  <button style={{ ...sx.btnSm, color: C.yellow, borderColor: "#4A3000" }}
                    onClick={() => {
                      if (window.confirm(tr.kbBaseConfirm)) {
                        persistKB(SEED_KB); notify("ok", tr.msgKBToBase);
                      }
                    }}>{tr.kbBase}</button>
                  <button style={{ ...sx.btnSm, color: C.red, borderColor: "#4A1A1A" }}
                    onClick={() => {
                      if (window.confirm(tr.kbClearConfirm)) {
                        persistKB([]); notify("ok", tr.msgKBCleared);
                      }
                    }}>{tr.kbClear}</button>
                </>
              ) : (
                <span style={{ fontSize: 10.5, color: C.muted, fontStyle: "italic" }}>🔒 {tr.adminOnlyKB}</span>
              )}
              <input ref={kbFileRef} type="file" accept=".json" style={{ display: "none" }}
                onChange={e => { importKB(e.target.files[0]); e.target.value = ""; }} />
            </div>
            <div style={{ overflowY: "auto", padding: "8px 18px 18px" }}>
              {(() => {
                const nQ = normalize(kbSearch);
                const list = kb.filter(k => !nQ || normalize(k.cobertura).includes(nQ) || normalize(k.respuesta).includes(nQ));
                if (list.length === 0) return <div style={{ color: C.muted, fontSize: 12, padding: 24, textAlign: "center" }}>{tr.kbNoMatch}</div>;
                return list.map(k => (
                  <div key={normalize(k.cobertura)} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "#B0C0D8", marginBottom: 4 }}>{k.cobertura}</div>
                      <input defaultValue={k.respuesta} onBlur={e => { if (e.target.value !== k.respuesta) updateKBEntry(k.cobertura, e.target.value); }}
                        style={{ width: "100%", background: "#0A1425", border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "6px 9px", fontSize: 12, fontFamily: F, outline: "none" }} />
                    </div>
                    <button onClick={() => deleteKBEntry(k.cobertura)} title={tr.kbDeleteTitle}
                      style={{ ...sx.btnSm, color: C.red, borderColor: "#4A1A1A", marginTop: 20 }}>🗑</button>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      <div style={{ ...sx.body, padding: narrow ? "16px 14px" : "24px 28px" }}>
        {/* ─── Asistente guiado: subir archivo base + instrucciones + archivo nuevo ─── */}
        {step === "upload" && effView === "asistente" && (
          <div className="fade-up" style={{ maxWidth: 680, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 40, marginBottom: 6 }}>🪄</div>
              <h1 style={{ fontSize: narrow ? 24 : 30, fontWeight: 700, margin: "0 0 6px", letterSpacing: -0.5 }}>
                {user?.firstName ? L(`Hola, ${user.firstName} 👋`, `Hi, ${user.firstName} 👋`) : L("Asistente de cotización", "Quoting assistant")}
              </h1>
              <p style={{ color: "#9FB1CC", fontSize: 13.5, lineHeight: 1.65, margin: "0 auto", maxWidth: 480 }}>
                {L("En 3 pasos: sube tu archivo base con las respuestas, dile qué hacer, y sube el archivo nuevo. Lo lleno solo.",
                   "In 3 steps: upload your base file with the answers, tell me what to do, and upload the new file. I'll fill it for you.")}
              </p>
            </div>

            {/* Paso 1 — archivo base */}
            <div style={{ ...sx.card, marginTop: 16, borderColor: baseCount ? C.green : C.border }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 20 }}>{baseCount ? "✅" : "1️⃣"}</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{L("Sube tu archivo base (tu “key” de respuestas)", "Upload your base file (your answer “key”)")}</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>
                    {baseCount
                      ? L(`${baseFileName} · ${baseCount} respuestas cargadas`, `${baseFileName} · ${baseCount} answers loaded`)
                      : L("Un Excel con tus respuestas (o una cotización vieja ya respondida). Detecto la columna sola.",
                          "An Excel with your answers (or an old answered quote). I detect the column automatically.")}
                  </div>
                </div>
                <button style={{ ...sx.btn, opacity: baseLoading ? 0.6 : 1 }} disabled={baseLoading}
                  onClick={() => baseFileRef.current?.click()}>
                  {baseLoading ? L("Leyendo…", "Reading…") : baseCount ? L("Cambiar", "Change") : L("Elegir archivo", "Choose file")}
                </button>
                <input ref={baseFileRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }}
                  onChange={e => { loadBaseFile(e.target.files[0]); e.target.value = ""; }} />
              </div>
            </div>

            {/* Paso 2 — instrucciones (texto o voz) */}
            <div style={{ ...sx.card, marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>2️⃣</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{L("Dile qué hacer (escribe o habla)", "Tell it what to do (type or speak)")}</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{L("Opcional. Ej.: “Si no estás seguro, pon REVISAR. Usa límites en dólares.”", "Optional. E.g.: “If unsure, put REVISAR. Use limits in dollars.”")}</div>
                </div>
                <button onClick={toggleVoice} title={L("Dictar por voz", "Dictate by voice")}
                  style={{ ...sx.btnSm, color: listening ? C.red : C.accentLight, borderColor: listening ? C.red : C.border, padding: "8px 12px", fontSize: 14 }}>
                  {listening ? L("⏹ Detener", "⏹ Stop") : "🎤"}
                </button>
              </div>
              <textarea value={instrucciones}
                onChange={e => { setInstrucciones(e.target.value); instruccionesRef.current = e.target.value; }}
                placeholder={L("Escribe aquí las instrucciones para la IA…", "Type the instructions for the AI here…")}
                style={{ ...sx.ta, minHeight: 70 }} />
              {listening && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>🔴 {L("Escuchando… habla y aparecerá el texto.", "Listening… speak and the text will appear.")}</div>}
            </div>

            {/* Paso 3 — archivo nuevo a llenar */}
            <div style={{ ...sx.card, marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>3️⃣</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{L("Sube el archivo nuevo a llenar", "Upload the new file to fill")}</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{L("Lo lleno con tu archivo base + tus instrucciones y te lo devuelvo respondido.", "I fill it with your base file + your instructions and return it answered.")}</div>
                </div>
              </div>
              <div
                style={{ ...sx.drop, padding: narrow ? 26 : 36, ...(dragOver ? { borderColor: C.accentLight, background: "#0A1F3A" } : {}) }}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); autoRunRef.current = true; handleFile(e.dataTransfer.files[0]); }}
                onClick={() => assistFileRef.current?.click()}
              >
                <div className={parsing ? "" : "float"} style={{ fontSize: 34, marginBottom: 8 }}>{parsing ? "⏳" : "📂"}</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{parsing ? L("Leyendo…", "Reading…") : L("Arrastra o haz clic para subir", "Drag or click to upload")}</div>
                <div style={{ fontSize: 11, color: C.muted }}>.xlsx · .xls · .xlsm</div>
                <input ref={assistFileRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }}
                  onChange={e => { autoRunRef.current = true; handleFile(e.target.files[0]); }} />
              </div>
              {!baseCount && (
                <div style={{ fontSize: 11, color: C.yellow, marginTop: 8, textAlign: "center" }}>
                  💡 {L("Tip: sube primero tu archivo base (paso 1) para mejores respuestas.", "Tip: upload your base file first (step 1) for better answers.")}
                </div>
              )}
            </div>

            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={() => setView("clasico")} style={{ ...sx.btnSm, padding: "8px 16px" }}>← {L("Ir al modo clásico", "Go to classic mode")}</button>
            </div>
          </div>
        )}

        {step === "upload" && effView === "clasico" && (
          <div>
            {/* Invitación a crear empresa (solo en uso individual) */}
            {!isCompany && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", maxWidth: 760, margin: "0 auto 4px", background: "rgba(26,111,216,.08)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.accentLight }}>{tr.teamNudgeTitle}</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>{tr.teamNudgeBody}</div>
                </div>
                <span style={{ fontSize: 22 }}>↗️</span>
              </div>
            )}
            {/* Hero */}
            <div style={{ position: "relative", overflow: "hidden", paddingBottom: 8 }}>
              <div className="hero-glow" />
              <div className="fade-up" style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 760, margin: "0 auto", padding: narrow ? "10px 0 4px" : "32px 0 4px" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 10.5, border: `1px solid ${C.border}`, background: "rgba(19,25,41,.7)", borderRadius: 999, padding: "6px 15px", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 20 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, display: "inline-block" }} className="live-dot" />
                  <span className="shine-text" style={{ fontWeight: 700 }}>{tr.heroBadge}</span>
                </div>
                <h1 style={{ fontSize: narrow ? 30 : 48, fontWeight: 700, lineHeight: 1.1, margin: "0 0 18px", letterSpacing: -1 }}>
                  {tr.heroTitle1}<br />
                  <span style={{ background: `linear-gradient(90deg,${C.accentLight},${C.gold})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{tr.heroTitle2}</span>
                </h1>
                <p style={{ color: "#9FB1CC", fontSize: narrow ? 14 : 16.5, lineHeight: 1.7, margin: "0 auto 24px", maxWidth: 580 }}>
                  {tr.heroSubA}<strong style={{ color: C.text }}>{tr.heroSubB}</strong>{tr.heroSubC}
                </p>
                <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                  {[
                    ["⚡", tr.chipSeconds],
                    ["🧠", tr.chipLearned(kb.length)],
                    ["📊", tr.chipExcel],
                  ].map(([ic, t]) => (
                    <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "#B8C6DD", border: `1px solid ${C.border}`, background: "rgba(14,24,40,.6)", borderRadius: 999, padding: "6px 13px" }}>
                      <span>{ic}</span>{t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Dropzone */}
            <div className="fade-up delay-1" style={{ maxWidth: 720, margin: "20px auto 0" }}>
              <div
                style={{ ...sx.drop, padding: narrow ? 32 : 48, ...(dragOver ? { borderColor: C.accentLight, background: "#0A1F3A", boxShadow: "0 0 0 4px rgba(58,142,248,.12)" } : {}) }}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current?.click()}
              >
                <div className={parsing ? "" : "float"} style={{ fontSize: 40, marginBottom: 10 }}>{parsing ? "⏳" : "📂"}</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{tr.dropTitle}</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 18 }}>{tr.dropHint}</div>
                <button style={{ ...sx.btnGold, opacity: !kbReady || parsing ? 0.6 : 1 }} disabled={!kbReady || parsing}>
                  {parsing ? tr.dropReading : kbReady ? tr.dropSelect : tr.dropLoadingKB}
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
              </div>
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button onClick={loadDemo}
                  style={{ ...sx.btn, background: "transparent", border: `1px solid ${C.gold}`, color: C.gold, padding: "10px 22px" }}>
                  {tr.demoBtn}
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: narrow ? 12 : 22, flexWrap: "wrap", marginTop: 16, fontSize: 11, color: C.muted }}>
                <span>{tr.trustKey}</span>
                <span>{tr.trustMem(kb.length)}</span>
                <span>{tr.trustExcel}</span>
              </div>
            </div>

            {/* Opcional: archivo base + instrucciones para la IA (solo usuario autorizado) */}
            {canUseAssistant && (
            <div className="fade-up delay-1" style={{ maxWidth: 720, margin: "16px auto 0", background: "rgba(196,151,90,.06)", border: `1px solid ${C.border}`, borderRadius: 12, padding: narrow ? "14px 14px" : "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>⚡ {L("Opcional: archivo base + instrucciones", "Optional: base file + instructions")}</span>
                <button onClick={() => setView("asistente")} style={{ ...sx.btnSm, marginLeft: "auto", color: C.gold, borderColor: C.gold }}>🪄 {L("Abrir asistente guiado", "Open guided assistant")}</button>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                <button style={{ ...sx.btnSm, opacity: baseLoading ? 0.6 : 1 }} disabled={baseLoading}
                  onClick={() => baseFileRef.current?.click()}>
                  📑 {baseLoading ? L("Leyendo…", "Reading…") : L("Cargar archivo base", "Load base file")}
                </button>
                <input ref={baseFileRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }}
                  onChange={e => { loadBaseFile(e.target.files[0]); e.target.value = ""; }} />
                <span style={{ fontSize: 11, color: baseCount ? C.green : C.muted }}>
                  {baseCount ? `✓ ${baseFileName} · ${baseCount}` : L("Saca las respuestas de un archivo ya respondido", "Pulls answers from an already-answered file")}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <textarea value={instrucciones}
                  onChange={e => { setInstrucciones(e.target.value); instruccionesRef.current = e.target.value; }}
                  placeholder={L("Instrucciones para la IA (opcional). Ej.: “Si no estás seguro, pon REVISAR.”", "Instructions for the AI (optional). E.g.: “If unsure, put REVISAR.”")}
                  style={{ ...sx.ta, minHeight: 46 }} />
                <button onClick={toggleVoice} title={L("Dictar por voz", "Dictate by voice")}
                  style={{ ...sx.btnSm, color: listening ? C.red : C.accentLight, borderColor: listening ? C.red : C.border, padding: "9px 12px", fontSize: 14 }}>
                  {listening ? "⏹" : "🎤"}
                </button>
              </div>
            </div>
            )}

            {/* Compatible con Excel */}
            <div className="fade-up delay-1 grad-border" style={{ maxWidth: 720, margin: "20px auto 0", padding: narrow ? "18px 16px" : "22px 26px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: narrow ? 13 : 14, fontWeight: 700, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>📊</span> {tr.compatTitle}
              </div>
              <div style={{ display: "flex", alignItems: "stretch", justifyContent: "center", gap: narrow ? 8 : 12, flexWrap: narrow ? "wrap" : "nowrap" }}>
                {[
                  ["⬆️", ...tr.compatImport],
                  ["🤖", ...tr.compatRespond],
                  ["⬇️", ...tr.compatExport],
                ].map(([ic, t, d], i) => (
                  <Fragment key={t}>
                    <div style={{ flex: 1, minWidth: narrow ? 88 : 0, textAlign: "center", background: "rgba(14,24,40,.55)", border: `1px solid ${C.border}`, borderRadius: 10, padding: narrow ? "10px 8px" : "12px 10px" }}>
                      <div style={{ fontSize: 20, marginBottom: 5 }}>{ic}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>{t}</div>
                      <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.4 }}>{d}</div>
                    </div>
                    {i < 2 && !narrow && <div style={{ display: "flex", alignItems: "center", color: C.gold, fontSize: 18 }}>→</div>}
                  </Fragment>
                ))}
              </div>
            </div>

            {/* Franja de métricas */}
            <div className="fade-up delay-2 grad-border" style={{ maxWidth: 1000, margin: "44px auto 0", padding: narrow ? "20px 16px" : "26px 32px" }}>
              <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(3,1fr)", gap: narrow ? 18 : 14, textAlign: "center" }}>
                {[
                  [`${kb.length}`, tr.metricMem, C.green],
                  [tr.metricMinutes[0], tr.metricMinutes[1], C.accentLight],
                  [tr.metricFile[0], tr.metricFile[1], C.gold],
                ].map(([big, small, col], i) => (
                  <div key={i} style={{ borderLeft: !narrow && i > 0 ? `1px solid ${C.border}` : "none", padding: narrow ? 0 : "0 8px" }}>
                    <div style={{ fontSize: narrow ? 30 : 36, fontWeight: 700, color: col, lineHeight: 1, marginBottom: 8, letterSpacing: -1 }}>{big}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{small}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cómo funciona */}
            <div className="fade-up delay-2" style={{ maxWidth: 1000, margin: "48px auto 0" }}>
              <div style={{ textAlign: "center", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.gold, marginBottom: 8, fontWeight: 600 }}>{tr.howKicker}</div>
              <div style={{ textAlign: "center", fontSize: narrow ? 18 : 22, fontWeight: 700, marginBottom: 24, letterSpacing: -0.5 }}>{tr.howTitle}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
                {tr.steps.map(([n, t, d]) => (
                  <div key={n} className="lift" style={sx.card}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg,${C.accent},#1555B0)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, marginBottom: 12, boxShadow: "0 4px 14px rgba(26,111,216,.4)" }}>{n}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5 }}>{t}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Beneficios */}
            <div className="fade-up delay-3" style={{ maxWidth: 1000, margin: "48px auto 0" }}>
              <div style={{ textAlign: "center", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.gold, marginBottom: 8, fontWeight: 600 }}>{tr.whyKicker}</div>
              <div style={{ textAlign: "center", fontSize: narrow ? 18 : 22, fontWeight: 700, marginBottom: 24, letterSpacing: -0.5 }}>{tr.whyTitle}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
                {tr.benefits.map(([ic, t, d], i) => (
                  <div key={i} className="lift" style={sx.card}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{ic}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5 }}>{t}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{d(kb.length)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Antes / Después */}
            <div className="fade-up delay-3" style={{ maxWidth: 1000, margin: "48px auto 0", display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 14 }}>
              <div style={{ ...sx.card, padding: 22, background: "#160F0F", border: "1px solid #3A2020" }}>
                <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.red, marginBottom: 14, fontWeight: 700 }}>{tr.beforeTitle}</div>
                {tr.beforeItems.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, color: "#C9A8A8", lineHeight: 1.55, marginBottom: i < 2 ? 10 : 0 }}>
                    <span style={{ color: C.red }}>✕</span>{t}
                  </div>
                ))}
              </div>
              <div style={{ ...sx.card, padding: 22, background: "#0C1A12", border: "1px solid #1C3A28" }}>
                <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.green, marginBottom: 14, fontWeight: 700 }}>{tr.afterTitle}</div>
                {tr.afterItems.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, color: "#A8E6BC", lineHeight: 1.55, marginBottom: i < 2 ? 10 : 0 }}>
                    <span style={{ color: C.green }}>✓</span>{t}
                  </div>
                ))}
              </div>
            </div>

            {/* CTA de cierre */}
            <div className="fade-up delay-4 grad-border" style={{ maxWidth: 1000, margin: "48px auto 0", padding: narrow ? "28px 20px" : "40px", textAlign: "center" }}>
              <h2 style={{ fontSize: narrow ? 20 : 26, fontWeight: 700, margin: "0 0 10px", letterSpacing: -0.5 }}>{tr.ctaTitle}</h2>
              <p style={{ color: C.muted, fontSize: narrow ? 13 : 14.5, lineHeight: 1.6, margin: "0 auto 22px", maxWidth: 460 }}>
                {tr.ctaBody}
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={!kbReady || parsing}
                style={{ ...sx.btnGold, padding: "14px 30px", fontSize: 14, opacity: !kbReady || parsing ? 0.6 : 1 }}>
                {parsing ? tr.dropReading : kbReady ? tr.ctaBtn : tr.dropLoadingKB}
              </button>
            </div>

            {/* Footer */}
            <div style={{ textAlign: "center", color: C.muted, fontSize: 11, marginTop: 40, paddingTop: 20, borderTop: `1px solid ${C.border}`, maxWidth: 1000, marginLeft: "auto", marginRight: "auto", lineHeight: 1.7 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ ...sx.logo, width: 24, height: 24, fontSize: 12, borderRadius: 6 }}>C</span>
                <span style={{ color: C.text, fontWeight: 700, letterSpacing: 0.5 }}>AUTO-COTIZADOR</span>
              </div>
              {tr.footer}
            </div>
          </div>
        )}

        {step === "review" && (
          <div>
            <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap", alignItems: "stretch" }}>
              <div style={sx.stat}><div style={sx.statLabel}>{tr.stSheets}</div><div style={{ fontSize: 26, fontWeight: 700, color: C.accentLight }}>{Object.keys(sheets).length}</div></div>
              <div style={sx.stat}><div style={sx.statLabel}>{tr.stItems}</div><div style={{ fontSize: 26, fontWeight: 700, color: C.gold }}>{total}</div></div>
              <div style={sx.stat}><div style={sx.statLabel}>{tr.stAuto}</div><div style={{ fontSize: 26, fontWeight: 700, color: C.green }}>{auto}</div></div>
              <div style={sx.stat}><div style={sx.statLabel}>{tr.stPending}</div><div style={{ fontSize: 26, fontWeight: 700, color: pend > 0 ? C.yellow : C.green }}>{pend}</div></div>
              <div style={sx.stat}><div style={sx.statLabel}>{tr.stReview}</div><div style={{ fontSize: 26, fontWeight: 700, color: revisar > 0 ? C.red : C.green }}>{revisar}</div></div>
              <div style={{ ...sx.stat, background: "#0F2614", border: `1px solid ${C.green}` }} title={tr.stSavingTitle}>
                <div style={sx.statLabel}>{tr.stSaving}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.green }}>{savedLabel}</div>
              </div>
              <div style={{ ...sx.stat, flex: 2, minWidth: 180 }}>
                <div style={sx.statLabel}>{tr.stDone(answered, total)}</div>
                <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: "hidden", marginTop: 10 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,${C.accent},${C.accentLight})`, transition: "width .5s" }} />
                </div>
                <div style={{ fontSize: 11, color: pct === 100 ? C.green : C.muted, marginTop: 5 }}>{pct}%</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <button style={{ ...sx.btnGold, opacity: processing ? 0.6 : 1 }} onClick={processAI} disabled={processing}>
                {processing ? tr.btnProcessing(progress, progressText) : tr.btnCompleteAI(pend)}
              </button>
              <button style={sx.btn} onClick={exportFile}>{tr.btnExport}</button>
              <button style={sx.btnSm} onClick={async () => { await saveToHistory(); setStep("upload"); setSheets({}); setFileName(""); setWb(null); clearSession(); }}>{tr.btnOther}</button>
            </div>

            {processing && (
              <div style={{ background: "#0A1F3A", border: `1px solid ${C.accent}`, borderRadius: 8, padding: "12px 18px", marginBottom: 14, fontSize: 12 }}>
                {tr.processingBox(progress)}
                {progressText && <span style={{ color: C.muted }}> · {progressText}</span>}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {Object.entries(sheets).map(([sName, { coverages }]) => {
                const a = coverages.filter(c => c.respuesta).length, isA = active === sName;
                return (
                  <button key={sName} onClick={() => setActive(sName)} style={{
                    background: isA ? C.accent : C.surface, border: `1px solid ${isA ? C.accent : C.border}`,
                    color: isA ? "#fff" : C.muted, borderRadius: 6, padding: "6px 12px", cursor: "pointer",
                    fontSize: 11, fontFamily: F, fontWeight: isA ? 700 : 400, display: "flex", gap: 6, alignItems: "center",
                  }}>
                    {sName.trim()}
                    <span style={{ background: a === coverages.length ? "#1A4020" : "#2A1A00", color: a === coverages.length ? C.green : C.yellow, borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>{a}/{coverages.length}</span>
                  </button>
                );
              })}
            </div>

            {active && sheets[active] && (() => {
              const nQ = normalize(search);
              const rows = sheets[active].coverages
                .map((c, idx) => ({ c, idx }))
                .filter(({ c }) => {
                  const isPend = c.tipo === "Pendiente" || !c.respuesta;
                  if (filter === "pendientes" && !isPend) return false;
                  if (filter === "respondidas" && isPend) return false;
                  if (filter === "revisar" && !needsReview(c)) return false;
                  if (!nQ) return true;
                  return normalize(c.texto).includes(nQ) || normalize(c.respuesta).includes(nQ);
                });
              const fbtn = (key, label) => (
                <button key={key} onClick={() => setFilter(key)} style={{
                  background: filter === key ? C.accent : "transparent",
                  color: filter === key ? "#fff" : C.muted,
                  border: `1px solid ${filter === key ? C.accent : C.border}`,
                  borderRadius: 6, padding: "5px 11px", cursor: "pointer", fontSize: 11, fontFamily: F,
                }}>{label}</button>
              );
              return (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: C.surface, padding: "11px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, letterSpacing: 0.8 }}>📄 {active.trim().toUpperCase()}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{tr.respColDetected(sheets[active].respCol + 1)}</span>
                </div>
                <div style={{ padding: "11px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={tr.reviewSearch}
                    style={{ flex: 1, minWidth: 180, background: "#0A1425", border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "7px 11px", fontSize: 12, fontFamily: F, outline: "none" }}
                  />
                  {fbtn("todas", tr.fAll)}
                  {fbtn("pendientes", tr.fPending)}
                  {fbtn("respondidas", tr.fAnswered)}
                  {fbtn("revisar", tr.fReview)}
                  <span style={{ fontSize: 11, color: C.muted }}>{tr.rowsOf(rows.length, sheets[active].coverages.length)}</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      <th style={{ ...sx.th, width: 36 }}>{tr.thNum}</th>
                      <th style={{ ...sx.th, width: "44%" }}>{tr.thCoverage}</th>
                      <th style={sx.th}>{tr.thAnswer}</th>
                      <th style={{ ...sx.th, width: 90 }}>{tr.thOrigin}</th>
                    </tr></thead>
                    <tbody>
                      {rows.map(({ c, idx }) => {
                        const review = needsReview(c);
                        return (
                        <tr key={idx} style={{
                          background: review ? "rgba(231,76,60,.07)" : idx % 2 ? "rgba(255,255,255,.015)" : "transparent",
                          boxShadow: review ? `inset 3px 0 0 ${C.red}` : "none",
                        }}>
                          <td style={{ ...sx.td, color: C.muted, fontSize: 10 }}>{idx + 1}</td>
                          <td style={{ ...sx.td, color: "#B0C0D8", maxWidth: 380 }}>{c.texto}</td>
                          <td style={sx.td}>
                            <textarea style={sx.ta} value={c.respuesta} placeholder={tr.noAnswer}
                              onChange={e => editResp(active, idx, e.target.value)}
                              onBlur={() => onBlurLearn(active, idx)}
                              onFocus={e => e.target.style.borderColor = C.accentLight}
                            />
                            <button onClick={() => aiSingle(active, idx)} disabled={rowLoading === `${active}::${idx}`}
                              style={{ ...sx.btnSm, marginTop: 5, opacity: rowLoading === `${active}::${idx}` ? 0.6 : 1, color: C.accentLight, borderColor: C.border }}>
                              {rowLoading === `${active}::${idx}` ? tr.aiRowLoading : tr.aiRowBtn}
                            </button>
                          </td>
                          <td style={{ ...sx.td, textAlign: "center" }}>
                            <span style={badge(c.tipo)}>{tr.tipoLabel[c.tipo] || c.tipo}</span>
                            {c.score > 0 && c.score < 1 && c.tipo === "Similar" &&
                              <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>{Math.round(c.score * 100)}%</div>}
                            {c.tipo === "IA" && c.confianza &&
                              <div style={{ fontSize: 9, marginTop: 4, color: c.confianza === "alta" ? C.green : c.confianza === "baja" ? C.red : C.yellow }}>
                                {tr.confLabel(c.confianza)}
                              </div>}
                            {review &&
                              <div style={{ fontSize: 9, marginTop: 4, color: C.red, fontWeight: 700 }}>{tr.reviewTag}</div>}
                          </td>
                        </tr>
                        );
                      })}
                      {rows.length === 0 && (
                        <tr><td colSpan={4} style={{ ...sx.td, textAlign: "center", color: C.muted, padding: 28 }}>
                          {tr.noResults}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              );
            })()}

            {Object.keys(sheets).length === 0 && (
              <div style={{ ...sx.card, textAlign: "center", color: C.muted, padding: 40 }}>
                {tr.noSheetsDetected}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
