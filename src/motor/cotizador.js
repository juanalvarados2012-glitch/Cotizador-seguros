// ─── Motor de cotización de seguros vehiculares (Ecuador) ────────────────────
//
// FÓRMULA GENERAL (por cada plan):
//
//   prima neta = valor asegurado × tasa del plan × Π(factores de riesgo)
//                                                  └ edad, ciudad, uso,
//                                                    antigüedad, siniestros,
//                                                    licencia
//   (con un piso de `primaMinima`)
//
//   + Contribución Superintendencia de Compañías, Valores y Seguros (3.5%)
//   + Aporte al Seguro Social Campesino (0.5%)
//   + Derechos de emisión de la póliza (tabla por rango de prima)
//   ────────────────────────────────────────────────
//   = subtotal
//   + IVA (15%)
//   ────────────────────────────────────────────────
//   = PRIMA TOTAL ANUAL (USD)
//
//   cuota mensual = (prima total × (1 + recargo financiamiento)) / 12
//
// Todos los porcentajes y factores se leen de la configuración white-label,
// por lo que cada aseguradora puede calibrar su propia tarifa sin tocar código.

import { CIUDADES, LICENCIAS } from "../data/catalogos.js";

const PLANES = [
  { id: "basico", nombre: "Básico", tasaKey: "tasaBasica" },
  { id: "estandar", nombre: "Estándar", tasaKey: "tasaEstandar" },
  { id: "premium", nombre: "Premium", tasaKey: "tasaPremium" },
];

// Redondeo a centavos para evitar arrastre de decimales en los totales.
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Valida los datos del formulario contra las políticas de aceptación.
 * Devuelve una lista de errores legibles; vacía si todo está bien.
 */
export function validarSolicitud(datos, tarifas) {
  const errores = [];
  const anioActual = new Date().getFullYear();
  const v = datos.vehiculo;
  const c = datos.conductor;

  if (!v.marca) errores.push("Selecciona la marca del vehículo.");
  if (!v.modelo) errores.push("Selecciona el modelo del vehículo.");
  if (!v.anio) errores.push("Selecciona el año del vehículo.");
  if (!v.uso) errores.push("Selecciona el tipo de uso del vehículo.");

  const valor = Number(v.valor);
  if (!valor || valor <= 0) {
    errores.push("Ingresa el valor comercial del vehículo.");
  } else if (valor < tarifas.valorMinimoVehiculo) {
    errores.push(
      `El valor mínimo asegurable es $${tarifas.valorMinimoVehiculo.toLocaleString("en-US")}.`
    );
  } else if (valor > tarifas.valorMaximoVehiculo) {
    errores.push(
      `Para vehículos de más de $${tarifas.valorMaximoVehiculo.toLocaleString("en-US")} contáctanos directamente.`
    );
  }

  if (v.anio && anioActual - Number(v.anio) > tarifas.antiguedadMaxima) {
    errores.push(
      `Solo cotizamos en línea vehículos de hasta ${tarifas.antiguedadMaxima} años de antigüedad.`
    );
  }

  const edad = Number(c.edad);
  if (!edad) {
    errores.push("Ingresa la edad del conductor.");
  } else if (edad < tarifas.edadMinima || edad > tarifas.edadMaxima) {
    errores.push(
      `La edad del conductor debe estar entre ${tarifas.edadMinima} y ${tarifas.edadMaxima} años.`
    );
  }
  if (!c.ciudad) errores.push("Selecciona la ciudad de circulación.");
  if (!c.licencia) errores.push("Selecciona el tipo de licencia.");
  if (c.siniestros === "" || c.siniestros === undefined || c.siniestros === null) {
    errores.push("Indica los siniestros de los últimos 3 años.");
  }

  return errores;
}

/**
 * Calcula los factores de riesgo individuales del perfil.
 * Se devuelven desglosados para poder mostrarlos con transparencia
 * en el resultado y en el PDF.
 */
