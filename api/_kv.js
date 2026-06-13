// ─── Acceso compartido a Redis (Upstash / Vercel KV) vía REST ────────────────
// Sin SDK: solo fetch. Lo usan la memoria del equipo (/api/kb) y el limitador de
// uso del proxy de IA (/api/quote). Si no hay base configurada devuelve null y
// el llamador degrada con gracia (la app sigue funcionando).
//
// Los archivos con prefijo `_` NO se publican como funciones serverless en
// Vercel: son módulos auxiliares que importan las funciones reales.

export function kvEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export async function kvGet(kv, key) {
  const res = await fetch(`${kv.url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${kv.token}` },
  });
  if (!res.ok) throw new Error(`KV GET ${res.status}`);
  const data = await res.json();
  if (!data || data.result == null) return null;
  try { return JSON.parse(data.result); } catch { return null; }
}

export async function kvSet(kv, key, value) {
  // POST /set/<key> con el valor en el cuerpo (forma recomendada para valores grandes)
  const res = await fetch(`${kv.url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kv.token}` },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`KV SET ${res.status}`);
}

// Ejecuta un comando arbitrario de Redis con la API REST estilo-ruta de Upstash:
//   kvCmd(kv, ["INCR", "clave"])  →  https://…/INCR/clave
// Devuelve el campo `result` (sin parsear JSON: los comandos numéricos lo dan
// como número/cadena). Se usa para el limitador de uso (INCR + EXPIRE) y para
// leer el valor crudo en el compare-and-swap.
export async function kvCmd(kv, parts) {
  const path = parts.map((p) => encodeURIComponent(String(p))).join("/");
  const res = await fetch(`${kv.url}/${path}`, {
    headers: { Authorization: `Bearer ${kv.token}` },
  });
  if (!res.ok) throw new Error(`KV ${parts[0]} ${res.status}`);
  const data = await res.json();
  return data.result;
}

// Ejecuta un script Lua (comando EVAL) por POST. Permite operaciones atómicas
// como el compare-and-swap de la memoria del equipo. keys/args son arreglos.
export async function kvEval(kv, script, keys = [], args = []) {
  const body = ["EVAL", script, keys.length, ...keys, ...args];
  const res = await fetch(kv.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${kv.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`KV EVAL ${res.status}`);
  const data = await res.json();
  return data.result;
}

// Guarda `newRaw` SOLO si el valor actual sigue siendo `expectedRaw` (o sigue sin
// existir, cuando expectedRaw es null). Atómico: dos escritores concurrentes no
// se pisan; el que pierde reintenta releyendo. Devuelve true si escribió.
export async function kvCompareAndSet(kv, key, expectedRaw, newRaw) {
  if (expectedRaw == null) {
    const script =
      "if redis.call('EXISTS', KEYS[1]) == 0 then redis.call('SET', KEYS[1], ARGV[1]); return 1 else return 0 end";
    return Number(await kvEval(kv, script, [key], [newRaw])) === 1;
  }
  const script =
    "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2]); return 1 else return 0 end";
  return Number(await kvEval(kv, script, [key], [expectedRaw, newRaw])) === 1;
}
