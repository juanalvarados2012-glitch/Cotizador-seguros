// ─── Persistencia en localStorage ────────────────────────────────────────────
// Todo el estado del producto vive en el navegador: configuración white-label,
// historial de cotizaciones y leads de demo. Sin backend, sin costos de
// infraestructura para la aseguradora.

const KEYS = {
  config: "cotizador_wl_config_v1",
  cotizaciones: "cotizador_wl_historial_v1",
  leads: "cotizador_wl_leads_v1",
};

// Lectura segura: si el JSON está corrupto o localStorage no está disponible
// (modo incógnito estricto, iframes con storage bloqueado) devolvemos el fallback.
function leer(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function escribir(key, valor) {
  try {
    localStorage.setItem(key, JSON.stringify(valor));
  } catch {
    // Storage lleno o bloqueado: la app sigue funcionando sin persistencia.
  }
}

// ── Configuración white-label ──────────────────────────────────────────────
export const cargarConfig = (fallback) => leer(KEYS.config, fallback);
export const guardarConfig = (config) => escribir(KEYS.config, config);
export const borrarConfig = () => {
  try {
    localStorage.removeItem(KEYS.config);
  } catch {
    /* sin storage disponible */
  }
};

// ── Historial de cotizaciones (máximo 30, las más recientes primero) ───────
export const cargarCotizaciones = () => leer(KEYS.cotizaciones, []);
export function guardarCotizacion(cotizacion) {
  const lista = [cotizacion, ...cargarCotizaciones()].slice(0, 30);
  escribir(KEYS.cotizaciones, lista);
  return lista;
}
export function eliminarCotizacion(numero) {
  const lista = cargarCotizaciones().filter((c) => c.numero !== numero);
  escribir(KEYS.cotizaciones, lista);
  return lista;
}

// ── Leads del formulario "Solicitar demo" ──────────────────────────────────
export const cargarLeads = () => leer(KEYS.leads, []);
export function guardarLead(lead) {
  const lista = [{ ...lead, fecha: new Date().toISOString() }, ...cargarLeads()];
  escribir(KEYS.leads, lista);
  return lista;
}

/** Exporta los leads como CSV descargable (para importarlos a un CRM). */
export function exportarLeadsCSV() {
  const leads = cargarLeads();
  if (!leads.length) return;
  const cols = ["fecha", "empresa", "nombre", "cargo", "email", "telefono", "mensaje"];
  const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [cols.join(","), ...leads.map((l) => cols.map((c) => esc(l[c])).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `leads-cotizador-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
