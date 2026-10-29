const int = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const fmtInt = (n: number) => int.format(Math.round(n));
export const fmtCompact = (n: number) => compact.format(n);

export function fmtPercent(p: number): string {
  // Round down, so it never shows 100% before the node is synced.
  const v = Math.min(p * 100, 99.99);
  return (v < 10 ? (Math.floor(v * 100) / 100).toFixed(2) : (Math.floor(v * 10) / 10).toFixed(1)) + "%";
}

function scaled(n: number, units: string[], base: number): string {
  let i = 0;
  while (Math.abs(n) >= base && i < units.length - 1) {
    n /= base;
    i++;
  }
  const digits = i === 0 ? 0 : n < 10 ? 2 : n < 100 ? 1 : 0;
  return `${n.toFixed(digits)} ${units[i]}`;
}

export const fmtBytes = (n: number) => scaled(n, ["B", "KB", "MB", "GB", "TB"], 1000);
export const fmtHashrate = (n: number) => scaled(n, ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"], 1000);

export function fmtDuration(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min`;
  return `${sec} s`;
}

export function fmtAgo(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!t || t < 1e12 / 2) return "unknown";
  const sec = (now - t) / 1000;
  if (sec < 60) return "just now";
  return `${fmtDuration(sec)} ago`;
}

// "/pearlwire:0.5.0/pearld:1.5.5/" -> "pearld 1.5.5"
export function fmtAgent(ua: string): string {
  const parts = ua.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? ua;
  return last.replace(":", " ");
}
