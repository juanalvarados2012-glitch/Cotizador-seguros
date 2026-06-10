// ─── Paso 2: datos del conductor ─────────────────────────────────────────────
// Edad, ciudad de circulación, historial de siniestros y tipo de licencia
// (A/B/C/D/E según la clasificación de la Agencia Nacional de Tránsito).

import { CIUDADES, LICENCIAS } from "../data/catalogos.js";

export function FormConductor({ conductor, onChange, onSiguiente, onAtras }) {
  const set = (campo) => (e) => onChange({ ...conductor, [campo]: e.target.value });

  return (
    <form
      className="formulario tarjeta"
      onSubmit={(e) => {
        e.preventDefault();
        onSiguiente();
      }}
    >
      <h2>👤 Datos del conductor principal</h2>

      <div className="fila-2">
        <label>
          Edad *
          <input
            type="number"
            min="18"
            max="99"
            inputMode="numeric"
            placeholder="Ej.: 35"
            value={conductor.edad}
            onChange={set("edad")}
          />
        </label>
        <label>
          Ciudad de circulación *
          <select value={conductor.ciudad} onChange={set("ciudad")}>
            <option value="">Selecciona…</option>
            {CIUDADES.map((c) => (
              <option key={c.nombre} value={c.nombre}>{c.nombre}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="fila-2">
        <label>
          Siniestros en los últimos 3 años *
          <select value={conductor.siniestros} onChange={set("siniestros")}>
            <option value="0">Ninguno</option>
            <option value="1">1 siniestro</option>
            <option value="2">2 siniestros</option>
            <option value="3">3 o más</option>
          </select>
        </label>
        <label>
          Tipo de licencia *
          <select value={conductor.licencia} onChange={set("licencia")}>
            {LICENCIAS.map((l) => (
              <option key={l.tipo} value={l.tipo}>{l.descripcion}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="nota">
        🔒 No pedimos cédula ni datos sensibles para cotizar. La información se usa solo para
        calcular tu prima referencial.
      </p>

      <div className="acciones-paso">
        <button type="button" className="btn btn-borde" onClick={onAtras}>← Atrás</button>
        <button type="submit" className="btn btn-acento">Ver mis 3 planes →</button>
      </div>
    </form>
  );
}
