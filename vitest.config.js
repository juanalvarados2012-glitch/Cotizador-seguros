import { defineConfig } from "vitest/config";

// Config de pruebas separada de vite.config.js (no carga el plugin devApi).
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.js"],
    include: ["test/**/*.test.js"],
  },
});
