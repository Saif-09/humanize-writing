import { z } from "zod";
import { handle } from "@/lib/api";
import { LEVELS, LIMITS } from "@/lib/constants";
import { alternatives } from "@/lib/humanizer";

export const maxDuration = 60;

const schema = z.object({
  sentence: z.string().trim().min(1).max(1000),
  context: z.string().max(12000),
  level: z.enum(LEVELS),
});

export async function POST(req: Request) {
  return handle(
    req,
    "alternatives",
    schema,
    async ({ sentence, context, level }, meter) => ({
      alternatives: await alternatives(sentence, context, level, meter),
    }),
    LIMITS.dailyAlternatives,
  );
}
