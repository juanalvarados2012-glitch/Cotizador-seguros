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

// Red de seguridad: si algo truena dentro de la app, se muestra un mensaje
// amable con botón de recarga en vez de una pantalla negra. Los datos no se
// pierden (la sesión y la memoria quedan guardadas en el navegador).
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Error de la app:", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, background: "#0B0F1A", color: "#E8EDF5",
        fontFamily: "'IBM Plex Mono',monospace", textAlign: "center", lineHeight: 1.7,
      }}>
        <div style={{ maxWidth: 480 }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>😅</div>
          <h1 style={{ fontSize: 18, marginBottom: 10 }}>Algo salió mal / Something went wrong</h1>
          <p style={{ fontSize: 13, color: "#9FB1CC", marginBottom: 18 }}>
            Tranquilo: tu memoria y tu sesión están guardadas en este navegador.
            Recarga la página para continuar donde quedaste.
          </p>
          <button onClick={() => window.location.reload()} style={{
            background: "linear-gradient(135deg,#C4975A,#A8813E)", color: "#0B0F1A",
            border: "none", borderRadius: 8, padding: "12px 26px", cursor: "pointer",
            fontSize: 14, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
          }}>↺ Recargar / Reload</button>
          <div style={{ fontSize: 10.5, color: "#6B7FA0", marginTop: 16 }}>
            Detalle técnico: {String(this.state.error && this.state.error.message || this.state.error)}
          </div>
        </div>
      </div>
    );
  }
}

const root = createRoot(document.getElementById("root"));

if (!PUBLISHABLE_KEY) {
  root.render(<React.StrictMode><MissingKey /></React.StrictMode>);
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
          <SignedIn>
            <App />
          </SignedIn>
          <SignedOut>
            <Gate />
          </SignedOut>
        </ClerkProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
