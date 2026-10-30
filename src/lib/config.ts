import { anthropic, type AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { generateText, LanguageModelUsage } from "ai";

/** USD per 1M tokens. */
type Price = { input: number; output: number };

const PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};
// Unknown models are metered at the priciest known rate so budgets stay on the safe side.
const FALLBACK_PRICE: Price = { input: 4, output: 20 };

export type ModelSetup = {
  /** Spread into generateText(). */
  call: Pick<Parameters<typeof generateText>[0], "model" | "providerOptions">;
  price: Price;
};

export function costUsd(setup: ModelSetup, usage: LanguageModelUsage): number {
  return ((usage.inputTokens ?? 0) * setup.price.input + (usage.outputTokens ?? 0) * setup.price.output) / 1e6;
}

// Which backend serves "provider/model" ids. The first key present wins; with none,
// requests go through the Vercel AI Gateway (OIDC on Vercel deployments).
const mode = process.env.AI_GATEWAY_API_KEY
  ? "gateway"
  : process.env.ANTHROPIC_API_KEY
    ? "anthropic"
    : process.env.GOOGLE_GENERATIVE_AI_API_KEY
      ? "google"
      : "gateway";

// Haiku 5.5 is the cheapest Claude model and plenty for sentence-level rewriting
// and judging. Direct-provider ids use that provider's own model names.
const DEFAULTS = {
  gateway: { rewriter: "anthropic/claude-haiku-5.5", judge: "anthropic/claude-haiku-5.5" },
  anthropic: { rewriter: "anthropic/claude-haiku-5-5", judge: "anthropic/claude-haiku-5-5" },
  google: { rewriter: "google/gemini-3.5-flash", judge: "google/gemini-3.5-flash" },
}[mode];

function anthropicOptions(name: string) {
  // Haiku can skip thinking entirely, which cuts cost and latency. Opus and Sonnet 5.5
  // can't disable it, so they run at low effort with refusal fallbacks instead
  // (Haiku has no server-side fallback).
  return name.includes("haiku")
    ? { anthropic: { effort: "low", thinking: { type: "disabled" } } satisfies AnthropicLanguageModelOptions }
    : { anthropic: { effort: "low", fallbacks: "default" } satisfies AnthropicLanguageModelOptions };
}

function resolve(id: string): ModelSetup {
  const [provider, name] = [id.slice(0, id.indexOf("/")), id.slice(id.indexOf("/") + 1)];
  const price = PRICES[name.replaceAll(".", "-")] ?? FALLBACK_PRICE;
  if (mode === "gateway") return { call: { model: id }, price };
  if (provider !== mode) throw new Error(`${id} can't be served with only a ${mode} API key`);
  return provider === "anthropic"
    ? { call: { model: anthropic(name), providerOptions: anthropicOptions(name) }, price }
    : { call: { model: google(name) }, price };
}

export const rewriter: ModelSetup = resolve(process.env.REWRITER_MODEL ?? DEFAULTS.rewriter);

// Our fine-tuned humanizer (see ml/), served by any OpenAI-compatible server such as
// mlx_lm.server or vLLM. When set, it does the main rewrite; sentence alternatives
// stay on `rewriter` because they need structured output.
export const finetuned: ModelSetup | null = process.env.FINETUNED_BASE_URL
  ? {
      call: {
        model: createOpenAICompatible({
          name: "finetuned",
          baseURL: process.env.FINETUNED_BASE_URL,
          apiKey: process.env.FINETUNED_API_KEY,
        }).chatModel(process.env.FINETUNED_MODEL ?? "models/humanizer"),
      },
      // Self-hosted: no per-token bill. Set a real rate here if you move to a paid host.
      price: { input: 0, output: 0 },
    }
  : null;

export const judge: ModelSetup = resolve(process.env.JUDGE_MODEL ?? DEFAULTS.judge);
