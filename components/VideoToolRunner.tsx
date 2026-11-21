"use client";

import { useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  Download,
  RotateCcw,
  Upload,
  Settings2,
  Video,
  X,
} from "lucide-react";
import type { Tool } from "@/lib/tools";

// ── helpers ──────────────────────────────────────────────────────────────────
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function randomJobId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

interface GeneratedVideo {
  video: string; // data-URI
  prompt: string;
}

// ── component ────────────────────────────────────────────────────────────────
export default function VideoToolRunner({ tool }: { tool: Tool }) {
  // inputs
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");

  // advanced settings
  const [showSettings, setShowSettings] = useState(false);
  const [numFrames, setNumFrames] = useState(81);
  const [fps, setFps] = useState(16);
  const [guidanceScale, setGuidanceScale] = useState(5.0);
  const [steps, setSteps] = useState(20);
  const [seed, setSeed] = useState(-1);

  // state
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropRef = useRef<HTMLLabelElement>(null);

  function stopPolling() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }

  async function handleImageSelect(file: File) {
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      setError("Please use PNG, JPEG, WebP, or GIF images.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Image must be under 20 MB.");
      return;
    }
    setError("");
    setImageFile(file);
    const url = await fileToDataUrl(file);
    setImagePreview(url);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageSelect(file);
  }

  async function generate() {
    setError("");
    if (!imageFile || !imagePreview) {
      setError("Please upload an image first.");
      return;
    }
    if (!prompt.trim()) {
      setError("Please describe the motion or animation you want.");
      return;
    }

    setLoading(true);
    setStatusMsg("Connecting to Wan2.2 Space…");

    const jobId = randomJobId();

    // Poll for status updates
    pollingRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/image-to-video?jobId=${encodeURIComponent(jobId)}`);
        const d = await r.json();
        if (d.status) setStatusMsg(d.status);
      } catch {}
    }, 1500);

    try {
      const res = await fetch("/api/image-to-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          image: imagePreview,
          prompt: prompt.trim(),
          negativePrompt: negativePrompt.trim(),
          numFrames,
          fps,
          guidanceScale,
          steps,
          seed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Video generation failed. Please try again.");
      } else {
        setVideos((prev) => [{ video: data.video, prompt: data.prompt }, ...prev].slice(0, 6));
        setStatusMsg("");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      stopPolling();
      setLoading(false);
    }
  }

  function reset() {
    stopPolling();
    setImageFile(null);
    setImagePreview(null);
    setPrompt("");
    setNegativePrompt("");
    setVideos([]);
    setError("");
    setStatusMsg("");
    setLoading(false);
  }

  function downloadVideo(v: GeneratedVideo, index: number) {
    const a = document.createElement("a");
    a.href = v.video;
    a.download = `ai-video-${index + 1}.mp4`;
    a.click();
  }

  function removeVideo(index: number) {
    setVideos((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-6">
      {/* ── Composer card ──────────────────────────────────────────────── */}
      <div className="card overflow-hidden p-0">
        {/* top bar */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-black/[0.03] px-5 py-2.5">
          <span className="text-xs font-semibold text-[var(--muted)]">{tool.name}</span>
          <div className="flex items-center gap-2">
            <span className="rounded bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600 ring-1 ring-rose-100">
              New
            </span>
            <span className="text-[10px] text-[var(--faint)]">Wan2.2 14B · free · public Space</span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {/* Image upload */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-[var(--ink)]">
              Source Image <span className="text-rose-500">*</span>
            </label>

            {imagePreview ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-h-52 max-w-full rounded-xl object-contain ring-1 ring-[var(--border)]"
                />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-white shadow hover:bg-rose-600"
                  title="Remove image"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label
                ref={dropRef}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border)] bg-black/[0.01] py-10 transition-colors hover:border-[var(--accent)] hover:bg-black/[0.03]"
              >
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--paper)] ring-1 ring-[var(--border)]">
                  <Upload className="h-5 w-5 text-[var(--muted)]" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-[var(--ink)]">Click to upload or drag & drop</p>
                  <p className="text-xs text-[var(--faint)]">PNG, JPEG, WebP · max 20 MB</p>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }}
                />
              </label>
            )}
          </div>

          {/* Prompt */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--ink)]">
                Motion Prompt <span className="text-rose-500">*</span>
              </label>
              <span className="text-xs text-[var(--faint)]">{prompt.length} / 500</span>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="e.g. Camera slowly zooms in, leaves gently swaying in the breeze, cinematic, smooth motion"
              className="field w-full resize-y px-3.5 py-2.5 text-sm"
            />
          </div>

          {/* Advanced settings */}
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--ink)]"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {showSettings ? "Hide" : "Show"} advanced settings
            </button>

            {showSettings && (
              <div className="space-y-3 rounded-xl border border-[var(--border)] bg-black/[0.02] p-4 text-xs">
                {/* Row 1 */}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[var(--muted)]">
                    Frames
                    <input
                      type="number" min={16} max={121} step={1}
                      value={numFrames}
                      onChange={(e) => setNumFrames(Number(e.target.value))}
                      className="field ml-1 w-16 px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-[var(--muted)]">
                    FPS
                    <input
                      type="number" min={8} max={24} step={1}
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      className="field ml-1 w-14 px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-[var(--muted)]">
                    Guidance
                    <input
                      type="number" min={1} max={20} step={0.5}
                      value={guidanceScale}
                      onChange={(e) => setGuidanceScale(Number(e.target.value))}
                      className="field ml-1 w-16 px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-[var(--muted)]">
                    Steps
                    <input
                      type="number" min={5} max={50} step={1}
                      value={steps}
                      onChange={(e) => setSteps(Number(e.target.value))}
                      className="field ml-1 w-14 px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-[var(--muted)]">
                    Seed
                    <input
                      type="number" min={-1}
                      value={seed}
                      onChange={(e) => setSeed(Number(e.target.value))}
                      className="field ml-1 w-20 px-2 py-1.5 text-xs"
                    />
                    <span className="text-[var(--faint)]">(-1 = random)</span>
                  </label>
                </div>
                {/* Negative prompt */}
                <div>
                  <label className="mb-1 block text-[var(--muted)]">
                    Negative prompt <span className="text-[var(--faint)]">optional</span>
                  </label>
                  <textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    maxLength={2000}
                    rows={2}
                    placeholder="e.g. blurry, low quality, distorted, shaky camera"
                    className="field w-full resize-y px-3 py-2 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Generate / Reset */}
          <div className="flex items-center gap-3">
            <button
              onClick={generate}
              disabled={loading}
              className="btn-ink inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {statusMsg || "Generating…"}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Video
                </>
              )}
            </button>
            <button
              onClick={reset}
              title="Reset"
              className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border-strong)] text-[var(--muted)] transition-colors hover:bg-black/[0.03] hover:text-[var(--ink)]"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">
              {error}
            </p>
          )}

          <p className="mt-4 text-xs text-[var(--faint)]">
            Powered by Wan2.2 14B via public Hugging Face Space · Free · ZeroGPU — availability may vary
          </p>
        </div>
      </div>

      {/* ── Video Gallery ────────────────────────────────────────────────── */}
      {(videos.length > 0 || loading) && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow">Generated Videos</p>
            <span className="text-xs text-[var(--faint)]">
              {videos.length} {videos.length === 1 ? "video" : "videos"}
            </span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* Loading placeholder */}
            {loading && (
              <div
                className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-gradient-to-br from-rose-50 to-orange-50"
                style={{ aspectRatio: "16/9" }}
              >
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center p-4">
                  <div className="grid h-12 w-12 place-items-center rounded-xl bg-white ring-1 ring-rose-100">
                    <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
                  </div>
                  <p className="max-w-[90%] text-xs text-[var(--muted)] leading-relaxed">
                    {statusMsg || "Generating your video… this may take 1–3 minutes"}
                  </p>
                </div>
              </div>
            )}

            {/* Generated videos */}
            {videos.map((v, index) => (
              <div
                key={index}
                className="group relative overflow-hidden rounded-xl border border-[var(--border)] bg-black"
              >
                <video
                  src={v.video}
                  controls
                  loop
                  className="w-full"
                  style={{ aspectRatio: "16/9", objectFit: "contain" }}
                />
                {/* Hover actions */}
                <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => downloadVideo(v, index)}
                    title="Download"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-white/20 bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeVideo(index)}
                    title="Remove"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-white/20 bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Meta */}
                <div className="p-3">
                  <p className="line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">{v.prompt}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {videos.length === 0 && !loading && (
        <div className="card flex min-h-[16rem] flex-col items-center justify-center text-center">
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--paper)] ring-1 ring-[var(--border)]">
            <Video className="h-5 w-5 text-[var(--faint)]" strokeWidth={1.5} />
          </span>
          <p className="text-sm font-medium text-[var(--ink)]">Your video will appear here</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Upload an image, describe the motion, and click Generate Video.
          </p>
        </div>
      )}
    </div>
  );
}
