export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_URL = process.env.AI_BASE_URL || "https://api.groq.com/openai/v1";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_MODELS = new Set(["whisper-large-v3", "whisper-large-v3-turbo"]);

export async function POST(req: Request) {
  const apiKey =
    req.headers.get("x-ai-key")?.trim() || process.env.GROQ_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Add your API key in Aivora's API key settings to transcribe." },
      { status: 401 },
    );
  }

  let input: FormData;
  try {
    input = await req.formData();
  } catch {
    return Response.json({ error: "Invalid transcription request." }, { status: 400 });
  }

  const file = input.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Choose an audio or video file to transcribe." }, { status: 400 });
  }
  if (!file.size || file.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio chunks must be 25 MB or smaller." }, { status: 413 });
  }

  const model = String(input.get("model") || "whisper-large-v3-turbo");
  if (!ALLOWED_MODELS.has(model)) {
    return Response.json({ error: "Choose a supported transcription model." }, { status: 400 });
  }

  const form = new FormData();
  form.append("file", file, "audio.wav");
  form.append("model", model);
  for (const field of ["response_format", "language", "prompt", "temperature", "timestamp_granularities[]"]) {
    for (const value of input.getAll(field)) {
      if (typeof value === "string" && value.length <= 2000) form.append(field, value);
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${BASE_URL.replace(/\/+$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "The transcription service could not be reached." }, { status: 502 });
  }

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
    },
  });
}
