import { ToolTabs } from "@/components/tool-tabs";
import { APP_NAME } from "@/lib/constants";

const STEPS = [
  {
    title: "Rewrite",
    body: "Your text is split into passages and rewritten several times at the intensity you pick.",
  },
  {
    title: "Score",
    body: "Each candidate is checked for robotic patterns such as uniform rhythm, stock phrases and buzzwords.",
  },
  {
    title: "Refine",
    body: "The most natural version wins. Click any sentence to swap in an alternative.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="font-semibold tracking-tight">{APP_NAME}</span>
          <span className="text-xs text-muted">Free · 10 runs/day</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <div className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Turn stiff AI drafts into natural writing.</h1>
          <p className="mt-3 text-muted">
            Rewrite generic, robotic phrasing into clear prose in a natural voice, then fine-tune it sentence by sentence.
          </p>
        </div>

        <ToolTabs />

        <section className="mt-16 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title}>
              <p className="text-xs font-medium text-accent">0{i + 1}</p>
              <h2 className="mt-1 font-medium">{s.title}</h2>
              <p className="mt-1 text-sm text-muted">{s.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        Text is processed to produce your result and is not stored. Follow your school&apos;s or employer&apos;s rules on
        AI-assisted writing, and disclose AI help where they require it.
      </footer>
    </div>
  );
}
