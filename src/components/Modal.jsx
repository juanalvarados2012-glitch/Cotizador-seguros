import { C, sx } from "../ui/theme";

// Cáscara común de los paneles modales (privacidad, historial, memoria, ROI):
// fondo oscuro, tarjeta centrada, encabezado con título y botón de cerrar. El
// cuerpo de cada panel va como `children`. Cerrar al hacer clic fuera o en ✕.
export function Modal({ title, titleColor = C.text, maxWidth = 640, narrow = false, onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)",
        display: "flex", justifyContent: "center", alignItems: "flex-start",
        padding: narrow ? 10 : 40,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
          width: "100%", maxWidth, maxHeight: "88vh", display: "flex",
          flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: titleColor }}>{title}</span>
          <button onClick={onClose} style={{ ...sx.btnSm, fontSize: 16, padding: "2px 10px" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
