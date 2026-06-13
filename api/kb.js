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

import { verifyClerk } from "./_auth.js";
import { kvEnv, kvGet, kvSet, kvCmd, kvCompareAndSet } from "./_kv.js";
import { mergeIntoMap } from "./_merge.js";

const MAX_ENTRIES = 5000; // tope de entradas vivas por empresa

// Verifica el token de Clerk y devuelve la empresa activa del usuario.
// Solo hay memoria en la nube para EMPRESAS: sin organización activa → null.
async function authOrg(req) {
  const auth = await verifyClerk(req);
  if (!auth || !auth.orgId) return null;
  return { orgId: auth.orgId, userId: auth.userId };
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

    // Lee-fusiona-escribe con compare-and-swap: si otro miembro del equipo
    // escribió entremedio, releemos y reintentamos en vez de pisar su cambio.
    // (El merge es por-entrada last-write-wins, así que reintentar es seguro.)
    // Un fallo transitorio de GET o de CAS NO se sobrescribe a ciegas: se
    // reintenta el ciclo completo. Solo en el último intento, si el CAS siguió
    // fallando (p. ej. backend sin EVAL), se hace un guardado directo de último
    // recurso. Los fallos persistentes devuelven 503 sin pisar a nadie.
    const RETRIES = 5;
    let vivas = 0;
    let written = false;
    let lastErr = null;
    for (let attempt = 0; attempt < RETRIES && !written; attempt++) {
      let raw;
      try {
        raw = await kvCmd(kv, ["GET", key]); // valor crudo (string) o null
      } catch (e) {
        lastErr = e; // GET transitorio: reintenta el ciclo
        continue;
      }
      let current = {};
      if (raw != null) { try { current = JSON.parse(raw); } catch { current = {}; } }
      const map = mergeIntoMap(current, upserts, deletes);

      vivas = Object.values(map).filter((e) => !e.deleted).length;
      if (vivas > MAX_ENTRIES) {
        return res.status(413).json({
          error: `La memoria del equipo superó el límite de ${MAX_ENTRIES} entradas. Depúrala desde el panel de Memoria.`,
        });
      }

      try {
        written = await kvCompareAndSet(kv, key, raw, JSON.stringify(map));
      } catch (e) {
        lastErr = e;
        if (attempt === RETRIES - 1) {
          // El CAS falló en todos los intentos (backend sin EVAL): último
          // recurso, guardado directo como el método clásico. Pierde atomicidad
          // solo en este caso límite y poco frecuente.
          await kvSet(kv, key, map);
          written = true;
        }
        // si no es el último intento: el bucle reintenta el CAS (atómico)
      }
    }
    if (!written) {
      // Conflicto sostenido o fallo de infraestructura: el cliente conserva sus
      // cambios localmente y reintenta. No pisamos lo que escribió el equipo.
      return res.status(503).json({
        error: `No se pudo sincronizar la memoria del equipo${lastErr ? `: ${String(lastErr.message || lastErr).slice(0, 160)}` : ""}. ` +
          "Tus cambios quedaron guardados en este navegador y se reintentarán.",
      });
    }
    return res.status(200).json({ ok: true, ts: Date.now(), n: vivas });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Error interno de sincronización." });
  }
}
