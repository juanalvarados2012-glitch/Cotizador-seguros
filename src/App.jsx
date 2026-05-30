import { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
// ─── Storage shim (localStorage) ────────────────────────────────────────────
const storage = {
  async get(key) {
    const v = localStorage.getItem(key);
    return v == null ? null : { key, value: v };
  },
  async set(key, value) { localStorage.setItem(key, value); return { key, value }; },
};


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

function extractCoverages(wb, kb) {
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
async function callAI(pendientes, hoja, kb) {
  const res = await fetch("/api/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hoja,
      pendientes: pendientes.map(p => ({ texto: p.texto })),
      kb: kb.slice(0, 120).map(k => ({ cobertura: k.cobertura, respuesta: k.respuesta })),
    }),
  });

  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  return Array.isArray(data.respuestas) ? data.respuestas : [];
}

// ─── Estilos ────────────────────────────────────────────────────────────────────
const F = "'IBM Plex Mono','Courier New',monospace";
const sx = {
  app: { minHeight: "100vh", background: C.bg, color: C.text, fontFamily: F },
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
  const kbRef = useRef(SEED_KB);
  const fileRef = useRef();

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

  const persistKB = useCallback(async (newKb) => {
    kbRef.current = newKb; setKb(newKb);
    try { await storage.set(STORAGE_KEY, JSON.stringify(newKb)); } catch {}
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
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: "array", cellStyles: true, cellNF: true });
      if (!workbook.SheetNames?.length) throw new Error("El archivo no contiene hojas.");
      const extracted = extractCoverages(workbook, kbRef.current);
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

    for (let i = 0; i < sheetsConPend.length; i++) {
      const sName = sheetsConPend[i];
      const pend = updated[sName].coverages.filter(c => c.tipo === "Pendiente" && !c.editado);
      if (pend.length === 0) continue;
      try {
        const ans = await callAI(pend, sName, kbRef.current);
        ans.forEach(({ idx, respuesta, confianza }) => {
          const target = pend[idx - 1];
          if (target && respuesta) {
            target.respuesta = respuesta;
            target.tipo = "IA";
            target.confianza = confianza || "media";
            resueltas++;
          }
        });
      } catch (e) {
        console.error(e);
        fallidas += pend.length;
        if (!firstError) firstError = e.message;
      }
      setProgress(Math.round(((i + 1) / sheetsConPend.length) * 100));
    }

    setProgress(100);
    setSheets({ ...updated });
    setProcessing(false);

    if (fallidas > 0 && resueltas === 0) {
      notify("error", `La IA no pudo responder: ${firstError || "error de conexión"}.`, 8000);
    } else if (fallidas > 0) {
      notify("info", `IA: ${resueltas} resueltas, ${fallidas} sin respuesta (${firstError}).`, 7000);
    } else {
      notify("ok", `IA completó ${resueltas} cobertura(s) pendiente(s).`);
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
  const exportFile = () => {
    if (!wb) return;
    const totalResp = Object.values(sheets)
      .flatMap(s => s.coverages).filter(c => c.respuesta).length;
    if (totalResp === 0) {
      notify("info", "Aún no hay respuestas que exportar.");
      return;
    }
    try {
    // 1) escribir respuestas en las celdas originales
    Object.entries(sheets).forEach(([sName, { coverages }]) => {
      const ws = wb.Sheets[sName];
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
    // 2) hoja resumen
    const summary = [["HOJA", "COBERTURA / ÍTEM", "RESPUESTA CÓNDOR", "ORIGEN"]];
    Object.entries(sheets).forEach(([sName, { coverages }]) => {
      coverages.forEach(c => summary.push([sName, c.texto, c.respuesta || "(vacío)", c.tipo]));
      summary.push(["", "", "", ""]);
    });
    const wsS = XLSX.utils.aoa_to_sheet(summary);
    wsS["!cols"] = [{ wch: 22 }, { wch: 65 }, { wch: 65 }, { wch: 12 }];
    if (wb.Sheets["✓ Respuestas Cóndor"]) delete wb.Sheets["✓ Respuestas Cóndor"];
    XLSX.utils.book_append_sheet(wb, wsS, "✓ Respuestas Cóndor");

    XLSX.writeFile(wb, `${fileName.replace(/\.[^.]+$/, "")}_RESPONDIDO.xlsx`);
    notify("ok", "Archivo exportado con las respuestas de Cóndor.");
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
  const pct = total ? Math.round((answered / total) * 100) : 0;

  return (
    <div style={sx.app}>
      <div style={sx.header}>
        <div style={sx.logo}>C</div>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.5 }}>AUTO-COTIZADOR</div>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>Seguros Cóndor · Ramos Generales</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>MEMORIA</div>
            <div style={{ fontSize: 13, color: C.green }}>🧠 {kb.length} respuestas</div>
          </div>
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

      <div style={sx.body}>
        {step === "upload" && (
          <div>
            <h2 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 6px" }}>Nueva Cotización</h2>
            <p style={{ color: C.muted, margin: "0 0 26px", fontSize: 13 }}>
              Sube el Excel del broker. La app llena las respuestas al instante con lo que ya aprendió y usa IA solo para lo nuevo.
            </p>
            <div
              style={{ ...sx.drop, ...(dragOver ? { borderColor: C.accentLight, background: "#0A1F3A" } : {}) }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: 34, marginBottom: 10 }}>📂</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Arrastra el archivo del broker aquí</div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 18 }}>.xlsx · .xls · .xlsm</div>
              <button style={{ ...sx.btn, opacity: !kbReady || parsing ? 0.6 : 1 }} disabled={!kbReady || parsing}>
                {parsing ? "Leyendo archivo..." : kbReady ? "Seleccionar archivo" : "Cargando memoria..."}
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 22 }}>
              {[
                ["🧠", "Aprende contigo", `Ya tiene ${kb.length} respuestas. Cada cobertura que corriges se guarda para la próxima vez.`],
                ["⚡", "Match instantáneo", "Las coberturas conocidas se llenan solas, sin esperar a la IA ni gastar llamadas."],
                ["📄", "Llena tu archivo", "Te devuelve el mismo Excel del broker con las respuestas puestas, listo para reenviar."],
              ].map(([ic, t, d], i) => (
                <div key={i} style={sx.card}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{ic}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 5 }}>{t}</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{d}</div>
                </div>
              ))}
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
              <button style={sx.btnSm} onClick={() => { setStep("upload"); setSheets({}); setFileName(""); setWb(null); }}>Otro archivo</button>
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
                  <span style={{ fontSize: 11, color: C.muted }}>{rows.length} de {sheets[active].coverages.length}</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      <th style={{ ...sx.th, width: 36 }}>#</th>
                      <th style={{ ...sx.th, width: "44%" }}>COBERTURA / ÍTEM DEL BROKER</th>
                      <th style={sx.th}>RESPUESTA CÓNDOR</th>
                      <th style={{ ...sx.th, width: 90 }}>ORIGEN</th>
                    </tr></thead>
                    <tbody>
                      {rows.map(({ c, idx }) => (
                        <tr key={idx} style={{ background: idx % 2 ? "rgba(255,255,255,.015)" : "transparent" }}>
                          <td style={{ ...sx.td, color: C.muted, fontSize: 10 }}>{idx + 1}</td>
                          <td style={{ ...sx.td, color: "#B0C0D8", maxWidth: 380 }}>{c.texto}</td>
                          <td style={sx.td}>
                            <textarea style={sx.ta} value={c.respuesta} placeholder="— sin respuesta —"
                              onChange={e => editResp(active, idx, e.target.value)}
                              onBlur={() => onBlurLearn(active, idx)}
                              onFocus={e => e.target.style.borderColor = C.accentLight}
                            />
                          </td>
                          <td style={{ ...sx.td, textAlign: "center" }}>
                            <span style={badge(c.tipo)}>{c.tipo}</span>
                            {c.score > 0 && c.score < 1 && c.tipo === "Similar" &&
                              <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>{Math.round(c.score * 100)}%</div>}
                            {c.tipo === "IA" && c.confianza &&
                              <div style={{ fontSize: 9, marginTop: 4, color: c.confianza === "alta" ? C.green : c.confianza === "baja" ? C.red : C.yellow }}>
                                confianza {c.confianza}
                              </div>}
                          </td>
                        </tr>
                      ))}
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
