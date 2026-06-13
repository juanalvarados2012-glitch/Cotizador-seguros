// ─── Limitador de uso (rate limit) por usuario ───────────────────────────────
// Protege el proxy de IA (/api/quote) del abuso: un atacante con la URL no puede
// quemar la cuota/dinero de Groq. Ventana fija por usuario.
//
//   • Si hay Redis (Upstash/Vercel KV) configurado, el conteo es global y fiable
//     entre todas las instancias serverless (INCR + EXPIRE).
//   • Si no hay Redis, cae a un limitador en memoria por instancia: menos exacto
//     (cada instancia cuenta aparte) pero suficiente para frenar abusos básicos.
//
// Nunca bloquea por un fallo de infraestructura: si Redis falla, degrada al
// limitador en memoria en lugar de tumbar el servicio.

import { kvCmd } from "./_kv.js";

const mem = new Map(); // clave → { count, reset }

function memHit(key, limit, windowMs) {
  const now = Date.now();
  let e = mem.get(key);
  if (!e || now >= e.reset) { e = { count: 0, reset: now + windowMs }; mem.set(key, e); }
  e.count++;
  return {
    ok: e.count <= limit,
    remaining: Math.max(0, limit - e.count),
    retryAfter: Math.max(1, Math.ceil((e.reset - now) / 1000)),
  };
}

// Cuenta un acceso y dice si está dentro del límite.
//   kv        : resultado de kvEnv() (o null)
//   id        : identificador del usuario (sub de Clerk)
//   limit     : máximo de accesos en la ventana
//   windowSec : duración de la ventana en segundos
//   prefix    : etiqueta para separar contadores (p. ej. "quote:min")
export async function rateLimit(kv, id, { limit, windowSec, prefix }) {
  if (!limit || limit <= 0) return { ok: true, remaining: Infinity, retryAfter: 0 };
  const windowMs = windowSec * 1000;
  if (!kv) return memHit(`${prefix}:${id}`, limit, windowMs);
  try {
    const now = Date.now();
    const bucket = Math.floor(now / windowMs);
    const key = `cotizador:rl:${prefix}:${id}:${bucket}`;
    const n = Number(await kvCmd(kv, ["INCR", key]));
    if (n === 1) await kvCmd(kv, ["EXPIRE", key, windowSec]);
    // Tiempo real que falta para que el bucket de ventana fija se reinicie
    // (no la ventana completa): así no le decimos al usuario que espere 24 h
    // cuando el límite diario se reinicia en segundos.
    const retryAfter = Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000));
    return { ok: n <= limit, remaining: Math.max(0, limit - n), retryAfter };
  } catch {
    // Redis caído: no tumbamos el servicio, usamos el limitador local.
    return memHit(`${prefix}:${id}`, limit, windowMs);
  }
}
