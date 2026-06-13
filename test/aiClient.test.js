import { describe, it, expect, vi, afterEach } from "vitest";
import { callAI } from "../src/aiClient.js";

const origFetch = global.fetch;
afterEach(() => { global.fetch = origFetch; vi.restoreAllMocks(); });

function mockFetch(impl) { global.fetch = vi.fn(impl); }

describe("callAI", () => {
  it("devuelve el arreglo de respuestas del servidor", async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ respuestas: [{ idx: 1, respuesta: "Ok" }] }) }));
    const r = await callAI([{ texto: "Incendio" }], "Hoja1", []);
    expect(r).toEqual([{ idx: 1, respuesta: "Ok" }]);
  });

  it("adjunta el token de Clerk como Bearer cuando hay getToken", async () => {
    let sentAuth;
    mockFetch(async (_url, opts) => { sentAuth = opts.headers.Authorization; return { ok: true, status: 200, json: async () => ({ respuestas: [] }) }; });
    await callAI([{ texto: "x" }], "H", [], "", async () => "tok-123");
    expect(sentAuth).toBe("Bearer tok-123");
  });

  it("no manda Authorization si no hay getToken", async () => {
    let headers;
    mockFetch(async (_url, opts) => { headers = opts.headers; return { ok: true, status: 200, json: async () => ({ respuestas: [] }) }; });
    await callAI([{ texto: "x" }], "H", []);
    expect(headers.Authorization).toBeUndefined();
  });

  it("propaga el mensaje de error del servidor en un fallo no-429", async () => {
    mockFetch(async () => ({ ok: false, status: 500, json: async () => ({ error: "Falla del proxy" }) }));
    await expect(callAI([{ texto: "x" }], "H", [])).rejects.toThrow("Falla del proxy");
  });

  it("recorta la memoria a 15 ejemplos y los pendientes a {texto} en el cuerpo", async () => {
    let body;
    mockFetch(async (_url, opts) => { body = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ respuestas: [] }) }; });
    const kb = Array.from({ length: 30 }, (_, i) => ({ cobertura: `c${i}`, respuesta: `r${i}`, count: 1, extra: "x" }));
    await callAI([{ texto: "uno", de: "mas" }], "H", kb);
    expect(body.kb).toHaveLength(15);
    expect(body.kb[0]).toEqual({ cobertura: "c0", respuesta: "r0" }); // sin campos extra
    expect(body.pendientes).toEqual([{ texto: "uno" }]);
  });
});
