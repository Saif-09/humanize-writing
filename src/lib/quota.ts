import { LIMITS } from "@/lib/constants";

// In-memory counters keyed by IP. Good enough for local dev and a single instance;
// replace with Redis (or per-user DB rows) once accounts exist.
const daily = new Map<string, { day: string; count: number }>();
const spend = new Map<string, { month: string; usd: number }>();

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export function consumeQuota(req: Request, tool: string, limit = LIMITS.dailyRequests) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${tool}:${clientIp(req)}`;
  const entry = daily.get(key);
  const count = entry?.day === day ? entry.count : 0;
  if (count >= limit) return { ok: false, remaining: 0 };
  daily.set(key, { day, count: count + 1 });
  return { ok: true, remaining: limit - count - 1 };
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** Model spend this month for the caller, across all tools. */
export function monthlySpend(req: Request): number {
  const entry = spend.get(clientIp(req));
  return entry?.month === currentMonth() ? entry.usd : 0;
}

export function recordSpend(req: Request, usd: number) {
  spend.set(clientIp(req), { month: currentMonth(), usd: monthlySpend(req) + usd });
}
