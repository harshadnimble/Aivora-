import { Client, handle_file } from "@gradio/client";

export const runtime = "nodejs";
export const maxDuration = 300; // Wan2.2 14B can take several minutes

const HF_SPACE = "JCisHERE/wan2-2-i2v-v3";
const generationStatuses = new Map<string, { message: string; updatedAt: number }>();

function updateStatus(jobId: string, message: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(jobId || "")) return;
  generationStatuses.set(jobId, { message, updatedAt: Date.now() });
  // prune old entries
  if (generationStatuses.size > 100) {
    for (const [id, entry] of generationStatuses) {
      if (Date.now() - entry.updatedAt > 20 * 60 * 1000) generationStatuses.delete(id);
    }
  }
}

function redact(msg: string) {
  const hf = process.env.HF_TOKEN;
  let s = String(msg || "");
  if (hf) s = s.replaceAll(hf, "[redacted]");
  return s.replace(/hf_[A-Za-z0-9]{20,}/g, "[redacted]");
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => { onTimeout?.(); reject(new Error("Request timed out.")); }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t)) as Promise<T>;
}

// ── GET — status polling ─────────────────────────────────────────────────────
export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get("jobId") || "";
  const entry = generationStatuses.get(jobId);
  if (!entry || Date.now() - entry.updatedAt > 20 * 60 * 1000) return Response.json({ status: "" });
  return Response.json({ status: entry.message });
}

// ── POST — generate ──────────────────────────────────────────────────────────
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const jobId = String(body.jobId || "");
  const prompt = String(body.prompt || "").trim();
  const negativePrompt = String(body.negativePrompt || "").slice(0, 2000);
  const imageData = String(body.image || "");

  if (!imageData) return Response.json({ error: "Please upload an image." }, { status: 400 });
  if (!prompt) return Response.json({ error: "Please enter a prompt describing the motion." }, { status: 400 });

  // Decode the base64 image
  const match = imageData.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return Response.json({ error: "Invalid image format. Use PNG, JPEG, or WebP." }, { status: 400 });
  const imageBuffer = Buffer.from(match[2], "base64");
  if (imageBuffer.length > 20 * 1024 * 1024) return Response.json({ error: "Image must be under 20 MB." }, { status: 413 });

  // Parse optional params
  const numFrames = Math.min(Math.max(Number(body.numFrames) || 81, 16), 121);
  const fps = Math.min(Math.max(Number(body.fps) || 16, 8), 24);
  const guidanceScale = Math.min(Math.max(Number(body.guidanceScale) || 5.0, 1.0), 20.0);
  const steps = Math.min(Math.max(Number(body.steps) || 20, 5), 50);
  const seed = Number.isInteger(Number(body.seed)) ? Number(body.seed) : -1;

  updateStatus(jobId, "Connecting to Wan2.2 Space…");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientOptions: Record<string, any> = { events: ["data", "status"] };
  if (process.env.HF_TOKEN) clientOptions.token = process.env.HF_TOKEN;

  let client: Awaited<ReturnType<typeof Client.connect>>;
  try {
    client = await withTimeout(Client.connect(HF_SPACE, clientOptions), 3 * 60 * 1000);
  } catch (err) {
    return Response.json({ error: `Could not connect to the Wan2.2 Space: ${redact((err as Error).message)}` }, { status: 503 });
  }

  updateStatus(jobId, "Connected — submitting your image…");

  try {
    const submission = client.submit("/generate_video", {
      image: handle_file(imageBuffer),
      prompt,
      negative_prompt: negativePrompt,
      num_frames: numFrames,
      fps,
      guidance_scale: guidanceScale,
      num_inference_steps: steps,
      seed,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = null;
    for await (const event of submission) {
      if (event.type === "status") {
        const stage = (event as { stage?: string; position?: number }).stage;
        const pos = (event as { position?: number }).position;
        if (stage === "pending") {
          const posStr = Number.isInteger(pos) ? ` (queue position ${(pos as number) + 1})` : "";
          updateStatus(jobId, `Waiting in queue${posStr}…`);
        } else if (stage === "generating") {
          updateStatus(jobId, "Generating video frames…");
        } else if (stage === "error") {
          throw new Error((event as { message?: string }).message || "Generation failed in the Space.");
        }
      }
      if (event.type === "data") result = event.data;
    }

    if (!result) throw new Error("The Space returned no result.");

    // The result is typically an array; the video is the first element.
    // It may be a URL string or an object with a `url` or `path` property.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = Array.isArray(result) ? result[0] : result;
    let videoUrl: string | null = null;
    if (typeof raw === "string") {
      videoUrl = raw;
    } else if (raw && typeof raw === "object") {
      videoUrl = (raw as { url?: string; path?: string }).url ?? null;
      if (!videoUrl && (raw as { path?: string }).path) {
        // Build URL from the Space's file API
        const spaceName = HF_SPACE.replace("/", "-").toLowerCase();
        videoUrl = `https://${spaceName}.hf.space/gradio_api/file=${(raw as { path: string }).path}`;
      }
    }
    if (!videoUrl) throw new Error("Could not find the video URL in the Space response.");

    updateStatus(jobId, "Downloading video…");

    // Fetch the video and return as base64 so the browser can play it without CORS issues
    const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(90_000) });
    if (!videoRes.ok) throw new Error(`Could not download the video (${videoRes.status}).`);
    const contentType = videoRes.headers.get("content-type") || "video/mp4";
    const videoBytes = Buffer.from(await videoRes.arrayBuffer());
    if (!videoBytes.length || videoBytes.length > 100 * 1024 * 1024) throw new Error("Video download failed or file is too large.");

    updateStatus(jobId, "Done.");
    return Response.json({
      video: `data:${contentType};base64,${videoBytes.toString("base64")}`,
      prompt,
    });
  } catch (err) {
    const msg = redact((err as Error).message || "Video generation failed.");
    const lower = msg.toLowerCase();
    if (/quota|rate.?limit|429|zero.?gpu|gpu.*(busy|limit)|exhausted/.test(lower))
      return Response.json({ error: "The Wan2.2 Space is busy or its GPU quota is exhausted. Please wait and retry." }, { status: 429 });
    if (/timed? ?out|timeout/.test(lower))
      return Response.json({ error: "Video generation timed out. The Space may be overloaded; please try again." }, { status: 504 });
    return Response.json({ error: msg }, { status: 502 });
  } finally {
    client.close();
  }
}
