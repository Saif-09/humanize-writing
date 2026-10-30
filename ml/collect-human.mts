/**
 * Collect human-written passages from permissively licensed datasets.
 *
 * Queries each dataset's remote Parquet files with DuckDB, so only the needed rows
 * are downloaded. Writes ml/data/human.jsonl.
 *
 * Usage: node ml/collect-human.mts [perSource=1000]
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { DuckDBInstance } from "@duckdb/node-api";

type Source = {
  name: string;
  license: string;
  dataset: string;
  config: string;
  split: string;
  sql: string;
  /** RAID is sorted by domain, so a domain lives in a few shards; don't cap per shard. */
  clustered?: boolean;
};

// `sql` selects one text column named `text` from the table `src`.
const SOURCES: Source[] = [
  ...["abstracts", "books", "news"].map((domain) => ({
    name: domain,
    license: "MIT (RAID)",
    dataset: "liamdugan/raid",
    config: "raid",
    split: "train",
    sql: `SELECT generation AS text FROM src WHERE model = 'human' AND attack = 'none' AND domain = '${domain}'`,
    clustered: true,
  })),
  {
    name: "reddit",
    license: "CC BY 4.0 (webis/tldr-17)",
    dataset: "webis/tldr-17",
    config: "default",
    split: "train",
    sql: "SELECT content AS text FROM src",
  },
  {
    name: "reviews",
    license: "Apache 2.0 (amazon_polarity)",
    dataset: "fancyzhx/amazon_polarity",
    config: "amazon_polarity",
    split: "train",
    sql: "SELECT content AS text FROM src",
  },
  {
    name: "stories",
    license: "MIT (writingprompts)",
    dataset: "euclaise/writingprompts",
    config: "default",
    split: "train",
    sql: "SELECT story AS text FROM src",
  },
];

const MIN_WORDS = 60;
const MAX_WORDS = 230;
const OUT = new URL("./data/human.jsonl", import.meta.url);

/** Resolves the dataset's auto-converted Parquet shards to direct download URLs. */
async function parquetUrls(s: Source): Promise<string[]> {
  const res = await fetch(`https://huggingface.co/api/datasets/${s.dataset}/parquet/${s.config}/${s.split}`);
  const apiUrls = (await res.json()) as string[];
  return Promise.all(
    apiUrls.map(async (url) => {
      const head = await fetch(url, { method: "HEAD", redirect: "manual" });
      return new URL(head.headers.get("location") ?? url, url).toString();
    }),
  );
}

function clean(text: string): string {
  return text
    .replace(/ ?<newline> ?/g, "\n") // WritingPrompts encodes line breaks as tokens
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/(?<!\n)\n(?!\n)/g, " ") // hard-wrapped lines (arXiv abstracts) back into paragraphs
    .replace(/\n{3,}/g, "\n\n")
    // Undo PTB-style tokenization (WritingPrompts): ``quotes'', do n't, spaced punctuation.
    .replace(/``\s*|\s*''/g, '"')
    .replace(/ (n't|'s|'re|'ve|'ll|'d|'m)\b/gi, "$1")
    .replace(/ ([.,!?;:%)\]])/g, "$1")
    .replace(/([([]) /g, "$1")
    .replace(/([“‘]) /g, "$1")
    .replace(/ ([”’])/g, "$1")
    .trim();
}

/** Trims to whole sentences within the word range, keeping paragraph breaks. */
function toPassage(raw: string): string | null {
  const parts = clean(raw).split(/(?<=[.!?]["')\]]?)(\s+)/);
  let out = "";
  let words = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const n = parts[i].split(/\s+/).filter(Boolean).length;
    if (words + n > MAX_WORDS) break;
    out += parts[i] + (parts[i + 1] ?? "");
    words += n;
  }
  out = out.trim();
  // Skip fragments that don't end like prose (lists, code, truncated scrapes).
  return words >= MIN_WORDS && /[.!?]["')\]]?$/.test(out) ? out : null;
}

function shuffle<T>(items: T[], seed = 1): T[] {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

async function main() {
  const perSource = Number(process.argv[2] ?? 1000);
  const con = await (await DuckDBInstance.create(":memory:")).connect();
  const rows: { id: string; domain: string; text: string }[] = [];

  for (const source of SOURCES) {
    const started = Date.now();
    const urls = await parquetUrls(source);
    // Spread the pull across shards so one shard's ordering doesn't dominate.
    const perShard = source.clustered ? perSource * 2 : Math.ceil((perSource * 3) / urls.length);
    const seen = new Set<string>();
    let fetched = 0;
    let kept = 0;
    for (const url of urls) {
      if (kept >= perSource) break;
      await con.run(`CREATE OR REPLACE VIEW src AS SELECT * FROM read_parquet('${url}')`);
      const result = await con.runAndReadAll(`${source.sql} LIMIT ${perShard}`);
      for (const { text } of result.getRowObjects() as { text: string | null }[]) {
        fetched++;
        const passage = toPassage(text ?? "");
        if (!passage) continue;
        const key = createHash("md5").update(passage.slice(0, 200).toLowerCase()).digest("hex");
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ id: `${source.name}-${kept}`, domain: source.name, text: passage });
        if (++kept >= perSource) break;
      }
    }
    console.log(`${source.name} [${source.license}]: fetched ${fetched}, kept ${kept} in ${(Date.now() - started) / 1000}s`);
  }

  mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
  writeFileSync(OUT, shuffle(rows).map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`Wrote ${rows.length} passages to ${OUT.pathname}`);
}

await main();
