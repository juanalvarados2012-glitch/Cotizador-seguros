// ─── Paleta, tipografía y estilos compartidos ────────────────────────────────
// Antes vivían dentro de App.jsx. Centralizados aquí para reutilizarlos desde
// los componentes extraídos (Toast, Modal…) sin duplicarlos.

export const C = {
  bg: "#0B0F1A", surface: "#131929", border: "#1E2D45", accent: "#1A6FD8",
  accentLight: "#3A8EF8", gold: "#C4975A", green: "#2ECC71", red: "#E74C3C",
  yellow: "#F39C12", text: "#E8EDF5", muted: "#6B7FA0", card: "#0E1828",
};

export const F = "'IBM Plex Mono','Courier New',monospace";

export const sx = {
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

// Estilo del badge de origen de una respuesta (Exacta/Similar/IA/…).
export function badge(tipo) {
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
