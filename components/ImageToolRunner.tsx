"use client";

import { useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  Download,
  RotateCcw,
  ImageIcon,
  Trash2,
  Upload,
  Settings2,
} from "lucide-react";
import type { Tool } from "@/lib/tools";

// ── types ────────────────────────────────────────────────────────────────────
interface GeneratedImage {
  image: string; // data-URI
  prompt: string;
  size: string;
  seed?: number;
}

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

// ── component ────────────────────────────────────────────────────────────────
export default function ImageToolRunner({ tool }: { tool: Tool }) {
  const [prompt, setPrompt] = useState("");

  // Qwen settings
  const [qwenQuality, setQwenQuality] = useState<"speed" | "quality">("speed");
  const [enhancePrompt, setEnhancePrompt] = useState(true);
  const [randomizeSeed, setRandomizeSeed] = useState(true);
  const [seed, setSeed] = useState(0);
  const [customSize, setCustomSize] = useState(false);
  const [qwenWidth, setQwenWidth] = useState(1024);
  const [qwenHeight, setQwenHeight] = useState(1024);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // Status & output
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");
  const [images, setImages] = useState<GeneratedImage[]>([]);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  async function generate() {
    setError("");
    if (!prompt.trim()) {
      setError("Please describe the image you want to generate.");
      return;
    }
    setLoading(true);
    setStatusMsg("Connecting to Qwen Space…");

    const jobId = randomJobId();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {
      provider: "qwen",
      prompt,
      jobId,
      qwenQuality,
      enhancePrompt,
      randomizeSeed,
      seed,
      customSize,
      width: qwenWidth,
      height: qwenHeight,
      negativePrompt,
      nonCommercialConfirmed: true,
      images: await Promise.all(referenceFiles.map(fileToDataUrl)),
    };

    // Status polling
    pollingRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/image-generate?jobId=${encodeURIComponent(jobId)}`);
        const d = await r.json();
        if (d.status) setStatusMsg(d.status);
      } catch {}
    }, 1200);

    try {
      const res = await fetch("/api/image-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Image generation failed. Please try again.");
      } else {
        setImages((prev) =>
          [{ image: data.image, prompt: data.prompt, size: data.size, seed: data.seed }, ...prev].slice(0, 9)
        );
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
    setPrompt("");
    setImages([]);
    setError("");
    setStatusMsg("");
    setLoading(false);
    setReferenceFiles([]);
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function downloadImage(img: GeneratedImage, index: number) {
    const a = document.createElement("a");
    a.href = img.image;
    a.download = `ai-image-${index + 1}.png`;
    a.click();
  }

  function handleReferenceFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length > 10) {
      setError("Qwen supports up to 10 reference images.");
      e.target.value = "";
      return;
    }
    const totalBytes = files.reduce((s, f) => s + f.size, 0);
    if (totalBytes > 16 * 1024 * 1024) {
      setError("Keep reference images under 16 MB total.");
      e.target.value = "";
      return;
    }
    setReferenceFiles(files);
  }

  return (
    <div className="space-y-6">
      {/* ── Composer card ──────────────────────────────────────────────── */}
      <div className="card overflow-hidden p-0">
        {/* top bar */}
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-black/[0.03] px-5 py-2.5">
          <span className="text-xs font-semibold text-[var(--muted)]">{tool.name}</span>
        </div>

        <div className="p-5 sm:p-6">
          {/* Prompt */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--ink)]">
                Describe your image <span className="text-rose-500">*</span>
              </label>
              <span className="text-xs text-[var(--faint)]">{prompt.length} / 32,000</span>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={32000}
              rows={4}
              placeholder="e.g. A quiet little bookstore on a rainy evening, warm window light spilling onto the cobblestones…"
              className="field w-full resize-y px-3.5 py-2.5 text-sm"
            />
          </div>

          {/* Settings toggle */}
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
                {/* Row 1 — quality / seed */}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[var(--muted)]">
                    Quality
                    <select
                      value={qwenQuality}
                      onChange={(e) => setQwenQuality(e.target.value as "speed" | "quality")}
                      className="field ml-1 px-2.5 py-1.5 text-xs"
                    >
                      <option value="speed">Speed · 1K</option>
                      <option value="quality">Quality · 2K</option>
                    </select>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={enhancePrompt}
                      onChange={(e) => setEnhancePrompt(e.target.checked)}
                      className="accent-amber-500"
                    />
                    Enhance prompt
                  </label>
                  <label className="flex items-center gap-1.5 text-[var(--muted)]">
                    Seed
                    <input
                      type="number"
                      min={0}
                      max={2147483647}
                      value={seed}
                      onChange={(e) => setSeed(Number(e.target.value))}
                      className="field ml-1 w-20 px-2 py-1.5 text-xs"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={randomizeSeed}
                      onChange={(e) => setRandomizeSeed(e.target.checked)}
                      className="accent-amber-500"
                    />
                    Randomize
                  </label>
                </div>

                {/* Row 2 — reference images */}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] bg-white/50 px-3 py-2 hover:bg-white">
                    <Upload className="h-3.5 w-3.5 text-[var(--muted)]" />
                    <span className="font-medium text-[var(--ink)]">Reference images (up to 10)</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      className="hidden"
                      onChange={handleReferenceFiles}
                    />
                  </label>
                  <span className="text-[var(--faint)]">
                    {referenceFiles.length
                      ? `${referenceFiles.length} file${referenceFiles.length !== 1 ? "s" : ""} selected`
                      : "No images — add to edit or combine them"}
                  </span>
                </div>

                {/* Row 3 — custom dimensions */}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={customSize}
                      onChange={(e) => setCustomSize(e.target.checked)}
                      className="accent-amber-500"
                    />
                    Custom dimensions
                  </label>
                  {customSize && (
                    <>
                      <label className="flex items-center gap-1.5 text-[var(--muted)]">
                        W
                        <input
                          type="number"
                          min={256}
                          max={2688}
                          step={8}
                          value={qwenWidth}
                          onChange={(e) => setQwenWidth(Number(e.target.value))}
                          className="field ml-1 w-20 px-2 py-1.5 text-xs"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-[var(--muted)]">
                        H
                        <input
                          type="number"
                          min={256}
                          max={2688}
                          step={8}
                          value={qwenHeight}
                          onChange={(e) => setQwenHeight(Number(e.target.value))}
                          className="field ml-1 w-20 px-2 py-1.5 text-xs"
                        />
                      </label>
                    </>
                  )}
                </div>

                {/* Negative prompt */}
                <div>
                  <label className="mb-1 block text-[var(--muted)]">
                    Negative prompt <span className="text-[var(--faint)]">optional</span>
                  </label>
                  <textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    maxLength={4000}
                    rows={2}
                    placeholder="Describe elements you want the image to avoid…"
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
                  Generate Image
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

        </div>
      </div>

      {/* ── Gallery ─────────────────────────────────────────────────────── */}
      {(images.length > 0 || loading) && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow">Generated Images</p>
            <span className="text-xs text-[var(--faint)]">
              {images.length} {images.length === 1 ? "image" : "images"}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Loading placeholder */}
            {loading && (
              <div
                className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-gradient-to-br from-amber-50 to-orange-50"
                style={{ aspectRatio: "1/1" }}
              >
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-white ring-1 ring-amber-100">
                    <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                  </div>
                  <p className="max-w-[80%] text-xs text-[var(--muted)]">
                    {statusMsg || "Dreaming up your image…"}
                  </p>
                </div>
              </div>
            )}

            {/* Generated images */}
            {images.map((img, index) => (
              <div
                key={index}
                className="group relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--paper)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.image}
                  alt={img.prompt}
                  className="w-full object-cover"
                  style={{ aspectRatio: "1/1" }}
                />
                {/* Hover actions */}
                <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => downloadImage(img, index)}
                    title="Download"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-white/20 bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeImage(index)}
                    title="Remove"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-white/20 bg-black/60 text-white backdrop-blur-sm hover:bg-black/80"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Meta */}
                <div className="p-3">
                  <p className="line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">{img.prompt}</p>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--faint)]">
                    <span className="rounded bg-[var(--paper)] px-1.5 py-0.5 ring-1 ring-[var(--border)]">
                      {img.size.replace("x", " × ")}
                    </span>
                    {img.seed !== undefined && <span>seed {img.seed}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {images.length === 0 && !loading && (
        <div className="card flex min-h-[16rem] flex-col items-center justify-center text-center">
          <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--paper)] ring-1 ring-[var(--border)]">
            <ImageIcon className="h-5 w-5 text-[var(--faint)]" strokeWidth={1.5} />
          </span>
          <p className="text-sm font-medium text-[var(--ink)]">Your canvas is waiting</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Describe what you want to see and click Generate Image.
          </p>
        </div>
      )}
    </div>
  );
}
