// ─── Proxy serverless a Groq ─────────────────────────────────────────────────
// Esconde la API key en el servidor. Funciona como Serverless Function en Vercel
// y, en desarrollo, lo reutiliza el plugin `devApi` de vite.config.js.
//
// Seguridad: el endpoint NO es de acceso anónimo. Exige un token de sesión de
// Clerk válido (la app ya está detrás de login) y aplica un límite de uso por
// usuario, para que nadie con la URL pueda quemar la cuota/dinero de Groq.
//
// Variables de entorno (servidor, NUNCA expuestas al navegador):
//   GROQ_API_KEY        (obligatoria)
//   GROQ_MODEL          (opcional, por defecto llama-3.3-70b-versatile)
//   CLERK_SECRET_KEY    (obligatoria: autentica al usuario)
//   QUOTE_RL_PER_MIN    (opcional, por defecto 120 llamadas/min por usuario)
//   QUOTE_RL_PER_DAY    (opcional, por defecto 2000 llamadas/día por usuario)

import { verifyClerk } from "./_auth.js";
import { kvEnv } from "./_kv.js";
import { rateLimit } from "./_ratelimit.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const RL_PER_MIN = Number(process.env.QUOTE_RL_PER_MIN || 120);
const RL_PER_DAY = Number(process.env.QUOTE_RL_PER_DAY || 2000);

const SYSTEM = `Eres el sistema de suscripción de una aseguradora (Ecuador).
Tu trabajo es decidir la respuesta de la aseguradora a cada cobertura que pide el broker,
imitando el estilo y criterio de las respuestas previas.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Usa POST." });
  }

  // ── Autenticación: el proxy de IA exige una sesión de Clerk válida ──
  if (!process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({
      error: "Falta CLERK_SECRET_KEY en el servidor: el proxy de IA requiere autenticación. " +
        "Configúrala (misma instancia de Clerk —test/live— que la clave pública).",
    });
  }
  let auth = null;
  try {
    auth = await verifyClerk(req);
  } catch (e) {
    return res.status(401).json({
      error: `Sesión inválida: ${String(e?.message || e).slice(0, 160)}. Vuelve a iniciar sesión.`,
    });
  }
  if (!auth || !auth.userId) {
    return res.status(401).json({ error: "Inicia sesión para usar la IA." });
  }

  // ── Límite de uso por usuario (evita abuso de la cuota de Groq) ──
  const kv = kvEnv();
  const perMin = await rateLimit(kv, auth.userId, { limit: RL_PER_MIN, windowSec: 60, prefix: "quote:min" });
  if (!perMin.ok) {
    return res.status(429).json({
      error: "Alcanzaste el límite de uso por minuto. Espera unos segundos y reintenta.",
      retryAfter: perMin.retryAfter,
    });
  }
  const perDay = await rateLimit(kv, auth.userId, { limit: RL_PER_DAY, windowSec: 86400, prefix: "quote:day" });
  if (!perDay.ok) {
    return res.status(429).json({
      error: "Alcanzaste el límite diario de IA de tu cuenta. Vuelve a intentar mañana.",
      retryAfter: perDay.retryAfter,
    });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Falta GROQ_API_KEY en el servidor. Configúrala en .env (local) o en Vercel.",
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { hoja = "", pendientes = [], kb = [], instrucciones = "" } = body;
    const extra = String(instrucciones || "").trim().slice(0, 1200);

    if (!Array.isArray(pendientes) || pendientes.length === 0) {
      return res.status(400).json({ error: "No se enviaron coberturas pendientes." });
    }
    if (pendientes.length > 60) {
      return res.status(400).json({ error: "Demasiadas coberturas en una llamada (máximo 60 por lote)." });
    }

    // Topes de tamaño: controlan los tokens por llamada y evitan payloads abusivos.
    const clip = (s, n) => String(s || "").slice(0, n);
    const kbText = (Array.isArray(kb) ? kb : [])
      .slice(0, 40)
      .map((k) => `"${clip(k && k.cobertura, 200)}" → "${clip(k && k.respuesta, 200)}"`)
      .join("\n");
    const lista = pendientes.map((c, i) => `${i + 1}. "${clip(c && c.texto, 300)}"`).join("\n");

    const prompt = `Genera la respuesta de la aseguradora para cada cobertura del broker en la hoja "${hoja}".

RESPUESTAS PREVIAS DE LA ASEGURADORA (referencia de estilo y criterio):
${kbText}
${extra ? `\nINSTRUCCIONES DEL USUARIO (tienen prioridad sobre todo lo demás, síguelas al pie de la letra):\n${extra}\n` : ""}
COBERTURAS A RESPONDER:
${lista}

Reglas:
- Usa el estilo de las respuestas previas (suelen ser "Ok", "NO", un límite como "Hasta $5,000", o una aclaración corta).
- Las cifras monetarias van en dólares de Estados Unidos (USD), la moneda de Ecuador, con formato $5,000.
- Si no hay precedente claro, responde "REVISAR".
- Devuelve SOLO un objeto JSON con esta forma exacta, sin texto adicional:
{"respuestas":[{"idx":1,"respuesta":"...","confianza":"alta|media|baja"}]}`;

    const groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!groqRes.ok) {
      const detail = await groqRes.text().catch(() => "");
      // Reenvía el límite de velocidad para que el cliente reintente con espera.
      if (groqRes.status === 429) {
        const retryAfter = Number(groqRes.headers.get("retry-after")) || 0;
        return res.status(429).json({
          error: "Groq está limitando por exceso de uso (429).",
          retryAfter,
          detail: detail.slice(0, 300),
        });
      }
      return res.status(502).json({
        error: `Groq respondió ${groqRes.status}.`,
        detail: detail.slice(0, 500),
      });
    }

    const data = await groqRes.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    let parsed = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: "La IA devolvió un JSON inválido." });
    }

    const respuestas = Array.isArray(parsed) ? parsed : parsed.respuestas || [];
    return res.status(200).json({ respuestas });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Error interno del proxy." });
  }
}
