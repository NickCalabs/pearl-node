import { useEffect, useRef, useState, type ReactNode } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[28px] border border-line bg-panel ${className}`}>{children}</section>;
}

export function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-panel px-4 py-3.5">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold tracking-tight text-ink">{value}</div>
      {detail && <div className="mt-0.5 truncate text-xs text-ink-3">{detail}</div>}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 px-1 text-sm font-medium text-ink-2">{children}</h2>;
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
      <div className="mb-1 text-xs text-ink-3">{label}</div>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-2.5">
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-ink select-all">
          {shown ? value : "•".repeat(Math.min(value.length, 16))}
        </code>
        {secret && (
          <button type="button" onClick={() => setShown((s) => !s)} className="shrink-0 text-xs font-medium text-ink-2 hover:text-ink">
            {shown ? "Hide" : "Show"}
          </button>
        )}
        <button type="button" onClick={copy} className="shrink-0 text-xs font-medium text-nacre hover:underline">
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
    <div role="tablist" className="inline-flex rounded-full border border-line bg-panel-2 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
            value === t.id ? "bg-white/10 text-ink" : "text-ink-3 hover:text-ink"
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
      className="m-auto w-[min(640px,calc(100vw-32px))] rounded-[28px] border border-line-2 bg-panel p-0 text-ink backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-ink-3 hover:bg-white/5 hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function AppIcon({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[22%] bg-gradient-to-br from-[#2a2440] via-[#16141f] to-[#0b0b10] shadow-lg ring-1 ring-white/10 ${className}`} aria-hidden>
      <div className="pearl absolute left-1/2 top-1/2 h-[62%] w-[62%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full">
        <div className="pearl-film absolute inset-[-20%] rounded-full" />
      </div>
    </div>
  );
}
