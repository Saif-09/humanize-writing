"use client";

import { useState } from "react";
import { LIMITS, type DetectorVersion } from "@/lib/constants";
import type { DetectionResult } from "@/lib/detector";
import { countWords } from "@/lib/text";
import { HighlightedText, Legend } from "./highlighted-text";
import { Button, ErrorText, Panel, postJson, SAMPLE_TEXT, scoreColor, Segmented, Spinner } from "./ui";

const VERSION_OPTIONS = [
  { value: "v1", label: "V1 · Fast" },
  { value: "v2", label: "V2 · Deep Scan" },
] as const;

function ScoreRing({ humanScore }: { humanScore: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className={`relative size-36 ${scoreColor(humanScore)}`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - humanScore / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums">{humanScore}%</span>
        <span className="text-xs text-muted">human</span>
      </div>
    </div>
  );
}

function verdict(humanScore: number) {
  if (humanScore >= 70) return "Reads as human-written";
  if (humanScore >= 40) return "Mixed: parts look AI-generated";
  return "Likely AI-generated";
}

export function Detector() {
  const [input, setInput] = useState("");
  const [version, setVersion] = useState<DetectorVersion>("v2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);

  const inputWords = countWords(input);
  const tooLong = inputWords > LIMITS.detectWords;

  async function scan() {
    setLoading(true);
    setError(null);
    try {
      setResult(await postJson<DetectionResult>("/api/detect", { text: input, version }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Detector version" value={version} options={VERSION_OPTIONS} onChange={setVersion} />
        <ErrorText message={error} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel
          header={
            <>
              <span className="text-sm font-medium">{result ? "Sentence analysis" : "Text to scan"}</span>
              <div className="flex gap-1">
                {result && <Legend />}
                {!input && (
                  <Button variant="ghost" onClick={() => setInput(SAMPLE_TEXT)}>
                    Try a sample
                  </Button>
                )}
                {result && (
                  <Button variant="ghost" onClick={() => setResult(null)}>
                    Edit
                  </Button>
                )}
              </div>
            </>
          }
          footer={
            <>
              <span className={`text-xs tabular-nums ${tooLong ? "text-ai" : "text-muted"}`}>
                {inputWords} / {LIMITS.detectWords} words
              </span>
              <Button onClick={scan} disabled={loading || inputWords < 30 || tooLong}>
                {loading && <Spinner />}
                {loading ? "Scanning…" : "Scan text"}
              </Button>
            </>
          }
        >
          {result ? (
            <HighlightedText sentences={result.sentences} />
          ) : (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste any text to check it for AI writing patterns (at least 30 words)…"
              className="absolute inset-0 resize-none bg-transparent p-4 text-[15px] leading-7 outline-none placeholder:text-muted"
            />
          )}
        </Panel>

        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface p-6 text-center">
          {result ? (
            <>
              <ScoreRing humanScore={result.humanScore} />
              <div>
                <p className="font-medium">{verdict(result.humanScore)}</p>
                <p className="mt-1 text-xs text-muted">
                  {result.sentences.filter((s) => s.aiProbability >= 0.65).length} of {result.sentences.length}{" "}
                  sentences flagged · {result.version.toUpperCase()}
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              {loading ? "Analysing each sentence…" : "Your score and sentence-by-sentence breakdown will appear here."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
