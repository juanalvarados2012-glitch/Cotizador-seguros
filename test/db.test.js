import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  setScope, idbSet, idbGet, idbClear,
  histSave, histList, histGet, histDelete,
  kbKey, sessionKey, tombsKey, migratedKey,
} from "../src/db.js";

describe("db (IndexedDB + claves por scope)", () => {
  beforeEach(() => setScope("test_" + Math.random().toString(36).slice(2)));

  it("idbSet/idbGet hace round-trip de la sesión y idbClear la borra", async () => {
    await idbSet({ fileName: "a.xlsx", bytes: null });
    expect((await idbGet()).fileName).toBe("a.xlsx");
    await idbClear();
    expect(await idbGet()).toBeNull();
  });

  it("historial: guarda, lista, obtiene y borra", async () => {
    await histSave({ id: "f1", fileName: "f1.xlsx", ts: 1, total: 10, answered: 8, pending: 2, sheets: { H: { coverages: [] } } });
    expect((await histList()).find((h) => h.id === "f1")).toBeTruthy();
    expect((await histGet("f1")).sheets).toEqual({ H: { coverages: [] } });
    await histDelete("f1");
    expect(await histList()).toHaveLength(0);
  });

  it("aísla los datos por scope (dos empresas no comparten historial)", async () => {
    setScope("empresa_A");
    await histSave({ id: "x", fileName: "x", ts: 1, total: 1, answered: 1, pending: 0, sheets: {} });
    setScope("empresa_B");
    expect(await histList()).toHaveLength(0); // B no ve el archivo de A
  });

  it("las claves de localStorage llevan el scope activo", () => {
    setScope("acme");
    expect(kbKey()).toBe("cotizador_kb_acme");
    expect(sessionKey()).toBe("cotizador_sesion_acme");
    expect(tombsKey()).toBe("cotizador_kb_tombs_acme");
    expect(migratedKey()).toBe("cotizador_migrado_acme");
  });
});
