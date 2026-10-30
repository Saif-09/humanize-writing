import type { LanguageModelUsage } from "ai";
import { costUsd, type ModelSetup } from "@/lib/config";

/** Accumulates the model cost of one API request across all its LLM calls. */
export class CostMeter {
  usd = 0;
  calls = 0;

  add(setup: ModelSetup, usage: LanguageModelUsage) {
    this.usd += costUsd(setup, usage);
    this.calls++;
  }
}
