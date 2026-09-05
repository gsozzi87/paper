// Servidor del ws397: OTA hoy, IA/voz/recordatorios después (cada feature = un archivo en src/).
import { Hono } from "hono";
import { firmware } from "./firmware";
import { api } from "./api";
import { ask } from "./ask";

const app = new Hono();

app.get("/", (c) => c.json({ ok: true, service: "ws397", uptime: process.uptime() }));
app.route("/firmware", firmware);
app.route("/api", api);
api.route("/ask", ask);

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
