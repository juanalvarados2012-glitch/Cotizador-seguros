import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";

// Config plana de ESLint (v9). Separa el código de cliente (navegador + React)
// del de servidor (funciones serverless en node). El objetivo es atrapar errores
// reales (variables sin declarar, etc.) sin ahogar en avisos de estilo.
export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,

  // ── Cliente: React en el navegador ──
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, react },
    rules: {
      // Marca como "usados" los identificadores referenciados solo en JSX
      // (Fragment, componentes de Clerk, etc.): evita falsos no-unused-vars.
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // ── Servidor + configs + tests: node ──
  {
    files: ["api/**/*.js", "*.config.js", "test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        fetch: "readonly",
        Response: "readonly",
        Request: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
