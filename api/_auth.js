// ─── Verificación del token de sesión de Clerk (lado servidor) ────────────────
// La firma del token se valida criptográficamente con CLERK_SECRET_KEY. La
// empresa (organization) sale del token verificado, NUNCA de un parámetro del
// cliente. Lo usan /api/kb (memoria del equipo) y /api/quote (proxy de IA) para
// que ningún endpoint sea de acceso anónimo.
//
// Soporta los dos formatos de claims de Clerk (v1: org_id · v2: o.id).

import { verifyToken } from "@clerk/backend";

// Devuelve { userId, orgId } del token, o null si no se envió token.
// Lanza si el token es inválido/vencido (lo maneja el llamador como 401).
export async function verifyClerk(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const token = String(header).replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  const orgId = payload.org_id || (payload.o && payload.o.id) || null;
  return { userId: payload.sub || null, orgId };
}
