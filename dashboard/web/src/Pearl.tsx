import { useId } from "react";
import type { Peer } from "./types";

// "Parametric pearl", after Pearl's brand art: concentric bands tangent at the
// bottom, lit from below, with film grain. Same construction as assets/icon.svg.

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, k) => Math.round(v + (pb[k] - v) * t).toString(16).padStart(2, "0")).join("");
}

function Grain({ id, seed }: { id: string; seed: number }) {
  // Grain scales with brightness (multiply), so dark areas stay dark.
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed} result="n" />
      <feColorMatrix in="n" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1" result="g" />
      <feComposite in="SourceGraphic" in2="g" operator="arithmetic" k1={1.15} k2={0.45} k3={0} k4={0} />
    </filter>
  );
}

// Hero: like nacre around a pearl, bands light up from the core outward as the
// node syncs; the pearl at the base glows once synced. Peers are small dots on a slow orbit: filled =
// outgoing, hollow = incoming (shape, not color, tells them apart).
export function ParametricPearl({ progress, synced, waiting, peers, bg = "#100f0e" }: {
  progress: number;
  synced: boolean;
  waiting: boolean;
  peers: Peer[];
  bg?: string; // the panel color the orb fades into
}) {
  const uid = useId().replace(/:/g, "");
  const N = 14;
  const S = 420;
  const cx = S / 2;
  const R0 = 168;
  const bottom = 372;
  const center = bottom - R0;
  const lit = synced ? N : Math.floor(Math.max(0, Math.min(1, progress)) * N);
  const orbitR = R0 + 24;

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-auto w-full" aria-hidden>
      <defs>
        <Grain id={`grain-${uid}`} seed={11} />
        {Array.from({ length: N }, (_, i) => {
          const t = i / (N - 1);
          const on = mix("#ece8e1", "#1a1816", 0.8 * Math.pow(t, 1.2));
          const off = mix("#1f1d1b", bg, 0.3 + 0.5 * t);
          const isLit = N - 1 - i < lit; // innermost band (i = N-1) lights first
          return (
            <linearGradient key={i} id={`band-${uid}-${i}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor={isLit ? on : off} style={{ transition: "stop-color 1.2s ease" }} />
              <stop offset={0.55 - 0.25 * t} stopColor={bg} />
            </linearGradient>
          );
        })}
        <radialGradient id={`glow-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#f6f2ed" stopOpacity=".6" />
          <stop offset="1" stopColor="#f6f2ed" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g filter={`url(#grain-${uid})`}>
        {Array.from({ length: N }, (_, i) => {
          const r = R0 * (1 - 0.88 * (i / (N - 1)));
          return <circle key={i} cx={cx} cy={bottom - r} r={r} fill={`url(#band-${uid}-${i})`} />;
        })}
      </g>

      {/* peers in orbit around the pearl */}
      <g>
        <circle cx={cx} cy={center} r={orbitR} fill="none" stroke="var(--rule)" strokeDasharray="1 7" strokeLinecap="round" />
        {peers.map((p, i) => {
          // spread over the upper 260 degrees, centred on the top
          const span = (260 * Math.PI) / 180;
          const a = -Math.PI / 2 + (peers.length > 1 ? (i / (peers.length - 1) - 0.5) * span : 0);
          const x = cx + orbitR * Math.cos(a);
          const y = center + orbitR * Math.sin(a);
          return p.inbound ? (
            <circle key={p.id} cx={x} cy={y} r={4.5} fill="var(--canvas)" stroke="var(--oyster)" strokeWidth={1.5} />
          ) : (
            <circle key={p.id} cx={x} cy={y} r={4.5} fill="var(--oyster)" stroke="var(--canvas)" strokeWidth={2} />
          );
        })}
      </g>

      {/* the pearl */}
      <circle cx={cx} cy={bottom} r={synced ? 30 : 22} fill={`url(#glow-${uid})`} className={synced ? "" : "breathe"} />
      <circle
        cx={cx} cy={bottom} r={9}
        fill={synced ? "#f6f2ed" : waiting ? "#5a5751" : "#cfcac2"}
        className={synced ? "" : "breathe"}
      />
    </svg>
  );
}

// Small pearl for a block card, shaped by the block hash.
export function BlockPearl({ hash }: { hash: string }) {
  const uid = useId().replace(/:/g, "");
  const bytes = hash.match(/../g)?.map((h) => parseInt(h, 16)) ?? [0];
  const b = (i: number) => bytes[i % bytes.length];
  const N = 5 + (b(0) % 5);
  const R0 = 34 + (b(1) % 10);
  const cx = 50 + ((b(2) % 17) - 8);
  const bottom = 78 + (b(3) % 8);
  const shrink = 0.7 + (b(4) % 20) / 100;
  const tilt = ((b(5) % 41) - 20) * 0.6;
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <Grain id={`g-${uid}`} seed={b(6)} />
        {Array.from({ length: N }, (_, i) => {
          const t = i / Math.max(N - 1, 1);
          return (
            <linearGradient key={i} id={`b-${uid}-${i}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor={mix("#e6e2da", "#151412", Math.pow(t, 0.8))} />
              <stop offset={0.6 - 0.25 * t} stopColor="#080807" />
            </linearGradient>
          );
        })}
      </defs>
      <g filter={`url(#g-${uid})`} transform={`rotate(${tilt} ${cx} ${bottom})`}>
        {Array.from({ length: N }, (_, i) => {
          const r = R0 * (1 - shrink * (i / Math.max(N - 1, 1)));
          return <circle key={i} cx={cx} cy={bottom - r} r={r} fill={`url(#b-${uid}-${i})`} />;
        })}
      </g>
      <circle cx={cx} cy={bottom} r={2.6} fill="#f6f2ed" />
    </svg>
  );
}
