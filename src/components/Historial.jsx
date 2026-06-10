// ─── Historial de cotizaciones ───────────────────────────────────────────────
// Lista las cotizaciones guardadas en localStorage de este navegador.
// Permite recalcular (re-cotizar con las tarifas actuales) o eliminar.

import { useState } from "react";
import { useConfig } from "../context/ConfigContext.jsx";
import { cargarCotizaciones, eliminarCotizacion } from "../utils/storage.js";
import { cotizar, firmarCotizacion, usd } from "../motor/cotizador.js";

export function Historial() {
  const { config } = useConfig();
  const [lista, setLista] = useState(cargarCotizaciones);

  const eliminar = (numero) => setLista(eliminarCotizacion(numero));

  // Regenera el PDF re-cotizando con las tarifas vigentes (la cotización vieja
  // pudo emitirse con otra configuración de precios).
  const descargar = async (cot) => {
    const { generarPdfCotizacion } = await import("../utils/pdf.js");
    const resultado = cotizar(cot.datos, config);
    const firma = { numero: cot.numero, verificacion: cot.verificacion ?? firmarCotizacion(cot.datos, resultado).verificacion };
    generarPdfCotizacion({ config, datos: cot.datos, resultado, firma, planSeleccionado: "estandar" });
  };

  if (!lista.length) {
    return (
      <div className="panel-angosto">
        <h1>Historial de cotizaciones</h1>
        <div className="tarjeta vacio">
          <p>Todavía no hay cotizaciones guardadas en este navegador.</p>
          <a href="#/cotizador" className="btn btn-acento">Hacer mi primera cotización →</a>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-angosto">
      <h1>Historial de cotizaciones</h1>
      <p className="sub">Guardadas en este navegador (las últimas 30).</p>
      <div className="historial-lista">
        {lista.map((cot) => (
          <div key={cot.numero} className="tarjeta historial-item">
            <div>
              <strong>{cot.numero}</strong>
              <p>
                {cot.datos.vehiculo.marca} {cot.datos.vehiculo.modelo} {cot.datos.vehiculo.anio} ·{" "}
                {usd(Number(cot.datos.vehiculo.valor))} · {cot.datos.conductor.ciudad}
              </p>
              <small>
                {new Date(cot.fecha).toLocaleString("es-EC")} · Estándar: {usd(cot.totales.estandar)}/año
              </small>
            </div>
            <div className="historial-acciones">
              <button type="button" className="btn btn-borde btn-chico" onClick={() => descargar(cot)}>
                📄 PDF
              </button>
              <button type="button" className="btn btn-borde btn-chico" onClick={() => eliminar(cot.numero)}>
                🗑 Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
