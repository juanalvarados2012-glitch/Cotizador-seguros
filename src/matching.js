// ─── Matching de coberturas + extracción del Excel (lógica pura) ──────────────
// Antes vivía dentro de App.jsx. Se extrajo aquí para poder probarla de forma
// aislada (test/matching.test.js) y aligerar el componente. No depende de React
// ni del DOM; las funciones que leen Excel reciben el módulo `xlsx` (XLSX) por
// parámetro, así el resto se puede testear sin esa librería.

import { normalize } from "./cloudSync";

// Ahorro de tiempo estimado: ~40 s por cobertura resuelta a mano (buscar
// precedente, redactar y escribir). Se usa en pantalla, en el Excel y en el ROI.
export const SECS_PER_ITEM = 40;

// ¿La respuesta conviene que un humano la revise? (baja confianza, REVISAR, match flojo)
export function needsReview(c) {
  if (!c || !c.respuesta) return false;
  const r = normalize(c.respuesta);
  if (r.includes("revisar")) return true;
  if (c.tipo === "IA" && c.confianza === "baja") return true;
  if (c.tipo === "Similar" && typeof c.score === "number" && c.score < 0.7) return true;
  return false;
}

// ─── Normalización + matching ──────────────────────────────────────────────────
const STOP = new Set(["de","la","el","los","las","y","o","del","en","por","para","un","una","a","con","que","se","su","al","como","es","si","no","aplicable","suma","asegurable","requerida","clausula","cláusula","opcional"]);

// Abreviaturas comunes en slips de seguros (Ecuador): se expanden a sus palabras
// completas para que "R.C." haga match con "Responsabilidad Civil", etc.
// Solo siglas inequívocas del ramo, para no crear coincidencias falsas.
const ABBR = {
  rc: ["responsabilidad", "civil"],
  amit: ["actos", "malintencionados", "terceros"],
  hmacc: ["huelga", "motin", "asonada", "conmocion", "civil"],
  deduc: ["deducible"],
  resp: ["responsabilidad"],
};
export function tokens(s) {
  return normalize(s).split(" ")
    .flatMap(w => (ABBR[w] !== undefined ? ABBR[w] : [w]))
    .filter(w => w.length > 2 && !STOP.has(w));
}
export function jaccard(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}
// Devuelve {respuesta, score, tipo} o null
// Combina Jaccard con un score de "contención": el texto del broker suele ser
// más largo que la clave en memoria, y Jaccard lo penaliza injustamente. La
// contención mide qué fracción de la clave aparece en el texto, lo que autollena
// muchas más coberturas. Las coincidencias flojas (0.5–0.7) quedan marcadas
// como "por revisar" para que un humano las confirme.
export function matchKB(texto, kb) {
  const nTexto = normalize(texto);
  const tSet = new Set(tokens(texto));
  let best = null;
  for (const k of kb) {
    const nK = normalize(k.cobertura);
    if (nK === nTexto) return { respuesta: k.respuesta, score: 1, tipo: "Exacta" };
    const kSet = new Set(tokens(k.cobertura));
    if (kSet.size === 0 || tSet.size === 0) continue;
    let inter = 0;
    kSet.forEach(x => { if (tSet.has(x)) inter++; });
    const jac = inter / (kSet.size + tSet.size - inter);   // similitud simétrica
    const cont = inter / kSet.size;                          // cuánto de la clave está en el texto
    const subset = kSet.size <= 6 && inter === kSet.size;    // clave corta totalmente contenida
    let eff = Math.max(jac, cont * 0.9);
    if (subset) eff = Math.max(eff, 0.8);
    if (!best || eff > best.score) best = { respuesta: k.respuesta, score: eff, tipo: eff >= 0.85 ? "Exacta" : "Similar" };
  }
  if (best && best.score >= 0.5) return best;
  return null;
}

// ─── Detectar columna de respuesta en una hoja ─────────────────────────────────
export function findResponseCol(data, coverageCol) {
  // Busca en las primeras 6 filas un encabezado tipo COTIZACIÓN / CÓNDOR / RESPUESTA
  for (let r = 0; r < Math.min(8, data.length); r++) {
    const row = data[r] || [];
    for (let c = row.length - 1; c >= 0; c--) {
      const v = normalize(row[c]);
      if (c > coverageCol && /(cotizacion|respuesta|oferta|aseguradora|propuesta|condiciones ofertadas)/.test(v)) return c;
    }
  }
  // fallback: una columna a la derecha del bloque de coberturas
  let maxCol = coverageCol;
  data.forEach(row => { if (row.length - 1 > maxCol) maxCol = row.length - 1; });
  return Math.max(coverageCol + 1, maxCol);
}

// ─── Extraer coberturas del workbook ───────────────────────────────────────────
// Ramos típicos del mercado ecuatoriano para reconocer hojas por su nombre.
const RELEVANT = ["multirriesgo","multiriesgo","deducible","dinero","valores","equipo","maquinaria",
  "vehiculo","vehículo","veh ","responsabilidad","transporte","garantia","garantía","incendio","robo",
  "electronico","electrónico","fidelidad","cumplimiento","anticipo","accidentes","lucro","rotura",
  "todo riesgo","casco","cobertura","ramo"];

