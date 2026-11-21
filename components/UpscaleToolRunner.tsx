"use client";

import { useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles } from "lucide-react";

const DEFAULT_PROMPT = "Upscale this picture to 4K resolution.";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}

export default function UpscaleToolRunner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function chooseImage(next?: File) {
    if (!next) return;
    if (!/^image\/(png|jpeg|webp)$/.test(next.type)) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (next.size > 12 * 1024 * 1024) {
      setError("Keep the image under 12 MB.");
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setResult("");
    setError("");
  }

  async function upscale() {
    setError("");
    if (!file) return setError("Upload an image to upscale first.");
    setLoading(true);
    try {
      const image = await readAsDataUrl(file);
      const response = await fetch("/api/image-upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, prompt: prompt.trim() || DEFAULT_PROMPT }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upscaling failed. Please try again.");
      setResult(data.image);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = "qwen-upscaled-image.png";
    a.click();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="card p-5 sm:p-6">
        <p className="eyebrow mb-4">Image to image · Qwen Image Edit 2509 + Upscale2K LoRA</p>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => chooseImage(e.target.files?.[0])} />
        <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseImage(e.dataTransfer.files?.[0]); }} className="flex min-h-64 w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--border-strong)] bg-black/[0.02] text-sm text-[var(--muted)] hover:bg-black/[0.04]">
          {preview ? <img src={preview} alt="Selected image preview" className="max-h-80 w-full object-contain" /> : <><ImagePlus className="mb-3 h-8 w-8" /><span>Drop an image here or click to browse</span><span className="mt-1 text-xs text-[var(--faint)]">PNG, JPEG, WebP · up to 12 MB</span></>}
        </button>
        {file && <button type="button" className="mt-2 text-xs text-[var(--muted)] hover:text-[var(--ink)]" onClick={() => { setFile(null); setPreview(""); setResult(""); }}>Remove image</button>}
        <label className="mb-1.5 mt-5 block text-sm font-medium">Optional text guidance</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} maxLength={2000} className="field w-full resize-y px-3.5 py-2.5 text-sm" placeholder={DEFAULT_PROMPT} />
        <button type="button" onClick={upscale} disabled={loading} className="btn-ink mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Upscaling…</> : <><Sparkles className="h-4 w-4" /> Upscale image</>}
        </button>
        {loading && <p className="mt-3 text-sm text-[var(--muted)]">This can take around 30 seconds.</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">{error}</p>}
        <p className="mt-4 text-xs text-[var(--faint)]">Generation runs through WaveSpeed and may incur provider charges. Configure WAVESPEED_API_KEY on the server.</p>
      </section>
      <section className="card flex min-h-80 flex-col p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between"><p className="eyebrow">Upscaled result</p>{result && <button onClick={download} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium"><Download className="h-3.5 w-3.5" /> Download</button>}</div>
        {result ? <img src={result} alt="Upscaled result" className="max-h-[34rem] w-full rounded-xl object-contain" /> : <div className="grid flex-1 place-items-center rounded-xl bg-black/[0.02] text-sm text-[var(--faint)]">Your upscaled image will appear here.</div>}
      </section>
    </div>
  );
}
