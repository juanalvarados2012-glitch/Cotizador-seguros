// ─── Contexto de configuración white-label ───────────────────────────────────
// Distribuye la configuración (marca, colores, tarifas) a toda la app y la
// sincroniza con localStorage. Además aplica los colores corporativos como
// variables CSS, de modo que TODO el theming responde a la configuración.

import { createContext, useContext, useEffect, useState } from "react";
import { defaultConfig } from "../config/defaultConfig.js";
import { cargarConfig, guardarConfig, borrarConfig } from "../utils/storage.js";

const ConfigContext = createContext(null);

// Mezcla superficial por sección: si en el futuro agregamos campos nuevos a
// defaultConfig, las configuraciones guardadas viejas no los pierden.
function mezclar(guardada) {
  if (!guardada) return defaultConfig;
  return {
    ...defaultConfig,
    ...guardada,
    empresa: { ...defaultConfig.empresa, ...guardada.empresa },
    tema: { ...defaultConfig.tema, ...guardada.tema },
    tarifas: {
      ...defaultConfig.tarifas,
      ...guardada.tarifas,
      factores: { ...defaultConfig.tarifas.factores, ...guardada.tarifas?.factores },
      legales: { ...defaultConfig.tarifas.legales, ...guardada.tarifas?.legales },
      deducibles: { ...defaultConfig.tarifas.deducibles, ...guardada.tarifas?.deducibles },
    },
    coberturas: { ...defaultConfig.coberturas, ...guardada.coberturas },
  };
}

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(() => mezclar(cargarConfig(null)));

  // Aplica el tema como variables CSS en :root cada vez que cambia.
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.style.setProperty("--primario", config.tema.colorPrimario);
    raiz.style.setProperty("--acento", config.tema.colorAcento);
    raiz.style.setProperty("--fondo", config.tema.colorFondo);
  }, [config.tema]);

  // Actualiza una sección de la config y la persiste.
  const actualizar = (cambios) => {
    setConfig((prev) => {
      const nueva = mezclar({ ...prev, ...cambios });
      guardarConfig(nueva);
      return nueva;
    });
  };

  // Vuelve a los valores de fábrica (borra la personalización local).
  const restaurar = () => {
    borrarConfig();
    setConfig(defaultConfig);
  };

  return (
    <ConfigContext.Provider value={{ config, actualizar, restaurar }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig debe usarse dentro de <ConfigProvider>");
  return ctx;
}
