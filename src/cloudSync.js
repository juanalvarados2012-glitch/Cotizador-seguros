// ─── Sincronización de la memoria en la nube (por empresa) ───────────────────
// Hace realidad la promesa central del producto: "lo que corrige un suscriptor
// lo aprovecha TODO el equipo", aunque cada uno trabaje en una computadora
// distinta. El navegador sigue siendo la copia de trabajo (localStorage,
// rápido y offline); la nube (/api/kb) es el punto de encuentro del equipo.
//
// Diseño:
//   • Cada entrada de memoria lleva `updatedAt`. Ante conflicto gana la más
//     reciente (last-write-wins por entrada, no por archivo completo).
//   • Los borrados viajan como "lápidas" ({ key, updatedAt }) para que borrar
//     en una máquina no haga que la entrada "reviva" desde otra.
//   • Si el servidor no está configurado (sin base de datos), la app sigue
//     funcionando 100% local: la sincronización degrada con gracia.

// Normalización compartida por el matching y por las claves de sincronización.
// (Misma lógica que usaba App.jsx; ahora vive aquí y App la importa.)
export function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Diff local: qué cambió entre la memoria anterior y la nueva ────────────
// Estampa `updatedAt` SOLO en las entradas que realmente cambiaron (las demás
// conservan su marca de tiempo, clave para que el merge no pelee de gratis).
// Devuelve { stamped, upserts, deletes } listo para encolar al servidor.
export function stampChanges(prevArr, nextArr, now = Date.now()) {
  const prevBy = new Map(prevArr.map((k) => [normalize(k.cobertura), k]));
  const seen = new Set();
  const upserts = [];
  const stamped = nextArr.map((k) => {
    const key = normalize(k.cobertura);
    seen.add(key);
    const p = prevBy.get(key);
    if (p && p.respuesta === k.respuesta && (p.count || 1) === (k.count || 1)) {
      // sin cambios: conserva la marca de tiempo que tuviera
      return p.updatedAt && !k.updatedAt ? { ...k, updatedAt: p.updatedAt } : k;
    }
    const e = { ...k, updatedAt: now };
    upserts.push(e);
    return e;
  });
  const deletes = [];
  for (const key of prevBy.keys()) {
    if (!seen.has(key)) deletes.push({ key, updatedAt: now });
  }
  return { stamped, upserts, deletes };
}

// ─── Merge con lo que llegó de la nube ───────────────────────────────────────
// localArr: memoria local · localTombs: { key: ts } de borrados locales ·
// remoteMap: { key: {cobertura, respuesta, count, updatedAt, deleted?} }.
// Devuelve la memoria fusionada y lo que falta subir (upserts/deletes locales
// más nuevos que lo remoto).
export function mergeRemote(localArr, localTombs = {}, remoteMap = {}) {
  const localBy = new Map(localArr.map((k) => [normalize(k.cobertura), k]));
  const merged = new Map();
  const upserts = [];
  const deletes = [];

  for (const [key, r] of Object.entries(remoteMap)) {
    const l = localBy.get(key);
    const rTs = r.updatedAt || 0;
    if (r.deleted) {
      // borrado remoto: solo sobrevive si lo local es más reciente
      if (l && (l.updatedAt || 0) > rTs) {
        merged.set(key, l);
        upserts.push(l);
      }
      continue;
    }
    // borrado local más reciente que la entrada remota → propagar el borrado
    if ((localTombs[key] || 0) > rTs) {
      deletes.push({ key, updatedAt: localTombs[key] });
      continue;
    }
    if (l && (l.updatedAt || 0) > rTs) {
      merged.set(key, l);
      if (l.respuesta !== r.respuesta || (l.count || 1) !== (r.count || 1)) upserts.push(l);
    } else {
      merged.set(key, {
        cobertura: r.cobertura,
        respuesta: r.respuesta,
        count: r.count || 1,
        updatedAt: rTs,
      });
    }
  }

  // entradas locales que la nube todavía no conoce
  for (const [key, l] of localBy) {
    if (!(key in remoteMap)) {
      merged.set(key, l);
      upserts.push(l);
    }
  }

  return { merged: [...merged.values()], upserts, deletes };
}

// ─── Lápidas locales (borrados pendientes de propagar) ───────────────────────
const TOMB_TTL = 90 * 24 * 3600 * 1000; // 90 días: luego ya nadie las necesita

export function tombsLoad(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    const map = raw ? JSON.parse(raw) : {};
    const limit = Date.now() - TOMB_TTL;
    for (const k of Object.keys(map)) if (map[k] < limit) delete map[k];
    return map;
  } catch {
    return {};
  }
}

export function tombsSave(storageKey, map) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch { /* sin storage: se pierde la lápida, riesgo aceptable */ }
}

// ─── Llamadas al servidor ─────────────────────────────────────────────────────
// El token de sesión de Clerk identifica al usuario Y a su empresa: el servidor
// lo verifica y decide el scope. El cliente nunca elige qué memoria leer.
// Si el servidor rechaza, el error incluye el detalle para mostrarlo en la UI.
async function lanzarConDetalle(res, etiqueta) {
  let detalle = "";
  try { const j = await res.json(); detalle = j.error || ""; } catch { /* sin cuerpo */ }
  throw new Error(`${etiqueta} ${res.status}${detalle ? `: ${detalle}` : ""}`);
}

export async function kbPull(token) {
  const res = await fetch("/api/kb", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) await lanzarConDetalle(res, "Sync GET");
  return res.json(); // { disabled:true } | { entries: {...} }
}

export async function kbPush(token, upserts, deletes) {
  const res = await fetch("/api/kb", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ upserts, deletes }),
  });
  if (!res.ok) await lanzarConDetalle(res, "Sync POST");
  return res.json(); // { disabled:true } | { ok:true }
}
