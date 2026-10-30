import { z } from "zod";
import { LIMITS } from "@/lib/constants";
import { CostMeter } from "@/lib/meter";
import { consumeQuota, monthlySpend, recordSpend } from "@/lib/quota";

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * Parses and validates the body, enforces the daily quota and monthly cost budget,
 * and records what the request actually cost.
 */
export async function handle<T extends z.ZodType>(
  req: Request,
  tool: string,
  schema: T,
  run: (input: z.infer<T>, meter: CostMeter) => Promise<unknown>,
  dailyLimit?: number,
) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

  if (monthlySpend(req) >= LIMITS.monthlyBudgetUsd) {
    return jsonError("You've reached this month's usage limit.", 429);
  }
  if (!consumeQuota(req, tool, dailyLimit).ok) return jsonError("Daily limit reached. Try again tomorrow.", 429);

  const meter = new CostMeter();
  try {
    return Response.json(await run(parsed.data, meter));
  } catch (err) {
    console.error(`[${tool}]`, err);
    return jsonError("Something went wrong while processing your text. Please try again.", 502);
  } finally {
    // Failed requests can still have spent tokens on calls that did succeed.
    recordSpend(req, meter.usd);
    console.log(`[${tool}] ${meter.calls} calls, $${meter.usd.toFixed(5)}, month total $${monthlySpend(req).toFixed(4)}`);
  }
}
