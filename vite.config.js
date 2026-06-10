import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// ─── Plugin: sirve /api/quote en desarrollo ──────────────────────────────────
// Reutiliza la MISMA serverless function que usa Vercel en producción, para que
// `npm run dev` funcione de punta a punta (con la key del .env, server-side).
function devApi() {
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use("/api/quote", async (req, res) => {
        const send = (code, obj) => {
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(obj));
        };
        try {
          const { default: handler } = await server.ssrLoadModule("/api/quote.js");
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const raw = Buffer.concat(chunks).toString("utf8");
          req.body = raw ? JSON.parse(raw) : {};
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
  // Carga .env y lo expone a la serverless function en desarrollo (process.env).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return { plugins: [react(), devApi()] };
});
