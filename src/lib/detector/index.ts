import { generateText, Output } from "ai";
import { z } from "zod";
import { judge } from "@/lib/config";
import type { DetectorVersion } from "@/lib/constants";
import type { CostMeter } from "@/lib/meter";
import { detectStats, weightedAverage, type SentenceScore } from "./stats";

export type DetectionResult = {
  version: DetectorVersion;
  /** 0–100, higher means more human. */
  humanScore: number;
  sentences: SentenceScore[];
};

const JUDGE_INSTRUCTIONS = `You are an expert forensic linguist who detects AI-generated text.
For each numbered sentence, estimate the probability (0 to 1) that it was written by a language model.
Consider the sentence in the context of the whole passage. Signals of AI writing include: predictable
word choice, stock transitions (moreover, furthermore, additionally), hedged generic claims, buzzwords
(delve, tapestry, pivotal, seamless, landscape), uniform sentence rhythm, tidy list-like structure,
balanced "not only X but also Y" constructions, and summarising conclusions. Signals of human writing
include: specific concrete detail, idiosyncratic phrasing, uneven rhythm, contractions, asides,
mild imperfections, and opinions with a real point of view. Be calibrated, not alarmist.`;

async function judgeSentences(sentences: string[], meter: CostMeter): Promise<number[]> {
  const numbered = sentences.map((s, i) => `[${i}] ${s.trim()}`).join("\n");
  const { output, usage } = await generateText({
    ...judge.call,
    instructions: JUDGE_INSTRUCTIONS,
    prompt: `Score every sentence below. Return exactly ${sentences.length} scores in order.\n\n${numbered}`,
    output: Output.object({
      schema: z.object({
        scores: z.array(z.object({ index: z.number().int(), aiProbability: z.number().min(0).max(1) })),
      }),
    }),
  });
  meter.add(judge, usage);
  const byIndex = new Map(output.scores.map((s) => [s.index, s.aiProbability]));
  return sentences.map((_, i) => byIndex.get(i) ?? 0.5);
}

// Optional self-hosted classifier (e.g. a fine-tuned DeBERTa). Expected contract:
// POST { sentences: string[] } -> { scores: number[] } with one AI probability per sentence.
async function externalScores(sentences: string[]): Promise<number[]> {
  const res = await fetch(process.env.DETECTOR_URL!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.DETECTOR_API_KEY && { authorization: `Bearer ${process.env.DETECTOR_API_KEY}` }),
    },
    body: JSON.stringify({ sentences }),
  });
  if (!res.ok) throw new Error(`Detector service returned ${res.status}`);
  const { scores } = (await res.json()) as { scores: number[] };
  return scores;
}

function toResult(version: DetectorVersion, sentences: SentenceScore[]): DetectionResult {
  return { version, humanScore: Math.round((1 - weightedAverage(sentences)) * 100), sentences };
}

export async function detect(text: string, version: DetectorVersion, meter: CostMeter): Promise<DetectionResult> {
  const stats = detectStats(text);
  if (version === "v1") return toResult("v1", stats.sentences);

  const texts = stats.sentences.map((s) => s.text);
  const model = process.env.DETECTOR_URL ? await externalScores(texts) : await judgeSentences(texts, meter);
  // Blend the model's judgement with the stylometric signal so short sentences don't swing wildly.
  const blended = stats.sentences.map((s, i) => ({
    text: s.text,
    aiProbability: 0.75 * (model[i] ?? 0.5) + 0.25 * s.aiProbability,
  }));
  return toResult("v2", blended);
}
