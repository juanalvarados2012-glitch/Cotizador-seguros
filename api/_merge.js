// ─── Fusión de la memoria del equipo (lógica pura, sin servidor) ──────────────
// Vive aparte de api/kb.js para poder probarla sin cargar Clerk ni la red.
// Por entrada gana el `updatedAt` más reciente (last-write-wins). Los borrados
// se guardan como "lápidas" ({ deleted:true, updatedAt }) para que borrar en una
// máquina no haga "revivir" la entrada desde otra; las lápidas viejas se purgan.

export const MAX_TEXT = 400;   // tope de caracteres por campo
export const MAX_BATCH = 1500; // tope de cambios por llamada
export const TOMB_TTL = 90 * 24 * 3600 * 1000; // lápidas: 90 días y se purgan

const clip = (s, n) => String(s || "").slice(0, n);

// Misma normalización que el cliente (clave canónica de cada cobertura).
export function normalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Fusiona los cambios del cliente dentro del mapa guardado. Muta y devuelve `map`.
export function mergeIntoMap(map, upserts = [], deletes = [], now = Date.now()) {
  for (const u of upserts.slice(0, MAX_BATCH)) {
    if (!u || !u.cobertura || !("respuesta" in u)) continue;
    const key = clip(u.key || "", MAX_TEXT) || null;
    const k = key || normalizeKey(u.cobertura);
    const cur = map[k];
    const ts = Number(u.updatedAt) || now;
    if (cur && (cur.updatedAt || 0) >= ts) continue; // lo guardado es más nuevo
    map[k] = {
      cobertura: clip(u.cobertura, MAX_TEXT),
      respuesta: clip(u.respuesta, MAX_TEXT),
      count: Math.max(1, Number(u.count) || 1),
      updatedAt: ts,
    };
  }
  for (const d of (deletes || []).slice(0, MAX_BATCH)) {
    if (!d || !d.key) continue;
    const k = clip(d.key, MAX_TEXT);
    const ts = Number(d.updatedAt) || now;
    const cur = map[k];
    if (cur && (cur.updatedAt || 0) >= ts) continue; // alguien la editó después del borrado
    map[k] = { deleted: true, updatedAt: ts };
  }
  // Purga lápidas viejas (ya se propagaron a todo el equipo hace tiempo).
  const limit = now - TOMB_TTL;
  for (const k of Object.keys(map)) {
    if (map[k].deleted && (map[k].updatedAt || 0) < limit) delete map[k];
  }
  return map;
}
