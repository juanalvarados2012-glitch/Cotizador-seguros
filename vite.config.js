import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ─── Configuración de Vite ───────────────────────────────────────────────────
// El producto es 100% client-side: no hay backend ni variables secretas.
// `base: "./"` permite servir el build desde cualquier subcarpeta o dominio,
// ideal para que cada aseguradora lo aloje donde prefiera (o lo embeba en
// su sitio con un <iframe>).
export default defineConfig({
  base: "./",
  plugins: [react()],
});
