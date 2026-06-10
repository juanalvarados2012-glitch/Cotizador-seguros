// ─── Formulario "Solicitar demo" (captura de leads B2B) ──────────────────────
// Guarda el lead en localStorage (visible/exportable desde el panel admin) y
// muestra una confirmación. Sin backend: el dueño del producto exporta los
// leads como CSV desde #/admin.

import { useState } from "react";
import { guardarLead } from "../utils/storage.js";

const VACIO = { empresa: "", nombre: "", cargo: "", email: "", telefono: "", mensaje: "" };

export function DemoForm() {
  const [lead, setLead] = useState(VACIO);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");

  const set = (campo) => (e) => setLead({ ...lead, [campo]: e.target.value });

  const enviar = (e) => {
    e.preventDefault();
    if (!lead.empresa.trim() || !lead.nombre.trim() || !lead.email.trim()) {
      setError("Completa al menos empresa, nombre y correo.");
      return;
    }
    guardarLead(lead);
    setEnviado(true);
  };

  if (enviado) {
    return (
      <div className="panel-angosto">
        <div className="tarjeta confirmacion">
          <h2>✅ ¡Gracias, {lead.nombre.split(" ")[0]}!</h2>
          <p>
            Recibimos tu solicitud de demo para <strong>{lead.empresa}</strong>. Te
            contactaremos en menos de 24 horas laborables para agendar una sesión de 20
            minutos con el cotizador personalizado con tu marca.
          </p>
          <a href="#/cotizador" className="btn btn-acento">Mientras tanto, pruébalo en vivo →</a>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-angosto">
      <h1>Solicitar una demo</h1>
      <p className="sub">
        Cuéntanos de tu aseguradora o broker y te mostramos el cotizador funcionando con tu
        marca. Sin compromiso.
      </p>
      <form className="formulario" onSubmit={enviar}>
        <label>
          Empresa aseguradora / broker *
          <input value={lead.empresa} onChange={set("empresa")} placeholder="Ej.: Seguros Andinos S.A." />
        </label>
        <div className="fila-2">
          <label>
            Nombre completo *
            <input value={lead.nombre} onChange={set("nombre")} placeholder="Ej.: María Sánchez" />
          </label>
          <label>
            Cargo
            <input value={lead.cargo} onChange={set("cargo")} placeholder="Ej.: Gerente Comercial" />
          </label>
        </div>
        <div className="fila-2">
          <label>
            Correo corporativo *
            <input type="email" value={lead.email} onChange={set("email")} placeholder="nombre@empresa.com.ec" />
          </label>
          <label>
            Teléfono / WhatsApp
            <input value={lead.telefono} onChange={set("telefono")} placeholder="+593 99 999 9999" />
          </label>
        </div>
        <label>
          ¿Qué te gustaría resolver?
          <textarea
            rows="3"
            value={lead.mensaje}
            onChange={set("mensaje")}
            placeholder="Ej.: Queremos cotizar en línea desde nuestra web y captar más leads…"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-acento">Enviar solicitud</button>
      </form>
    </div>
  );
}
