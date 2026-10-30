# Writing editor fine-tuning

Trains our own editor model: Qwen3 4B, fine-tuned to turn stiff AI-assistant drafts
into natural human writing. Everything after step 1 runs on-device on the training
Mac (M2, 16 GB) with MLX, so there are no API costs.

| Step | Script | Runs on | Time on M2 |
|---|---|---|---|
| 1. Collect human passages | `collect-human.mts` | dev Mac (done; output committed) | — |
| 2. Generate AI-assistant drafts with Qwen | `gen_pairs.py` | M2 | ~4–8 h (overnight) |
| 3. Split into train / valid / test | `prepare_sft.py` | M2 | seconds |
| 4. LoRA fine-tune | `lora.yaml` | M2 | ~1 h |
| 5. Merge and serve to the app | `mlx_lm.fuse`, `mlx_lm.server` | M2 | minutes |

## Data

`data/human.jsonl` holds 6,000 human-written passages (55–230 words), 1,000 from each source:

| Domain | Source | License |
|---|---|---|
| abstracts, books, news | [RAID](https://huggingface.co/datasets/liamdugan/raid) | MIT |
| reddit | [Webis-TLDR-17](https://huggingface.co/datasets/webis/tldr-17) (Völske et al.) | CC BY 4.0 |
| reviews | [amazon_polarity](https://huggingface.co/datasets/fancyzhx/amazon_polarity) | Apache 2.0 |
| stories | [WritingPrompts](https://huggingface.co/datasets/euclaise/writingprompts) | MIT |

To rebuild it (Node 24, from the repo root): `node ml/collect-human.mts 1000`.

## On the M2

Quit other apps first: generation and training use the GPU and most of the RAM.

```bash
# once
curl -LsSf https://astral.sh/uv/install.sh | sh
git clone <this repo> && cd <repo>/ml
uv sync

# 2. smoke test: 32 passages. Check the speed (ETA line) and read a few drafts:
uv run gen_pairs.py --limit 32
head -n 3 data/pairs.jsonl

# 2. full run; safe to stop (Ctrl-C) and re-run, it resumes where it left off
caffeinate -i uv run gen_pairs.py

# 3. split
uv run prepare_sft.py

# 4. fine-tune; watch "Val loss" fall. Writes adapters/humanizer/
caffeinate -i uv run mlx_lm.lora -c lora.yaml
```

If training runs out of memory, set `batch_size: 1` and `grad_accumulation_steps: 4`
in `lora.yaml`. If `gen_pairs.py` runs out of memory, pass `--batch-size 4`.
`caffeinate -i` keeps the Mac awake for long runs.

Expect `gen_pairs.py` to skip some passages: drafts that describe the passage
instead of rewriting it, or that change length too much, are dropped.

## Serve it to the app

Merge the adapter into the base model, then serve it on the local network. The
server expects the request's `model` field to be a local path, which is why we fuse
into `models/humanizer` and the app sends exactly that. (These flags weren't
run-tested yet; check `uv run mlx_lm.fuse --help` / `uv run mlx_lm.server --help`
if one is rejected.)

```bash
uv run mlx_lm.fuse \
  --model mlx-community/Qwen3-4B-Instruct-2507-4bit \
  --adapter-path adapters/humanizer \
  --save-path models/humanizer
uv run mlx_lm.server --model models/humanizer --host 0.0.0.0 --port 8080
```

Then in the app's `.env.local` on the dev Mac:

```
FINETUNED_BASE_URL=http://<m2-name>.local:8080/v1
FINETUNED_MODEL=models/humanizer
```

The main rewrite then runs on the fine-tuned model. Sentence alternatives and the
V2 writing check stay on Claude.
