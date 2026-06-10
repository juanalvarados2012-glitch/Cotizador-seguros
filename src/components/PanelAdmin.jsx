// ─── Panel de configuración white-label ──────────────────────────────────────
// Desde aquí la aseguradora personaliza TODO sin tocar código:
//   · Identidad: nombre, eslogan, logo, contacto y registro legal
//   · Colores corporativos (se aplican en vivo a toda la app y al PDF)
//   · Tarifas: tasas por plan, prima mínima, factores y límites de aceptación
//   · Coberturas de cada plan
// Además: leads de demo recibidos (con export CSV), export/import de la
// configuración como JSON y el snippet de embebido para su sitio web.

import { useState } from "react";
import { useConfig } from "../context/ConfigContext.jsx";
import { cargarLeads, exportarLeadsCSV } from "../utils/storage.js";

export function PanelAdmin() {
  const { config, actualizar, restaurar } = useConfig();
  const [guardado, setGuardado] = useState(false);
  const leads = cargarLeads();

  // Muestra el aviso "✓ Guardado" un instante después de cada cambio.
  const notificar = () => {
    setGuardado(true);
    setTimeout(() => setGuardado(false), 1500);
  };

  const setEmpresa = (campo) => (e) => {
    actualizar({ empresa: { ...config.empresa, [campo]: e.target.value } });
    notificar();
  };
  const setTema = (campo) => (e) => {
    actualizar({ tema: { ...config.tema, [campo]: e.target.value } });
    notificar();
  };
  const setTarifa = (campo) => (e) => {
    actualizar({ tarifas: { ...config.tarifas, [campo]: Number(e.target.value) } });
    notificar();
  };
  const setCoberturas = (plan) => (e) => {
    // Una cobertura por línea; se ignoran las líneas vacías.
    const lineas = e.target.value.split("\n");
    actualizar({ coberturas: { ...config.coberturas, [plan]: lineas } });
  };

  // El logo se guarda como data URL en localStorage (sin servidor de archivos).
  const subirLogo = (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
      actualizar({ empresa: { ...config.empresa, logo: lector.result } });
      notificar();
    };
    lector.readAsDataURL(archivo);
  };

  // ── Export / import de la configuración completa (para clonar clientes) ───
  const exportarConfig = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `config-${config.empresa.nombre.replaceAll(" ", "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importarConfig = (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
      try {
        actualizar(JSON.parse(lector.result));
        notificar();
      } catch {
        alert("El archivo no es un JSON de configuración válido.");
      }
    };
    lector.readAsText(archivo);
  };

  const urlEmbed = `${window.location.origin}${window.location.pathname}#/cotizador?embed=1`;
  const snippet = `<iframe src="${urlEmbed}" style="width:100%;min-height:900px;border:0" title="Cotizador de seguros"></iframe>`;

  return (
    <div className="panel-admin">
      <div className="admin-cabecera">
        <h1>Panel de configuración</h1>
        {guardado && <span className="badge-guardado">✓ Guardado</span>}
      </div>
      <p className="sub">
        Todos los cambios se guardan automáticamente en este navegador y se aplican en vivo al
        cotizador y al PDF. Usa <em>Exportar configuración</em> para llevar la personalización a
        otro equipo o entregarla a tu proveedor.
      </p>

      {/* ── Identidad ──────────────────────────────────────────────────────── */}
      <section className="tarjeta">
        <h2>🏢 Identidad de la aseguradora</h2>
        <div className="fila-2">
          <label>
            Nombre comercial
            <input value={config.empresa.nombre} onChange={setEmpresa("nombre")} />
          </label>
          <label>
            Eslogan
            <input value={config.empresa.eslogan} onChange={setEmpresa("eslogan")} />
          </label>
        </div>
        <div className="fila-2">
          <label>
            Teléfono
            <input value={config.empresa.telefono} onChange={setEmpresa("telefono")} />
          </label>
          <label>
            WhatsApp (con código de país)
            <input value={config.empresa.whatsapp} onChange={setEmpresa("whatsapp")} />
          </label>
        </div>
        <div className="fila-2">
          <label>
            Correo de cotizaciones
            <input value={config.empresa.email} onChange={setEmpresa("email")} />
          </label>
          <label>
            Registro Superintendencia (aparece en el PDF)
            <input
              value={config.empresa.registroSuperintendencia}
              onChange={setEmpresa("registroSuperintendencia")}
            />
          </label>
        </div>
        <label>
          Dirección
          <input value={config.empresa.direccion} onChange={setEmpresa("direccion")} />
        </label>
        <label>
          Logo (PNG o JPG, fondo transparente recomendado)
          <input type="file" accept="image/png,image/jpeg" onChange={subirLogo} />
        </label>
        {config.empresa.logo && (
          <div className="logo-preview">
            <img src={config.empresa.logo} alt="Logo actual" />
            <button
              type="button"
              className="btn btn-borde btn-chico"
              onClick={() => actualizar({ empresa: { ...config.empresa, logo: "" } })}
            >
              Quitar logo
            </button>
          </div>
        )}
      </section>

      {/* ── Colores ────────────────────────────────────────────────────────── */}
      <section className="tarjeta">
        <h2>🎨 Colores corporativos</h2>
        <div className="fila-3">
          <label>
            Color primario
            <input type="color" value={config.tema.colorPrimario} onChange={setTema("colorPrimario")} />
          </label>
          <label>
            Color de acento
            <input type="color" value={config.tema.colorAcento} onChange={setTema("colorAcento")} />
          </label>
          <label>
            Color de fondo
            <input type="color" value={config.tema.colorFondo} onChange={setTema("colorFondo")} />
          </label>
        </div>
      </section>

      {/* ── Tarifas ────────────────────────────────────────────────────────── */}
      <section className="tarjeta">
        <h2>💲 Tablas de precios</h2>
        <p className="nota">
          Tasa anual sobre el valor asegurado, por plan. Rango típico del mercado: 3% a 6%.
        </p>
        <div className="fila-3">
          <label>
            Tasa plan Básico (%)
            <input type="number" step="0.1" min="0" value={config.tarifas.tasaBasica} onChange={setTarifa("tasaBasica")} />
          </label>
          <label>
            Tasa plan Estándar (%)
            <input type="number" step="0.1" min="0" value={config.tarifas.tasaEstandar} onChange={setTarifa("tasaEstandar")} />
          </label>
          <label>
            Tasa plan Premium (%)
            <input type="number" step="0.1" min="0" value={config.tarifas.tasaPremium} onChange={setTarifa("tasaPremium")} />
          </label>
        </div>
        <div className="fila-3">
          <label>
            Prima neta mínima (USD)
            <input type="number" min="0" value={config.tarifas.primaMinima} onChange={setTarifa("primaMinima")} />
          </label>
          <label>
            Recargo pago mensual (%)
            <input type="number" step="0.5" min="0" value={config.tarifas.recargoMensual} onChange={setTarifa("recargoMensual")} />
          </label>
          <label>
            Antigüedad máxima (años)
            <input type="number" min="1" value={config.tarifas.antiguedadMaxima} onChange={setTarifa("antiguedadMaxima")} />
          </label>
        </div>
        <div className="fila-2">
          <label>
            Valor mínimo del vehículo (USD)
            <input type="number" min="0" value={config.tarifas.valorMinimoVehiculo} onChange={setTarifa("valorMinimoVehiculo")} />
          </label>
          <label>
            Valor máximo del vehículo (USD)
            <input type="number" min="0" value={config.tarifas.valorMaximoVehiculo} onChange={setTarifa("valorMaximoVehiculo")} />
          </label>
        </div>
      </section>

      {/* ── Coberturas ─────────────────────────────────────────────────────── */}
      <section className="tarjeta">
        <h2>🛡 Coberturas por plan</h2>
        <p className="nota">Una cobertura por línea. Se muestran en los resultados y en el PDF.</p>
        <div className="fila-3 coberturas-grid">
          {["basico", "estandar", "premium"].map((plan) => (
            <label key={plan}>
              Plan {plan.charAt(0).toUpperCase() + plan.slice(1)}
              <textarea
                rows="8"
                value={config.coberturas[plan].join("\n")}
                onChange={setCoberturas(plan)}
                onBlur={() => {
                  // Limpia líneas vacías al salir del campo.
                  actualizar({
                    coberturas: {
                      ...config.coberturas,
                      [plan]: config.coberturas[plan].map((l) => l.trim()).filter(Boolean),
                    },
                  });
                  notificar();
                }}
              />
            </label>
          ))}
        </div>
      </section>

      {/* ── Embebido ───────────────────────────────────────────────────────── */}
      <section className="tarjeta">
        <h2>🔗 Embeber en tu sitio web</h2>
        <p className="nota">
          Pega este código en cualquier página de tu sitio para mostrar el cotizador con tu marca
          (sin la cabecera ni el pie de esta app):
        </p>
        <pre className="snippet">{snippet}</pre>
        <button
          type="button"
          className="btn btn-borde btn-chico"
          onClick={() => navigator.clipboard?.writeText(snippet)}
        >
          📋 Copiar código
        </button>
      </section>

      {/* ── Leads de demo ──────────────────────────────────────────────────── */}
      <section className="tarjeta">
        <h2>📥 Leads de "Solicitar demo" ({leads.length})</h2>
        {leads.length === 0 ? (
          <p className="nota">Todavía no hay solicitudes de demo en este navegador.</p>
        ) : (
          <>
            <div className="tabla-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Empresa</th>
                    <th>Contacto</th>
                    <th>Email</th>
                    <th>Teléfono</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.fecha + l.email}>
                      <td>{new Date(l.fecha).toLocaleDateString("es-EC")}</td>
                      <td>{l.empresa}</td>
                      <td>{l.nombre}{l.cargo ? ` (${l.cargo})` : ""}</td>
                      <td>{l.email}</td>
                      <td>{l.telefono}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="btn btn-borde btn-chico" onClick={exportarLeadsCSV}>
              ⬇ Exportar CSV
            </button>
          </>
        )}
      </section>

      {/* ── Respaldo ───────────────────────────────────────────────────────── */}
      <section className="tarjeta">
        <h2>⚙️ Respaldo de configuración</h2>
        <div className="acciones-paso">
          <button type="button" className="btn btn-borde" onClick={exportarConfig}>
            ⬇ Exportar configuración (JSON)
          </button>
          <label className="btn btn-borde btn-archivo">
            ⬆ Importar configuración
            <input type="file" accept="application/json" onChange={importarConfig} hidden />
          </label>
          <button
            type="button"
            className="btn btn-peligro"
            onClick={() => {
              if (confirm("¿Volver a los valores de fábrica? Se perderá la personalización local.")) {
                restaurar();
              }
            }}
          >
            ↺ Restaurar valores de fábrica
          </button>
        </div>
      </section>
    </div>
  );
}
