// ─── App principal: enrutado por hash ────────────────────────────────────────
// Se usa enrutado por hash (#/) en lugar de react-router para que el build
// funcione desde cualquier carpeta/CDN sin configurar el servidor, y para que
// la herramienta sea embebible en un <iframe> apuntando directo a una ruta:
//
//   #/           → Landing B2B de ventas (para la aseguradora prospecto)
//   #/cotizador  → El cotizador en sí (lo que ve el cliente final / embebible)
//   #/historial  → Cotizaciones anteriores guardadas en este navegador
//   #/admin      → Panel de configuración white-label de la aseguradora
//   #/demo       → Formulario de solicitud de demo (captura de leads)

import { useEffect, useState } from "react";
import { useConfig } from "./context/ConfigContext.jsx";
import { Landing } from "./components/Landing.jsx";
import { Cotizador } from "./components/Cotizador.jsx";
import { Historial } from "./components/Historial.jsx";
import { PanelAdmin } from "./components/PanelAdmin.jsx";
import { DemoForm } from "./components/DemoForm.jsx";

function rutaActual() {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0] || "";
}

export function App() {
  const [ruta, setRuta] = useState(rutaActual);
  const { config } = useConfig();

  useEffect(() => {
    const onHash = () => {
      setRuta(rutaActual());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Modo embebido (?embed=1 en el hash): oculta cabecera y pie para que el
  // <iframe> en el sitio de la aseguradora muestre SOLO el cotizador.
  const embebido = window.location.hash.includes("embed=1");

  const paginas = {
    "": <Landing />,
    cotizador: <Cotizador />,
    historial: <Historial />,
    admin: <PanelAdmin />,
    demo: <DemoForm />,
  };

  // Las rutas de producto llevan la marca de la aseguradora; la landing lleva
  // la marca del producto (es la página de VENTA hacia aseguradoras).
  const esProducto = ruta !== "" && ruta !== "demo";

  return (
    <div className="app">
      {!embebido && (
        <header className="cabecera">
          <a href="#/" className="cabecera-marca">
            {esProducto && config.empresa.logo ? (
              <img src={config.empresa.logo} alt="" className="cabecera-logo" />
            ) : (
              <span className="cabecera-logo-placeholder">▣</span>
            )}
            <span>{esProducto ? config.empresa.nombre : "Auto Cotizador · White Label"}</span>
          </a>
          <nav className="cabecera-nav">
            <a href="#/cotizador" className={ruta === "cotizador" ? "activo" : ""}>Cotizar</a>
            <a href="#/historial" className={ruta === "historial" ? "activo" : ""}>Historial</a>
            <a href="#/admin" className={ruta === "admin" ? "activo" : ""}>Configuración</a>
            {!esProducto && (
              <a href="#/demo" className="btn btn-acento btn-chico">Solicitar demo</a>
            )}
          </nav>
        </header>
      )}

      <main className={embebido ? "contenido embebido" : "contenido"}>
        {paginas[ruta] ?? <Landing />}
      </main>

      {!embebido && (
        <footer className="pie">
          <p>
            {esProducto
              ? `${config.empresa.nombre} · ${config.empresa.registroSuperintendencia} · Controlada por la Superintendencia de Compañías, Valores y Seguros del Ecuador`
              : "Auto Cotizador White Label · Hecho para aseguradoras de Ecuador · Valores en USD"}
          </p>
        </footer>
      )}
    </div>
  );
}
