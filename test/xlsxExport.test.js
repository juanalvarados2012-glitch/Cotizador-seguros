import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { colToNum, numToCol, applyEditsToSheet, exportPreservingFormat } from "../src/xlsxExport.js";

describe("colToNum / numToCol", () => {
  it("convierte columnas en ambos sentidos", () => {
    expect(colToNum("A")).toBe(1);
    expect(colToNum("Z")).toBe(26);
    expect(colToNum("AA")).toBe(27);
    expect(numToCol(1)).toBe("A");
    expect(numToCol(27)).toBe("AA");
    for (const n of [1, 26, 27, 52, 703]) expect(colToNum(numToCol(n))).toBe(n);
  });
});

describe("applyEditsToSheet", () => {
  const base =
    `<worksheet><dimension ref="A1:B2"/><sheetData>` +
    `<row r="1"><c r="A1" t="inlineStr"><is><t>Cob</t></is></c></row>` +
    `<row r="2"><c r="A2" s="5" t="inlineStr"><is><t>Incendio</t></is></c></row>` +
    `</sheetData></worksheet>`;

  it("inserta una celda nueva en una fila existente", () => {
    const out = applyEditsToSheet(base, new Map([["B2", "Cubierto"]]));
    expect(out).toContain(`r="B2"`);
    expect(out).toContain("Cubierto");
  });

  it("reemplaza una celda existente preservando su estilo (s=)", () => {
    const out = applyEditsToSheet(base, new Map([["A2", "NuevoTexto"]]));
    expect(out).toContain(`s="5"`);
    expect(out).toContain("NuevoTexto");
    expect(out).not.toContain(">Incendio<");
  });

  it("crea una fila nueva y amplía la dimensión", () => {
    const out = applyEditsToSheet(base, new Map([["B3", "X"]]));
    expect(out).toContain(`<row r="3">`);
    expect(out).toContain(`r="B3"`);
    expect(out).toContain(`<dimension ref="A1:B3"/>`);
  });

  it("escapa caracteres XML peligrosos", () => {
    const out = applyEditsToSheet(base, new Map([["B2", "A & B <x>"]]));
    expect(out).toContain("&amp;");
    expect(out).toContain("&lt;");
    expect(out).not.toContain("<x>");
  });
});

describe("exportPreservingFormat (round-trip end-to-end)", () => {
  function buildBytes() {
    const ws = XLSX.utils.aoa_to_sheet([["Cobertura", "Respuesta"], ["Incendio", ""]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }

  it("escribe la respuesta en el .xlsx original y se relee correctamente", () => {
    const out = exportPreservingFormat(buildBytes(), { Hoja1: new Map([["B2", "Cubierto"]]) }, null);
    const wb = XLSX.read(out, { type: "array" });
    expect(wb.SheetNames).toContain("Hoja1");
    expect(wb.Sheets.Hoja1.B2.v).toBe("Cubierto");
  });

  it("registra la hoja resumen como hoja nueva válida", () => {
    const summary = { name: "Resumen", aoa: [["Total", 2], ["Auto", 1]], cols: [20, 10], merges: [], autofilter: "" };
    const out = exportPreservingFormat(buildBytes(), { Hoja1: new Map([["B2", "Ok"]]) }, summary);
    const wb = XLSX.read(out, { type: "array" });
    expect(wb.SheetNames).toContain("Resumen");
    expect(wb.SheetNames).toContain("Hoja1");
    expect(wb.Sheets.Hoja1.B2.v).toBe("Ok");
  });

  it("lanza si los bytes no son un .xlsx OOXML estándar", () => {
    expect(() => exportPreservingFormat(new Uint8Array([1, 2, 3]), {}, null)).toThrow();
  });
});
