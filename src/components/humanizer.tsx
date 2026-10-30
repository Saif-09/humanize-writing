"use client";

import { useState } from "react";
import { LIMITS, type Level } from "@/lib/constants";
import type { DetectionResult } from "@/lib/detector";
import { countWords, splitSentences } from "@/lib/text";
import { HighlightedText } from "./highlighted-text";
import { Button, ErrorText, Panel, postJson, SAMPLE_TEXT, ScoreBadge, Segmented, Spinner } from "./ui";

const LEVEL_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "aggressive", label: "Aggressive" },
] as const;

type Alts = { index: number; loading: boolean; items: string[]; error: string | null };

export function Humanizer() {
  const [input, setInput] = useState("");
  const [level, setLevel] = useState<Level>("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentences, setSentences] = useState<string[] | null>(null);
  const [alts, setAlts] = useState<Alts | null>(null);
  const [score, setScore] = useState<DetectionResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const [copied, setCopied] = useState(false);

  const inputWords = countWords(input);
  const output = sentences?.join("") ?? "";
  const tooLong = inputWords > LIMITS.humanizeWords;

  async function run() {
    setLoading(true);
    setError(null);
    setAlts(null);
    setScore(null);
    try {
      const { text } = await postJson<{ text: string }>("/api/humanize", { text: input, level });
      setSentences(splitSentences(text));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function openAlternatives(index: number) {
    if (!sentences || alts?.index === index) return setAlts(null);
    setAlts({ index, loading: true, items: [], error: null });
    try {
      const { alternatives } = await postJson<{ alternatives: string[] }>("/api/alternatives", {
        sentence: sentences[index],
        context: output,
        level,
      });
      setAlts((a) => (a?.index === index ? { ...a, loading: false, items: alternatives } : a));
    } catch (e) {
      setAlts((a) => (a?.index === index ? { ...a, loading: false, error: (e as Error).message } : a));
    }
  }

  function replaceSentence(index: number, replacement: string) {
    setSentences((prev) => {
      if (!prev) return prev;
      const trailing = prev[index].match(/\s*$/)?.[0] ?? "";
      return prev.with(index, replacement.trim() + trailing);
    });
    setAlts(null);
    setScore(null);
  }

  async function checkScore() {
    setScoring(true);
    setError(null);
    try {
      setScore(await postJson<DetectionResult>("/api/detect", { text: output, version: "v2" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScoring(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Rewrite level" value={level} options={LEVEL_OPTIONS} onChange={setLevel} />
        <ErrorText message={error} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          header={
            <>
              <span className="text-sm font-medium">Your text</span>
              <div className="flex gap-1">
                {!input && (
                  <Button variant="ghost" onClick={() => setInput(SAMPLE_TEXT)}>
                    Try a sample
                  </Button>
                )}
                {input && (
                  <Button variant="ghost" onClick={() => setInput("")}>
                    Clear
                  </Button>
                )}
              </div>
            </>
          }
          footer={
            <>
              <span className={`text-xs tabular-nums ${tooLong ? "text-ai" : "text-muted"}`}>
                {inputWords} / {LIMITS.humanizeWords} words
              </span>
              <Button onClick={run} disabled={loading || inputWords < 30 || tooLong}>
                {loading && <Spinner />}
                {loading ? "Humanizing…" : "Humanize"}
              </Button>
            </>
          }
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste AI-generated text here (at least 30 words)…"
            className="absolute inset-0 resize-none bg-transparent p-4 text-[15px] leading-7 outline-none placeholder:text-muted"
          />
        </Panel>

        <Panel
          header={
            <>
              <span className="text-sm font-medium">Humanized</span>
              {score && <ScoreBadge humanScore={score.humanScore} />}
            </>
          }
          footer={
            sentences && (
              <>
                <span className="text-xs text-muted">
                  {countWords(output)} words · click a sentence for alternatives
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={checkScore} disabled={scoring}>
                    {scoring && <Spinner />}
                    {score ? "Re-check" : "Check writing"}
                  </Button>
                  <Button variant="ghost" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </>
            )
          }
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted">
              <Spinner /> Rewriting and picking the most natural version…
            </div>
          )}
          {!loading && !sentences && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">
              Your rewritten text will appear here.
            </div>
          )}
          {!loading && sentences && score && <HighlightedText sentences={score.sentences} />}
          {!loading && sentences && !score && (
            <div className="whitespace-pre-wrap p-4 text-[15px] leading-7">
              {sentences.map((s, i) => (
                <span
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => openAlternatives(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openAlternatives(i);
                    }
                  }}
                  className={`cursor-pointer rounded-sm transition-colors hover:bg-accent-soft ${
                    alts?.index === i ? "bg-accent-soft" : ""
                  }`}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          {score && (
            <div className="px-4 pb-4">
              <Button variant="ghost" onClick={() => setScore(null)}>
                ← Back to editing
              </Button>
            </div>
          )}
          {alts && !score && (
            <div className="mx-4 mb-4 rounded-lg border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">Alternatives</span>
                <button onClick={() => setAlts(null)} className="text-xs text-muted hover:text-foreground">
                  Close
                </button>
              </div>
              {alts.loading && (
                <div className="flex items-center gap-2 py-2 text-sm text-muted">
                  <Spinner /> Generating…
                </div>
              )}
              <ErrorText message={alts.error} />
              <ul className="space-y-1">
                {alts.items.map((a, i) => (
                  <li key={i}>
                    <button
                      onClick={() => replaceSentence(alts.index, a)}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm leading-6 hover:bg-surface"
                    >
                      {a}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
