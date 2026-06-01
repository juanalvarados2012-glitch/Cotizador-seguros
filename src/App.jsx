import { useState, useRef, useEffect, useCallback, Fragment } from "react";

// xlsx se carga bajo demanda (code-splitting) para aligerar la carga inicial.
let _xlsx = null;
async function getXLSX() {
  if (!_xlsx) _xlsx = await import("xlsx");
  return _xlsx;
}

// Descarga un objeto como archivo JSON (para respaldo de memoria).
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
// ─── Storage shim (localStorage) ────────────────────────────────────────────
const storage = {
  async get(key) {
    const v = localStorage.getItem(key);
    return v == null ? null : { key, value: v };
  },
  async set(key, value) { localStorage.setItem(key, value); return { key, value }; },
};

// ─── Autoguardado de sesión ─────────────────────────────────────────────────
// Las respuestas (ligeras) van en localStorage; el archivo original (pesado)
// en IndexedDB, para poder reconstruir el Excel y exportar tras recargar.
const SESSION_META_KEY = "cotizador_sesion_v1";
const IDB_NAME = "cotizador_sesion";
const IDB_STORE = "archivo";
const IDB_KEY = "actual";
// Historial de archivos completados: metadatos ligeros (para la lista) y datos
// pesados (respuestas + bytes del Excel, solo se cargan al abrir un archivo).
const HIST_META = "historial";       // { id, fileName, ts, total, answered, pending }
const HIST_DATA = "historial_data";  // { id, sheets, bytes }

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(HIST_META)) db.createObjectStore(HIST_META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(HIST_DATA)) db.createObjectStore(HIST_DATA, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, IDB_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function idbGet() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const r = tx.objectStore(IDB_STORE).get(IDB_KEY);
    r.onsuccess = () => { db.close(); resolve(r.result || null); };
    r.onerror = () => { db.close(); reject(r.error); };
  });
}
async function idbClear() {
  try {
    const db = await idbOpen();
    await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch { /* sin IndexedDB */ }
}

// ─── Historial de archivos ──────────────────────────────────────────────────
async function histSave(entry) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([HIST_META, HIST_DATA], "readwrite");
    tx.objectStore(HIST_META).put({
      id: entry.id, fileName: entry.fileName, ts: entry.ts,
      total: entry.total, answered: entry.answered, pending: entry.pending,
    });
    tx.objectStore(HIST_DATA).put({ id: entry.id, sheets: entry.sheets, bytes: entry.bytes || null });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function histList() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIST_META, "readonly");
    const r = tx.objectStore(HIST_META).getAll();
    r.onsuccess = () => { db.close(); resolve(r.result || []); };
    r.onerror = () => { db.close(); reject(r.error); };
  });
}
async function histGet(id) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HIST_DATA, "readonly");
    const r = tx.objectStore(HIST_DATA).get(id);
    r.onsuccess = () => { db.close(); resolve(r.result || null); };
    r.onerror = () => { db.close(); reject(r.error); };
  });
}
async function histDelete(id) {
  const db = await idbOpen();
  return new Promise((resolve) => {
    const tx = db.transaction([HIST_META, HIST_DATA], "readwrite");
    tx.objectStore(HIST_META).delete(id);
    tx.objectStore(HIST_DATA).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); resolve(); };
  });
}

// ¿La respuesta conviene que un humano la revise? (baja confianza, REVISAR, match flojo)
function needsReview(c) {
  if (!c || !c.respuesta) return false;
  const r = normalize(c.respuesta);
  if (r.includes("revisar")) return true;
  if (c.tipo === "IA" && c.confianza === "baja") return true;
  if (c.tipo === "Similar" && typeof c.score === "number" && c.score < 0.7) return true;
  return false;
}


// ─── BASE DE CONOCIMIENTO SEMILLA (extraída del Unicomer completado) ──────────
const SEED_KB = [
  { cobertura: "Incendio y/o rayo y/o humo", respuesta: "ok" },
  { cobertura: "HMACC AMIT Huelga Motín Asonada Conmoción Civil Actos Malintencionados de Terceros", respuesta: "NO, esto es lucro cesante contingente, impedimento de acceso (exclusión de contratos)" },
  { cobertura: "Terremoto tsunami temblor erupción volcánica maremoto convulsión de la naturaleza", respuesta: "ok" },
  { cobertura: "Tifón huracán tornado ciclón granizada perturbación atmosférica", respuesta: "ok" },
  { cobertura: "Lluvia e Inundación", respuesta: "ok" },
  { cobertura: "Explosión", respuesta: "ok" },
  { cobertura: "Daños por agua", respuesta: "ok" },
  { cobertura: "Colapso", respuesta: "ok" },
  { cobertura: "Autoexplosión", respuesta: "Hasta $5,000" },
  { cobertura: "Desprendimiento de tierra o rocas alud", respuesta: "Se excluye de colapso" },
  { cobertura: "Daños por fuego subterráneo", respuesta: "NO" },
  { cobertura: "Choque con un vehículo terrestre o animal", respuesta: "NO" },
  { cobertura: "Contaminación de producto", respuesta: "NO" },
  { cobertura: "Todo riesgo de rotura de maquinaria", respuesta: "OK" },
  { cobertura: "Lucro cesante por interrupción del negocio incendio", respuesta: "Pérdidas por interrupción del negocio a consecuencia de un evento amparado bajo la póliza de Incendio y Líneas Aliadas, de acuerdo con las condiciones generales de la póliza." },
  { cobertura: "Modalidad de Cobertura forma inglesa", respuesta: "OK" },
  { cobertura: "Periodo de Indemnización", respuesta: "OK" },
  { cobertura: "Robo y/o Asalto a primer riesgo absoluto", respuesta: "Ok" },
  { cobertura: "Remoción de escombros", respuesta: "Ok" },
  { cobertura: "Honorarios de Profesionales gastos de viaje y estadía", respuesta: "Ok" },
  { cobertura: "Documentos y modelos", respuesta: "Ok" },
  { cobertura: "Rotura de vidrios y cristales", respuesta: "Ok" },
  { cobertura: "Gastos de extinción de incendio", respuesta: "Ok" },
  { cobertura: "Gastos para aminorar la pérdida", respuesta: "Ok" },
  { cobertura: "Terrorismo y Sabotaje", respuesta: "Ok" },
  { cobertura: "Combustión espontánea", respuesta: "Ok" },
  { cobertura: "Arrendamientos alquiler", respuesta: "Ok" },
  { cobertura: "Extintores y Otros Medios de Extinción", respuesta: "Ok" },
  { cobertura: "Refrigeración", respuesta: "Ok" },
  { cobertura: "Flete aéreo", respuesta: "Ok" },
  { cobertura: "Aceites lubricantes y refrigerantes", respuesta: "SOLO EN ROTURA" },
  { cobertura: "Suspensión de los servicios de energía eléctrica agua o gas", respuesta: "Ok" },
  { cobertura: "Proveedores distribuidores o procesadores", respuesta: "Ok" },
  { cobertura: "Hurto excepto Mercaderías y Dinero", respuesta: "Ok" },
  { cobertura: "Gastos por Anulación y Duplicación de Documentos", respuesta: "Ok" },
  { cobertura: "Saqueo", respuesta: "Ok" },
  { cobertura: "Adhesión", respuesta: "Ok" },
  { cobertura: "Ajustadores", respuesta: "Ok" },
  { cobertura: "Cláusula de Cobertura de Alteraciones y Reparaciones", respuesta: "Labores y materiales (Alteraciones y reparaciones), sin límite" },
  { cobertura: "Amparo automático nuevos predios propiedades y activos 45 días", respuesta: "ok" },
  { cobertura: "Arbitraje", respuesta: "Ok" },
  { cobertura: "Autoridad civil", respuesta: "Ok" },
  { cobertura: "Aviso de siniestro 10 días", respuesta: "Aclarar si son días calendario o hábiles" },
  { cobertura: "Avisos y letreros", respuesta: "Ok" },
  { cobertura: "Bienes a la intemperie", respuesta: "Amparo para bienes fuera de edificios" },
  { cobertura: "Bienes del asegurado bajo responsabilidad de terceros", respuesta: "Ok" },
  { cobertura: "Cancelación a prorrata", respuesta: "Ok" },
  { cobertura: "Cancelación de póliza 30 días", respuesta: "Terminación anticipada" },
  { cobertura: "Designación de bienes", respuesta: "Ok" },
  { cobertura: "Destrucción preventiva", respuesta: "Ok" },
  { cobertura: "Equipos móviles y portátiles", respuesta: "Cobertura de Equipos móviles y portátiles fuera de los predios asegurados (Endoso)" },
  { cobertura: "Errores u omisiones de descripción no de valores ni condiciones", respuesta: "Ok" },
  { cobertura: "Extensión de vigencia a prorrata", respuesta: "(de común acuerdo entre las partes)" },
  { cobertura: "Inspecciones 48 horas", respuesta: "NO" },
  { cobertura: "Intereses de contratistas", respuesta: "FAVOR CONFIRMAR, el cuadro de costos tiene otros valores" },
  { cobertura: "Libre circulación de bienes", respuesta: "Localización y libre transporte de mercaderías" },
  { cobertura: "Materiales importados 45 días", respuesta: "OK" },
  { cobertura: "No cancelación individual de cobertura", respuesta: "OK" },
  { cobertura: "No cancelación individual de póliza", respuesta: "OK" },
  { cobertura: "Obras civiles en curso", respuesta: "NO" },
  { cobertura: "Pago de primas 30 días", respuesta: "SÍ, SEGÚN CONDICIONES GENERALES" },
  { cobertura: "Par y juego límite agregado anual", respuesta: "OK" },
  { cobertura: "Primera opción de compra", respuesta: "OK" },
  { cobertura: "Propiedad Horizontal", respuesta: "OK" },
  { cobertura: "Propiedad de terceros bajo responsabilidad del asegurado", respuesta: "OK" },
  { cobertura: "Propiedad personal de empleados excluye joyas y dinero", respuesta: "OK" },
  { cobertura: "Reparaciones o reconstrucciones inmediatas", respuesta: "Sin límite" },
  { cobertura: "Reposición o reemplazo ramos técnicos", respuesta: "OK" },
  { cobertura: "Restitución Automática del Valor Asegurado", respuesta: "SÍ, DEPENDIENDO DEL RAMO: INCENDIO, EXCLUYE TERRORISMO Y SABOTAJE. ROBO: MÁXIMO 2 VECES" },
  { cobertura: "Salvamento", respuesta: "OK" },
  { cobertura: "Sellos y marcas", respuesta: "OK" },
  { cobertura: "Tolerancia 15% todos los rubros asegurados", respuesta: "OK" },
  { cobertura: "Traslado temporal excluye transporte y hurto", respuesta: "OK" },
  { cobertura: "Equipo Electrónico Todo riesgo sección I", respuesta: "Sección I Todo riesgo según condiciones generales de la póliza" },
  { cobertura: "Eléctrica amplia", respuesta: "Ok" },
  { cobertura: "Hornos cláusula opcional", respuesta: "Ok" },
  { cobertura: "Materiales en Fusión cláusula opcional", respuesta: "Ok" },
  { cobertura: "Amparo de Muelles cláusula opcional", respuesta: "Ok" },
  // Deducibles
  { cobertura: "Deducible terremoto lluvia inundación colapso eventos naturaleza", respuesta: "2% del valor asegurado total de la ubicación afectada" },
  { cobertura: "Deducible otros eventos caída accidental", respuesta: "10% del valor del siniestro, mínimo $500" },
  { cobertura: "Deducible vidrios", respuesta: "10% del valor del siniestro, mínimo $100" },
  { cobertura: "Deducible HMACC AMIT sabotaje y terrorismo", respuesta: "10% del valor del siniestro, mínimo $5,000" },
  { cobertura: "Deducible saqueo incendio", respuesta: "10% del valor del siniestro, mínimo $500" },
  { cobertura: "Deducible lucro cesante de incendio", respuesta: "3 Días de la utilidad bruta anual, por ubicación y por evento" },
  { cobertura: "Deducible rotura de maquinaria", respuesta: "10% del valor del siniestro, mínimo $300" },
  { cobertura: "Deducible robo asalto", respuesta: "10% del valor del siniestro, mínimo $300" },
  { cobertura: "Deducible hurto", respuesta: "15% del valor del siniestro, mínimo $250" },
  { cobertura: "Deducible equipo electrónico equipos fijos", respuesta: "10% del valor del siniestro, mínimo $300" },
  { cobertura: "Deducible equipo electrónico equipos portátiles", respuesta: "15% del valor del siniestro, mínimo $250" },
  { cobertura: "Deducible equipo y maquinaria", respuesta: "20% del valor del siniestro, mínimo $1,000" },
  { cobertura: "Deducible responsabilidad civil", respuesta: "10% del valor del siniestro, mínimo $500" },
].map(k => ({ ...k, count: 1 }));

