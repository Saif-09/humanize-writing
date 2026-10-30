// Shared by client and server. Keep this file free of server-only imports.

export const APP_NAME = "Humanize Writing";

export const LEVELS = ["light", "medium", "aggressive"] as const;
export type Level = (typeof LEVELS)[number];

export const DETECTOR_VERSIONS = ["v1", "v2"] as const;
export type DetectorVersion = (typeof DETECTOR_VERSIONS)[number];

export const LIMITS = {
  // Per-request word caps. Raise these per plan once billing exists.
  humanizeWords: 1000,
  detectWords: 1500,
  // Anonymous requests per IP per day, per tool.
  dailyRequests: 10,
  // Sentence alternatives are cheap single calls; allow more of them.
  dailyAlternatives: 100,
  // Hard cap on model spend per user per month. Checked before each request, so the
  // request that crosses it can overshoot by one run (~$0.005 on Haiku); 0.45 keeps
  // the worst case under $0.50.
  monthlyBudgetUsd: 0.45,
};
