"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Shuffle } from "lucide-react";

type Mood = "Editorial" | "Modern" | "Warm" | "Elegant" | "Bold" | "Technical";
type Pairing = {
  id: string;
  mood: Mood;
  heading: string;
  body: string;
  headingFallback: string;
  bodyFallback: string;
  note: string;
};

const MOODS = ["All styles", "Editorial", "Modern", "Warm", "Elegant", "Bold", "Technical"] as const;

const PAIRINGS: Pairing[] = [
  { id: "playfair-dm", mood: "Editorial", heading: "Playfair Display", body: "DM Sans", headingFallback: "Georgia, serif", bodyFallback: "Arial, sans-serif", note: "A literary serif with a clean, quiet sans." },
  { id: "cormorant-manrope", mood: "Editorial", heading: "Cormorant Garamond", body: "Manrope", headingFallback: "Georgia, serif", bodyFallback: "Arial, sans-serif", note: "High contrast and graceful, with a contemporary reading voice." },
  { id: "space-inter", mood: "Modern", heading: "Space Grotesk", body: "Inter", headingFallback: "Arial, sans-serif", bodyFallback: "Arial, sans-serif", note: "Distinctive geometry up top; effortless reading below." },
  { id: "plus-jakarta-outfit", mood: "Modern", heading: "Plus Jakarta Sans", body: "Outfit", headingFallback: "Arial, sans-serif", bodyFallback: "Arial, sans-serif", note: "Crisp, friendly shapes for a polished digital brand." },
  { id: "fraunces-nunito", mood: "Warm", heading: "Fraunces", body: "Nunito Sans", headingFallback: "Georgia, serif", bodyFallback: "Arial, sans-serif", note: "Soft character and rounded details feel personal." },
  { id: "newsreader-karla", mood: "Warm", heading: "Newsreader", body: "Karla", headingFallback: "Georgia, serif", bodyFallback: "Arial, sans-serif", note: "An inviting editorial voice without feeling formal." },
  { id: "dmserif-manrope", mood: "Elegant", heading: "DM Serif Display", body: "Manrope", headingFallback: "Georgia, serif", bodyFallback: "Arial, sans-serif", note: "A poised display face balanced by a measured sans." },
  { id: "librebaskerville-source", mood: "Elegant", heading: "Libre Baskerville", body: "Source Sans 3", headingFallback: "Georgia, serif", bodyFallback: "Arial, sans-serif", note: "Classic proportions with open, practical body text." },
  { id: "archivo-work", mood: "Bold", heading: "Archivo Black", body: "Work Sans", headingFallback: "Impact, sans-serif", bodyFallback: "Arial, sans-serif", note: "A strong headline with straightforward supporting copy." },
  { id: "barlow-condensed-inter", mood: "Bold", heading: "Barlow Condensed", body: "Inter", headingFallback: "Impact, sans-serif", bodyFallback: "Arial, sans-serif", note: "Tall, punchy headlines and a calm interface voice." },
  { id: "ibmplex-ibmplex", mood: "Technical", heading: "IBM Plex Mono", body: "IBM Plex Sans", headingFallback: "monospace", bodyFallback: "Arial, sans-serif", note: "A precise technical voice that stays easy to scan." },
  { id: "space-plex", mood: "Technical", heading: "Space Grotesk", body: "IBM Plex Sans", headingFallback: "Arial, sans-serif", bodyFallback: "Arial, sans-serif", note: "A little character for the headline, built for clear product text." },
];

const STARTING_IDS = ["playfair-dm", "space-inter", "fraunces-nunito", "ibmplex-ibmplex"];
const DEFAULT_TITLE = "Make your next idea impossible to ignore.";
const DEFAULT_BODY = "Good typography gives every message a clearer voice. Pair a distinctive headline with body text that feels effortless to read.";

