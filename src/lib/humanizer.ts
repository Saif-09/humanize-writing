import { generateText, Output } from "ai";
import { z } from "zod";
import { finetuned, rewriter } from "@/lib/config";
import type { Level } from "@/lib/constants";
import { detectStats } from "@/lib/detector/stats";
import type { CostMeter } from "@/lib/meter";
import { chunkParagraphs, splitParagraphs } from "@/lib/text";

const BASE_RULES = `You rewrite text so it reads like it was written by a thoughtful human, not a language model.

Hard rules:
- Keep the original meaning, facts, names, numbers, citations and technical terms exactly.
- Do not add new claims, examples, opinions or information that isn't in the source.
- Keep the same language, point of view and roughly the same length (within ±15%).
- Keep the same number of paragraphs, separated by blank lines.
- Output only the rewritten text. No preamble, no quotes, no notes.

How humans write (do this):
- Vary sentence length a lot. Mix short punchy sentences with longer ones that wander a little.
- Use contractions where natural (it's, don't, they're).
- Prefer plain, specific words over polished ones.
- Start some sentences with "And", "But" or "So". Use the occasional parenthetical aside.
- Let some transitions be implicit instead of signposted.

AI tells (never do this):
- Words: delve, tapestry, testament, pivotal, crucial, seamless, leverage, robust, realm, landscape,
  navigate, foster, underscore, showcase, embark, elevate, unlock, multifaceted, intricate, comprehensive,
  nuanced, vibrant, holistic, meticulous.
- Openers: Furthermore, Moreover, Additionally, Consequently, Notably, Ultimately, In conclusion, Overall.
- Phrases: "it is important to note", "plays a crucial role", "in today's world", "not only… but also",
  "when it comes to", "a wide range of", "serves as a".
- Em dashes, semicolons, tidy groups of three, and summary sentences that restate the paragraph.`;

const LEVEL_GUIDE: Record<Level, string> = {
  light:
    "Edit lightly. Keep most sentences and their order. Remove AI tells, add contractions, and split or merge a few sentences to vary rhythm.",
  medium:
    "Rewrite each sentence in your own words. Restructure clauses, change sentence boundaries and vary rhythm noticeably, while keeping the paragraph's flow of ideas.",
  aggressive:
    "Rewrite from scratch as a person explaining this in their own voice. Reorder ideas within a paragraph when it reads better, change every sentence's structure, and make the rhythm clearly uneven.",
};

// Must match SYSTEM in ml/prepare_sft.py: the fine-tuned model only knows this instruction.
const FINETUNED_SYSTEM =
  "Rewrite the text so it reads as naturally human-written. Keep the meaning, facts and paragraph breaks.";
// Self-hosted servers accept temperature, so the fine-tuned model's intensity comes from sampling.
const FINETUNED_TEMPERATURE: Record<Level, number> = { light: 0.5, medium: 0.8, aggressive: 1.0 };

const CANDIDATES: Record<Level, number> = { light: 2, medium: 3, aggressive: 3 };

// Newer models reject custom temperature, so each candidate gets a different voice
// nudge instead; that keeps the candidates distinct enough to be worth ranking.
const VOICES = [
  "Write like a careful, plain-spoken writer.",
  "Write like someone explaining this to a colleague over coffee.",
  "Write like an experienced writer with a slightly dry, direct style.",
];

async function rewriteChunk(text: string, level: Level, voice: string, meter: CostMeter): Promise<string> {
  if (finetuned) {
    const { text: out, usage } = await generateText({
      ...finetuned.call,
      instructions: FINETUNED_SYSTEM,
      prompt: text,
      temperature: FINETUNED_TEMPERATURE[level],
    });
    meter.add(finetuned, usage);
    return out.trim();
  }
  const { text: out, usage } = await generateText({
    ...rewriter.call,
    instructions: `${BASE_RULES}\n\nIntensity: ${LEVEL_GUIDE[level]}\n\nVoice: ${voice}`,
    prompt: text,
  });
  meter.add(rewriter, usage);
  return out.trim();
}

/** Generates several rewrites of one chunk and keeps the one the detector finds most human. */
async function bestRewrite(chunk: string, level: Level, meter: CostMeter): Promise<string> {
  const results = await Promise.allSettled(
    VOICES.slice(0, CANDIDATES[level]).map((voice) => rewriteChunk(chunk, level, voice, meter)),
  );
  const outputs = results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  if (outputs.length === 0) {
    const failure = results.find((r) => r.status === "rejected");
    throw failure?.reason ?? new Error("Rewrite failed");
  }
  return outputs
    .map((text) => ({ text, score: detectStats(text).aiProbability }))
    .sort((a, b) => a.score - b.score)[0].text;
}

export async function humanize(text: string, level: Level, meter: CostMeter): Promise<string> {
  // Bigger chunks mean fewer calls, so the system prompt is paid for less often.
  const chunks = chunkParagraphs(splitParagraphs(text), 400).map((c) => c.join("\n\n"));
  const rewritten = await Promise.all(chunks.map((c) => bestRewrite(c, level, meter)));
  return rewritten.join("\n\n");
}

export async function alternatives(
  sentence: string,
  context: string,
  level: Level,
  meter: CostMeter,
): Promise<string[]> {
  const { output, usage } = await generateText({
    ...rewriter.call,
    instructions: `${BASE_RULES}\n\nIntensity: ${LEVEL_GUIDE[level]}`,
    prompt: `Here is a passage for context:\n"""\n${context}\n"""\n\nWrite 4 different alternative versions of only this sentence from it, each one fitting naturally in the same spot. Make them differ from each other in structure and length.\n\nSentence: ${sentence.trim()}`,
    output: Output.object({ schema: z.object({ alternatives: z.array(z.string()).min(1).max(4) }) }),
  });
  meter.add(rewriter, usage);
  return output.alternatives.map((a) => a.trim()).filter((a) => a && a !== sentence.trim());
}
