import type { SentenceScore } from "@/lib/detector/stats";

function highlight(p: number) {
  if (p >= 0.65) return "bg-ai/20 decoration-ai";
  if (p >= 0.4) return "bg-mixed/20 decoration-mixed";
  return "";
}

export function HighlightedText({ sentences }: { sentences: SentenceScore[] }) {
  return (
    <div className="whitespace-pre-wrap p-4 text-[15px] leading-7">
      {sentences.map((s, i) => (
        <span
          key={i}
          className={`rounded-sm ${highlight(s.aiProbability)}`}
          title={`${Math.round(s.aiProbability * 100)}% likely AI`}
        >
          {s.text}
        </span>
      ))}
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-ai/40" /> Likely AI
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-mixed/40" /> Mixed
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm border border-border" /> Human
      </span>
    </div>
  );
}
