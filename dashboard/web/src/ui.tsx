import { useState, type ReactNode } from "react";

export function Card({ title, action, children, className = "" }: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="mt-1.5 truncate text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {detail && <div className="mt-1 truncate text-xs text-ink-2">{detail}</div>}
    </div>
  );
}

// Meter: fill and track are two steps of the same hue.
export function Meter({ value, tone, indeterminate = false, label }: {
  value: number;
  tone: "accent" | "good";
  indeterminate?: boolean;
  label: string;
}) {
  const track = tone === "good" ? "bg-good-track" : "bg-accent-track";
  const fill = tone === "good" ? "bg-good" : "bg-accent";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
      className={`h-2.5 w-full overflow-hidden rounded-full ${track}`}
    >
      <div
        className={`h-full rounded-full ${fill} ${indeterminate ? "indeterminate w-2/5" : "transition-[width] duration-700"}`}
        style={indeterminate ? undefined : { width: `${Math.max(value * 100, value > 0 ? 1 : 0)}%` }}
      />
    </div>
  );
}

export type Tone = "good" | "accent" | "critical" | "muted";

// Status is never color alone: dot/icon + text label.
export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const dot = {
    good: "bg-good",
    accent: "bg-accent animate-pulse",
    critical: "bg-critical",
    muted: "bg-ink-3",
  }[tone];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink">
      <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

export function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard needs https or localhost; the value stays selectable */
    }
  };
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-ink-3">{label}</div>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-ink select-all">
          {shown ? value : "•".repeat(Math.min(value.length, 16))}
        </code>
        {secret && (
          <button type="button" onClick={() => setShown((s) => !s)} className="shrink-0 text-xs font-medium text-ink-2 hover:text-ink">
            {shown ? "Hide" : "Show"}
          </button>
        )}
        <button type="button" onClick={copy} className="shrink-0 text-xs font-medium text-accent hover:underline">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div role="tablist" className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            value === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function PearlMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <radialGradient id="pearl-g" cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".45" stopColor="#e9edf5" />
          <stop offset="1" stopColor="#9aa6bd" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="26" fill="url(#pearl-g)" />
      <ellipse cx="24" cy="22" rx="7" ry="4.5" fill="#fff" opacity=".85" transform="rotate(-30 24 22)" />
    </svg>
  );
}
