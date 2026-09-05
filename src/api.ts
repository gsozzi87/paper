// API del aparato: todo lo que cuelga de /api exige el token del aparato
// (Authorization: Bearer $DEVICE_TOKEN). Es un token propio del lector, distinto
// del OTA_TOKEN (ese solo sube firmware). Las features nuevas (preguntar al
// libro, recordatorios, voz) se montan acá adentro y heredan el chequeo.
import { Hono } from "hono";
import { ask } from "./ask";
api.route("/ask", ask);
const TOKEN = process.env.DEVICE_TOKEN ?? "";

export const api = new Hono();

api.use("*", async (c, next) => {
  const auth = c.req.header("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!TOKEN || token !== TOKEN) return c.json({ ok: false, error: "unauthorized" }, 401);
  await next();
});

// Lo usa Settings -> Prueba de servidor. X-Request-Id viene en cada pedido del
// aparato (estable entre reintentos); por ahora solo lo devolvemos.
api.get("/ping", (c) => c.json({ ok: true, now: Date.now(), requestId: c.req.header("x-request-id") ?? null }));
