import { Client, handle_file } from "@gradio/client";

export const runtime = "nodejs";
export const maxDuration = 180; // Qwen can take up to 3 min

// ── constants ────────────────────────────────────────────────────────────────
const QWEN_SPACE = "Qwen/Qwen-Image-2.1";
const QWEN_SPACE_ORIGIN = "https://qwen-qwen-image-2-1.hf.space";
const QWEN_TIMEOUT_MS = 12 * 60 * 1000;
const QWEN_CONNECT_TIMEOUT_MS = 3 * 60 * 1000;

const generationStatuses = new Map<string, { message: string; updatedAt: number }>();

// ── helpers ──────────────────────────────────────────────────────────────────
function updateGenerationStatus(jobId: string, message: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(jobId || "")) return;
  generationStatuses.set(jobId, { message, updatedAt: Date.now() });
  if (generationStatuses.size > 150) {
    for (const [id, entry] of generationStatuses) {
      if (Date.now() - entry.updatedAt > 20 * 60 * 1000 || generationStatuses.size > 100)
        generationStatuses.delete(id);
    }
  }
}

function redactSecrets(message: string) {
  let safe = String(message || "");
  const hfToken = process.env.HF_TOKEN;
  if (hfToken) safe = safe.replaceAll(hfToken, "[redacted]");
  return safe
    .replace(/hf_[A-Za-z0-9]{20,}/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error("Qwen request timed out."));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

// ── Qwen via Gradio ──────────────────────────────────────────────────────────
async function runQwenEndpoint(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  endpoint: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>,
  jobId: string,
  phase: string,
) {
  const submission = client.submit(endpoint, payload);
  const resultPromise = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    for await (const event of submission) {
      if (event.type === "status") {
        if (event.stage === "pending") {
          const position = Number.isInteger(event.position)
            ? ` · position ${event.position + 1}`
            : "";
          updateGenerationStatus(jobId, `Waiting in the Qwen Space queue${position}…`);
        } else if (event.stage === "generating") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detail = (event.progress_data as any[])?.find((item) => item.desc)?.desc;
          updateGenerationStatus(jobId, detail ? `Qwen: ${detail}` : phase);
        } else if (event.stage === "error") {
          throw new Error((event as { message?: string }).message || "Qwen Space request failed.");
        }
      }
      if (event.type === "data") result = event.data;
    }
    if (!result) throw new Error("Qwen Space returned no result.");
    return result;
  })();
  return withTimeout(resultPromise, QWEN_TIMEOUT_MS, () => submission.cancel());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateQwen(input: Record<string, any>, prompt: string) {
  const jobId = String(input.jobId || "");
  updateGenerationStatus(jobId, "Connecting to the Qwen Image 2.1 public Space…");

  const imageInputs: string[] = Array.isArray(input.images) ? input.images : [];
  if (imageInputs.length > 10) throw new Error("Qwen editing supports up to 10 input images.");
  let totalImageBytes = 0;
  const qwenImages = imageInputs.map((image) => {
    if (typeof image !== "string") throw new Error("An uploaded image is invalid.");
    const match = image.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) throw new Error("Use PNG, JPEG, or WebP images for Qwen editing.");
    const buffer = Buffer.from(match[2], "base64");
    totalImageBytes += buffer.length;
    return { image: handle_file(buffer), caption: null };
  });
  if (totalImageBytes > 16 * 1024 * 1024) throw new Error("Keep uploaded images under 16 MB total.");

  const seedValue = Number(input.seed);
  const seed =
    Number.isInteger(seedValue) && seedValue >= 0 && seedValue <= 2147483647 ? seedValue : 0;
  const widthValue = Number(input.width);
  const heightValue = Number(input.height);
  const validDimension = (v: number) =>
    Number.isInteger(v) && v >= 256 && v <= 2688 && v % 8 === 0;
  const width = validDimension(widthValue) ? widthValue : 1024;
  const height = validDimension(heightValue) ? heightValue : 1024;
  const quality = input.qwenQuality === "quality" ? "quality" : "speed";
  const enhance = input.enhancePrompt !== false;
  const customSize = input.customSize === true;
  const randomizeSeed = input.randomizeSeed === true;
  const negativePrompt = String(input.negativePrompt || "").slice(0, 4000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientOptions: Record<string, any> = { events: ["data", "status"] };
  if (process.env.HF_TOKEN) clientOptions.token = process.env.HF_TOKEN;

  const client = await withTimeout(
    Client.connect(QWEN_SPACE, clientOptions),
    QWEN_CONNECT_TIMEOUT_MS,
  );
  try {
    updateGenerationStatus(jobId, "Preparing your prompt…");
    const prepared = await runQwenEndpoint(
      client,
      "/prepare_request",
      {
        input_images: qwenImages,
        original_prompt: prompt,
        enable_extend: enhance,
        custom_size: customSize,
        quality,
        seed,
        randomize_seed: randomizeSeed,
      },
      jobId,
      "Preparing your prompt…",
    );
    const finalSeed = Number.isInteger(prepared[1]) ? prepared[1] : seed;

    updateGenerationStatus(jobId, "Generating with Qwen Image 2.1…");
    const generated = await runQwenEndpoint(
      client,
      "/generate_request",
      {
        original_prompt: prompt,
        enable_extend: enhance,
        custom_size: customSize,
        log_dir: "./generation_logs_paper_case",
        seed: finalSeed,
        height,
        width,
        negative_prompt: negativePrompt,
      },
      jobId,
      "Generating with Qwen Image 2.1…",
    );

    const output = generated[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let imageUrl = typeof output === "string" ? output : (output as any)?.url;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!imageUrl && (output as any)?.path)
      imageUrl = `${QWEN_SPACE_ORIGIN}/gradio_api/file=${(output as any).path}`;
    if (!imageUrl) throw new Error("Qwen Space returned an image in an unsupported format.");

    const parsedUrl = new URL(imageUrl);
    if (parsedUrl.origin !== QWEN_SPACE_ORIGIN)
      throw new Error("Qwen Space returned an unexpected image host.");

    const imageResponse = await fetch(parsedUrl, { signal: AbortSignal.timeout(60_000) });
    if (!imageResponse.ok) throw new Error("Could not download the generated image from the Qwen Space.");
    const contentType = imageResponse.headers.get("content-type") || "image/png";
    if (!/^image\/(png|jpeg|webp)$/.test(contentType))
      throw new Error("Qwen Space returned a non-image result.");
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    if (!imageBytes.length || imageBytes.length > 25 * 1024 * 1024)
      throw new Error("Qwen Space returned an empty or oversized image.");

    let actualSize = customSize
      ? `${width}x${height}`
      : `${quality === "quality" ? 2048 : 1024}x${quality === "quality" ? 2048 : 1024}`;
    if (
      contentType === "image/png" &&
      imageBytes.length >= 24 &&
      imageBytes.readUInt32BE(0) === 0x89504e47
    ) {
      actualSize = `${imageBytes.readUInt32BE(16)}x${imageBytes.readUInt32BE(20)}`;
    }

    updateGenerationStatus(jobId, "Image ready.");
    return {
      image: `data:${contentType};base64,${imageBytes.toString("base64")}`,
      prompt,
      model: QWEN_SPACE,
      size: actualSize,
      provider: "qwen",
      seed: finalSeed,
    };
  } finally {
    client.close();
  }
}

