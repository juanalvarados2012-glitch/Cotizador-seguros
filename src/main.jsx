import React from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import App from "./App.jsx";
import "./styles.css";

// La publishable key se inyecta en build (Vite solo expone variables VITE_*).
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Pantalla de inicio de sesión obligatoria, centrada y con el fondo de la app.
function Gate() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, background: "#0B0F1A",
    }}>
      <SignIn routing="hash" />
    </div>
  );
}

// Si falta la key, avisamos claramente en vez de mostrar una pantalla en blanco.
function MissingKey() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, background: "#0B0F1A", color: "#E8EDF5",
      fontFamily: "'IBM Plex Mono',monospace", textAlign: "center", lineHeight: 1.7,
    }}>
      <div style={{ maxWidth: 460 }}>
        <div style={{ fontSize: 38, marginBottom: 12 }}>🔑</div>
        <h1 style={{ fontSize: 18, marginBottom: 10 }}>Falta configurar Clerk</h1>
        <p style={{ fontSize: 13, color: "#9FB1CC" }}>
          No se encontró <b>VITE_CLERK_PUBLISHABLE_KEY</b>. Agrégala en el archivo
          <b> .env</b> (local) y en las variables de entorno de Vercel, luego vuelve a desplegar.
        </p>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root"));

if (!PUBLISHABLE_KEY) {
  root.render(<React.StrictMode><MissingKey /></React.StrictMode>);
} else {
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <SignedIn>
          <App />
        </SignedIn>
        <SignedOut>
          <Gate />
        </SignedOut>
      </ClerkProvider>
    </React.StrictMode>
  );
}
