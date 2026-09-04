// Endpoint de OTA para CrossPoint (ws397) — se monta en tu Hono existente.
//
//   import { firmware } from "./firmware";
//   app.route("/firmware", firmware);
//
// Rutas:
//   GET  /firmware/latest              → JSON con forma de release de GitHub (lo lee el aparato)
//   GET  /firmware/firmware-ws397.bin  → el binario
//   PUT  /firmware                     → sube un build (Authorization: Bearer $OTA_TOKEN,
//                                        header X-Version: 1.5.<build>, body = firmware.bin)
//
// Guarda el .bin y la versión en disco (FIRMWARE_DIR, default ./data/firmware).
// El aparato compara major.minor.patch estrictamente: cada build que quieras que
// instale tiene que tener un patch mayor que el que ya corre.
import { Hono } from "hono";
import { mkdir } from "node:fs/promises";

const DIR = process.env.FIRMWARE_DIR ?? "./data/firmware";
const TOKEN = process.env.OTA_TOKEN ?? "";
const BIN = "firmware-ws397.bin";

export const firmware = new Hono();

async function meta(): Promise<{ version: string; size: number } | null> {
  const f = Bun.file(`${DIR}/${BIN}`);
  const v = Bun.file(`${DIR}/version.txt`);
  if (!(await f.exists()) || !(await v.exists())) return null;
  return { version: (await v.text()).trim(), size: f.size };
}

firmware.get("/latest", async (c) => {
  const m = await meta();
  if (!m) return c.json({ error: "no firmware uploaded" }, 404);
  const base = new URL(c.req.url);
  base.protocol = "https:";
  base.pathname = `/firmware/${BIN}`;
  base.search = "";
  return c.json({
    tag_name: m.version,
    assets: [{ name: BIN, browser_download_url: base.toString(), size: m.size }],
  });
});

firmware.get(`/${BIN}`, async (c) => {
  const f = Bun.file(`${DIR}/${BIN}`);
  if (!(await f.exists())) return c.text("not found", 404);
  c.header("Content-Type", "application/octet-stream");
  c.header("Content-Length", String(f.size));
  return c.body(f.stream());
});

firmware.put("/", async (c) => {
  if (!TOKEN || c.req.header("authorization") !== `Bearer ${TOKEN}`) return c.text("unauthorized", 401);
  const version = c.req.header("x-version") ?? "";
  if (!/^\d+\.\d+\.\d+$/.test(version)) return c.text("X-Version must be major.minor.patch", 400);
  const body = await c.req.arrayBuffer();
  if (body.byteLength < 100_000) return c.text("body too small to be a firmware", 400);
  await mkdir(DIR, { recursive: true });
  await Bun.write(`${DIR}/${BIN}`, body);
  await Bun.write(`${DIR}/version.txt`, version);
  return c.json({ ok: true, version, size: body.byteLength });
});
