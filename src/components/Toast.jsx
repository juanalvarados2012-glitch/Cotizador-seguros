import { C } from "../ui/theme";

// Notificación flotante (esquina superior derecha). Se cierra al hacer clic.
// `toast` = { type: "error" | "ok" | "info", msg } | null.
export function Toast({ toast, onClose }) {
  if (!toast) return null;
  const tone = toast.type;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", top: 16, right: 16, zIndex: 50, maxWidth: 380,
        padding: "12px 16px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
        display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
        boxShadow: "0 8px 30px rgba(0,0,0,.45)",
        background: tone === "error" ? "#2A1212" : tone === "ok" ? "#0F2614" : "#0A1F3A",
        border: `1px solid ${tone === "error" ? C.red : tone === "ok" ? C.green : C.accent}`,
        color: tone === "error" ? "#FFB3AB" : tone === "ok" ? "#A8E6BC" : "#A8C8F0",
      }}
    >
      <span style={{ fontSize: 15 }}>{tone === "error" ? "⚠️" : tone === "ok" ? "✅" : "ℹ️"}</span>
      <span>{toast.msg}</span>
    </div>
  );
}
