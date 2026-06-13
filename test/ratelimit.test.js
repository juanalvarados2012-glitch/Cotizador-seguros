import { describe, it, expect } from "vitest";
import { rateLimit } from "../api/_ratelimit.js";

// Sin KV (kv=null) usa el limitador en memoria por instancia. Cada test usa un
// id único para no compartir contador con otro.
describe("rateLimit (memoria, sin Redis)", () => {
  it("permite hasta el límite y luego bloquea", async () => {
    const opts = { limit: 2, windowSec: 60, prefix: "test" };
    const id = "u1";
    const r1 = await rateLimit(null, id, opts);
    const r2 = await rateLimit(null, id, opts);
    const r3 = await rateLimit(null, id, opts);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(false);
    expect(r3.retryAfter).toBeGreaterThan(0);
  });

  it("limit<=0 desactiva el límite (siempre permite)", async () => {
    const r = await rateLimit(null, "u2", { limit: 0, windowSec: 60, prefix: "test" });
    expect(r.ok).toBe(true);
  });

  it("cuenta por usuario de forma independiente", async () => {
    const opts = { limit: 1, windowSec: 60, prefix: "test-iso" };
    expect((await rateLimit(null, "a", opts)).ok).toBe(true);
    expect((await rateLimit(null, "b", opts)).ok).toBe(true); // otro usuario, su propio cupo
    expect((await rateLimit(null, "a", opts)).ok).toBe(false);
  });
});
