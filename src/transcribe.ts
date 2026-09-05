// Transcripción de voz para el aparato (no tiene teclado: toda pregunta entra
// por el mic). Recibe un WAV y devuelve el texto, usando cualquier servicio
// con la API de transcripción compatible con OpenAI:
//
//   STT_API_KEY   (o OPENAI_API_KEY)  → key del servicio
//   STT_BASE_URL  default https://api.openai.com/v1
//                 Groq (más barato / free tier): https://api.groq.com/openai/v1
//   STT_MODEL     default whisper-1   (Groq: whisper-large-v3-turbo)
//   STT_LANGUAGE  default es
//
//   POST /api/transcribe   (Bearer del aparato, lo chequea api.ts)
//   body: audio/wav (16 kHz mono 16-bit, hasta ~10 s = 320 KB)
//   200: { ok: true, text }
//   4xx/5xx: { ok: false, error }
import { Hono } from "hono";

const API_KEY = process.env.STT_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
const BASE_URL = (process.env.STT_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
const MODEL = process.env.STT_MODEL ?? "whisper-1";
const LANGUAGE = process.env.STT_LANGUAGE ?? "es";
const MAX_BYTES = 2_000_000;

export const transcribe = new Hono();

transcribe.post("/", async (c) => {
  if (!API_KEY) return c.json({ ok: false, error: "STT_API_KEY not set" }, 500);
  const audio = await c.req.arrayBuffer();
  if (audio.byteLength < 1_000) return c.json({ ok: false, error: "audio too short" }, 400);
  if (audio.byteLength > MAX_BYTES) return c.json({ ok: false, error: "audio too large" }, 413);

  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "question.wav");
  form.append("model", MODEL);
  form.append("language", LANGUAGE);
  form.append("response_format", "json");

  try {
    const res = await fetch(`${BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: form,
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error("transcribe:", res.status, detail);
      return c.json({ ok: false, error: `stt ${res.status}` }, 502);
    }
    const data = (await res.json()) as { text?: string };
    const text = (data.text ?? "").trim();
    if (!text) return c.json({ ok: false, error: "nothing recognised" }, 422);
    return c.json({ ok: true, text });
  } catch (err) {
    console.error("transcribe:", err);
    return c.json({ ok: false, error: "internal" }, 500);
  }
});
