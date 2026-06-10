// ─── Paso 3: resultado con los 3 planes ──────────────────────────────────────
// Muestra Básico / Estándar / Premium con su desglose legal completo,
// los factores de riesgo aplicados (transparencia) y el botón de PDF.

import { useState } from "react";
import { useConfig } from "../context/ConfigContext.jsx";
import { usd } from "../motor/cotizador.js";

export function Resultados({ datos, resultado, firma, onNueva }) {
  const { config } = useConfig();
  // El plan Estándar viene preseleccionado: es el que más se vende.
  const [seleccionado, setSeleccionado] = useState("estandar");
  const [verDesglose, setVerDesglose] = useState(false);

  // jsPDF se carga bajo demanda: el cotizador embebido arranca liviano y la
  // librería solo se descarga cuando el usuario pide su PDF.
  const descargarPdf = async () => {
    const { generarPdfCotizacion } = await import("../utils/pdf.js");
    generarPdfCotizacion({ config, datos, resultado, firma, planSeleccionado: seleccionado });
  };

  return (
    <div className="resultados">
      <div className="resultados-meta">
        <p>
          Cotización <strong>{firma.numero}</strong> · {datos.vehiculo.marca} {datos.vehiculo.modelo}{" "}
          {datos.vehiculo.anio} · Valor asegurado {usd(Number(datos.vehiculo.valor))}
        </p>
        <p className="nota">Válida por 15 días · Valores en dólares (USD) · Incluye impuestos y contribuciones de ley</p>
      </div>

      <div className="planes">
        {resultado.planes.map((plan) => (
          <article
            key={plan.id}
            className={`plan ${plan.id === "estandar" ? "plan-popular" : ""} ${seleccionado === plan.id ? "plan-elegido" : ""}`}
            onClick={() => setSeleccionado(plan.id)}
          >
            {plan.id === "estandar" && <span className="plan-cinta">Más elegido</span>}
            <h3>{plan.nombre}</h3>
            <p className="plan-precio">
              {usd(plan.cuotaMensual)} <span>/mes</span>
            </p>
            <p className="plan-anual">{usd(plan.total)} al año (pago de contado)</p>
            <p className="plan-deducible">
              Deducible: {plan.deducible.porcentaje}% del siniestro (mín. {usd(plan.deducible.minimo)})
            </p>
            <ul className="plan-coberturas">
              {plan.coberturas.map((c) => (
                <li key={c}>✓ {c}</li>
              ))}
            </ul>
            <button
              type="button"
              className={seleccionado === plan.id ? "btn btn-acento" : "btn btn-borde"}
            >
              {seleccionado === plan.id ? "✓ Plan seleccionado" : "Elegir este plan"}
            </button>
          </article>
        ))}
      </div>

      {/* Desglose transparente: factores de riesgo + composición legal de la prima */}
      <button type="button" className="enlace" onClick={() => setVerDesglose(!verDesglose)}>
        {verDesglose ? "▲ Ocultar desglose del cálculo" : "▼ Ver cómo se calculó mi prima"}
      </button>

      {verDesglose && (
        <div className="tarjeta desglose">
          <h3>Factores de riesgo aplicados</h3>
          <table>
            <tbody>
              {resultado.factores.map((f) => (
                <tr key={f.nombre}>
                  <td>{f.nombre}</td>
                  <td className={f.valor > 1 ? "recargo" : f.valor < 1 ? "descuento" : ""}>
                    ×{f.valor.toFixed(2)}
                  </td>
                </tr>
              ))}
              <tr className="total">
                <td>Factor total del perfil</td>
                <td>×{resultado.factorTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <h3>Composición de la prima (impuestos y contribuciones de ley)</h3>
          <table>
            <thead>
              <tr>
                <th>Concepto</th>
                {resultado.planes.map((p) => (
                  <th key={p.id}>{p.nombre}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Prima neta anual", (p) => usd(p.primaNeta)],
                [`Contrib. Superintendencia (${config.tarifas.legales.contribucionSuperintendencia}%)`, (p) => usd(p.contribSuper)],
                [`Seguro Social Campesino (${config.tarifas.legales.seguroCampesino}%)`, (p) => usd(p.campesino)],
                ["Derechos de emisión", (p) => usd(p.emision)],
                [`IVA (${config.tarifas.legales.iva}%)`, (p) => usd(p.iva)],
              ].map(([nombre, valorDe]) => (
                <tr key={nombre}>
                  <td>{nombre}</td>
                  {resultado.planes.map((p) => (
                    <td key={p.id}>{valorDe(p)}</td>
                  ))}
                </tr>
              ))}
              <tr className="total">
                <td>Prima total anual</td>
                {resultado.planes.map((p) => (
                  <td key={p.id}>{usd(p.total)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="acciones-resultado">
        <button type="button" className="btn btn-acento" onClick={descargarPdf}>
          📄 Descargar cotización en PDF
        </button>
        <a
          className="btn btn-borde"
          href={`https://wa.me/${config.empresa.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
            `Hola, quiero contratar la cotización ${firma.numero} (plan ${seleccionado}).`
          )}`}
          target="_blank"
          rel="noreferrer"
        >
          💬 Contratar por WhatsApp
        </a>
        <button type="button" className="btn btn-borde" onClick={onNueva}>
          ↺ Nueva cotización
        </button>
      </div>

      <p className="legal">{config.textoLegal}</p>
      <p className="legal">
        Documento firmado electrónicamente · Código de verificación: <strong>{firma.verificacion}</strong>
      </p>
    </div>
  );
}
