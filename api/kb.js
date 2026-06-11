// ─── Memoria compartida del equipo en la nube ────────────────────────────────
// GET  /api/kb → devuelve la memoria de la EMPRESA del usuario autenticado
// POST /api/kb → aplica cambios { upserts, deletes } y guarda el resultado
//
// Seguridad:
//   • El token de sesión de Clerk se VERIFICA aquí (firma criptográfica) y la
//     empresa se toma del token verificado — nunca de un parámetro del cliente.
//     Nadie puede leer ni escribir la memoria de otra empresa.
//   • Solo hay memoria en la nube para EMPRESAS (Clerk Organizations). El uso
//     personal sigue siendo 100% local, como siempre.
//
// Almacenamiento: Upstash Redis / Vercel KV vía REST (sin SDK, solo fetch).
// Variables de entorno del servidor:
//   KV_REST_API_URL  + KV_REST_API_TOKEN   (nombres que crea Vercel KV)
//   o UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (Upstash directo)
//   y CLERK_SECRET_KEY (ya usada por el login).
// Si faltan, responde { disabled: true } y la app sigue funcionando solo-local.

import { verifyToken } from "@clerk/backend";

const MAX_ENTRIES = 5000; // tope de entradas vivas por empresa
const MAX_TEXT = 400; // tope de caracteres por campo
const MAX_BATCH = 1500; // tope de cambios por llamada
const TOMB_TTL = 90 * 24 * 3600 * 1000; // lápidas: 90 días y se purgan

function kvEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function kvGet(kv, key) {
  const res = await fetch(`${kv.url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${kv.token}` },
  });
  if (!res.ok) throw new Error(`KV GET ${res.status}`);
  const data = await res.json();
  if (!data || data.result == null) return null;
  try { return JSON.parse(data.result); } catch { return null; }
}

async function kvSet(kv, key, value) {
  // POST /set/<key> con el valor en el cuerpo (forma recomendada para valores grandes)
  const res = await fetch(`${kv.url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kv.token}` },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`KV SET ${res.status}`);
}

// Verifica el token de Clerk y devuelve la empresa activa del usuario.
// Soporta los dos formatos de claims de Clerk (v1: org_id · v2: o.id).
async function authOrg(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const token = String(header).replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  const orgId = payload.org_id || (payload.o && payload.o.id) || null;
  if (!orgId) return null;
  return { orgId, userId: payload.sub };
}

const clip = (s, n) => String(s || "").slice(0, n);

// Fusiona los cambios del cliente dentro del mapa guardado.
// Por entrada gana el `updatedAt` más reciente (igual que en el cliente).
// Exportada para poder probarla sin servidor.
export function mergeIntoMap(map, upserts = [], deletes = []) {
  for (const u of upserts.slice(0, MAX_BATCH)) {
    if (!u || !u.cobertura || !("respuesta" in u)) continue;
    const key = clip(u.key || "", MAX_TEXT) || null;
    const k = key || normalizeKey(u.cobertura);
    const cur = map[k];
    const ts = Number(u.updatedAt) || Date.now();
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
    const ts = Number(d.updatedAt) || Date.now();
    const cur = map[k];
    if (cur && (cur.updatedAt || 0) >= ts) continue; // alguien la editó después del borrado
    map[k] = { deleted: true, updatedAt: ts };
  }
  // Purga lápidas viejas (ya se propagaron a todo el equipo hace tiempo).
  const limit = Date.now() - TOMB_TTL;
  for (const k of Object.keys(map)) {
    if (map[k].deleted && (map[k].updatedAt || 0) < limit) delete map[k];
  }
  return map;
}

// Misma normalización que el cliente (clave canónica de cada cobertura).
function normalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function handler(req, res) {
  const kv = kvEnv();
  if (!kv || !process.env.CLERK_SECRET_KEY) {
    // Sin base de datos configurada: la app trabaja solo-local sin error.
    // `check` dice qué pieza falta (true = la variable SÍ está) para poder
    // diagnosticar desde el navegador sin exponer ningún secreto.
    return res.status(200).json({
      disabled: true,
      check: {
        kv_url: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
        kv_token: !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
        clerk_secret: !!process.env.CLERK_SECRET_KEY,
      },
    });
  }

  let auth = null;
  try {
    auth = await authOrg(req);
  } catch (e) {
    // Incluye el motivo de Clerk (firma inválida, token vencido, instancia
    // equivocada…) para poder diagnosticar desde la app sin adivinar.
    return res.status(401).json({
      error: `Token de sesión inválido: ${String(e?.message || e).slice(0, 200)}. ` +
        "Verifica que CLERK_SECRET_KEY sea de la MISMA instancia de Clerk (test/live) que la clave pública.",
    });
  }
  if (!auth) {
    return res.status(401).json({ error: "Se requiere una sesión con empresa activa." });
  }

  const key = `cotizador:kb:${auth.orgId}`;

  try {
    if (req.method === "GET") {
      const map = (await kvGet(kv, key)) || {};
      return res.status(200).json({ entries: map, ts: Date.now() });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Método no permitido." });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const upserts = Array.isArray(body.upserts) ? body.upserts : [];
    const deletes = Array.isArray(body.deletes) ? body.deletes : [];
    if (upserts.length === 0 && deletes.length === 0) {
      return res.status(400).json({ error: "No se enviaron cambios." });
    }

    const map = mergeIntoMap((await kvGet(kv, key)) || {}, upserts, deletes);

    const vivas = Object.values(map).filter((e) => !e.deleted).length;
    if (vivas > MAX_ENTRIES) {
      return res.status(413).json({
        error: `La memoria del equipo superó el límite de ${MAX_ENTRIES} entradas. Depúrala desde el panel de Memoria.`,
      });
    }

    await kvSet(kv, key, map);
    return res.status(200).json({ ok: true, ts: Date.now(), n: vivas });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Error interno de sincronización." });
  }
}
