import { describe, it, expect } from "vitest";
import { mergeIntoMap, normalizeKey, TOMB_TTL } from "../api/_merge.js";

describe("normalizeKey (servidor)", () => {
  it("coincide con la normalización del cliente", () => {
    expect(normalizeKey("Daños Por Agua")).toBe("danos por agua");
  });
});

describe("mergeIntoMap", () => {
  it("inserta una entrada nueva con su clave normalizada", () => {
    const map = mergeIntoMap({}, [{ cobertura: "Incendio", respuesta: "Ok", updatedAt: 100 }], [], 1000);
    expect(map.incendio).toMatchObject({ cobertura: "Incendio", respuesta: "Ok", count: 1, updatedAt: 100 });
  });

  it("last-write-wins: no pisa una entrada más nueva", () => {
    const map = { incendio: { cobertura: "Incendio", respuesta: "Nuevo", count: 1, updatedAt: 200 } };
    mergeIntoMap(map, [{ cobertura: "Incendio", respuesta: "Viejo", updatedAt: 100 }], [], 1000);
    expect(map.incendio.respuesta).toBe("Nuevo");
  });

  it("un borrado coloca una lápida", () => {
    const map = { a: { cobertura: "A", respuesta: "x", count: 1, updatedAt: 100 } };
    mergeIntoMap(map, [], [{ key: "a", updatedAt: 200 }], 1000);
    expect(map.a).toEqual({ deleted: true, updatedAt: 200 });
  });

  it("un borrado más viejo que una edición posterior no aplica", () => {
    const map = { a: { cobertura: "A", respuesta: "editado", count: 1, updatedAt: 300 } };
    mergeIntoMap(map, [], [{ key: "a", updatedAt: 200 }], 1000);
    expect(map.a.deleted).toBeUndefined();
    expect(map.a.respuesta).toBe("editado");
  });

  it("purga lápidas de más de 90 días", () => {
    const now = 1_000_000_000_000;
    const map = { a: { deleted: true, updatedAt: now - TOMB_TTL - 1 } };
    mergeIntoMap(map, [], [], now);
    expect(map.a).toBeUndefined();
  });

  it("respeta una clave (key) explícita en el upsert", () => {
    const map = mergeIntoMap({}, [{ key: "clave-fija", cobertura: "Lo que sea", respuesta: "Ok", updatedAt: 1 }], [], 10);
    expect(map["clave-fija"]).toBeTruthy();
  });
});
