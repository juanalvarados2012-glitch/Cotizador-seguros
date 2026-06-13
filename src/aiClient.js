// ─── Cliente del proxy de IA (/api/quote) ────────────────────────────────────
// La API key vive en el servidor (Groq), nunca en el navegador. El proxy exige
// sesión (token de Clerk) y aplica rate limit. Aislado de la UI para poder
// probarlo con fetch simulado.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function callAI(pendientes, hoja, kb, instrucciones = "", getToken = null) {
  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000); // 30s de timeout por lote
    try {
      // El proxy de IA exige sesión: adjunta el token de Clerk (fresco en cada
      // intento, por si expira durante una corrida larga).
      const token = getToken ? await getToken() : null;
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          hoja,
          instrucciones: (instrucciones || "").slice(0, 1200),
          pendientes: pendientes.map((p) => ({ texto: p.texto })),
          kb: kb.slice(0, 15).map((k) => ({ cobertura: k.cobertura, respuesta: k.respuesta })),
        }),
      });

      // 429 = límite de velocidad (Groq) o de uso por usuario → espera y reintenta.
      if (res.status === 429) {
        let retryAfter = 0, serverMsg = "";
        try { const j = await res.json(); retryAfter = Number(j.retryAfter) || 0; serverMsg = j.error || ""; } catch { /* sin cuerpo */ }
        clearTimeout(timer);
        if (attempt < MAX_RETRIES) {
          // Espera lo que pida el servidor, PERO con tope de 20 s: un límite
          // diario reporta un retryAfter de horas y no queremos colgar la app.
          const base = retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
          await sleep(Math.min(base, 20000));
          continue;
        }
        // Tras los reintentos, surfacea el motivo real (límite diario, etc.).
        throw new Error(serverMsg || "Servicio de IA saturado (429). Espera un momento y vuelve a intentar.");
      }

      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try { const j = await res.json(); msg = j.error || msg; } catch { /* sin cuerpo */ }
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
