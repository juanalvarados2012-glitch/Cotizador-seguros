import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// ─── Plugin: sirve las funciones /api/* en desarrollo ────────────────────────
// Reutiliza las MISMAS serverless functions que usa Vercel en producción
// (api/quote.js, api/kb.js, …), para que `npm run dev` funcione de punta a
// punta con las claves del .env, del lado del servidor.
function devApi() {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use("/api", async (req, res) => {
        const send = (code, obj) => {
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(obj));
        };
        try {
          // /api/<nombre> → api/<nombre>.js (solo nombres simples, sin rutas raras)
          const name = (req.url || "").split("?")[0].replace(/^\/+|\/+$/g, "");
          if (!/^[a-z][a-z0-9_-]*$/i.test(name)) return send(404, { error: "Endpoint no encontrado." });
          const { default: handler } = await server.ssrLoadModule(`/api/${name}.js`);
          // Shims mínimos del runtime de Vercel: req.body + res.status().json()
          if (req.method !== "GET" && req.method !== "HEAD") {
            const chunks = [];
            for await (const c of req) chunks.push(c);
            const raw = Buffer.concat(chunks).toString("utf8");
            req.body = raw ? JSON.parse(raw) : {};
          }
          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (obj) => send(res.statusCode || 200, obj);
          await handler(req, res);
        } catch (e) {
          send(500, { error: e?.message || "Error en el proxy de desarrollo." });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Carga .env y lo expone a las serverless functions en desarrollo (process.env).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return { plugins: [react(), devApi()] };
});
