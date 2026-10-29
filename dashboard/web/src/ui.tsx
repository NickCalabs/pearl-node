import { useEffect, useRef, useState, type ReactNode } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[20px] border border-rule bg-surface ${className}`}>{children}</section>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4 px-1">
      <h2 className="eyebrow">{children}</h2>
      {aside && <div className="text-xs text-ink-3">{aside}</div>}
    </div>
  );
}

// One cell of a ruled stats grid (editorial, like Pearl's site).
export function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-5">
      <div className="eyebrow">{label}</div>
      <div className="serif-num mt-2 truncate text-[28px] leading-none text-ink">{value}</div>
      {detail && <div className="mt-2 truncate text-xs text-ink-3">{detail}</div>}
    </div>
  );
}

// Status: always a dot plus a word, never color alone.
export function StatusLine({ tone, children }: { tone: "good" | "progress" | "error" | "muted"; children: ReactNode }) {
  const dot = {
    good: "bg-teal-bright",
    progress: "bg-accent breathe",
    error: "bg-error",
    muted: "bg-ink-3",
  }[tone];
  return (
    <div className="flex items-center gap-2.5 text-sm text-ink-2">
      <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
      {children}
    </div>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="h-[3px] w-full overflow-hidden rounded-full bg-accent-track"
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-1000" style={{ width: `${value * 100}%` }} />
    </div>
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
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="flex items-center gap-3 rounded-xl border border-rule bg-elevated px-3.5 py-2.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink select-all">
          {shown ? value : "•".repeat(Math.min(value.length, 16))}
        </code>
        {secret && (
          <button type="button" onClick={() => setShown((s) => !s)} className="shrink-0 text-xs text-ink-3 hover:text-ink">
            {shown ? "Hide" : "Show"}
          </button>
        )}
        <button type="button" onClick={copy} className="shrink-0 text-xs font-medium text-accent hover:text-accent-hover">
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
    <div role="tablist" className="flex gap-6 border-b border-rule">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b pb-2.5 text-sm transition-colors ${
            value === t.id ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Native <dialog>: focus trap, Esc to close and backdrop come for free.
export function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className="m-auto w-[min(620px,calc(100vw-32px))] rounded-[20px] border border-rule-strong bg-surface p-0 text-ink backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    >
      <div className="p-6 sm:p-7">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-serif text-2xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink-3 hover:bg-white/5 hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function AppIcon({ className = "h-14 w-14" }: { className?: string }) {
  return <img src="./icon.svg" alt="" className={`rounded-[22%] ring-1 ring-rule ${className}`} />;
}
