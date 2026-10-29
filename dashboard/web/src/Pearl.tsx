import type { Peer } from "./types";

// The hero visual: a pearl that "forms" as the node syncs. The ring around it
// is sync progress; small lights orbiting it are the connected peers
// (lavender = outgoing, teal = incoming). No peer locations are used.
export function PearlVisual({ progress, indeterminate, synced, peers }: {
  progress: number;
  indeterminate: boolean;
  synced: boolean;
  peers: Peer[];
}) {
  const size = 360;
  const c = size / 2;
  const ringR = 128;
  const circ = 2 * Math.PI * ringR;
  const p = synced ? 1 : Math.max(0, Math.min(1, progress));
  const orbitR = 162;

  return (
    <div className="relative aspect-square w-full max-w-[360px]" aria-hidden>
      <div className="pearl-glow absolute inset-[-12%] rounded-full" />

      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--nacre-1)" />
            <stop offset=".45" stopColor="var(--nacre-2)" />
            <stop offset="1" stopColor="var(--nacre-3)" />
          </linearGradient>
        </defs>

        {/* nacre growth lines */}
        {[100, 142, 176].map((r, i) => (
          <circle key={r} cx={c} cy={c} r={r} fill="none" stroke="white" strokeOpacity={0.05 - i * 0.012} />
        ))}

        {/* progress ring */}
        <circle cx={c} cy={c} r={ringR} fill="none" stroke="white" strokeOpacity={0.07} strokeWidth={4} />
        {indeterminate ? (
          <g className="ring-indeterminate">
            <circle
              cx={c} cy={c} r={ringR} fill="none" stroke="url(#ring-g)" strokeWidth={4} strokeLinecap="round"
              strokeDasharray={`${circ * 0.18} ${circ}`}
            />
          </g>
        ) : (
          <circle
            cx={c} cy={c} r={ringR} fill="none" stroke="url(#ring-g)" strokeWidth={4} strokeLinecap="round"
            strokeDasharray={`${Math.max(p * circ, p > 0 ? 4 : 0)} ${circ}`}
            transform={`rotate(-90 ${c} ${c})`}
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        )}

        {/* peers in orbit */}
        <g className="orbit" style={{ transformOrigin: `${c}px ${c}px` }}>
          <circle cx={c} cy={c} r={orbitR} fill="none" stroke="white" strokeOpacity={0.06} strokeDasharray="2 6" />
          {peers.map((peer, i) => {
            const a = (i / Math.max(peers.length, 1)) * 2 * Math.PI - Math.PI / 2;
            const x = c + orbitR * Math.cos(a);
            const y = c + orbitR * Math.sin(a);
            return (
              <g key={peer.id}>
                <circle cx={x} cy={y} r={9} fill={peer.inbound ? "var(--in)" : "var(--out)"} opacity={0.18} />
                <circle cx={x} cy={y} r={4.5} fill={peer.inbound ? "var(--in)" : "var(--out)"} stroke="var(--panel)" strokeWidth={2} />
              </g>
            );
          })}
        </g>
      </svg>

      {/* the pearl itself */}
      <div className="pearl absolute left-1/2 top-1/2 h-[54%] w-[54%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full">
        <div className="pearl-film absolute inset-[-20%] rounded-full" />
        <div className="absolute left-[22%] top-[16%] h-[18%] w-[30%] -rotate-[28deg] rounded-full bg-white/70 blur-[6px]" />
      </div>
    </div>
  );
}

// Connections ring: outgoing vs incoming. Two validated series colors,
// a 2px gap between segments, and a legend with counts (never color alone).
export function ConnectionsRing({ outbound, inbound }: { outbound: number; inbound: number }) {
  const total = outbound + inbound;
  const r = 52;
  const circ = 2 * Math.PI * r;
  const gap = total > 0 && outbound > 0 && inbound > 0 ? 3 : 0;
  const outLen = total ? (outbound / total) * circ - gap : 0;
  const inLen = total ? (inbound / total) * circ - gap : 0;
  return (
    <svg viewBox="0 0 140 140" className="h-44 w-44" role="img" aria-label={`${total} peers: ${outbound} outgoing, ${inbound} incoming`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="white" strokeOpacity={0.07} strokeWidth={14} />
      {outLen > 0 && (
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--out)" strokeWidth={14}
          strokeDasharray={`${outLen} ${circ}`} transform="rotate(-90 70 70)" />
      )}
      {inLen > 0 && (
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--in)" strokeWidth={14}
          strokeDasharray={`${inLen} ${circ}`} strokeDashoffset={-(outLen + gap)} transform="rotate(-90 70 70)" />
      )}
      <text x="70" y="68" textAnchor="middle" className="fill-ink text-[26px] font-semibold">{total}</text>
      <text x="70" y="88" textAnchor="middle" className="fill-ink-3 text-[11px]">Peers</text>
    </svg>
  );
}

// Deterministic "nacre" art for a block, drawn from its hash.
export function BlockArt({ hash }: { hash: string }) {
  const bytes = hash.match(/../g)?.map((h) => parseInt(h, 16)) ?? [0];
  const b = (i: number) => bytes[i % bytes.length];
  const palette = ["var(--nacre-1)", "var(--nacre-2)", "var(--nacre-3)", "var(--nacre-4)"];
  const cx = 50 + (b(0) - 128) / 16;
  const cy = 50 + (b(1) - 128) / 16;
  const rings = Array.from({ length: 9 }, (_, k) => {
    const base = 8 + k * 5.2;
    const pts = Array.from({ length: 24 }, (_, j) => {
      const wobble = ((b(k * 7 + j) / 255) - 0.5) * (1.2 + k * 0.45);
      const a = (j / 24) * 2 * Math.PI + b(k) / 80;
      return [cx + (base + wobble) * Math.cos(a), cy + (base + wobble) * Math.sin(a)];
    });
    const d = pts.map(([x, y], j) => `${j ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + "Z";
    return { d, color: palette[(b(k + 3) + k) % palette.length], op: 0.15 + (b(k + 11) / 255) * 0.45 };
  });
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={`bg-${hash.slice(0, 8)}`} cx="50%" cy="50%" r="60%">
          <stop offset="0" stopColor={palette[b(5) % 4]} stopOpacity=".22" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#bg-${hash.slice(0, 8)})`} />
      {rings.map((r, i) => (
        <path key={i} d={r.d} fill="none" stroke={r.color} strokeOpacity={r.op} strokeWidth={0.8} />
      ))}
      <circle cx={cx} cy={cy} r={4.5} fill="white" opacity={0.85} />
    </svg>
  );
}
