const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });
const wordSegmenter = new Intl.Segmenter("en", { granularity: "word" });

export function countWords(text: string): number {
  let n = 0;
  for (const s of wordSegmenter.segment(text)) if (s.isWordLike) n++;
  return n;
}

export function words(text: string): string[] {
  const out: string[] = [];
  for (const s of wordSegmenter.segment(text)) if (s.isWordLike) out.push(s.segment.toLowerCase());
  return out;
}

/** Sentences with their trailing whitespace kept, so joining them restores the text exactly. */
export function splitSentences(text: string): string[] {
  return Array.from(sentenceSegmenter.segment(text), (s) => s.segment).filter((s) => s.length > 0);
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Groups paragraphs into chunks of roughly `maxWords` so each rewrite call stays small and parallel. */
export function chunkParagraphs(paragraphs: string[], maxWords: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const p of paragraphs) {
    const n = countWords(p);
    if (current.length > 0 && size + n > maxWords) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(p);
    size += n;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
