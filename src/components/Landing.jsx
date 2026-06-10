// ─── Landing B2B ─────────────────────────────────────────────────────────────
// Página de VENTA dirigida a la aseguradora (no al cliente final): explica el
// producto, muestra el precio sugerido y empuja a "Solicitar demo" o a probar
// el cotizador en vivo.

export function Landing() {
  return (
    <div className="landing">
      {/* ── Héroe ─────────────────────────────────────────────────────────── */}
      <section className="hero">
        <p className="hero-etiqueta">Para aseguradoras y brokers de Ecuador</p>
        <h1>
          Tu aseguradora cotizando seguros de auto <span className="resaltado">en línea, en 60 segundos</span>
        </h1>
        <p className="hero-sub">
          Cotizador white-label que embebes en tu sitio web con tu logo, tus colores y tus
          tarifas. El cliente cotiza, descarga su PDF con tu marca y tú recibes el contacto.
          Sin proyectos de TI de meses: listo en 48 horas.
        </p>
        <div className="hero-acciones">
          <a href="#/demo" className="btn btn-acento">Solicitar demo</a>
          <a href="#/cotizador" className="btn btn-borde">Probar el cotizador en vivo →</a>
        </div>
      </section>

      {/* ── Problema / solución ──────────────────────────────────────────── */}
      <section className="seccion">
        <h2>El 80% de quienes piden precio por WhatsApp nunca reciben respuesta a tiempo</h2>
        <div className="tarjetas-3">
          <div className="tarjeta">
            <h3>⏱ Cotiza al instante</h3>
            <p>
              El cliente ingresa su vehículo y su perfil, y recibe 3 planes (Básico, Estándar y
              Premium) con prima anual, cuota mensual y deducibles. Sin esperar a un asesor.
            </p>
          </div>
          <div className="tarjeta">
            <h3>🎨 100% con tu marca</h3>
            <p>
              Logo, colores corporativos, nombre y datos de contacto se configuran desde un
              panel, sin tocar código. El PDF de la cotización sale firmado con tu identidad.
            </p>
          </div>
          <div className="tarjeta">
            <h3>⚖️ Pensado para Ecuador</h3>
            <p>
              Desglose con contribución a la Superintendencia de Compañías, Valores y Seguros,
              Seguro Social Campesino, derechos de emisión e IVA. Todo en dólares (USD).
            </p>
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ────────────────────────────────────────────────── */}
      <section className="seccion seccion-alterna">
        <h2>Cómo funciona</h2>
        <ol className="pasos">
          <li><strong>1 · Configura tu marca.</strong> Sube tu logo, elige tus colores y calibra tus tasas y factores de riesgo desde el panel de configuración.</li>
          <li><strong>2 · Embebe o comparte.</strong> Pega una línea de código en tu sitio web (iframe) o comparte el enlace directo con tu equipo comercial.</li>
          <li><strong>3 · Vende más.</strong> Cada cotización queda guardada con los datos del prospecto; tu equipo da seguimiento con el PDF ya generado.</li>
        </ol>
      </section>

      {/* ── Precio ───────────────────────────────────────────────────────── */}
      <section className="seccion">
        <h2>Inversión</h2>
        <div className="tarjetas-2">
          <div className="tarjeta tarjeta-precio">
            <h3>Implementación</h3>
            <p className="precio">$300 – $800 <span>/ una sola vez</span></p>
            <ul>
              <li>Personalización con tu marca y tus tarifas</li>
              <li>Carga de tus tablas de precios y coberturas</li>
              <li>Instalación en tu sitio web o subdominio</li>
              <li>Capacitación a tu equipo comercial</li>
            </ul>
          </div>
          <div className="tarjeta tarjeta-precio destacada">
            <h3>Licencia mensual</h3>
            <p className="precio">$99 <span>/ mes por empresa</span></p>
            <ul>
              <li>Hosting y mantenimiento incluidos</li>
              <li>Actualizaciones de normativa (IVA, contribuciones)</li>
              <li>Ajustes de tarifas ilimitados desde el panel</li>
              <li>Soporte por WhatsApp en horario laboral</li>
            </ul>
          </div>
        </div>
        <p className="nota-centrada">
          Sin permanencia mínima · Una cotización que termine en póliza paga el mes entero.
        </p>
      </section>

      {/* ── Cumplimiento ─────────────────────────────────────────────────── */}
      <section className="seccion seccion-alterna">
        <h2>Cumplimiento normativo</h2>
        <p className="parrafo-ancho">
          La herramienta está diseñada según las prácticas del mercado asegurador ecuatoriano,
          supervisado por la <strong>Superintendencia de Compañías, Valores y Seguros</strong>:
          desglosa la contribución del 3.5%, el aporte del 0.5% al Seguro Social Campesino, los
          derechos de emisión y el IVA vigente; recoge los campos del vehículo y del conductor
          requeridos para la suscripción (incluido el tipo de licencia A/B/C/D/E de la Agencia
          Nacional de Tránsito) y muestra tu número de registro ante el ente de control en cada
          cotización. La cotización emitida es referencial y la emisión de la póliza sigue tu
          propio proceso de suscripción.
        </p>
      </section>

      {/* ── Cierre ───────────────────────────────────────────────────────── */}
      <section className="seccion cierre">
        <h2>Agenda una demo de 20 minutos</h2>
        <p>Te mostramos el cotizador funcionando con TU marca antes de que pagues un centavo.</p>
        <a href="#/demo" className="btn btn-acento">Solicitar demo</a>
      </section>
    </div>
  );
}
