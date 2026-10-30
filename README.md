# Humanize Writing

An AI writing editor: turns stiff AI-assistant drafts into natural writing, with a sentence-level writing check. Built with Next.js 16 and the AI SDK.

## Run locally

```bash
nvm use            # Node 24
cp .env.example .env.local   # add ANTHROPIC_API_KEY (or a gateway / Google key)
pnpm install
pnpm dev
```

## How it works

- **Humanizer** (`src/lib/humanizer.ts`). Splits text into chunks of about 250 words and generates 2–3 rewrites per chunk in parallel at the selected level. Each rewrite is scored with the V1 detector and the most human-scoring one is kept. Clicking a sentence fetches 4 alternatives for it.
- **Detector V1** (`src/lib/detector/stats.ts`). Stylometric and free: AI buzzwords and phrases, sentence-length burstiness, contraction rate, lexical diversity.
- **Detector V2** (`src/lib/detector/index.ts`). An LLM judge scores each sentence, blended 75/25 with V1. Set `DETECTOR_URL` to swap in a self-hosted classifier.
- **Quotas** (`src/lib/quota.ts`). In-memory, per IP, per day. Replace with Redis or per-user counters when accounts land.

## Roadmap

1. Auth, Postgres, and per-plan quotas and word limits.
2. Billing (subscriptions with monthly/yearly plans).
3. Fine-tuned rewriter (see `ml/README.md`), served via mlx_lm.server or vLLM (`FINETUNED_BASE_URL`).
4. Our own trained detector (`DETECTOR_URL`).
