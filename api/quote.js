// ─── Proxy serverless a Groq ─────────────────────────────────────────────────
// Esconde la API key en el servidor. Funciona como Serverless Function en Vercel
// y, en desarrollo, lo reutiliza el plugin `devApi` de vite.config.js.
//
// Variables de entorno (servidor, NUNCA expuestas al navegador):
//   GROQ_API_KEY   (obligatoria)
//   GROQ_MODEL     (opcional, por defecto llama-3.3-70b-versatile)

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

const SYSTEM = `Eres el sistema de suscripción de una aseguradora (Ecuador).
Tu trabajo es decidir la respuesta de la aseguradora a cada cobertura que pide el broker,
imitando el estilo y criterio de las respuestas previas.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Usa POST." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Falta GROQ_API_KEY en el servidor. Configúrala en .env (local) o en Vercel.",
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { hoja = "", pendientes = [], kb = [] } = body;

    if (!Array.isArray(pendientes) || pendientes.length === 0) {
      return res.status(400).json({ error: "No se enviaron coberturas pendientes." });
    }

    const kbText = (Array.isArray(kb) ? kb : [])
      .slice(0, 90)
      .map((k) => `"${k.cobertura}" → "${k.respuesta}"`)
      .join("\n");
    const lista = pendientes.map((c, i) => `${i + 1}. "${c.texto}"`).join("\n");

    const prompt = `Genera la respuesta de la aseguradora para cada cobertura del broker en la hoja "${hoja}".

RESPUESTAS PREVIAS DE LA ASEGURADORA (referencia de estilo y criterio):
${kbText}

COBERTURAS A RESPONDER:
${lista}

Reglas:
- Usa el estilo de las respuestas previas (suelen ser "Ok", "NO", un límite como "Hasta $5,000", o una aclaración corta).
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
