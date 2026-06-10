// ─── Cotizador (wizard de 3 pasos) ───────────────────────────────────────────
// Paso 1: datos del vehículo · Paso 2: datos del conductor · Paso 3: resultado.
// Esta es la pantalla que la aseguradora embebe en su sitio (#/cotizador?embed=1).

import { useState } from "react";
import { useConfig } from "../context/ConfigContext.jsx";
import { FormVehiculo } from "./FormVehiculo.jsx";
import { FormConductor } from "./FormConductor.jsx";
import { Resultados } from "./Resultados.jsx";
import { cotizar, validarSolicitud, firmarCotizacion } from "../motor/cotizador.js";
import { guardarCotizacion } from "../utils/storage.js";

const DATOS_INICIALES = {
  vehiculo: { marca: "", modelo: "", anio: "", valor: "", uso: "particular" },
  conductor: { edad: "", ciudad: "", siniestros: "0", licencia: "B" },
};

const PASOS = ["Vehículo", "Conductor", "Planes"];

export function Cotizador() {
  const { config } = useConfig();
  const [paso, setPaso] = useState(0);
  const [datos, setDatos] = useState(DATOS_INICIALES);
  const [errores, setErrores] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [firma, setFirma] = useState(null);

  const setVehiculo = (vehiculo) => setDatos((d) => ({ ...d, vehiculo }));
  const setConductor = (conductor) => setDatos((d) => ({ ...d, conductor }));

  // Valida solo los campos del paso actual filtrando los mensajes del motor.
  const avanzar = () => {
    const todos = validarSolicitud(datos, config.tarifas);
    const delPaso =
      paso === 0
        ? todos.filter((e) => /veh|marca|modelo|año|valor|uso|antig/i.test(e))
        : todos;
    if (delPaso.length) {
      setErrores(delPaso);
      return;
    }
    setErrores([]);

    if (paso === 1) {
      // Calcula, firma y guarda la cotización en el historial local.
      const res = cotizar(datos, config);
      const f = firmarCotizacion(datos, res);
      setResultado(res);
      setFirma(f);
      guardarCotizacion({
        numero: f.numero,
        verificacion: f.verificacion,
        fecha: new Date().toISOString(),
        datos,
        totales: Object.fromEntries(res.planes.map((p) => [p.id, p.total])),
      });
    }
    setPaso(paso + 1);
  };

  const reiniciar = () => {
    setDatos(DATOS_INICIALES);
    setResultado(null);
    setFirma(null);
    setErrores([]);
    setPaso(0);
  };

  return (
    <div className="cotizador">
      <h1>Cotiza tu seguro vehicular</h1>
      <p className="sub">Obtén tu cotización en USD en menos de 60 segundos. Sin compromiso.</p>

      {/* Indicador de progreso */}
      <div className="progreso" role="list">
        {PASOS.map((nombre, i) => (
          <div key={nombre} className={`progreso-paso ${i === paso ? "actual" : ""} ${i < paso ? "hecho" : ""}`}>
            <span className="progreso-num">{i < paso ? "✓" : i + 1}</span>
            <span className="progreso-nombre">{nombre}</span>
          </div>
        ))}
      </div>

      {errores.length > 0 && (
        <div className="errores">
          {errores.map((e) => (
            <p key={e}>⚠ {e}</p>
          ))}
        </div>
      )}

      {paso === 0 && (
        <FormVehiculo vehiculo={datos.vehiculo} onChange={setVehiculo} onSiguiente={avanzar} />
      )}
      {paso === 1 && (
        <FormConductor
          conductor={datos.conductor}
          onChange={setConductor}
          onSiguiente={avanzar}
          onAtras={() => setPaso(0)}
        />
      )}
      {paso === 2 && resultado && (
        <Resultados datos={datos} resultado={resultado} firma={firma} onNueva={reiniciar} />
      )}
    </div>
  );
}
