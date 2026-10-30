"""Generate (AI-assistant draft, human original) training pairs with a local Qwen model.

For each human passage in data/human.jsonl, Qwen writes the stiff "AI-assistant
draft" version. The editor is later trained on the reverse: draft -> natural text.
Runs fully on-device with MLX (no API costs). Progress is appended to
data/pairs.jsonl, so the run can be stopped and resumed at any time.

Usage (on the training Mac):
  uv run gen_pairs.py --limit 32        # smoke test: check speed and quality first
  uv run gen_pairs.py                   # full run, resumes where it left off
"""

import argparse
import json
import time
import zlib
from pathlib import Path

from mlx_lm import generate, load
from mlx_lm.sample_utils import make_sampler

DATA = Path(__file__).parent / "data"
HUMAN = DATA / "human.jsonl"
PAIRS = DATA / "pairs.jsonl"
MODEL = "mlx-community/Qwen3-4B-Instruct-2507-4bit"

SYSTEM = """We are building training data for an AI writing editor: a model that takes stiff, generic AI-assistant drafts and edits them into natural, readable prose. Each example pairs a real human-written passage with an "AI-assistant draft" version of it. Your job is to produce the AI-assistant draft.

Rewrite the passage completely in a default AI-assistant voice. Drop the author's personal quirks: slang, ellipses, typos, asides, fragments and uneven rhythm. Use the hallmarks of AI writing: polished and even sentences, stock transitions (Moreover, Additionally, However, Overall), tidy topic sentences, balanced phrasing, words like "crucial", "notably", "ensure", "landscape", and a neat concluding sentence.

Keep the original point of view (if the author writes "I", keep "I"), every fact, name and number, the same meaning, the same number of paragraphs and roughly the same length. Output only the rewritten passage."""

# Different AI "voices" so the editor learns to fix the range of drafts users paste.
STYLES = [
    "Write it as a polished, helpful AI assistant would: smooth transitions, balanced sentences, confident tone.",
    "Write it as a formal, well-structured paragraph like an AI-written essay, with clear topic sentences and signposting.",
    "Write it like an AI-generated blog post: engaging but generic, tidy structure, upbeat wrap-up.",
    "Write it as a concise, neutral AI summary-style rewrite with even sentence lengths and precise wording.",
]

# Outputs that describe the passage instead of rewriting it make bad training data.
META_MARKERS = ("in this passage", "the author ", "the passage", "here is", "here's", "i can't", "i cannot", "i'm sorry")


def prompt_tokens(tokenizer, text: str, style: str) -> list[int]:
    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": f"{style}\n\nPassage:\n{text}"},
    ]
    # Render to text, then encode: newer tokenizers may return a dict when tokenize=True.
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    return tokenizer.encode(text, add_special_tokens=False)


def usable(human: str, draft: str) -> bool:
    if not draft or any(m in draft.lower()[:200] for m in META_MARKERS):
        return False
    ratio = len(draft.split()) / max(1, len(human.split()))
    return 0.6 <= ratio <= 1.6


def generate_batch(model, tokenizer, prompts, max_tokens, sampler, state) -> list[str]:
    """Batched generation when this mlx-lm version supports it, otherwise one at a time."""
    if state.get("batched", True):
        try:
            from mlx_lm.generate import batch_generate

            return batch_generate(model, tokenizer, prompts, max_tokens=max_tokens, sampler=sampler).texts
        except (ImportError, TypeError) as err:
            print(f"Batched generation unavailable ({err}); falling back to sequential.")
            state["batched"] = False
    return [generate(model, tokenizer, p, max_tokens=max_tokens, sampler=sampler) for p in prompts]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="only process the first N passages")
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()

    rows = [json.loads(line) for line in HUMAN.open()][: args.limit]
    done = {json.loads(line)["id"] for line in PAIRS.open()} if PAIRS.exists() else set()
    todo = [r for r in rows if r["id"] not in done]
    print(f"{len(rows)} passages, {len(done)} already done, {len(todo)} to go")
    if not todo:
        return

    model, tokenizer = load(MODEL)
    sampler = make_sampler(temp=0.7, top_p=0.9)
    state: dict = {}
    kept = skipped = 0
    started = time.time()

    with PAIRS.open("a") as out:
        for start in range(0, len(todo), args.batch_size):
            batch = todo[start : start + args.batch_size]
            styles = [STYLES[zlib.crc32(r["id"].encode()) % len(STYLES)] for r in batch]
            prompts = [prompt_tokens(tokenizer, r["text"], s) for r, s in zip(batch, styles)]
            max_tokens = int(max(len(r["text"].split()) for r in batch) * 2.2) + 64
            drafts = generate_batch(model, tokenizer, prompts, max_tokens, sampler, state)

            for row, draft in zip(batch, drafts):
                draft = draft.strip()
                if usable(row["text"], draft):
                    out.write(json.dumps({"id": row["id"], "domain": row["domain"], "ai": draft, "human": row["text"]}) + "\n")
                    kept += 1
                else:
                    skipped += 1
            out.flush()

            n = start + len(batch)
            rate = n / (time.time() - started)
            eta_min = (len(todo) - n) / rate / 60
            print(f"{n}/{len(todo)}  kept={kept} skipped={skipped}  {rate:.2f}/s  ETA {eta_min:.0f} min", flush=True)

    print(f"Done. {kept} new pairs in {PAIRS} ({skipped} skipped).")


if __name__ == "__main__":
    main()
