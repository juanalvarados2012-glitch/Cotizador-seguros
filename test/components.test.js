import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Toast } from "../src/components/Toast.jsx";
import { Modal } from "../src/components/Modal.jsx";

describe("Toast", () => {
  it("no renderiza nada sin toast", () => {
    expect(renderToStaticMarkup(h(Toast, { toast: null, onClose() {} }))).toBe("");
  });
  it("muestra el mensaje y el ícono de éxito", () => {
    const html = renderToStaticMarkup(h(Toast, { toast: { type: "ok", msg: "Guardado" }, onClose() {} }));
    expect(html).toContain("Guardado");
    expect(html).toContain("✅");
  });
  it("usa el ícono de error para type=error", () => {
    const html = renderToStaticMarkup(h(Toast, { toast: { type: "error", msg: "Ups" }, onClose() {} }));
    expect(html).toContain("⚠️");
  });
});

describe("Modal", () => {
  it("renderiza el título y los children", () => {
    const html = renderToStaticMarkup(h(Modal, { title: "Memoria", onClose() {} }, h("p", null, "cuerpo del panel")));
    expect(html).toContain("Memoria");
    expect(html).toContain("cuerpo del panel");
    expect(html).toContain("✕"); // botón de cerrar
  });
});
