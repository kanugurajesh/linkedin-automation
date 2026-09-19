"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* clipboard blocked: the text is still selectable on screen */
        }
      }}
      className="rounded-[3px] border border-rule bg-paper px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-ink"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
