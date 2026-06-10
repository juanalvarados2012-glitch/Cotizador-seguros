// ─── Paso 1: datos del vehículo ──────────────────────────────────────────────
// Campos requeridos por la práctica de suscripción ecuatoriana: marca, modelo,
// año, valor comercial (USD) y tipo de uso.

import { useConfig } from "../context/ConfigContext.jsx";
import { MARCAS_MODELOS, USOS, aniosDisponibles } from "../data/catalogos.js";

export function FormVehiculo({ vehiculo, onChange, onSiguiente }) {
  const { config } = useConfig();
  const anios = aniosDisponibles(config.tarifas.antiguedadMaxima);
  const modelos = vehiculo.marca ? MARCAS_MODELOS[vehiculo.marca] || ["Otro"] : [];

  const set = (campo) => (e) => {
    const cambios = { ...vehiculo, [campo]: e.target.value };
    // Al cambiar de marca se limpia el modelo para no dejar combinaciones inválidas.
    if (campo === "marca") cambios.modelo = "";
    onChange(cambios);
  };

  return (
    <form
      className="formulario tarjeta"
      onSubmit={(e) => {
        e.preventDefault();
        onSiguiente();
      }}
    >
      <h2>🚗 Datos del vehículo</h2>

      <div className="fila-2">
        <label>
          Marca *
          <select value={vehiculo.marca} onChange={set("marca")}>
            <option value="">Selecciona…</option>
            {Object.keys(MARCAS_MODELOS).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Modelo *
          <select value={vehiculo.modelo} onChange={set("modelo")} disabled={!vehiculo.marca}>
            <option value="">{vehiculo.marca ? "Selecciona…" : "Elige una marca primero"}</option>
            {modelos.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="fila-2">
        <label>
          Año *
          <select value={vehiculo.anio} onChange={set("anio")}>
            <option value="">Selecciona…</option>
            {anios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Valor comercial (USD) *
          <input
            type="number"
            min="0"
            step="100"
            inputMode="numeric"
            placeholder={`Ej.: 18500 (mín. $${config.tarifas.valorMinimoVehiculo.toLocaleString("en-US")})`}
            value={vehiculo.valor}
            onChange={set("valor")}
          />
        </label>
      </div>

      <fieldset className="opciones-uso">
        <legend>Tipo de uso *</legend>
        {USOS.map((u) => (
          <label key={u.id} className={`opcion-uso ${vehiculo.uso === u.id ? "elegida" : ""}`}>
            <input
              type="radio"
              name="uso"
              value={u.id}
              checked={vehiculo.uso === u.id}
              onChange={set("uso")}
            />
            <strong>{u.nombre}</strong>
            <small>{u.descripcion}</small>
          </label>
        ))}
      </fieldset>

      <button type="submit" className="btn btn-acento">Siguiente: conductor →</button>
    </form>
  );
}
