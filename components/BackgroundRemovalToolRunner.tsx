"use client";

import { useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Scissors } from "lucide-react";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}

export default function BackgroundRemovalToolRunner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function chooseImage(next?: File) {
    if (!next) return;
    if (!/^image\/(png|jpeg|webp)$/.test(next.type)) return setError("Choose a PNG, JPEG, or WebP image.");
    if (next.size > 10 * 1024 * 1024) return setError("Keep the image under 10 MB.");
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setResult("");
    setError("");
  }

  async function removeBackground() {
    if (!file) return setError("Upload an image first.");
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/background-remover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: await readAsDataUrl(file) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Background removal failed.");
      setResult(data.image);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the background.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-5 sm:p-6">
        <p className="eyebrow mb-4">AI background removal · transparent PNG</p>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => chooseImage(e.target.files?.[0])} />
        <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseImage(e.dataTransfer.files?.[0]); }} className="flex min-h-64 w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--border-strong)] bg-black/[0.02] text-sm text-[var(--muted)] hover:bg-black/[0.04]">
          {preview ? <img src={preview} alt="Image selected for background removal" className="max-h-80 w-full object-contain" /> : <><ImagePlus className="mb-3 h-8 w-8" /><span>Drop an image here or click to browse</span><span className="mt-1 text-xs text-[var(--faint)]">PNG, JPEG, WebP · up to 10 MB</span></>}
        </button>
        <button type="button" onClick={removeBackground} disabled={loading || !file} className="btn-ink mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Removing background…</> : <><Scissors className="h-4 w-4" /> Remove background</>}
        </button>
        {loading && <p className="mt-3 text-sm text-[var(--muted)]">The first run may take longer while the AI model downloads.</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">{error}</p>}
        <p className="mt-4 text-xs text-[var(--faint)]">Processing uses WaveSpeed and may incur provider charges. Configure WAVESPEED_API_KEY on the server.</p>
      </section>
      <section className="card flex min-h-80 flex-col p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between"><p className="eyebrow">Transparent result</p>{result && <a href={result} download="background-removed.png" className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium"><Download className="h-3.5 w-3.5" /> Download PNG</a>}</div>
        {result ? <div className="grid flex-1 place-items-center rounded-xl bg-[linear-gradient(45deg,#eee_25%,transparent_25%),linear-gradient(-45deg,#eee_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee_75%),linear-gradient(-45deg,transparent_75%,#eee_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0] p-3"><img src={result} alt="Background removed, transparent PNG" className="max-h-[34rem] w-full object-contain" /></div> : <div className="grid flex-1 place-items-center rounded-xl bg-black/[0.02] text-sm text-[var(--faint)]">Your cutout will appear here.</div>}
      </section>
    </div>
  );
}
