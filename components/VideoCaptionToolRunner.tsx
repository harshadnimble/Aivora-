"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function VideoCaptionToolRunner() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-hidden bg-black">
      <iframe
        src="/tools/video-caption-generator.html"
        title="Video Caption Generator"
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>,
    document.body,
  );
}
