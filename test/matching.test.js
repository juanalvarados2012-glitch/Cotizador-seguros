import { describe, it, expect } from "vitest";
import {
  tokens, jaccard, matchKB, needsReview, relevantKB,
  extractCoverages, kbFromWorkbook,
} from "../src/matching.js";

// XLSX simulado: cada "hoja" ES su arreglo de filas y sheet_to_json lo devuelve.
const fakeXLSX = { utils: { sheet_to_json: (ws) => ws } };

describe("tokens", () => {
  it("quita stopwords, acentos y palabras cortas", () => {
    expect(tokens("Daños por Agua")).toEqual(["danos", "agua"]);
  });
  it("expande abreviaturas del ramo (RC → responsabilidad civil)", () => {
    const t = tokens("RC frente a terceros");
    expect(t).toContain("responsabilidad");
    expect(t).toContain("civil");
    expect(t).toContain("terceros");
  });
});

describe("jaccard", () => {
  it("1 para textos idénticos", () => {
    expect(jaccard("responsabilidad civil", "responsabilidad civil")).toBe(1);
  });
  it("0 cuando no hay solapamiento", () => {
    expect(jaccard("incendio", "responsabilidad civil")).toBe(0);
  });
  it("0 con texto vacío", () => {
    expect(jaccard("", "incendio")).toBe(0);
  });
});

describe("matchKB", () => {
  const kb = [{ cobertura: "Incendio y rayo y humo", respuesta: "Cubierto" }];

  it("coincidencia exacta", () => {
    const m = matchKB("Incendio y rayo y humo", kb);
    expect(m).toMatchObject({ tipo: "Exacta", score: 1, respuesta: "Cubierto" });
  });

  it("coincidencia por contención marca Similar con score intermedio", () => {
    const m = matchKB("Daños por agua", [
      { cobertura: "Daños por agua a mercadería", respuesta: "Sujeto a evaluación" },
    ]);
    expect(m.tipo).toBe("Similar");
    expect(m.score).toBeGreaterThanOrEqual(0.5);
    expect(m.score).toBeLessThan(0.85);
    expect(m.respuesta).toBe("Sujeto a evaluación");
  });

  it("devuelve null cuando no hay precedente", () => {
    expect(matchKB("Responsabilidad civil patronal", kb)).toBeNull();
  });
});

describe("needsReview", () => {
  it("marca REVISAR", () => {
    expect(needsReview({ respuesta: "REVISAR" })).toBe(true);
  });
  it("marca IA de baja confianza", () => {
    expect(needsReview({ tipo: "IA", confianza: "baja", respuesta: "algo" })).toBe(true);
  });
  it("marca Similar con score flojo (<0.7)", () => {
    expect(needsReview({ tipo: "Similar", score: 0.6, respuesta: "algo" })).toBe(true);
    expect(needsReview({ tipo: "Similar", score: 0.8, respuesta: "algo" })).toBe(false);
  });
  it("no marca una respuesta exacta normal", () => {
    expect(needsReview({ tipo: "Exacta", respuesta: "Ok" })).toBe(false);
  });
  it("no marca cuando no hay respuesta", () => {
    expect(needsReview({ respuesta: "" })).toBe(false);
  });
});

describe("relevantKB", () => {
  it("prioriza las entradas con más solapamiento de tokens", () => {
    const kb = [
      { cobertura: "Incendio y rayo" },
      { cobertura: "Responsabilidad civil frente a terceros" },
    ];
    const r = relevantKB([{ texto: "responsabilidad civil patronal" }], kb, 1);
    expect(r).toHaveLength(1);
    expect(r[0].cobertura).toContain("Responsabilidad");
  });
});

describe("extractCoverages", () => {
  it("detecta la hoja, la columna de respuesta y autollena con la memoria", () => {
    const aoa = [
      ["COBERTURA", "RESPUESTA ASEGURADORA"],
      ["Incendio y rayo y humo", ""],
      ["Robo y asalto a instalaciones", ""],
    ];
    const wb = { SheetNames: ["Multirriesgo"], Sheets: { Multirriesgo: aoa } };
    const kb = [{ cobertura: "Incendio y rayo y humo", respuesta: "Cubierto" }];

    const res = extractCoverages(wb, kb, fakeXLSX);
    expect(res.Multirriesgo).toBeTruthy();
    expect(res.Multirriesgo.respCol).toBe(1);
    const cov = res.Multirriesgo.coverages;
    expect(cov[0]).toMatchObject({ tipo: "Exacta", respuesta: "Cubierto", respCol: 1 });
    expect(cov[1].tipo).toBe("Pendiente");
  });
});

describe("kbFromWorkbook", () => {
  it("extrae pares cobertura→respuesta de un archivo ya respondido", () => {
    const aoa = [
      ["COBERTURA", "RESPUESTA"],
      ["Incendio y rayo y humo", "Cubierto al 100%"],
      ["Robo y asalto a bodega", "NO"],
    ];
    const wb = { SheetNames: ["Hoja1"], Sheets: { Hoja1: aoa } };
    const pairs = kbFromWorkbook(wb, fakeXLSX);
    expect(pairs).toHaveLength(2);
    const incendio = pairs.find((p) => /Incendio/.test(p.cobertura));
    expect(incendio.respuesta).toBe("Cubierto al 100%");
  });
});
