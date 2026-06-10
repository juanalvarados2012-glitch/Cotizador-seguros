// ─── Generador de PDF de la cotización (jsPDF, 100% en el navegador) ─────────
// Produce un documento A4 con la marca de la aseguradora: logo, colores,
// datos del cliente, desglose de los 3 planes y la "firma" electrónica
// (número de cotización + código de verificación del motor).

import { jsPDF } from "jspdf";
import { usd } from "../motor/cotizador.js";

// Convierte "#1B2A4A" a [27, 42, 74] para la API de color de jsPDF.
function hexARgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function generarPdfCotizacion({ config, datos, resultado, firma, planSeleccionado }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth(); // 210 mm
  const margen = 15;
  const primario = hexARgb(config.tema.colorPrimario);
  const acento = hexARgb(config.tema.colorAcento);
  let y = 0;

  // ── Cabecera con la marca de la aseguradora ────────────────────────────────
  doc.setFillColor(...primario);
  doc.rect(0, 0, ancho, 30, "F");

  // Logo (si la aseguradora subió uno en el panel de configuración)
  let xTexto = margen;
  if (config.empresa.logo) {
    try {
      doc.addImage(config.empresa.logo, "PNG", margen, 6, 18, 18);
      xTexto = margen + 23;
    } catch {
      // Si el formato del logo no es compatible, se omite sin romper el PDF.
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(config.empresa.nombre, xTexto, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(config.empresa.eslogan || "", xTexto, 20);
  doc.text("COTIZACIÓN DE SEGURO VEHICULAR", ancho - margen, 14, { align: "right" });
  doc.text(firma.numero, ancho - margen, 20, { align: "right" });

  // ── Datos generales ────────────────────────────────────────────────────────
  y = 40;
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  const fecha = new Date().toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  doc.text(`Fecha de emisión: ${fecha}`, margen, y);
  doc.text("Validez: 15 días calendario · Valores en USD", ancho - margen, y, { align: "right" });

  // ── Resumen del riesgo (vehículo + conductor) ──────────────────────────────
  y += 8;
  doc.setFillColor(245, 246, 248);
  doc.roundedRect(margen, y, ancho - margen * 2, 24, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primario);
  doc.text("VEHÍCULO", margen + 5, y + 7);
  doc.text("CONDUCTOR", ancho / 2 + 5, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  const v = datos.vehiculo;
  const c = datos.conductor;
  doc.text(`${v.marca} ${v.modelo} · ${v.anio} · Uso ${v.uso}`, margen + 5, y + 13);
  doc.text(`Valor comercial: ${usd(Number(v.valor))}`, margen + 5, y + 19);
  doc.text(`Edad: ${c.edad} años · Licencia tipo ${c.licencia}`, ancho / 2 + 5, y + 13);
  doc.text(`Ciudad: ${c.ciudad} · Siniestros (3 años): ${c.siniestros}`, ancho / 2 + 5, y + 19);

  // ── Tabla comparativa de planes ────────────────────────────────────────────
  y += 34;
  const colPlan = (ancho - margen * 2) * 0.4;
  const colValor = (ancho - margen * 2) * 0.2;

  const filas = [
    ["Prima neta anual", (p) => usd(p.primaNeta)],
    ["Contrib. Superintendencia (3.5%)", (p) => usd(p.contribSuper)],
    ["Seguro Social Campesino (0.5%)", (p) => usd(p.campesino)],
    ["Derechos de emisión", (p) => usd(p.emision)],
    [`IVA (${config.tarifas.legales.iva}%)`, (p) => usd(p.iva)],
    ["PRIMA TOTAL ANUAL", (p) => usd(p.total)],
    ["Cuota mensual (12 pagos)", (p) => usd(p.cuotaMensual)],
    ["Deducible", (p) => `${p.deducible.porcentaje}% mín. ${usd(p.deducible.minimo)}`],
  ];

  // Cabecera de la tabla
  doc.setFillColor(...primario);
  doc.rect(margen, y, ancho - margen * 2, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("CONCEPTO", margen + 3, y + 5.5);
  resultado.planes.forEach((p, i) => {
    const x = margen + colPlan + colValor * i + colValor / 2;
    const etiqueta = p.id === planSeleccionado ? `★ ${p.nombre.toUpperCase()}` : p.nombre.toUpperCase();
    doc.text(etiqueta, x, y + 5.5, { align: "center" });
  });
  y += 8;

  // Filas de valores
  doc.setTextColor(60, 60, 60);
  filas.forEach(([etiqueta, valorDe], fi) => {
    const esTotal = etiqueta === "PRIMA TOTAL ANUAL";
    if (fi % 2 === 0) {
      doc.setFillColor(248, 249, 251);
      doc.rect(margen, y, ancho - margen * 2, 7, "F");
    }
    if (esTotal) {
      doc.setFillColor(...acento);
      doc.rect(margen, y, ancho - margen * 2, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
    } else {
      doc.setTextColor(60, 60, 60);
      doc.setFont("helvetica", "normal");
    }
    doc.setFontSize(8.5);
    doc.text(etiqueta, margen + 3, y + 4.8);
    resultado.planes.forEach((p, i) => {
      const x = margen + colPlan + colValor * i + colValor / 2;
      doc.text(valorDe(p), x, y + 4.8, { align: "center" });
    });
    y += 7;
  });

  // ── Coberturas del plan seleccionado (o del Estándar por defecto) ──────────
  const plan =
    resultado.planes.find((p) => p.id === planSeleccionado) ||
    resultado.planes.find((p) => p.id === "estandar");
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primario);
  doc.text(`COBERTURAS DEL PLAN ${plan.nombre.toUpperCase()}`, margen, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  y += 5;
  plan.coberturas.forEach((cob) => {
    doc.text(`• ${cob}`, margen + 2, y);
    y += 4.5;
  });

  // ── Texto legal y firma electrónica ────────────────────────────────────────
  y = Math.max(y + 6, 225);
  doc.setDrawColor(200, 200, 200);
  doc.line(margen, y, ancho - margen, y);
  y += 5;
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  const legal = doc.splitTextToSize(config.textoLegal, ancho - margen * 2);
  doc.text(legal, margen, y);
  y += legal.length * 3 + 6;

  doc.setFontSize(8);
  doc.setTextColor(...primario);
  doc.setFont("helvetica", "bold");
  doc.text("Documento generado y firmado electrónicamente", margen, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Código de verificación: ${firma.verificacion} · ${config.empresa.registroSuperintendencia}`,
    margen,
    y + 4.5
  );
  doc.text(
    `${config.empresa.telefono} · ${config.empresa.email} · ${config.empresa.direccion}`,
    margen,
    y + 9
  );

  doc.save(`${firma.numero}.pdf`);
}
