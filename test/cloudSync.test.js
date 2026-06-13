import { describe, it, expect } from "vitest";
import {
  normalize, stampChanges, mergeRemote, tombsLoad, tombsSave,
} from "../src/cloudSync.js";

describe("normalize", () => {
  it("baja a minúsculas, quita acentos y colapsa espacios", () => {
    expect(normalize("  Daños  Por   AGUA ")).toBe("danos por agua");
  });
});

describe("stampChanges", () => {
  it("estampa updatedAt solo en lo que cambió y detecta altas y bajas", () => {
    const prev = [
      { cobertura: "Incendio", respuesta: "Ok", count: 1, updatedAt: 100 },
      { cobertura: "Robo", respuesta: "No", count: 1, updatedAt: 100 },
    ];
    const next = [
      { cobertura: "Incendio", respuesta: "Cubierto", count: 1 }, // cambió
      { cobertura: "Agua", respuesta: "Si", count: 1 },           // nueva
    ];
    const { stamped, upserts, deletes } = stampChanges(prev, next, 500);

    expect(upserts).toHaveLength(2); // Incendio (cambió) + Agua (nueva)
    expect(upserts.every((u) => u.updatedAt === 500)).toBe(true);
    expect(deletes).toEqual([{ key: "robo", updatedAt: 500 }]);
    expect(stamped.find((s) => s.cobertura === "Incendio").updatedAt).toBe(500);
  });

  it("conserva la marca de tiempo de lo que no cambió", () => {
    const prev = [{ cobertura: "Incendio", respuesta: "Ok", count: 1, updatedAt: 100 }];
    const next = [{ cobertura: "Incendio", respuesta: "Ok", count: 1 }];
    const { stamped, upserts } = stampChanges(prev, next, 500);
    expect(upserts).toHaveLength(0);
    expect(stamped[0].updatedAt).toBe(100);
  });
});

describe("mergeRemote", () => {
  it("la versión remota más reciente gana", () => {
    const local = [{ cobertura: "A", respuesta: "viejo", count: 1, updatedAt: 100 }];
    const remote = { a: { cobertura: "A", respuesta: "nuevo", count: 2, updatedAt: 200 } };
    const { merged, upserts } = mergeRemote(local, {}, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].respuesta).toBe("nuevo");
    expect(upserts).toHaveLength(0);
  });

  it("la versión local más reciente gana y se re-sube", () => {
    const local = [{ cobertura: "A", respuesta: "local-nuevo", count: 1, updatedAt: 300 }];
    const remote = { a: { cobertura: "A", respuesta: "remoto-viejo", count: 1, updatedAt: 200 } };
    const { merged, upserts } = mergeRemote(local, {}, remote);
    expect(merged[0].respuesta).toBe("local-nuevo");
    expect(upserts).toHaveLength(1);
  });

  it("un borrado remoto elimina la entrada local más vieja", () => {
    const local = [{ cobertura: "A", respuesta: "x", count: 1, updatedAt: 100 }];
    const remote = { a: { deleted: true, updatedAt: 200 } };
    const { merged } = mergeRemote(local, {}, remote);
    expect(merged.find((m) => normalize(m.cobertura) === "a")).toBeUndefined();
  });

  it("una lápida local más reciente propaga el borrado", () => {
    const remote = { a: { cobertura: "A", respuesta: "x", count: 1, updatedAt: 200 } };
    const { merged, deletes } = mergeRemote([], { a: 300 }, remote);
    expect(merged).toHaveLength(0);
    expect(deletes).toEqual([{ key: "a", updatedAt: 300 }]);
  });

  it("entradas locales que la nube no conoce se suben", () => {
    const local = [{ cobertura: "B", respuesta: "y", count: 1, updatedAt: 100 }];
    const { merged, upserts } = mergeRemote(local, {}, {});
    expect(merged).toHaveLength(1);
    expect(upserts).toHaveLength(1);
  });
});

describe("tombs (lápidas locales)", () => {
  it("guarda y recupera", () => {
    tombsSave("test_tombs", { a: Date.now() });
    expect(tombsLoad("test_tombs").a).toBeTypeOf("number");
  });
  it("purga las lápidas de más de 90 días", () => {
    const viejo = Date.now() - 91 * 24 * 3600 * 1000;
    tombsSave("test_tombs_old", { vieja: viejo });
    expect(tombsLoad("test_tombs_old").vieja).toBeUndefined();
  });
});
