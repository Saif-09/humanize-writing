import { z } from "zod";
import { handle } from "@/lib/api";
import { DETECTOR_VERSIONS, LIMITS } from "@/lib/constants";
import { detect } from "@/lib/detector";
import { countWords } from "@/lib/text";

export const maxDuration = 60;

const schema = z.object({
  text: z
    .string()
    .trim()
    .refine((t) => countWords(t) >= 30, "Enter at least 30 words.")
    .refine((t) => countWords(t) <= LIMITS.detectWords, `Keep it under ${LIMITS.detectWords} words.`),
  version: z.enum(DETECTOR_VERSIONS),
});

export async function POST(req: Request) {
  return handle(req, "detect", schema, ({ text, version }, meter) => detect(text, version, meter));
}
