import { z } from "zod";
import { handle } from "@/lib/api";
import { LEVELS, LIMITS } from "@/lib/constants";
import { humanize } from "@/lib/humanizer";
import { countWords } from "@/lib/text";

export const maxDuration = 120;

const schema = z.object({
  text: z
    .string()
    .trim()
    .refine((t) => countWords(t) >= 30, "Enter at least 30 words.")
    .refine((t) => countWords(t) <= LIMITS.humanizeWords, `Keep it under ${LIMITS.humanizeWords} words.`),
  level: z.enum(LEVELS),
});

export async function POST(req: Request) {
  return handle(req, "humanize", schema, async ({ text, level }, meter) => ({ text: await humanize(text, level, meter) }));
}