const STORAGE_KEY = "cotizador_condor_kb_v1";

// ─── Colores ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#0B0F1A", surface: "#131929", border: "#1E2D45", accent: "#1A6FD8",
  accentLight: "#3A8EF8", gold: "#C4975A", green: "#2ECC71", red: "#E74C3C",
  yellow: "#F39C12", text: "#E8EDF5", muted: "#6B7FA0", card: "#0E1828",
};

// ─── Normalización + matching ──────────────────────────────────────────────────
const STOP = new Set(["de","la","el","los","las","y","o","del","en","por","para","un","una","a","con","que","se","su","al","como","es","si","no","aplicable","suma","asegurable","requerida","clausula","cláusula","opcional"]);

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokens(s) {
  return normalize(s).split(" ").filter(w => w.length > 2 && !STOP.has(w));
}
function jaccard(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}
// Devuelve {respuesta, score, tipo} o null
function matchKB(texto, kb) {
  const nTexto = normalize(texto);
  let best = null;
  for (const k of kb) {
    const nK = normalize(k.cobertura);
    if (nK === nTexto) return { respuesta: k.respuesta, score: 1, tipo: "Exacta" };
    const score = jaccard(texto, k.cobertura);
    // subset: si la clave (corta) está contenida en tokens del texto
    const kTok = tokens(k.cobertura);
    const tTok = new Set(tokens(texto));
    const subset = kTok.length > 0 && kTok.length <= 5 && kTok.every(t => tTok.has(t));
    const eff = subset ? Math.max(score, 0.75) : score;
    if (!best || eff > best.score) best = { respuesta: k.respuesta, score: eff, tipo: eff >= 0.85 ? "Exacta" : "Similar" };
  }
  if (best && best.score >= 0.55) return best;
  return null;
}

// ─── Detectar columna de respuesta en una hoja ─────────────────────────────────
function findResponseCol(data, coverageCol) {
  // Busca en las primeras 6 filas un encabezado tipo COTIZACIÓN / CÓNDOR / RESPUESTA
  for (let r = 0; r < Math.min(8, data.length); r++) {
    const row = data[r] || [];
    for (let c = row.length - 1; c >= 0; c--) {
      const v = normalize(row[c]);
      if (c > coverageCol && /(cotizacion|condor|respuesta|oferta)/.test(v)) return c;
    }
  }
  // fallback: una columna a la derecha del bloque de coberturas
  let maxCol = coverageCol;
  data.forEach(row => { if (row.length - 1 > maxCol) maxCol = row.length - 1; });
  return Math.max(coverageCol + 1, maxCol);
}

// ─── Extraer coberturas del workbook ───────────────────────────────────────────
const RELEVANT = ["multirriesgo","multiriesgo","deducible","dinero","valores","equipo","maquinaria",
  "vehiculo","vehículo","veh ","responsabilidad","transporte","garantia","garantía","incendio","robo"];