// ── GET — status polling ─────────────────────────────────────────────────────
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId") || "";
  const entry = generationStatuses.get(jobId);
  if (!entry || Date.now() - entry.updatedAt > 20 * 60 * 1000) {
    return Response.json({ status: "" });
  }
  return Response.json({ status: entry.message });
}

// ── POST — generate ──────────────────────────────────────────────────────────
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const prompt = String(body.prompt || "").trim();
  if (!prompt)
    return Response.json({ error: "Write a prompt before generating." }, { status: 400 });
  if (prompt.length > 32000)
    return Response.json({ error: "Prompt must be 32,000 characters or fewer." }, { status: 400 });

  if (body.nonCommercialConfirmed !== true) {
    return Response.json(
      { error: "Confirm personal, non-commercial testing before generating." },
      { status: 403 },
    );
  }

  try {
    const result = await generateQwen(body as Record<string, unknown>, prompt);
    return Response.json(result);
  } catch (error) {
    const message = redactSecrets((error as Error)?.message || "Hugging Face image generation failed.");
    const lower = message.toLowerCase();
    if (
      /quota|rate.?limit|too many requests|429|zero.?gpu|gpu.*(busy|limit|capacity)|out of (compute|gpu|inference)|exhaust(ed|ion)/.test(
        lower,
      )
    ) {
      return Response.json(
        { error: "The public Qwen Space is busy or its usage allowance is exhausted. Please wait and retry." },
        { status: 429 },
      );
    }
    if (/timed? ?out|timeout|aborted/.test(lower)) {
      return Response.json(
        { error: "Qwen generation took too long. The public Space may be busy; try again later." },
        { status: 504 },
      );
    }
    if (/queue|building|sleeping|not running|space_error/.test(lower)) {
      return Response.json({ error: `Qwen Space unavailable: ${message}` }, { status: 503 });
    }
    return Response.json(
      { error: message || "Hugging Face image generation failed." },
      { status: 502 },
    );
  }
}
