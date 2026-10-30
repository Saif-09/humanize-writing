import { countWords, splitSentences, words } from "@/lib/text";

// Words and phrases that LLMs overuse far more than human writers.
const AI_TELLS = [
  "delve", "delves", "delving", "tapestry", "testament", "intricate", "multifaceted",
  "pivotal", "crucial", "paramount", "seamless", "seamlessly", "leverage", "leveraging",
  "robust", "realm", "landscape", "navigate", "navigating", "foster", "fostering",
  "underscore", "underscores", "showcase", "showcasing", "embark", "elevate", "unlock",
  "furthermore", "moreover", "additionally", "consequently", "notably", "ultimately",
  "comprehensive", "nuanced", "vibrant", "bustling", "ever-evolving", "game-changer",
  "holistic", "synergy", "meticulous", "meticulously", "commendable", "invaluable",
];

const AI_PHRASES = [
  "it is important to note", "it's important to note", "it is worth noting",
  "in conclusion", "in today's", "in the realm of", "plays a crucial role",
  "plays a vital role", "a wide range of", "not only", "in summary", "overall,",
  "when it comes to", "serves as a", "stands as a", "the world of", "dive into",
  "let's dive", "at the end of the day", "in essence", "a myriad of",
];

const TELL_SET = new Set(AI_TELLS);

export type SentenceScore = { text: string; aiProbability: number };

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function tellDensity(sentence: string): number {
  const ws = words(sentence);
  const lower = sentence.toLowerCase();
  let hits = ws.filter((w) => TELL_SET.has(w)).length;
  for (const p of AI_PHRASES) if (lower.includes(p)) hits += 1.5;
  return ws.length ? hits / Math.sqrt(ws.length) : 0;
}

/** Coefficient of variation of sentence length — low values mean uniform, machine-like rhythm. */
function burstiness(lengths: number[]): number {
  if (lengths.length < 2) return 0.5;
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
  return Math.sqrt(variance) / (mean || 1);
}

/** Moving-average type-token ratio, which stays stable across text lengths. */
function lexicalDiversity(ws: string[], window = 50): number {
  if (ws.length < window) return new Set(ws).size / (ws.length || 1);
  let total = 0;
  let count = 0;
  for (let i = 0; i + window <= ws.length; i += 10) {
    total += new Set(ws.slice(i, i + window)).size / window;
    count++;
  }
  return total / count;
}

/**
 * V1 detector: fast, free, stylometric. Scores AI tells, rhythm uniformity,
 * missing contractions and lexical diversity. Also used to rank humanizer candidates.
 */
export function detectStats(text: string): { aiProbability: number; sentences: SentenceScore[] } {
  const sentences = splitSentences(text);
  const lengths = sentences.map(countWords);
  const mean = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
  const allWords = words(text);

  const cv = burstiness(lengths);
  const diversity = lexicalDiversity(allWords);
  const contractions = (text.match(/\b\w+'(s|t|re|ve|ll|d|m)\b/gi) ?? []).length;
  const contractionRate = contractions / (allWords.length || 1);
  const emDashes = (text.match(/—/g) ?? []).length / (sentences.length || 1);

  // Document-level signal: uniform rhythm, no contractions, em-dash habit.
  const docSignal =
    (0.45 - cv) * 4 + // humans usually land above ~0.45
    (0.012 - contractionRate) * 60 +
    emDashes * 1.2 +
    (diversity > 0.82 ? 0.4 : 0);

  const scored = sentences.map((s, i) => {
    const len = lengths[i];
    if (len < 3) return { text: s, aiProbability: 0.3 };
    const uniformity = 1 - Math.min(1, Math.abs(len - mean) / (mean || 1)); // near the mean = machine-like
    const x = -1.2 + tellDensity(s) * 2.2 + uniformity * 0.8 + docSignal * 0.6 + (/[—;]/.test(s) ? 0.3 : 0);
    return { text: s, aiProbability: sigmoid(x) };
  });

  return { aiProbability: weightedAverage(scored), sentences: scored };
}

export function weightedAverage(sentences: SentenceScore[]): number {
  let total = 0;
  let weight = 0;
  for (const s of sentences) {
    const w = countWords(s.text);
    total += s.aiProbability * w;
    weight += w;
  }
  return weight ? total / weight : 0;
}
