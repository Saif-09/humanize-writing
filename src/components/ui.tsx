"use client";

import type { ReactNode } from "react";

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border bg-background p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const styles =
    variant === "primary"
      ? "bg-accent text-accent-foreground hover:opacity-90"
      : "text-muted hover:text-foreground hover:bg-background";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Panel({ header, footer, children }: { header: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-[420px] flex-col rounded-xl border border-border bg-surface">
      <div className="flex min-h-12 items-center justify-between gap-2 border-b border-border px-4 py-2">{header}</div>
      <div className="relative flex-1">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">{footer}</div>
      )}
    </div>
  );
}

export function Spinner() {
  return <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />;
}

export function scoreColor(humanScore: number) {
  if (humanScore >= 70) return "text-human";
  if (humanScore >= 40) return "text-mixed";
  return "text-ai";
}

export function ScoreBadge({ humanScore }: { humanScore: number }) {
  return (
    <span className={`text-sm font-semibold tabular-nums ${scoreColor(humanScore)}`}>{humanScore}% human</span>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-ai">
      {message}
    </p>
  );
}

export const SAMPLE_TEXT = `In today's fast-paced digital landscape, artificial intelligence plays a crucial role in transforming how businesses operate. By leveraging advanced machine learning algorithms, organizations can streamline their workflows, enhance decision-making processes, and unlock new opportunities for growth. Furthermore, AI-powered tools enable teams to automate repetitive tasks, allowing employees to focus on more strategic initiatives.

However, it is important to note that the adoption of AI also presents significant challenges. Companies must navigate complex ethical considerations, ensure data privacy, and address potential biases in their models. Ultimately, a thoughtful and comprehensive approach to AI implementation will be essential for organizations seeking to thrive in an ever-evolving technological environment.`;
