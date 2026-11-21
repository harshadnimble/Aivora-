export const runtime = "nodejs";
export const maxDuration = 180;

const API = "https://api.wavespeed.ai/api/v3";
const LORA = "https://huggingface.co/joyfox/Qwen-Image-Edit-2509-Upscale2K/resolve/main/qwen_image_edit_2509_upscale.safetensors";

export async function POST(req: Request) {
  const apiKey = process.env.WAVESPEED_API_KEY;
  if (!apiKey) return Response.json({ error: "Image upscaling is not configured yet. Add WAVESPEED_API_KEY to the server environment." }, { status: 503 });
  let body: { image?: unknown; prompt?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const image = String(body.image || "");
  const match = image.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return Response.json({ error: "Upload a valid PNG, JPEG, or WebP image." }, { status: 400 });
  const imageBytes = Buffer.from(match[2], "base64");
  if (!imageBytes.length || imageBytes.length > 12 * 1024 * 1024) return Response.json({ error: "Keep the image under 12 MB." }, { status: 400 });
  const prompt = String(body.prompt || "Upscale this picture to 4K resolution.").trim().slice(0, 2000) || "Upscale this picture to 4K resolution.";
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  try {
    const submit = await fetch(`${API}/wavespeed-ai/qwen-image/edit-lora`, { method: "POST", headers, signal: AbortSignal.timeout(30000), body: JSON.stringify({ prompt, image, loras: [{ path: LORA, scale: 1 }], output_format: "png" }) });
    const submitBody = await submit.json().catch(() => ({}));
    if (!submit.ok) return Response.json({ error: submitBody?.message || submitBody?.error || "WaveSpeed could not accept this image." }, { status: 502 });
    const task = submitBody.data ?? submitBody;
    if (!task.id) return Response.json({ error: "WaveSpeed returned no job ID." }, { status: 502 });
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const poll = await fetch(`${API}/predictions/${encodeURIComponent(task.id)}/result`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) });
      const pollBody = await poll.json().catch(() => ({}));
      if (!poll.ok) return Response.json({ error: "Could not retrieve the WaveSpeed result." }, { status: 502 });
      const result = pollBody.data ?? pollBody;
      if (result.status === "completed") {
        const outputUrl = result.outputs?.[0];
        if (typeof outputUrl !== "string") return Response.json({ error: "WaveSpeed returned no image." }, { status: 502 });
        const parsed = new URL(outputUrl);
        if (parsed.protocol !== "https:") return Response.json({ error: "WaveSpeed returned an invalid image URL." }, { status: 502 });
        const output = await fetch(parsed, { signal: AbortSignal.timeout(30000) });
        const type = output.headers.get("content-type") || "image/png";
        const bytes = Buffer.from(await output.arrayBuffer());
        if (!output.ok || !/^image\/(png|jpeg|webp)$/.test(type) || bytes.length > 25 * 1024 * 1024) return Response.json({ error: "Could not download the upscaled image." }, { status: 502 });
        return Response.json({ image: `data:${type};base64,${bytes.toString("base64")}` });
      }
      if (["failed", "cancelled", "timeout", "deleted"].includes(result.status)) return Response.json({ error: result.error || "WaveSpeed could not upscale this image." }, { status: 502 });
    }
    return Response.json({ error: "Upscaling timed out. Please try again." }, { status: 504 });
  } catch {
    return Response.json({ error: "WaveSpeed is unavailable right now. Please try again." }, { status: 503 });
  }
}