export function calcularFactores(datos, tarifas) {
  const f = tarifas.factores;
  const anioActual = new Date().getFullYear();
  const edad = Number(datos.conductor.edad);
  const antiguedad = Math.max(0, anioActual - Number(datos.vehiculo.anio));
  const siniestros = Number(datos.conductor.siniestros);

  // ── Edad del conductor ──
  let factorEdad;
  if (edad < 25) factorEdad = f.edad.menor25;
  else if (edad < 30) factorEdad = f.edad.de25a29;
  else if (edad <= 64) factorEdad = f.edad.de30a64;
  else factorEdad = f.edad.mayor64;

  // ── Ciudad de circulación ──
  const ciudad = CIUDADES.find((c) => c.nombre === datos.conductor.ciudad);
  const factorCiudad = ciudad ? ciudad.factor : 1.0;

  // ── Uso del vehículo ──
  const factorUso = f.uso[datos.vehiculo.uso] ?? 1.0;

  // ── Antigüedad del vehículo ──
  let factorAntiguedad;
  if (antiguedad <= 3) factorAntiguedad = f.antiguedad.de0a3;
  else if (antiguedad <= 7) factorAntiguedad = f.antiguedad.de4a7;
  else if (antiguedad <= 12) factorAntiguedad = f.antiguedad.de8a12;
  else factorAntiguedad = f.antiguedad.mayor12;

  // ── Historial de siniestros ──
  let factorSiniestros;
  if (siniestros === 0) factorSiniestros = f.siniestros.cero;
  else if (siniestros === 1) factorSiniestros = f.siniestros.uno;
  else if (siniestros === 2) factorSiniestros = f.siniestros.dos;
  else factorSiniestros = f.siniestros.tresOMas;

  // ── Licencia ──
  // Licencia profesional (C/D/E) descuenta; pero usar el vehículo de forma
  // comercial/transporte SIN licencia profesional agrava el riesgo.
  const lic = LICENCIAS.find((l) => l.tipo === datos.conductor.licencia);
  const usoExigeProfesional = datos.vehiculo.uso !== "particular";
  let factorLicencia = 1.0;
  if (lic?.profesional) factorLicencia = f.licenciaProfesional;
  else if (usoExigeProfesional) factorLicencia = f.licenciaNoProfesionalUsoComercial;

  return [
    { nombre: "Edad del conductor", valor: factorEdad },
    { nombre: "Ciudad de circulación", valor: factorCiudad },
    { nombre: "Uso del vehículo", valor: factorUso },
    { nombre: "Antigüedad del vehículo", valor: factorAntiguedad },
    { nombre: "Historial de siniestros", valor: factorSiniestros },
    { nombre: "Tipo de licencia", valor: factorLicencia },
  ];
}

/** Derechos de emisión según la tabla por rango de prima neta. */
function derechosEmision(primaNeta, tabla) {
  const fila = tabla.find((t) => primaNeta <= t.hasta);
  return fila ? fila.valor : tabla[tabla.length - 1].valor;
}

/**
 * Cotiza los 3 planes para un perfil de riesgo.
 * Devuelve { factores, factorTotal, planes: [ {id, nombre, primaNeta, ...} ] }.
 */
export function cotizar(datos, config) {
  const { tarifas, coberturas } = config;
  const valor = Number(datos.vehiculo.valor);

  const factores = calcularFactores(datos, tarifas);
  const factorTotal = factores.reduce((acc, f) => acc * f.valor, 1);

  const planes = PLANES.map((plan) => {
    const tasa = tarifas[plan.tasaKey] / 100;

    // 1) Prima neta = valor × tasa × factores (nunca menor a la prima mínima)
    const primaNeta = r2(Math.max(valor * tasa * factorTotal, tarifas.primaMinima));

    // 2) Recargos legales de Ecuador
    const contribSuper = r2(primaNeta * (tarifas.legales.contribucionSuperintendencia / 100));
    const campesino = r2(primaNeta * (tarifas.legales.seguroCampesino / 100));
    const emision = derechosEmision(primaNeta, tarifas.legales.derechosEmision);

    // 3) Subtotal + IVA = prima total anual
    const subtotal = r2(primaNeta + contribSuper + campesino + emision);
    const iva = r2(subtotal * (tarifas.legales.iva / 100));
    const total = r2(subtotal + iva);

    // 4) Cuota mensual con recargo de financiamiento
    const cuotaMensual = r2((total * (1 + tarifas.recargoMensual / 100)) / 12);

    return {
      id: plan.id,
      nombre: plan.nombre,
      tasa: tarifas[plan.tasaKey],
      primaNeta,
      contribSuper,
      campesino,
      emision,
      subtotal,
      iva,
      total,
      cuotaMensual,
      deducible: tarifas.deducibles[plan.id],
      coberturas: coberturas[plan.id],
    };
  });

  return { factores, factorTotal: r2(factorTotal), planes };
}

/** Formatea un número como dólares (moneda oficial de Ecuador). */
export function usd(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * Genera el número único de cotización y un código de verificación que
 * "firma" el documento: es un hash determinístico del contenido, con el cual
 * la aseguradora puede comprobar que el PDF no fue alterado.
 */
export function firmarCotizacion(datos, resultado) {
  const numero = `COT-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
  const payload = JSON.stringify({ datos, totales: resultado.planes.map((p) => p.total) });
  // Hash FNV-1a de 32 bits: suficiente como código de verificación visual.
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return { numero, verificacion: hash.toString(16).toUpperCase().padStart(8, "0") };
}
