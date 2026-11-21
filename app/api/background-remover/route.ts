import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

export async function POST(req: Request) {
  let body: { image?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }

  const match = String(body.image || "").match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return Response.json({ error: "Upload a PNG, JPEG, or WebP image." }, { status: 400 });
  const input = Buffer.from(match[2], "base64");
  if (!input.length || input.length > 10 * 1024 * 1024) return Response.json({ error: "Keep the image under 10 MB." }, { status: 413 });

  const workDir = await mkdtemp(path.join(tmpdir(), "background-remover-"));
  const inputPath = path.join(workDir, match[1] === "image/png" ? "input.png" : match[1] === "image/webp" ? "input.webp" : "input.jpg");
  const outputPath = path.join(workDir, "output.png");
  try {
    await writeFile(inputPath, input);
    const python = process.env.PYTHON_BIN || "python3";
    await execFileAsync(python, ["-m", "backgroundremover.cmd.cli", "-i", inputPath, "-o", outputPath], { timeout: 270_000, maxBuffer: 2 * 1024 * 1024 });
    const output = await readFile(outputPath);
    if (!output.length || output.length > 25 * 1024 * 1024) return Response.json({ error: "The processed image is empty or too large." }, { status: 502 });
    return Response.json({ image: `data:image/png;base64,${output.toString("base64")}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("ENOENT") || message.includes("No module named 'backgroundremover'")) {
      return Response.json({ error: "BackgroundRemover is not installed. Follow the Python setup steps in README.md." }, { status: 503 });
    }
    if (message.includes("timed out")) return Response.json({ error: "Processing timed out. Try a smaller image or use a machine with GPU support." }, { status: 504 });
    return Response.json({ error: "Could not process this image. Check that BackgroundRemover, PyTorch, and FFmpeg are installed on the server." }, { status: 502 });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