// Celdas que son ENCABEZADO de tabla (no una cobertura real). Solo coincidencia
// exacta de toda la celda, para no descartar coberturas reales que empiecen igual.
const HEADER_CELLS = /^((nuestra )?respuesta(s)?( aseguradora| compania)?|cobertura(s)?( item)?|item(s)?|descripcion|detalle|amparos|beneficios|condiciones( particulares| generales)?|observaciones|cotizacion|aseguradora)$/;

export function isHeaderCell(val) { return HEADER_CELLS.test(normalize(val)); }

export function isListSheet(clean) {
  return clean.includes("listado") || clean.includes("list ") || clean.startsWith("list");
}

export function extractSheetCoverages(wb, sheetName, kb, XLSX) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (data.length === 0) return null;

  const coverages = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    // columna de cobertura = primera celda con texto descriptivo
    let covCol = -1, texto = "";
    for (let j = 0; j <= 2 && j < row.length; j++) {
      const val = String(row[j]).trim();
      if (val.length > 7 && /[a-záéíóúñ]/i.test(val) &&
        !/^(nan|cotizacion|coberturas|condiciones base|presentacion|aseguradora|aseguradob|ramo|total|valor asegurado)/i.test(normalize(val)) &&
        !isHeaderCell(val) &&
        !/^\d+$/.test(val)) {
        covCol = j; texto = val; break;
      }
    }
    if (covCol === -1) continue;

    const respCol = findResponseCol(data, covCol);
    const match = matchKB(texto, kb);
    coverages.push({
      fila: i, covCol, respCol,
      texto,
      respuesta: match ? match.respuesta : "",
      tipo: match ? match.tipo : "Pendiente",
      score: match ? match.score : 0,
      editado: false,
    });
  }
  if (coverages.length === 0) return null;
  return { coverages, respCol: coverages[0].respCol };
}

export function extractCoverages(wb, kb, XLSX) {
  const results = {};
  // 1ª pasada: hojas cuyo nombre menciona un ramo conocido.
  for (const sheetName of wb.SheetNames) {
    const clean = normalize(sheetName);
    if (!RELEVANT.some(r => clean.includes(normalize(r)))) continue;
    if (isListSheet(clean)) continue;
    const r = extractSheetCoverages(wb, sheetName, kb, XLSX);
    if (r) results[sheetName] = r;
  }
  // 2ª pasada (respaldo): si ningún nombre de hoja coincidió, se analizan TODAS
  // las hojas (menos listados) y se aceptan las que tengan suficientes filas de
  // cobertura. Así la app funciona aunque el broker nombre sus hojas distinto
  // ("Hoja1", "Slip", el nombre del cliente, etc.).
  if (Object.keys(results).length === 0) {
    for (const sheetName of wb.SheetNames) {
      if (isListSheet(normalize(sheetName))) continue;
      const r = extractSheetCoverages(wb, sheetName, kb, XLSX);
      if (r && r.coverages.length >= 3) results[sheetName] = r;
    }
  }
  return results;
}

// ─── Archivo base (key): construir memoria desde un archivo ya respondido ──────
// Recorre TODAS las hojas y extrae pares "cobertura → respuesta" de las filas que
// YA traen una respuesta escrita. Detección flexible: el usuario puede subir un
// archivo de pares pregunta/respuesta o una cotización vieja completa, y la app
// localiza sola la columna de respuestas. Devuelve un arreglo tipo KB.
export function kbFromWorkbook(wb, XLSX) {
  const pairs = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (data.length === 0) continue;
    for (let i = 0; i < data.length; i++) {
      const row = data[i] || [];
      // columna de cobertura = primera celda con texto descriptivo
      let covCol = -1, texto = "";
      for (let j = 0; j <= 2 && j < row.length; j++) {
        const val = String(row[j]).trim();
        if (val.length > 7 && /[a-záéíóúñ]/i.test(val) &&
          !/^(nan|cotizacion|coberturas|condiciones base|presentacion|aseguradora|aseguradob|ramo|total|valor asegurado)/i.test(normalize(val)) &&
          !isHeaderCell(val) &&
          !/^\d+$/.test(val)) { covCol = j; texto = val; break; }
      }
      if (covCol === -1) continue;
      const respCol = findResponseCol(data, covCol);
      const resp = String(row[respCol] != null ? row[respCol] : "").trim();
      // solo sirve si la fila YA tiene una respuesta distinta a la cobertura
      if (!resp || respCol === covCol || isHeaderCell(resp)) continue;
      if (normalize(resp) === normalize(texto)) continue;
      if (resp.length > 160) continue; // descarta párrafos largos (no son respuestas)
      pairs.push({ cobertura: texto, respuesta: resp, count: 1 });
    }
  }
  // dedup por cobertura normalizada (gana la última aparición)
  const map = new Map();
  for (const p of pairs) map.set(normalize(p.cobertura), p);
  return [...map.values()];
}

// Selecciona los ejemplos de memoria más parecidos al lote (menos tokens por llamada).
export function relevantKB(items, kb, max = 12) {
  const itemTokens = new Set(items.flatMap(it => tokens(it.texto)));
  if (itemTokens.size === 0 || kb.length <= max) return kb.slice(0, max);
  return kb
    .map(k => {
      const kt = tokens(k.cobertura);
      let overlap = 0;
      for (const t of kt) if (itemTokens.has(t)) overlap++;
      return { k, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, max)
    .map(s => s.k);
}