function googleFontsUrl(pairings: Pairing[]) {
  const families = Array.from(new Set(pairings.flatMap(({ heading, body }) => [heading, body])));
  const query = families.map((family) => `family=${encodeURIComponent(family)}:wght@400;500;600;700`).join("&");
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

function cssFor(pairing: Pairing) {
  const importUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(pairing.heading)}:wght@400;500;600;700&family=${encodeURIComponent(pairing.body)}:wght@400;500;600;700&display=swap`;
  return `@import url('${importUrl}');\n\n:root {\n  --font-heading: '${pairing.heading}', ${pairing.headingFallback};\n  --font-body: '${pairing.body}', ${pairing.bodyFallback};\n}\n\nh1, h2, h3 { font-family: var(--font-heading); }\nbody { font-family: var(--font-body); }`;
}

export default function FontPairingToolRunner() {
  const [mood, setMood] = useState<(typeof MOODS)[number]>("All styles");
  const [pairingIds, setPairingIds] = useState(STARTING_IDS);
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");

  const visiblePairings = pairingIds
    .map((id) => PAIRINGS.find((pairing) => pairing.id === id))
    .filter((pairing): pairing is Pairing => Boolean(pairing));

  useEffect(() => {
    const id = "font-pairing-google-fonts";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = googleFontsUrl(visiblePairings);
  }, [pairingIds]);

  function findPairings(nextMood = mood) {
    const choices = nextMood === "All styles" ? PAIRINGS : PAIRINGS.filter((pairing) => pairing.mood === nextMood);
    const shuffled = [...choices].sort(() => Math.random() - 0.5);
    setPairingIds(shuffled.slice(0, Math.min(4, shuffled.length)).map((pairing) => pairing.id));
  }

  async function copy(text: string, key: string) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopyError("Clipboard access is unavailable in this browser.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="card grid gap-5 p-5 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] sm:p-6">
        <div>
          <label htmlFor="font-mood" className="mb-2 block text-sm font-medium text-[var(--ink)]">Choose a mood</label>
          <select id="font-mood" value={mood} onChange={(event) => { const nextMood = event.target.value as (typeof MOODS)[number]; setMood(nextMood); findPairings(nextMood); }} className="field w-full px-3.5 py-2.5 text-sm">
            {MOODS.map((option) => <option key={option}>{option}</option>)}
          </select>
          <p className="mt-2 text-xs leading-relaxed text-[var(--faint)]">Curated Google Fonts pairings. Choose a direction, then preview them with your own copy.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="font-sample-title" className="mb-2 block text-sm font-medium text-[var(--ink)]">Headline preview</label>
            <input id="font-sample-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} className="field w-full px-3.5 py-2.5 text-sm" />
          </div>
          <div>
            <label htmlFor="font-sample-body" className="mb-2 block text-sm font-medium text-[var(--ink)]">Body preview</label>
            <textarea id="font-sample-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={240} rows={2} className="field w-full resize-y px-3.5 py-2.5 text-sm" />
          </div>
        </div>
        <div className="sm:col-span-2">
          <button type="button" onClick={() => findPairings()} className="btn-ink inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold">
            <Shuffle className="h-4 w-4" /> Find pairings
          </button>
        </div>
      </section>

      {copyError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">{copyError}</p>}

      <section className="grid gap-5 lg:grid-cols-2" aria-live="polite">
        {visiblePairings.map((pairing, index) => {
          const headingFont = `'${pairing.heading}', ${pairing.headingFallback}`;
          const bodyFont = `'${pairing.body}', ${pairing.bodyFallback}`;
          const key = `${pairing.id}-css`;
          return (
            <article key={pairing.id} className="card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--paper)] text-xs font-semibold text-[var(--muted)]">0{index + 1}</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{pairing.mood}</span>
                </div>
                <button type="button" onClick={() => copy(`${pairing.heading} + ${pairing.body}`, `${pairing.id}-names`)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-black/[0.04] hover:text-[var(--ink)]">
                  {copied === `${pairing.id}-names` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === `${pairing.id}-names` ? "Copied" : "Copy names"}
                </button>
              </div>
              <div className="p-5 sm:p-6">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--faint)]">Heading · {pairing.heading}</p>
                <h2 className="mb-5 text-3xl leading-[1.08] tracking-tight text-[var(--ink)] sm:text-4xl" style={{ fontFamily: headingFont, fontWeight: 600 }}>{title || DEFAULT_TITLE}</h2>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--faint)]">Body · {pairing.body}</p>
                <p className="text-[15px] leading-7 text-[var(--muted)]" style={{ fontFamily: bodyFont }}>{body || DEFAULT_BODY}</p>
                <p className="mt-4 border-t border-[var(--border)] pt-3 text-sm text-[var(--muted)]">{pairing.note}</p>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--border)] bg-black/[0.015] px-5 py-3">
                <span className="text-xs text-[var(--faint)]">{pairing.heading} + {pairing.body}</span>
                <button type="button" onClick={() => copy(cssFor(pairing), key)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-black/[0.04]">
                  {copied === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === key ? "CSS copied" : "Copy CSS"}
                </button>
              </div>
            </article>
          );
        })}
      </section>
      <p className="text-xs text-[var(--faint)]">Font files load from Google Fonts for the live previews. Copy CSS to use the pairing in your project.</p>
    </div>
  );
}
