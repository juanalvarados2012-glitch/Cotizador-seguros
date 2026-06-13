import { defineConfig } from "vitest/config";

// Config de pruebas separada de vite.config.js (no carga el plugin devApi).
export default defineConfig({
  // Runtime JSX automático (igual que @vitejs/plugin-react en el build): los
  // componentes no necesitan `import React`.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.js"],
    include: ["test/**/*.test.js"],
  },
});
