"use client";

import { useState } from "react";
import { Detector } from "./detector";
import { Humanizer } from "./humanizer";

const TABS = [
  { id: "humanizer", label: "AI Humanizer" },
  { id: "detector", label: "AI Detector" },
] as const;

export function ToolTabs() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("humanizer");
  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors ${
              tab === t.id ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Keep both mounted so switching tabs doesn't lose work. */}
      <div hidden={tab !== "humanizer"}>
        <Humanizer />
      </div>
      <div hidden={tab !== "detector"}>
        <Detector />
      </div>
    </div>
  );
}
