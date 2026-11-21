export const runtime = "nodejs";
export const maxDuration = 180;

const API = "https://api.wavespeed.ai/api/v3";

export async function POST(req: Request) {
  const apiKey = process.env.WAVESPEED_API_KEY;
  if (!apiKey) return Response.json({ error: "Background removal is not configured. Add WAVESPEED_API_KEY to the server environment." }, { status: 503 });

  let body: { image?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  const image = String(body.image || "");
  const match = image.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return Response.json({ error: "Upload a PNG, JPEG, or WebP image." }, { status: 400 });
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) return Response.json({ error: "Keep the image under 10 MB." }, { status: 413 });

  try {
    const submit = await fetch(`${API}/wavespeed-ai/image-background-remover`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
      signal: AbortSignal.timeout(30_000),
    });
    const submitBody = await submit.json().catch(() => ({}));
    if (!submit.ok) return Response.json({ error: submitBody?.message || submitBody?.error || "WaveSpeed could not accept this image." }, { status: 502 });
    const task = submitBody.data ?? submitBody;
    if (!task.id) return Response.json({ error: "WaveSpeed returned no job ID." }, { status: 502 });

    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const poll = await fetch(`${API}/predictions/${encodeURIComponent(task.id)}/result`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      const pollBody = await poll.json().catch(() => ({}));
      if (!poll.ok) return Response.json({ error: "Could not retrieve the WaveSpeed result." }, { status: 502 });
      const result = pollBody.data ?? pollBody;
      if (result.status === "completed") {
        const outputUrl = result.outputs?.[0];
        if (typeof outputUrl !== "string") return Response.json({ error: "WaveSpeed returned no processed image." }, { status: 502 });
        let parsed: URL;
        try { parsed = new URL(outputUrl); } catch { return Response.json({ error: "WaveSpeed returned an invalid image URL." }, { status: 502 }); }
        if (parsed.protocol !== "https:") return Response.json({ error: "WaveSpeed returned an invalid image URL." }, { status: 502 });
        const output = await fetch(parsed, { signal: AbortSignal.timeout(30_000) });
        const type = output.headers.get("content-type") || "image/png";
        const resultBytes = Buffer.from(await output.arrayBuffer());
        if (!output.ok || !/^image\/(png|jpeg|webp)$/.test(type) || resultBytes.length > 25 * 1024 * 1024) {
          return Response.json({ error: "Could not download the processed PNG." }, { status: 502 });
        }
        return Response.json({ image: `data:${type};base64,${resultBytes.toString("base64")}` });
      }
      if (["failed", "cancelled", "timeout", "deleted"].includes(result.status)) {
        return Response.json({ error: result.error || "WaveSpeed could not remove this background." }, { status: 502 });
      }
    }
    return Response.json({ error: "Background removal timed out. Please try again." }, { status: 504 });
  } catch {
    return Response.json({ error: "WaveSpeed is unavailable right now. Please try again." }, { status: 503 });
  }
}