function extractCoverages(wb, kb, XLSX) {
  const results = {};
  for (const sheetName of wb.SheetNames) {
    const clean = normalize(sheetName);
    if (!RELEVANT.some(r => clean.includes(normalize(r)))) continue;
    // saltar hojas de listados/inventarios
    if (clean.includes("listado") || clean.includes("list ") || clean.startsWith("list")) continue;

    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (data.length === 0) continue;

    const coverages = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      // columna de cobertura = primera celda con texto descriptivo
      let covCol = -1, texto = "";
      for (let j = 0; j <= 2 && j < row.length; j++) {
        const val = String(row[j]).trim();
        if (val.length > 7 && /[a-záéíóúñ]/i.test(val) &&
          !/^(nan|cotizacion|coberturas|condiciones base|presentacion|aseguradora|aseguradob|ramo|total|valor asegurado)/i.test(normalize(val)) &&
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
    if (coverages.length > 0) results[sheetName] = { coverages, respCol: coverages[0].respCol };
  }
  return results;
}

// ─── IA solo para pendientes (vía proxy serverless /api/quote) ──────────────────
// La API key vive en el servidor (Groq), nunca en el navegador.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Selecciona los ejemplos de memoria más parecidos al lote (menos tokens por llamada).
function relevantKB(items, kb, max = 12) {
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

async function callAI(pendientes, hoja, kb) {
  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000); // 30s de timeout por lote
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          hoja,
          pendientes: pendientes.map(p => ({ texto: p.texto })),
          kb: kb.slice(0, 15).map(k => ({ cobertura: k.cobertura, respuesta: k.respuesta })),
        }),
      });

      // 429 = límite de velocidad de Groq → espera y reintenta
      if (res.status === 429) {
        let retryAfter = 0;
        try { const j = await res.json(); retryAfter = Number(j.retryAfter) || 0; } catch {}
        clearTimeout(timer);
        if (attempt < MAX_RETRIES) {
          const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 20000);
          await sleep(waitMs);
          continue;
        }
        throw new Error("Groq está saturado (429). Espera un momento y vuelve a intentar.");
      }

      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try { const j = await res.json(); msg = j.error || msg; } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      return Array.isArray(data.respuestas) ? data.respuestas : [];
    } catch (e) {
      clearTimeout(timer);
      if (e.name === "AbortError") throw new Error("La IA tardó demasiado (timeout de 30s).");
      // error de red puntual → reintenta con espera
      if (attempt < MAX_RETRIES && /network|fetch|failed/i.test(e.message || "")) {
        await sleep(Math.min(2000 * 2 ** attempt, 20000));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("No se pudo contactar la IA tras varios intentos.");
}

// ─── Estilos ────────────────────────────────────────────────────────────────────
const F = "'IBM Plex Mono','Courier New',monospace";
const sx = {
  app: {
    minHeight: "100vh", color: C.text, fontFamily: F,
    background: `radial-gradient(900px circle at 12% -8%, rgba(26,111,216,.16), transparent 45%), radial-gradient(760px circle at 96% -2%, rgba(196,151,90,.11), transparent 46%), ${C.bg}`,
    backgroundAttachment: "fixed",
  },
  header: { background: `linear-gradient(135deg,${C.surface},#0A1628)`, borderBottom: `1px solid ${C.border}`, padding: "18px 28px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  logo: { width: 38, height: 38, background: `linear-gradient(135deg,${C.gold},#E8B96A)`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, color: C.bg },
  body: { padding: "24px 28px", maxWidth: 1400, margin: "0 auto" },
  btn: { background: `linear-gradient(135deg,${C.accent},#1555B0)`, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontFamily: F, fontWeight: 600 },
  btnGold: { background: `linear-gradient(135deg,${C.gold},#A8813E)`, color: C.bg, border: "none", borderRadius: 8, padding: "11px 22px", cursor: "pointer", fontSize: 13, fontFamily: F, fontWeight: 700 },
  btnSm: { background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 11px", cursor: "pointer", fontSize: 11, fontFamily: F },
  drop: { border: `2px dashed ${C.border}`, borderRadius: 12, padding: 48, textAlign: "center", cursor: "pointer", background: C.surface },
  card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 },
  th: { background: C.surface, color: C.muted, padding: "9px 11px", textAlign: "left", fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0 },
  td: { padding: "9px 11px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top", lineHeight: 1.55 },
  ta: { background: "#0A1425", border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: 8, fontSize: 12, fontFamily: F, width: "100%", resize: "vertical", minHeight: 54, outline: "none" },
  stat: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "13px 18px", flex: 1, minWidth: 130 },
  statLabel: { fontSize: 10, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase" },
};
function badge(tipo) {
  const map = {
    Exacta: [C.green, "#1A4020", "#0F2614"],
    Similar: [C.accentLight, "#1A4070", "#0D2440"],
    IA: [C.accentLight, "#1A4070", "#0D2440"],
    Manual: [C.gold, "#4A3A1A", "#241B0D"],
    Pendiente: [C.yellow, "#4A3000", "#241800"],
    Aprendida: [C.green, "#1A4020", "#0F2614"],
  };
  const [col, bd, bg] = map[tipo] || [C.muted, C.border, C.surface];
  return { display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: col, border: `1px solid ${bd}`, background: bg };
}

// ─── Componente ─────────────────────────────────────────────────────────────────
export default function AutoCotizador() {
  const [step, setStep] = useState("upload");
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState({});
  const [wb, setWb] = useState(null);
  const [active, setActive] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [kb, setKb] = useState(SEED_KB);
  const [kbReady, setKbReady] = useState(false);
  const [toast, setToast] = useState(null);   // { type: "error|ok|info", msg }
  const [parsing, setParsing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas"); // todas | pendientes | respondidas
  const [showKB, setShowKB] = useState(false);   // panel de memoria
  const [kbSearch, setKbSearch] = useState("");
  const [showHist, setShowHist] = useState(false); // panel de historial
  const [histItems, setHistItems] = useState([]);  // lista de archivos guardados
  const [showPriv, setShowPriv] = useState(false); // panel de privacidad
  const [kbBackupTs, setKbBackupTs] = useState(() => {
    try { return Number(localStorage.getItem("cotizador_kb_backup_ts")) || 0; } catch { return 0; }
  });
  const [rowLoading, setRowLoading] = useState(null); // "sName::idx" mientras la IA responde una fila
  const [narrow, setNarrow] = useState(typeof window !== "undefined" && window.innerWidth < 640);
  const kbRef = useRef(SEED_KB);
  const fileRef = useRef();
  const kbFileRef = useRef();
  const sessionBytesRef = useRef(null); // bytes del archivo original (para exportar tras recargar)

  // Responsive: detecta pantallas angostas
  useEffect(() => {
    const f = () => setNarrow(window.innerWidth < 640);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  // Aviso al salir mientras la IA procesa, para no perder una corrida larga.
  useEffect(() => {
    if (!processing) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [processing]);

  // Toast con auto-cierre
  const notify = useCallback((type, msg, ms = 4500) => {
    setToast({ type, msg });
    if (ms) setTimeout(() => setToast(t => (t && t.msg === msg ? null : t)), ms);
  }, []);

  // Cargar KB persistida
  useEffect(() => {
    (async () => {
      try {
        const r = await storage.get(STORAGE_KEY);
        if (r && r.value) {
          const stored = JSON.parse(r.value);
          // unir semilla con aprendidas (preferir aprendidas)
          const map = new Map(SEED_KB.map(k => [normalize(k.cobertura), k]));
          stored.forEach(k => map.set(normalize(k.cobertura), k));
          const merged = [...map.values()];
          setKb(merged); kbRef.current = merged;
        } else {
          await storage.set(STORAGE_KEY, JSON.stringify(SEED_KB));
        }
      } catch (e) { /* primera vez o sin storage */ }
      setKbReady(true);
    })();
  }, []);

  // ── Recuperar sesión anterior (no perder el trabajo al recargar) ──────────
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(SESSION_META_KEY);
        if (!raw) return;
        const meta = JSON.parse(raw);
        if (!meta || !meta.sheets || Object.keys(meta.sheets).length === 0) return;
        setSheets(meta.sheets);
        setFileName(meta.fileName || "");
        setActive(meta.active || Object.keys(meta.sheets)[0] || null);
        setStep("review");
        // Reconstruir el workbook desde los bytes guardados (para poder exportar).
        const rec = await idbGet().catch(() => null);
        if (rec && rec.bytes) {
          const XLSX = await getXLSX();
          setWb(XLSX.read(rec.bytes, { type: "array", cellStyles: true, cellNF: true }));
          sessionBytesRef.current = rec.bytes;
        }
        notify("info", `Sesión recuperada: ${meta.fileName || "archivo"}. Usa "Otro archivo" para empezar de cero.`, 7000);
      } catch { /* no había sesión previa */ }
    })();
  }, [notify]);

  // ── Autoguardado de las respuestas (se dispara al cambiar la sesión) ──────
  useEffect(() => {
    if (step !== "review" || !fileName || Object.keys(sheets).length === 0) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SESSION_META_KEY, JSON.stringify({ fileName, active, sheets, ts: Date.now() }));
      } catch { /* cuota llena: se omite el guardado */ }
    }, 800);
    return () => clearTimeout(t);
  }, [sheets, active, step, fileName]);

  const clearSession = useCallback(() => {
    try { localStorage.removeItem(SESSION_META_KEY); } catch {}
    sessionBytesRef.current = null;
    idbClear();
  }, []);

  // ── Historial de archivos completados ────────────────────────────────────
  const refreshHist = useCallback(async () => {
    try {
      const items = await histList();
      items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      setHistItems(items);
    } catch { /* sin historial */ }
  }, []);

  // Guarda (o actualiza) el archivo actual en el historial. id = nombre, para
  // que reprocesar el mismo archivo actualice su entrada en vez de duplicarla.
  const saveToHistory = useCallback(async (snapSheets, snapName) => {
    try {
      const sh = snapSheets || sheets;
      const name = snapName || fileName;
      if (!name || Object.keys(sh).length === 0) return;
      const cov = Object.values(sh).flatMap(s => s.coverages);
      const totalC = cov.length;
      const ans = cov.filter(c => c.respuesta).length;
      let bytes = sessionBytesRef.current;
      if (!bytes) { const rec = await idbGet().catch(() => null); bytes = rec && rec.bytes; }
      await histSave({
        id: name, fileName: name, ts: Date.now(),
        total: totalC, answered: ans, pending: totalC - ans,
        sheets: sh, bytes: bytes || null,
      });
      refreshHist();
    } catch { /* no se pudo guardar en historial */ }
  }, [sheets, fileName, refreshHist]);

  const openFromHistory = useCallback(async (id) => {
    try {
      const data = await histGet(id);
      if (!data || !data.sheets) { notify("error", "No se pudo abrir ese archivo del historial."); return; }
      setSheets(data.sheets);
      setFileName(id);
      setActive(Object.keys(data.sheets)[0] || null);
      setSearch(""); setFilter("todas");
      setStep("review");
      setShowHist(false);
      if (data.bytes) {
        sessionBytesRef.current = data.bytes;
        const XLSX = await getXLSX();
        setWb(XLSX.read(data.bytes, { type: "array", cellStyles: true, cellNF: true }));
        idbSet({ fileName: id, bytes: data.bytes, ts: Date.now() }).catch(() => {});
      } else {
        setWb(null);
      }
      notify("ok", `Archivo abierto del historial: ${id}`);
    } catch (e) {
      notify("error", `No se pudo abrir: ${e.message || "error"}.`);
    }
  }, [notify]);

  const deleteFromHistory = useCallback(async (id) => {
    await histDelete(id).catch(() => {});
    refreshHist();
    notify("info", "Archivo quitado del historial.");
  }, [refreshHist, notify]);

  // Cargar la lista de historial al inicio (para el contador del botón).
  useEffect(() => { refreshHist(); }, [refreshHist]);

  const persistKB = useCallback(async (newKb) => {
    kbRef.current = newKb; setKb(newKb);
    try {
      await storage.set(STORAGE_KEY, JSON.stringify(newKb));
      // Respaldo automático rolling (protege ante corrupción accidental).
      localStorage.setItem(STORAGE_KEY + "_backup", JSON.stringify({ ts: Date.now(), kb: newKb }));
    } catch {}
  }, []);

  // Aprender una respuesta
  const learn = useCallback((texto, respuesta) => {
    if (!respuesta || respuesta.trim().length === 0) return;
    const n = normalize(texto);
    const cur = kbRef.current;
    const idx = cur.findIndex(k => normalize(k.cobertura) === n);
    let next;
    if (idx >= 0) {
      next = [...cur];
      next[idx] = { ...next[idx], respuesta, count: (next[idx].count || 1) + 1 };
    } else {
      next = [...cur, { cobertura: texto, respuesta, count: 1 }];
    }
    persistKB(next);
  }, [persistKB]);

  // Aprender varias respuestas de una sola vez (una sola escritura en disco).
  // Se usa para guardar automáticamente lo que respondió la IA, así la próxima
  // vez ese archivo (o uno parecido) se llena solo, sin volver a usar la IA.
  const learnMany = useCallback((pairs) => {
    if (!pairs || pairs.length === 0) return;
    const map = new Map(kbRef.current.map(k => [normalize(k.cobertura), k]));
    pairs.forEach(({ texto, respuesta }) => {
      if (!texto || !texto.trim() || !respuesta || !respuesta.trim()) return;
      const n = normalize(texto);
      const ex = map.get(n);
      if (ex) map.set(n, { ...ex, respuesta, count: (ex.count || 1) + 1 });
      else map.set(n, { cobertura: texto, respuesta, count: 1 });
    });
    persistKB(Array.from(map.values()));
  }, [persistKB]);

  // ── Respaldo de memoria ──────────────────────────────────────────────────
  const exportKB = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10);
    downloadJSON(`cotizador_memoria_${date}.json`, kbRef.current);
    const now = Date.now();
    try { localStorage.setItem("cotizador_kb_backup_ts", String(now)); } catch {}
    setKbBackupTs(now);
    notify("ok", `Memoria exportada (${kbRef.current.length} respuestas).`);
  }, [notify]);

  const importKB = useCallback(async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const incoming = Array.isArray(data) ? data : data.kb;
      if (!Array.isArray(incoming) || !incoming.every(k => k && k.cobertura && "respuesta" in k)) {
        throw new Error("estructura inválida");
      }
      // Une con la actual (prioriza lo importado).
      const map = new Map(kbRef.current.map(k => [normalize(k.cobertura), k]));
      incoming.forEach(k => map.set(normalize(k.cobertura), { count: 1, ...k }));
      const merged = [...map.values()];
      persistKB(merged);
      notify("ok", `Memoria importada: ${incoming.length} respuestas (total ${merged.length}).`);
    } catch (e) {
      notify("error", `No se pudo importar: ${e.message || "archivo JSON inválido"}.`);
    }
  }, [persistKB, notify]);

  // ── Gestión de memoria (editar/borrar) ───────────────────────────────────
  const updateKBEntry = useCallback((cobertura, respuesta) => {
    const n = normalize(cobertura);
    const next = kbRef.current.map(k => normalize(k.cobertura) === n ? { ...k, respuesta } : k);
    persistKB(next);
  }, [persistKB]);

  const deleteKBEntry = useCallback((cobertura) => {
    const n = normalize(cobertura);
    persistKB(kbRef.current.filter(k => normalize(k.cobertura) !== n));
  }, [persistKB]);

  // ── IA para una sola cobertura ───────────────────────────────────────────
  const aiSingle = async (sName, idx) => {
    const c = sheets[sName].coverages[idx];
    setRowLoading(`${sName}::${idx}`);
    try {
      const items = [{ texto: c.texto }];
      const ans = await callAI(items, sName, relevantKB(items, kbRef.current));
      const r = ans[0];
      if (r && r.respuesta) {
        setSheets(prev => {
          const u = { ...prev };
          const t = u[sName].coverages[idx];
          t.respuesta = r.respuesta; t.tipo = "IA"; t.confianza = r.confianza || "media";
          return u;
        });
        // Auto-aprende si es confiable (igual que el llenado por lotes).
        const conf = (r.confianza || "media").toLowerCase();
        if (conf !== "baja" && !/^\s*revisar\s*$/i.test(r.respuesta)) learn(c.texto, r.respuesta);
        notify("ok", "Cobertura resuelta con IA.");
      } else {
        notify("info", "La IA no devolvió respuesta para esta cobertura.");
      }
    } catch (e) {
      notify("error", `IA: ${e.message}`);
    } finally {
      setRowLoading(null);
    }
  };

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
      notify("error", "Formato no soportado. Sube un archivo .xlsx, .xls o .xlsm.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      notify("error", "El archivo supera los 25 MB. Reduce su tamaño e inténtalo de nuevo.");
      return;
    }
    setParsing(true);
    try {
      const XLSX = await getXLSX();
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array", cellStyles: true, cellNF: true });
      if (!workbook.SheetNames?.length) throw new Error("El archivo no contiene hojas.");
      const extracted = extractCoverages(workbook, kbRef.current, XLSX);
      // Guardar el archivo original para poder exportar aunque se recargue la página.
      sessionBytesRef.current = buf.slice(0);
      idbSet({ fileName: file.name, bytes: buf.slice(0), ts: Date.now() }).catch(() => {});
      setWb(workbook);
      setFileName(file.name);
      setSheets(extracted);
      setSearch("");
      setFilter("todas");
      setActive(Object.keys(extracted)[0] || null);
      setStep("review");
      const nHojas = Object.keys(extracted).length;
      if (nHojas === 0) {
        notify("info", "No se detectaron hojas de coberturas. Revisa que el archivo tenga hojas tipo Multirriesgo, Deducibles, etc.");
      } else {
        notify("ok", `Archivo cargado: ${nHojas} hoja(s) de coberturas detectada(s).`);
      }
    } catch (e) {
      console.error(e);
      notify("error", `No se pudo leer el archivo: ${e.message || "archivo dañado o ilegible."}`);
    } finally {
      setParsing(false);
    }
  }, [notify]);

  const processAI = async () => {
    const names = Object.keys(sheets);
    const sheetsConPend = names.filter(n =>
      sheets[n].coverages.some(c => c.tipo === "Pendiente" && !c.editado));
    if (sheetsConPend.length === 0) {
      notify("info", "No hay pendientes que resolver. ¡Todo está respondido!");
      return;
    }

    setProcessing(true); setProgress(0);
    const updated = { ...sheets };
    let resueltas = 0, fallidas = 0;
    let firstError = null;
    let rateLimited = false;
    const learned = []; // respuestas de la IA a guardar en memoria al terminar

    // Lotes grandes = menos llamadas a la IA (cada llamada repite el contexto de
    // memoria, así que menos llamadas = mucho menos trabajo total y más rápido).
    const BATCH_SIZE = 30;
    const batches = [];
    for (const sName of sheetsConPend) {
      const pend = updated[sName].coverages.filter(c => c.tipo === "Pendiente" && !c.editado);
      for (let i = 0; i < pend.length; i += BATCH_SIZE) {
        batches.push({ sName, items: pend.slice(i, i + BATCH_SIZE) });
      }
    }

    // Varios lotes en paralelo (concurrencia controlada) para terminar antes
    // sin disparar el límite 429 de Groq. Cada lote que termina refresca la UI.
    const CONCURRENCY = Math.min(4, batches.length);
    const total = batches.length;
    let done = 0;
    let nextIdx = 0;
    let stop = false;

    const worker = async () => {
      while (!stop) {
        const myIdx = nextIdx++;
        if (myIdx >= batches.length) return;
        const { sName, items } = batches[myIdx];
        try {
          const ans = await callAI(items, sName, relevantKB(items, kbRef.current));
          ans.forEach(({ idx, respuesta, confianza }) => {
            const target = items[idx - 1];
            if (target && respuesta) {
              target.respuesta = respuesta;
              target.tipo = "IA";
              target.confianza = confianza || "media";
              resueltas++;
              // Auto-aprender: guarda en memoria solo respuestas confiables
              // (no "baja" ni "REVISAR") para no ensuciarla con posibles errores.
              const conf = (confianza || "media").toLowerCase();
              if (conf !== "baja" && !/^\s*revisar\s*$/i.test(respuesta)) {
                learned.push({ texto: target.texto, respuesta });
              }
            }
          });
          setSheets({ ...updated }); // refresca el avance en pantalla lote a lote
        } catch (e) {
          console.error(e);
          fallidas += items.length;
          if (!firstError) firstError = e.message;
          // Si Groq sigue saturado tras los reintentos, no insistas con el resto.
          if (/429|satur/i.test(e.message || "")) { rateLimited = true; stop = true; }
        } finally {
          done++;
          setProgress(Math.round((done / total) * 100));
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // Guarda en memoria las respuestas confiables de la IA (una sola escritura).
    // Así la próxima vez este archivo (o uno parecido) se llena solo, sin IA.
    learnMany(learned);

    setProgress(100);
    setSheets({ ...updated });
    setProcessing(false);

    if (rateLimited) {
      notify("error", `Groq limitó por uso (429). Se resolvieron ${resueltas}; espera 1-2 min y dale de nuevo para continuar con el resto.`, 9000);
    } else if (fallidas > 0 && resueltas === 0) {
      notify("error", `La IA no pudo responder: ${firstError || "error de conexión"}.`, 8000);
    } else if (fallidas > 0) {
      notify("info", `IA: ${resueltas} resueltas, ${fallidas} sin respuesta (${firstError}).`, 7000);
    } else {
      const apr = learned.length;
      notify("ok", `IA completó ${resueltas} cobertura(s).${apr ? ` ${apr} quedaron aprendidas en memoria para la próxima.` : ""}`);
    }
  };

  const editResp = (sName, idx, value) => {
    setSheets(prev => {
      const u = { ...prev };
      u[sName].coverages[idx].respuesta = value;
      u[sName].coverages[idx].tipo = "Manual";
      u[sName].coverages[idx].editado = true;
      return u;
    });
  };
  const onBlurLearn = (sName, idx) => {
    const c = sheets[sName].coverages[idx];
    if (c.editado && c.respuesta) {
      learn(c.texto, c.respuesta);
      setSheets(prev => {
        const u = { ...prev };
        u[sName].coverages[idx].tipo = "Aprendida";
        return u;
      });
    }
  };

  // Exportar: llena el archivo original + hoja resumen
  const exportFile = async () => {
    let workbook = wb;
    if (!workbook) {
      // Reconstruir desde la sesión guardada (p. ej. tras recargar la página).
      try {
        const rec = await idbGet();
        const bytes = (rec && rec.bytes) || sessionBytesRef.current;
        if (bytes) {
          const XLSXr = await getXLSX();
          workbook = XLSXr.read(bytes, { type: "array", cellStyles: true, cellNF: true });
          setWb(workbook);
        }
      } catch { /* no se pudo recuperar */ }
    }
    if (!workbook) {
      notify("error", "No hay archivo cargado. Vuelve a subir el Excel del broker.");
      return;
    }
    const totalResp = Object.values(sheets)
      .flatMap(s => s.coverages).filter(c => c.respuesta).length;
    if (totalResp === 0) {
      notify("info", "Aún no hay respuestas que exportar.");
      return;
    }
    try {
    const XLSX = await getXLSX();
    // 1) escribir respuestas en las celdas originales
    Object.entries(sheets).forEach(([sName, { coverages }]) => {
      const ws = workbook.Sheets[sName];
      if (!ws) return;
      coverages.forEach(c => {
        if (!c.respuesta) return;
        const addr = XLSX.utils.encode_cell({ r: c.fila, c: c.respCol });
        ws[addr] = { t: "s", v: c.respuesta };
        // extender el rango si hace falta
        const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
        if (c.respCol > ref.e.c) ref.e.c = c.respCol;
        if (c.fila > ref.e.r) ref.e.r = c.fila;
        ws["!ref"] = XLSX.utils.encode_range(ref);
      });
    });
    // 2) hoja resumen con encabezado y resumen ejecutivo (imagen de producto)
    const allCov = Object.values(sheets).flatMap(s => s.coverages);
    const stTotal = allCov.length;
    const stAuto = allCov.filter(c => ["Exacta", "Similar", "IA", "Aprendida"].includes(c.tipo) && c.respuesta).length;
    const stIA = allCov.filter(c => c.tipo === "IA" && c.respuesta).length;
    const stPend = allCov.filter(c => c.tipo === "Pendiente" || !c.respuesta).length;
    const stRev = allCov.filter(needsReview).length;
    const stMin = Math.round((stAuto * 40) / 60);
    const stSaved = stMin >= 60 ? `${Math.floor(stMin / 60)} h ${stMin % 60} min` : `${stMin} min`;
    const stPct = stTotal ? Math.round((allCov.filter(c => c.respuesta).length / stTotal) * 100) : 0;

    const summary = [
      ["AUTO-COTIZADOR · REPORTE DE COTIZACIÓN"],
      [`Archivo: ${fileName || "(sin nombre)"}`],
      [`Generado: ${new Date().toLocaleString()}`],
      [],
      ["RESUMEN EJECUTIVO", ""],
      ["Total de ítems", stTotal],
      ["Respondidas automáticamente", stAuto],
      ["   · de ellas, por IA", stIA],
      ["Pendientes", stPend],
      ["Por revisar", stRev],
      ["Completado", `${stPct}%`],
      ["Ahorro de tiempo estimado", stSaved],
      [],
      ["DETALLE DE RESPUESTAS"],
      ["HOJA", "COBERTURA / ÍTEM", "NUESTRA RESPUESTA", "ORIGEN", "¿REVISAR?"],
    ];
    Object.entries(sheets).forEach(([sName, { coverages }]) => {
      coverages.forEach(c => summary.push([sName, c.texto, c.respuesta || "(vacío)", c.tipo, needsReview(c) ? "⚠ REVISAR" : ""]));
    });
    const wsS = XLSX.utils.aoa_to_sheet(summary);
    wsS["!cols"] = [{ wch: 24 }, { wch: 65 }, { wch: 65 }, { wch: 12 }, { wch: 12 }];
    // Une el título y los encabezados de sección a lo ancho para que se vean limpios.
    wsS["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 13, c: 0 }, e: { r: 13, c: 4 } },
    ];
    const SUMMARY_NAME = "✓ Respuestas";
    // Quita una hoja resumen previa de AMBOS lugares (Sheets y SheetNames);
    // si solo se borra de Sheets, book_append_sheet lanza "already exists".
    if (workbook.SheetNames.includes(SUMMARY_NAME)) {
      workbook.SheetNames = workbook.SheetNames.filter(n => n !== SUMMARY_NAME);
      delete workbook.Sheets[SUMMARY_NAME];
    }
    XLSX.utils.book_append_sheet(workbook, wsS, SUMMARY_NAME);

    // 3) descargar — Blob + ancla en vez de XLSX.writeFile: es el método más
    // robusto en el navegador (writeFile fallaba en silencio con archivos
    // grandes o cuando el navegador bloqueaba la descarga interna).
    const out = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(fileName || "cotizacion").replace(/\.[^.]+$/, "")}_RESPONDIDO.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    notify("ok", "Archivo exportado con las respuestas.");
    saveToHistory(); // queda en el historial como archivo completado
    } catch (e) {
      console.error(e);
      notify("error", `No se pudo exportar: ${e.message || "error desconocido"}.`);
    }
  };

  const all = Object.values(sheets).flatMap(s => s.coverages);
  const total = all.length;
  const answered = all.filter(c => c.respuesta).length;
  const auto = all.filter(c => ["Exacta", "Similar", "IA", "Aprendida"].includes(c.tipo) && c.respuesta).length;
  const pend = all.filter(c => c.tipo === "Pendiente" || !c.respuesta).length;
  const revisar = all.filter(needsReview).length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  // Ahorro de tiempo estimado: ~40 s por cobertura resuelta a mano (buscar
  // precedente, redactar y escribir). Solo cuenta lo que la app llenó sola.
  const SECS_PER_ITEM = 40;
  const savedMin = Math.round((auto * SECS_PER_ITEM) / 60);
  const savedLabel = savedMin >= 60
    ? `${Math.floor(savedMin / 60)} h ${savedMin % 60} min`
    : `${savedMin} min`;

  return (
    <div style={sx.app}>
      <div style={{ ...sx.header, padding: narrow ? "14px 16px" : "18px 28px" }}>
        <div style={sx.logo}>C</div>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.5 }}>AUTO-COTIZADOR</div>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>Cotizador inteligente</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setShowPriv(true)} title="Cómo se manejan los datos"
            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", textAlign: "right", fontFamily: F }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>DATOS</div>
            <div style={{ fontSize: 13, color: C.green }}>🔒 Privacidad</div>
          </button>
          <button onClick={() => { refreshHist(); setShowHist(true); }} title="Archivos anteriores"
            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", textAlign: "right", fontFamily: F }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>HISTORIAL</div>
            <div style={{ fontSize: 13, color: C.accentLight }}>📁 {histItems.length} archivo(s)</div>
          </button>
          <button onClick={() => setShowKB(true)} title="Gestionar memoria"
            style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", textAlign: "right", fontFamily: F }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>MEMORIA</div>
            <div style={{ fontSize: 13, color: C.green }}>🧠 {kb.length} respuestas</div>
          </button>
          {fileName && step === "review" && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>ARCHIVO</div>
              <div style={{ fontSize: 12, color: C.accentLight, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 50, maxWidth: 380,
          padding: "12px 16px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
          display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
          boxShadow: "0 8px 30px rgba(0,0,0,.45)",
          background: toast.type === "error" ? "#2A1212" : toast.type === "ok" ? "#0F2614" : "#0A1F3A",
          border: `1px solid ${toast.type === "error" ? C.red : toast.type === "ok" ? C.green : C.accent}`,
          color: toast.type === "error" ? "#FFB3AB" : toast.type === "ok" ? "#A8E6BC" : "#A8C8F0",
        }} onClick={() => setToast(null)}>
          <span style={{ fontSize: 15 }}>{toast.type === "error" ? "⚠️" : toast.type === "ok" ? "✅" : "ℹ️"}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {showPriv && (
        <div onClick={() => setShowPriv(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: narrow ? 10 : 40 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>🔒 Privacidad y manejo de datos</span>
              <button onClick={() => setShowPriv(false)} style={{ ...sx.btnSm, fontSize: 16, padding: "2px 10px" }}>✕</button>
            </div>
            <div style={{ padding: "16px 18px", overflowY: "auto", fontSize: 12.5, lineHeight: 1.7, color: C.text }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: C.green, fontWeight: 700, marginBottom: 4 }}>✅ Qué se queda en tu equipo</div>
                Tu memoria de respuestas y el historial de archivos se guardan <b>solo en este navegador/dispositivo</b>. No se suben a ningún servidor nuestro.
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: C.accentLight, fontWeight: 700, marginBottom: 4 }}>🤖 Qué se envía a la IA</div>
                Solo para las coberturas <b>pendientes</b> se envía el <b>texto de la cobertura</b> y algunos ejemplos de respuestas previas, a través de un proveedor de IA (Groq). Esto se usa únicamente para generar la respuesta sugerida.
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: C.gold, fontWeight: 700, marginBottom: 4 }}>🚫 Qué NO se envía</div>
                No se envían nombres de clientes, números de póliza, valores asegurados ni datos personales: solo la descripción de la cobertura. El archivo Excel completo nunca sale de tu equipo.
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: C.text, fontWeight: 700, marginBottom: 4 }}>🔑 Claves y seguridad</div>
                La clave de la IA vive en el servidor, nunca en el navegador. La conexión con la IA es cifrada (HTTPS).
              </div>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 11.5, color: C.muted }}>
                <b style={{ color: C.yellow }}>Para uso empresarial:</b> si la aseguradora requiere que ningún dato salga de su red, existe la opción de usar una IA privada/local. Consúltalo antes de procesar información altamente confidencial.
              </div>
            </div>
          </div>
        </div>
      )}

      {showHist && (
        <div onClick={() => setShowHist(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: narrow ? 10 : 40 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 720, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.accentLight }}>📁 Historial · {histItems.length} archivo(s)</span>
              <button onClick={() => setShowHist(false)} style={{ ...sx.btnSm, fontSize: 16, padding: "2px 10px" }}>✕</button>
            </div>
            <div style={{ padding: "10px 14px", overflowY: "auto" }}>
              {histItems.length === 0 && (
                <div style={{ textAlign: "center", color: C.muted, fontSize: 12, padding: 28, lineHeight: 1.6 }}>
                  Aún no hay archivos guardados.<br />
                  Cuando exportes un archivo o cambies a otro, quedará aquí para reabrirlo.
                </div>
              )}
              {histItems.map(h => {
                const pctH = h.total ? Math.round((h.answered / h.total) * 100) : 0;
                const fecha = h.ts ? new Date(h.ts).toLocaleString() : "";
                return (
                  <div key={h.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {h.fileName}</div>
                        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>
                          {fecha} · {h.answered}/{h.total} respondidas ({pctH}%)
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openFromHistory(h.id)} style={{ ...sx.btn, padding: "7px 12px" }}>Abrir</button>
                        <button onClick={() => { if (confirm(`¿Quitar "${h.fileName}" del historial?`)) deleteFromHistory(h.id); }}
                          style={{ ...sx.btnSm, color: C.red, borderColor: C.border }}>🗑</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "10px 14px", borderTop: `1px solid ${C.border}`, fontSize: 10.5, color: C.muted, lineHeight: 1.5 }}>
              Los archivos se guardan en este navegador/dispositivo. Para respaldarlos, usa "⬇️ Exportar" en cada uno.
            </div>
          </div>
        </div>
      )}

      {showKB && (
        <div onClick={() => setShowKB(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: narrow ? 10 : 40 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: "100%", maxWidth: 760, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>🧠 Memoria · {kb.length} respuestas</span>
              <button onClick={() => setShowKB(false)} style={{ ...sx.btnSm, fontSize: 14 }}>✕</button>
            </div>
            <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input value={kbSearch} onChange={e => setKbSearch(e.target.value)} placeholder="🔎 Buscar en la memoria..."
                style={{ flex: 1, minWidth: 160, background: "#0A1425", border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "7px 11px", fontSize: 12, fontFamily: F, outline: "none" }} />
              <button style={sx.btnSm} onClick={exportKB}>⬇️ Exportar</button>
              <button style={sx.btnSm} onClick={() => kbFileRef.current?.click()}>⬆️ Importar</button>
              <span style={{ fontSize: 10.5, color: kbBackupTs ? C.muted : C.yellow }}>
                {kbBackupTs ? `Último respaldo: ${new Date(kbBackupTs).toLocaleDateString()}` : "⚠ Sin respaldo aún"}
              </span>
              <button style={{ ...sx.btnSm, color: C.yellow, borderColor: "#4A3000" }}
                onClick={() => {
                  if (window.confirm("¿Restaurar la memoria base? Se perderán las respuestas aprendidas que no estén en la semilla.")) {
                    persistKB(SEED_KB); notify("ok", "Memoria restaurada a la base.");
                  }
                }}>↺ Base</button>
              <input ref={kbFileRef} type="file" accept=".json" style={{ display: "none" }}
                onChange={e => { importKB(e.target.files[0]); e.target.value = ""; }} />
            </div>
            <div style={{ overflowY: "auto", padding: "8px 18px 18px" }}>
              {(() => {
                const nQ = normalize(kbSearch);
                const list = kb.filter(k => !nQ || normalize(k.cobertura).includes(nQ) || normalize(k.respuesta).includes(nQ));
                if (list.length === 0) return <div style={{ color: C.muted, fontSize: 12, padding: 24, textAlign: "center" }}>Sin coincidencias.</div>;
                return list.map(k => (
                  <div key={normalize(k.cobertura)} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "#B0C0D8", marginBottom: 4 }}>{k.cobertura}</div>
                      <input defaultValue={k.respuesta} onBlur={e => { if (e.target.value !== k.respuesta) updateKBEntry(k.cobertura, e.target.value); }}
                        style={{ width: "100%", background: "#0A1425", border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "6px 9px", fontSize: 12, fontFamily: F, outline: "none" }} />
                    </div>
                    <button onClick={() => deleteKBEntry(k.cobertura)} title="Borrar de la memoria"
                      style={{ ...sx.btnSm, color: C.red, borderColor: "#4A1A1A", marginTop: 20 }}>🗑</button>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      <div style={{ ...sx.body, padding: narrow ? "16px 14px" : "24px 28px" }}>
        {step === "upload" && (
          <div>
            {/* Hero */}
            <div style={{ position: "relative", overflow: "hidden", paddingBottom: 8 }}>
              <div className="hero-glow" />
              <div className="fade-up" style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: 760, margin: "0 auto", padding: narrow ? "10px 0 4px" : "32px 0 4px" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 10.5, border: `1px solid ${C.border}`, background: "rgba(19,25,41,.7)", borderRadius: 999, padding: "6px 15px", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 20 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, display: "inline-block" }} className="live-dot" />
                  <span className="shine-text" style={{ fontWeight: 700 }}>🦅 Cotizador inteligente de coberturas</span>
                </div>
                <h1 style={{ fontSize: narrow ? 30 : 48, fontWeight: 700, lineHeight: 1.1, margin: "0 0 18px", letterSpacing: -1 }}>
                  Cotiza en minutos,<br />
                  <span style={{ background: `linear-gradient(90deg,${C.accentLight},${C.gold})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>no en horas</span>
                </h1>
                <p style={{ color: "#9FB1CC", fontSize: narrow ? 14 : 16.5, lineHeight: 1.7, margin: "0 auto 24px", maxWidth: 580 }}>
                  Sube el Excel del broker y la app responde las coberturas al instante con lo que ya aprendió.
                  Usa IA solo para lo nuevo y te devuelve <strong style={{ color: C.text }}>el mismo archivo</strong>, respondido y listo para reenviar.
                </p>
                <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                  {[
                    ["⚡", "Segundos por cotización"],
                    ["🧠", `${kb.length} respuestas aprendidas`],
                    ["📊", "Importa y exporta en Excel"],
                  ].map(([ic, t]) => (
                    <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "#B8C6DD", border: `1px solid ${C.border}`, background: "rgba(14,24,40,.6)", borderRadius: 999, padding: "6px 13px" }}>
                      <span>{ic}</span>{t}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Dropzone */}
            <div className="fade-up delay-1" style={{ maxWidth: 720, margin: "20px auto 0" }}>
              <div
                style={{ ...sx.drop, padding: narrow ? 32 : 48, ...(dragOver ? { borderColor: C.accentLight, background: "#0A1F3A", boxShadow: "0 0 0 4px rgba(58,142,248,.12)" } : {}) }}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                onClick={() => fileRef.current?.click()}
              >
                <div className={parsing ? "" : "float"} style={{ fontSize: 40, marginBottom: 10 }}>{parsing ? "⏳" : "📂"}</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Arrastra el archivo del broker aquí</div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 18 }}>.xlsx · .xls · .xlsm · o haz clic para elegir</div>
                <button style={{ ...sx.btnGold, opacity: !kbReady || parsing ? 0.6 : 1 }} disabled={!kbReady || parsing}>
                  {parsing ? "Leyendo archivo..." : kbReady ? "Seleccionar archivo" : "Cargando memoria..."}
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: narrow ? 12 : 22, flexWrap: "wrap", marginTop: 16, fontSize: 11, color: C.muted }}>
                <span>🔒 API key protegida en el servidor</span>
                <span>🧠 {kb.length} respuestas en memoria</span>
                <span>📄 Exporta el mismo Excel</span>
              </div>
            </div>

            {/* Compatible con Excel */}
            <div className="fade-up delay-1 grad-border" style={{ maxWidth: 720, margin: "20px auto 0", padding: narrow ? "18px 16px" : "22px 26px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: narrow ? 13 : 14, fontWeight: 700, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>📊</span> 100% compatible con Excel
              </div>
              <div style={{ display: "flex", alignItems: "stretch", justifyContent: "center", gap: narrow ? 8 : 12, flexWrap: narrow ? "wrap" : "nowrap" }}>
                {[
                  ["⬆️", "Importa", ".xlsx · .xls · .xlsm del broker"],
                  ["🤖", "Responde", "memoria + IA para lo nuevo"],
                  ["⬇️", "Exporta", "el mismo Excel + hoja resumen"],
                ].map(([ic, t, d], i) => (
                  <Fragment key={t}>
                    <div style={{ flex: 1, minWidth: narrow ? 88 : 0, textAlign: "center", background: "rgba(14,24,40,.55)", border: `1px solid ${C.border}`, borderRadius: 10, padding: narrow ? "10px 8px" : "12px 10px" }}>
                      <div style={{ fontSize: 20, marginBottom: 5 }}>{ic}</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>{t}</div>
                      <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.4 }}>{d}</div>
                    </div>
                    {i < 2 && !narrow && <div style={{ display: "flex", alignItems: "center", color: C.gold, fontSize: 18 }}>→</div>}
                  </Fragment>
                ))}
              </div>
            </div>

            {/* Franja de métricas */}
            <div className="fade-up delay-2 grad-border" style={{ maxWidth: 1000, margin: "44px auto 0", padding: narrow ? "20px 16px" : "26px 32px" }}>
              <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(3,1fr)", gap: narrow ? 18 : 14, textAlign: "center" }}>
                {[
                  [`${kb.length}`, "respuestas en memoria", C.green],
                  ["Minutos", "en vez de horas por cotización", C.accentLight],
                  ["100%", "tu mismo archivo, sin reescribir nada", C.gold],
                ].map(([big, small, col], i) => (
                  <div key={i} style={{ borderLeft: !narrow && i > 0 ? `1px solid ${C.border}` : "none", padding: narrow ? 0 : "0 8px" }}>
                    <div style={{ fontSize: narrow ? 30 : 36, fontWeight: 700, color: col, lineHeight: 1, marginBottom: 8, letterSpacing: -1 }}>{big}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{small}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cómo funciona */}
            <div className="fade-up delay-2" style={{ maxWidth: 1000, margin: "48px auto 0" }}>
              <div style={{ textAlign: "center", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.gold, marginBottom: 8, fontWeight: 600 }}>Cómo funciona</div>
              <div style={{ textAlign: "center", fontSize: narrow ? 18 : 22, fontWeight: 700, marginBottom: 24, letterSpacing: -0.5 }}>De Excel del broker a cotización lista en 4 pasos</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
                {[
                  ["1", "Sube el archivo", "Arrastra el Excel del broker (.xlsx, .xls, .xlsm)."],
                  ["2", "Auto-llenado", "Las coberturas conocidas se responden solas al instante."],
                  ["3", "IA para lo nuevo", "Un clic resuelve los pendientes que no tienen precedente."],
                  ["4", "Exporta", "Descarga el mismo archivo respondido + hoja resumen."],
                ].map(([n, t, d]) => (
                  <div key={n} className="lift" style={sx.card}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg,${C.accent},#1555B0)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, marginBottom: 12, boxShadow: "0 4px 14px rgba(26,111,216,.4)" }}>{n}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5 }}>{t}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Beneficios */}
            <div className="fade-up delay-3" style={{ maxWidth: 1000, margin: "48px auto 0" }}>
              <div style={{ textAlign: "center", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.gold, marginBottom: 8, fontWeight: 600 }}>Por qué te conviene</div>
              <div style={{ textAlign: "center", fontSize: narrow ? 18 : 22, fontWeight: 700, marginBottom: 24, letterSpacing: -0.5 }}>Hecho para suscribir más rápido, sin perder criterio</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
                {[
                  ["🧠", "Aprende contigo", `Ya tiene ${kb.length} respuestas. Cada cobertura que corriges se guarda para la próxima vez.`],
                  ["⚡", "Match instantáneo", "Las coberturas conocidas se llenan solas, sin esperar a la IA ni gastar llamadas."],
                  ["📄", "Llena tu archivo", "Te devuelve el mismo Excel del broker con las respuestas puestas, listo para reenviar."],
                  ["🔒", "Seguro por diseño", "La API key vive en el servidor, nunca en el navegador, y tus datos no salen del flujo."],
                ].map(([ic, t, d], i) => (
                  <div key={i} className="lift" style={sx.card}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{ic}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5 }}>{t}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Antes / Después */}
            <div className="fade-up delay-3" style={{ maxWidth: 1000, margin: "48px auto 0", display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 14 }}>
              <div style={{ ...sx.card, padding: 22, background: "#160F0F", border: "1px solid #3A2020" }}>
                <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.red, marginBottom: 14, fontWeight: 700 }}>😵 Sin la app</div>
                {[
                  "Copiar y pegar coberturas a mano, una por una",
                  "Buscar en cotizaciones viejas qué se respondió antes",
                  "Horas por archivo y riesgo de errores de tipeo",
                ].map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, color: "#C9A8A8", lineHeight: 1.55, marginBottom: i < 2 ? 10 : 0 }}>
                    <span style={{ color: C.red }}>✕</span>{t}
                  </div>
                ))}
              </div>
              <div style={{ ...sx.card, padding: 22, background: "#0C1A12", border: "1px solid #1C3A28" }}>
                <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.green, marginBottom: 14, fontWeight: 700 }}>⚡ Con Auto-Cotizador</div>
                {[
                  "Subes el Excel y las coberturas conocidas se llenan solas",
                  "La memoria recuerda lo que respondiste y mejora con el uso",
                  "Minutos por archivo y el mismo formato listo para reenviar",
                ].map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, color: "#A8E6BC", lineHeight: 1.55, marginBottom: i < 2 ? 10 : 0 }}>
                    <span style={{ color: C.green }}>✓</span>{t}
                  </div>
                ))}
              </div>
            </div>

            {/* CTA de cierre */}
            <div className="fade-up delay-4 grad-border" style={{ maxWidth: 1000, margin: "48px auto 0", padding: narrow ? "28px 20px" : "40px", textAlign: "center" }}>
              <h2 style={{ fontSize: narrow ? 20 : 26, fontWeight: 700, margin: "0 0 10px", letterSpacing: -0.5 }}>¿Listo para cotizar tu próximo Excel?</h2>
              <p style={{ color: C.muted, fontSize: narrow ? 13 : 14.5, lineHeight: 1.6, margin: "0 auto 22px", maxWidth: 460 }}>
                Sube el archivo del broker y deja que la memoria del cotizador haga el trabajo pesado.
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={!kbReady || parsing}
                style={{ ...sx.btnGold, padding: "14px 30px", fontSize: 14, opacity: !kbReady || parsing ? 0.6 : 1 }}>
                {parsing ? "Leyendo archivo..." : kbReady ? "📂 Subir archivo ahora" : "Cargando memoria..."}
              </button>
            </div>

            {/* Footer */}
            <div style={{ textAlign: "center", color: C.muted, fontSize: 11, marginTop: 40, paddingTop: 20, borderTop: `1px solid ${C.border}`, maxWidth: 1000, marginLeft: "auto", marginRight: "auto", lineHeight: 1.7 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ ...sx.logo, width: 24, height: 24, fontSize: 12, borderRadius: 6 }}>C</span>
                <span style={{ color: C.text, fontWeight: 700, letterSpacing: 0.5 }}>AUTO-COTIZADOR</span>
              </div>
              Auto-Cotizador — herramienta interna de suscripción
            </div>
          </div>
        )}

        {step === "review" && (
          <div>
            <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap", alignItems: "stretch" }}>
              <div style={sx.stat}><div style={sx.statLabel}>HOJAS</div><div style={{ fontSize: 26, fontWeight: 700, color: C.accentLight }}>{Object.keys(sheets).length}</div></div>
              <div style={sx.stat}><div style={sx.statLabel}>ÍTEMS</div><div style={{ fontSize: 26, fontWeight: 700, color: C.gold }}>{total}</div></div>
              <div style={sx.stat}><div style={sx.statLabel}>AUTO-LLENADAS</div><div style={{ fontSize: 26, fontWeight: 700, color: C.green }}>{auto}</div></div>
              <div style={sx.stat}><div style={sx.statLabel}>PENDIENTES</div><div style={{ fontSize: 26, fontWeight: 700, color: pend > 0 ? C.yellow : C.green }}>{pend}</div></div>
              <div style={sx.stat}><div style={sx.statLabel}>POR REVISAR</div><div style={{ fontSize: 26, fontWeight: 700, color: revisar > 0 ? C.red : C.green }}>{revisar}</div></div>
              <div style={{ ...sx.stat, background: "#0F2614", border: `1px solid ${C.green}` }} title="Tiempo estimado que te ahorró la app vs. responder a mano">
                <div style={sx.statLabel}>⏱ AHORRO ESTIMADO</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: C.green }}>{savedLabel}</div>
              </div>
              <div style={{ ...sx.stat, flex: 2, minWidth: 180 }}>
                <div style={sx.statLabel}>COMPLETADO {answered}/{total}</div>
                <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: "hidden", marginTop: 10 }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,${C.accent},${C.accentLight})`, transition: "width .5s" }} />
                </div>
                <div style={{ fontSize: 11, color: pct === 100 ? C.green : C.muted, marginTop: 5 }}>{pct}%</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <button style={{ ...sx.btnGold, opacity: processing ? 0.6 : 1 }} onClick={processAI} disabled={processing}>
                {processing ? `Procesando IA... ${progress}%` : `⚡ Completar pendientes con IA (${pend})`}
              </button>
              <button style={sx.btn} onClick={exportFile}>⬇️ Exportar archivo respondido</button>
              <button style={sx.btnSm} onClick={async () => { await saveToHistory(); setStep("upload"); setSheets({}); setFileName(""); setWb(null); clearSession(); }}>Otro archivo</button>
            </div>

            {processing && (
              <div style={{ background: "#0A1F3A", border: `1px solid ${C.accent}`, borderRadius: 8, padding: "12px 18px", marginBottom: 14, fontSize: 12 }}>
                🤖 Analizando lo que no está en memoria... {progress}%
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {Object.entries(sheets).map(([sName, { coverages }]) => {
                const a = coverages.filter(c => c.respuesta).length, isA = active === sName;
                return (
                  <button key={sName} onClick={() => setActive(sName)} style={{
                    background: isA ? C.accent : C.surface, border: `1px solid ${isA ? C.accent : C.border}`,
                    color: isA ? "#fff" : C.muted, borderRadius: 6, padding: "6px 12px", cursor: "pointer",
                    fontSize: 11, fontFamily: F, fontWeight: isA ? 700 : 400, display: "flex", gap: 6, alignItems: "center",
                  }}>
                    {sName.trim()}
                    <span style={{ background: a === coverages.length ? "#1A4020" : "#2A1A00", color: a === coverages.length ? C.green : C.yellow, borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>{a}/{coverages.length}</span>
                  </button>
                );
              })}
            </div>

            {active && sheets[active] && (() => {
              const nQ = normalize(search);
              const rows = sheets[active].coverages
                .map((c, idx) => ({ c, idx }))
                .filter(({ c }) => {
                  const isPend = c.tipo === "Pendiente" || !c.respuesta;
                  if (filter === "pendientes" && !isPend) return false;
                  if (filter === "respondidas" && isPend) return false;
                  if (filter === "revisar" && !needsReview(c)) return false;
                  if (!nQ) return true;
                  return normalize(c.texto).includes(nQ) || normalize(c.respuesta).includes(nQ);
                });
              const fbtn = (key, label) => (
                <button key={key} onClick={() => setFilter(key)} style={{
                  background: filter === key ? C.accent : "transparent",
                  color: filter === key ? "#fff" : C.muted,
                  border: `1px solid ${filter === key ? C.accent : C.border}`,
                  borderRadius: 6, padding: "5px 11px", cursor: "pointer", fontSize: 11, fontFamily: F,
                }}>{label}</button>
              );
              return (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: C.surface, padding: "11px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, letterSpacing: 0.8 }}>📄 {active.trim().toUpperCase()}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>columna de respuesta detectada: col {sheets[active].respCol + 1}</span>
                </div>
                <div style={{ padding: "11px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="🔎 Buscar cobertura o respuesta..."
                    style={{ flex: 1, minWidth: 180, background: "#0A1425", border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "7px 11px", fontSize: 12, fontFamily: F, outline: "none" }}
                  />
                  {fbtn("todas", "Todas")}
                  {fbtn("pendientes", "Pendientes")}
                  {fbtn("respondidas", "Respondidas")}
                  {fbtn("revisar", "⚠ Revisar")}
                  <span style={{ fontSize: 11, color: C.muted }}>{rows.length} de {sheets[active].coverages.length}</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      <th style={{ ...sx.th, width: 36 }}>#</th>
                      <th style={{ ...sx.th, width: "44%" }}>COBERTURA / ÍTEM DEL BROKER</th>
                      <th style={sx.th}>NUESTRA RESPUESTA</th>
                      <th style={{ ...sx.th, width: 90 }}>ORIGEN</th>
                    </tr></thead>
                    <tbody>
                      {rows.map(({ c, idx }) => {
                        const review = needsReview(c);
                        return (
                        <tr key={idx} style={{
                          background: review ? "rgba(231,76,60,.07)" : idx % 2 ? "rgba(255,255,255,.015)" : "transparent",
                          boxShadow: review ? `inset 3px 0 0 ${C.red}` : "none",
                        }}>
                          <td style={{ ...sx.td, color: C.muted, fontSize: 10 }}>{idx + 1}</td>
                          <td style={{ ...sx.td, color: "#B0C0D8", maxWidth: 380 }}>{c.texto}</td>
                          <td style={sx.td}>
                            <textarea style={sx.ta} value={c.respuesta} placeholder="— sin respuesta —"
                              onChange={e => editResp(active, idx, e.target.value)}
                              onBlur={() => onBlurLearn(active, idx)}
                              onFocus={e => e.target.style.borderColor = C.accentLight}
                            />
                            <button onClick={() => aiSingle(active, idx)} disabled={rowLoading === `${active}::${idx}`}
                              style={{ ...sx.btnSm, marginTop: 5, opacity: rowLoading === `${active}::${idx}` ? 0.6 : 1, color: C.accentLight, borderColor: C.border }}>
                              {rowLoading === `${active}::${idx}` ? "⏳ IA..." : "⚡ Responder con IA"}
                            </button>
                          </td>
                          <td style={{ ...sx.td, textAlign: "center" }}>
                            <span style={badge(c.tipo)}>{c.tipo}</span>
                            {c.score > 0 && c.score < 1 && c.tipo === "Similar" &&
                              <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>{Math.round(c.score * 100)}%</div>}
                            {c.tipo === "IA" && c.confianza &&
                              <div style={{ fontSize: 9, marginTop: 4, color: c.confianza === "alta" ? C.green : c.confianza === "baja" ? C.red : C.yellow }}>
                                confianza {c.confianza}
                              </div>}
                            {review &&
                              <div style={{ fontSize: 9, marginTop: 4, color: C.red, fontWeight: 700 }}>⚠ revisar</div>}
                          </td>
                        </tr>
                        );
                      })}
                      {rows.length === 0 && (
                        <tr><td colSpan={4} style={{ ...sx.td, textAlign: "center", color: C.muted, padding: 28 }}>
                          Sin resultados para este filtro/búsqueda.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              );
            })()}

            {Object.keys(sheets).length === 0 && (
              <div style={{ ...sx.card, textAlign: "center", color: C.muted, padding: 40 }}>
                No detecté hojas de coberturas. Revisa que el archivo tenga hojas como Multirriesgo, Deducibles, Vehículos, etc.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
