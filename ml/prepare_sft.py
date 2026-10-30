"""Split data/pairs.jsonl into MLX chat-format train/valid/test sets.

Each example teaches the model to turn the AI-assistant draft back into the
original human passage. The test split is held out for evaluation only.

Usage: uv run prepare_sft.py
"""

import json
import random
from pathlib import Path

DATA = Path(__file__).parent / "data"
OUT = DATA / "sft"

# Must match FINETUNED_SYSTEM in src/lib/humanizer.ts, which sends it at inference time.
SYSTEM = "Rewrite the text so it reads as naturally human-written. Keep the meaning, facts and paragraph breaks."


def main():
    pairs = [json.loads(line) for line in (DATA / "pairs.jsonl").open()]
    random.Random(7).shuffle(pairs)
    held_out = max(50, len(pairs) // 20)
    splits = {
        "test": pairs[:held_out],
        "valid": pairs[held_out : held_out * 2],
        "train": pairs[held_out * 2 :],
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for name, rows in splits.items():
        with (OUT / f"{name}.jsonl").open("w") as f:
            for p in rows:
                messages = [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": p["ai"]},
                    {"role": "assistant", "content": p["human"]},
                ]
                f.write(json.dumps({"messages": messages, "id": p["id"], "domain": p["domain"]}) + "\n")
        print(f"{name}: {len(rows)}")


if __name__ == "__main__":
    main()
