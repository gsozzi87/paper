// "Preguntarle al libro": el aparato manda el texto del capítulo que está
// leyendo más una pregunta; acá lo responde Claude. La API key de Anthropic
// vive solo en Railway (ANTHROPIC_API_KEY): el lector nunca la ve.
//
//   POST /api/ask   (Bearer del aparato, lo chequea api.ts)
//   body: { book, chapter, text, page?, question, lang? }
//     text     = texto plano del capítulo leído hasta acá (el aparato manda las
//                últimas páginas, ~24 KB como mucho)
//     page     = texto de la página en la que está el lector (opcional)
//     question = pregunta del lector (ya transcripta si vino por voz)
//     lang     = "es" (default) | "en"
//   200: { ok: true, answer, model, usage: { input, output, cached } }
//   4xx/5xx: { ok: false, error }
//
// Modelo: claude-haiku-4-5 por defecto (el más barato: $1 / $5 por millón de
// tokens). ASK_MODEL lo cambia; el pedido no usa parámetros específicos de un
// modelo, así que cualquier ID actual sirve tal cual.
//
// El capítulo va en el system prompt con cache_control: las preguntas
// sucesivas sobre el mismo capítulo reusan el prefijo cacheado (~90 % menos
// tokens de entrada). La pregunta y la página actual van en el mensaje del
// usuario, después.
import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ASK_MODEL ?? "claude-haiku-4-5";
const MAX_TEXT = 32_000; // chars; el aparato recorta antes, esto es defensa
const MAX_PAGE = 8_000;
const MAX_QUESTION = 500;

const client = new Anthropic();

export const ask = new Hono();

function systemPrompt(book: string, chapter: string, lang: string): string {
  const language = lang === "en" ? "English" : "español rioplatense, informal";
  return [
    "Sos un compañero de lectura dentro de un lector de libros electrónico de tinta electrónica.",
    `El usuario está leyendo "${book}"${chapter ? `, capítulo "${chapter}"` : ""}.`,
    "Respondé SOLO con lo que aparece en el texto adjunto y lo que el lector ya leyó; no adelantes nada",
    "de lo que pasa después en la obra aunque la conozcas (sin spoilers). Si el texto no alcanza para",
    "responder, decilo en una línea.",
    "La pregunta llega transcripta de voz: puede traer errores de reconocimiento; interpretala con",
    "sentido común y no comentes la transcripción.",
    `Idioma: ${language}. Texto plano, sin markdown, sin títulos ni listas con viñetas.`,
    "La pantalla es chica: máximo 120 palabras salvo que el lector pida algo más largo.",
  ].join(" ");
}

ask.post("/", async (c) => {
  let body: { book?: string; chapter?: string; text?: string; page?: string; question?: string; lang?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid json" }, 400);
  }
  const book = (body.book ?? "").toString().slice(0, 200);
  const chapter = (body.chapter ?? "").toString().slice(0, 200);
  const text = (body.text ?? "").toString().slice(0, MAX_TEXT);
  const page = (body.page ?? "").toString().slice(0, MAX_PAGE);
  const question = (body.question ?? "").toString().trim().slice(0, MAX_QUESTION);
  const lang = body.lang === "en" ? "en" : "es";
  if (!text || !question) return c.json({ ok: false, error: "text and question are required" }, 400);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        { type: "text", text: systemPrompt(book, chapter, lang) },
        {
          type: "text",
          text: `<leido_hasta_aca>\n${text}\n</leido_hasta_aca>`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: page
            ? `El lector está en esta página:\n<pagina>\n${page}\n</pagina>\n\nPregunta: ${question}`
            : question,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return c.json({ ok: false, error: "refused" }, 422);
    }
    let answer = "";
    for (const block of response.content) {
      if (block.type === "text") answer += block.text;
    }
    answer = answer.trim();
    return c.json({
      ok: true,
      answer,
      model: response.model,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cached: response.usage.cache_read_input_tokens ?? 0,
      },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return c.json({ ok: false, error: "rate limited" }, 429);
    if (err instanceof Anthropic.AuthenticationError) return c.json({ ok: false, error: "bad ANTHROPIC_API_KEY" }, 500);
    if (err instanceof Anthropic.APIError) return c.json({ ok: false, error: `claude ${err.status}: ${err.message}` }, 502);
    console.error("ask:", err);
    return c.json({ ok: false, error: "internal" }, 500);
  }
});
