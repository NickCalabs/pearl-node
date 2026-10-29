import { useEffect, useState } from "react";
import type { Status } from "./types";
import { AppIcon, CopyField, Modal, Panel, SectionTitle, Stat, Tabs } from "./ui";
import { BlockArt, ConnectionsRing, PearlVisual } from "./Pearl";
import {
  fmtAgent, fmtAgo, fmtBytes, fmtCompact, fmtDuration, fmtHashrate, fmtInt, fmtPercent,
} from "./format";

const POLL_MS = 5000;

function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const res = await fetch("api/status", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const s = (await res.json()) as Status;
        if (alive) { setStatus(s); setFetchError(null); }
      } catch (e) {
        if (alive) setFetchError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) timer = setTimeout(load, POLL_MS);
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return { status, fetchError };
}

// Re-render so "x min ago" stays fresh between polls.
function useNow(ms = 10000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export default function App() {
  const { status: s, fetchError } = useStatus();
  const now = useNow();
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <AppIcon className="h-14 w-14 shrink-0 sm:h-16 sm:w-16" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">Pearl Node</h1>
              <p className="truncate text-sm text-ink-3">{s?.node.version ? `pearld ${s.node.version}` : "pearld"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            disabled={!s}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line-2 bg-panel-2 px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-white/10 disabled:opacity-40"
          >
            <PlugIcon /> Connect
          </button>
        </header>

        {!s ? (
          <Panel className="p-8">
            <p className="text-sm text-ink-2">{fetchError ? `Can't reach the dashboard server (${fetchError}).` : "Loading…"}</p>
          </Panel>
        ) : (
          <main className="space-y-8">
            <Hero s={s} now={now} dashboardOffline={Boolean(fetchError)} />
            <LatestBlocks s={s} now={now} />
            <Stats s={s} />
            <Peers s={s} now={now} />
            <footer className="pb-4 text-center text-xs text-ink-3">
              Updated {fmtAgo(s.updatedAt, now)}{s.node.userAgent ? ` · ${s.node.userAgent}` : ""}
            </footer>
            <Modal open={connectOpen} onClose={() => setConnectOpen(false)} title="Connect to your node">
              <Connect s={s} />
            </Modal>
          </main>
        )}
      </div>
    </div>
  );
}

function Hero({ s, now, dashboardOffline }: { s: Status; now: number; dashboardOffline: boolean }) {
  const { sync, peers } = s;
  const offline = dashboardOffline || !s.reachable;
  const synced = sync.phase === "synced";
  const early = sync.phase === "headers" || sync.phase === "connecting";

  return (
    <Panel className="p-2 sm:p-3">
      <div className="grid gap-2 lg:grid-cols-[1fr_300px] sm:gap-3">
        {/* main stage */}
        <div className="relative overflow-hidden rounded-[22px] border border-line bg-[radial-gradient(120%_90%_at_70%_40%,#17151f_0%,#0b0b0e_55%,#060607_100%)] p-6 sm:p-8 lg:flex lg:min-h-[480px] lg:flex-col lg:justify-between">
          <div className="relative z-10 flex items-center gap-2 text-sm">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${offline ? "bg-critical" : "bg-good"}`} />
            {offline ? (
              <span className="text-critical">{dashboardOffline ? "Dashboard offline" : "Node not responding"}</span>
            ) : (
              <span><span className="text-good">Running</span> <span className="text-ink-2">for {fmtDuration(s.node.uptimeSec)}</span></span>
            )}
          </div>

          <div className="pointer-events-none mx-auto my-4 flex justify-center sm:my-2 lg:absolute lg:right-[6%] lg:top-1/2 lg:my-0 lg:w-[46%] lg:-translate-y-1/2">
            <PearlVisual progress={sync.progress} indeterminate={early && !offline} synced={synced} peers={peers.list} />
          </div>

          <div className="relative z-10 lg:max-w-[50%]">
            {offline ? (
              <>
                <div className="text-4xl font-semibold tracking-tight sm:text-5xl">Offline</div>
                <p className="mt-2 text-sm text-ink-2">
                  The dashboard can't reach pearld. If the node was just started or restarted, give it a minute.
                </p>
                {s.error && <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 font-mono text-xs text-ink-2">{s.error}</p>}
              </>
            ) : synced ? (
              <>
                <div className="text-sm text-ink-3">Last block {fmtAgo(sync.tipTime, now)}</div>
                <div className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
                  <span className="nacre-text">Synced</span>
                </div>
                <div className="mt-1 text-2xl font-medium text-ink-2">Block {fmtInt(sync.blocks)}</div>
              </>
            ) : early ? (
              <>
                <div className="text-sm text-ink-3">Network height {fmtInt(sync.networkHeight)}</div>
                <div className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
                  {sync.phase === "headers" ? "Downloading headers" : "Finding peers"}
                </div>
                <p className="mt-3 text-sm text-ink-2">
                  {sync.phase === "headers"
                    ? "Fetching block headers and checking their proofs. Block progress appears after this step."
                    : "Looking for other Pearl nodes to connect to."}
                </p>
              </>
            ) : (
              <>
                <div className="text-sm text-ink-3">
                  {fmtInt(sync.blocks)} of {fmtInt(sync.networkHeight)} blocks
                </div>
                <div className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
                  Synchronizing <span className="text-ink-3">{fmtPercent(sync.progress)}</span>
                </div>
                <div className="mt-3 text-sm text-ink-2">
                  {sync.etaSec != null ? `About ${fmtDuration(sync.etaSec)} left` : "Estimating time left…"}
                  {sync.blocksPerMin > 0 && <span className="text-ink-3"> · {fmtInt(sync.blocksPerMin)} blocks/min</span>}
                </div>
              </>
            )}
          </div>
        </div>

        {/* connections */}
        <div className="flex flex-col items-center justify-center gap-6 rounded-[22px] p-6">
          <div className="text-base font-medium text-ink">Connections</div>
          <ConnectionsRing outbound={peers.outbound} inbound={peers.inbound} />
          <ul className="w-full max-w-[200px] space-y-2.5 text-sm">
            <Legend color="var(--out)" label="Outgoing" value={peers.outbound} />
            <Legend color="var(--in)" label="Incoming" value={peers.inbound} />
            <li className="flex items-center justify-between border-t border-line pt-2.5 text-ink-3">
              <span>Encrypted</span>
              <span className="tabular-nums">{peers.list.filter((p) => p.encrypted).length} of {peers.total}</span>
            </li>
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-2.5 text-ink-2">
        <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="tabular-nums text-ink">{value}</span>
    </li>
  );
}

function LatestBlocks({ s, now }: { s: Status; now: number }) {
  const blocks = s.blocks ?? [];
  if (blocks.length === 0) return null;
  return (
    <div>
      <SectionTitle>Latest blocks</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {blocks.map((b) => (
          <div key={b.hash} className="group relative aspect-square overflow-hidden rounded-2xl border border-line bg-[#09090b]" title={b.hash}>
            <BlockArt hash={b.hash} />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-8">
              <div className="text-lg font-semibold tabular-nums leading-tight">{fmtInt(b.height)}</div>
              <div className="text-xs text-ink-3">{fmtAgo(new Date(b.time * 1000).toISOString(), now)}</div>
              <div className="mt-1 hidden text-[11px] text-ink-3 group-hover:block">
                {b.txCount} tx · {fmtBytes(b.sizeBytes)} ({fmtBytes(b.sizeBytes - b.strippedSize)} proof &amp; witness)
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stats({ s }: { s: Status }) {
  const { chain, sync } = s;
  const synced = sync.phase === "synced";
  return (
    <div>
      <SectionTitle>Node</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Blockchain size" value={fmtBytes(chain.sizeBytes)} detail={chain.pruned ? "Pruned" : "Full copy"} />
        <Stat
          label="Network hashrate"
          value={chain.networkHashps > 0 ? fmtHashrate(chain.networkHashps) : "—"}
          detail={synced ? "Recent blocks" : `At block ${fmtCompact(sync.blocks)}`}
        />
        <Stat label="Difficulty" value={fmtCompact(chain.difficulty)} detail={synced ? "Current" : `At block ${fmtCompact(sync.blocks)}`} />
        <Stat label="Mempool" value={`${fmtInt(chain.mempoolTxs)} tx`} detail={fmtBytes(chain.mempoolBytes)} />
        <Stat label="Downloaded" value={fmtBytes(s.traffic.recvBytes)} detail="Since start" />
        <Stat label="Uploaded" value={fmtBytes(s.traffic.sentBytes)} detail="Since start" />
      </div>
    </div>
  );
}

function Peers({ s, now }: { s: Status; now: number }) {
  const list = s.peers.list;
  return (
    <div>
      <SectionTitle>Peers</SectionTitle>
      <Panel className="overflow-hidden">
        {list.length === 0 ? (
          <p className="p-6 text-sm text-ink-2">No peers connected yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-ink-3">
                <tr className="border-b border-line">
                  <th className="px-6 py-3 font-medium">Software</th>
                  <th className="px-3 py-3 font-medium">Direction</th>
                  <th className="px-3 py-3 text-right font-medium">Height</th>
                  <th className="px-3 py-3 text-right font-medium">Ping</th>
                  <th className="px-6 py-3 text-right font-medium">Connected</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {list.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-6 py-3">
                      <span className="text-ink">{fmtAgent(p.userAgent)}</span>
                      {p.encrypted && <span className="ml-2 text-xs text-ink-3" title="Encrypted connection (BIP324)">encrypted</span>}
                      {p.syncPeer && <span className="ml-2 text-xs text-nacre">syncing from</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-2 text-ink-2">
                        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: p.inbound ? "var(--in)" : "var(--out)" }} />
                        {p.inbound ? "Incoming" : "Outgoing"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-ink-2">{p.height ? fmtInt(p.height) : "—"}</td>
                    <td className="px-3 py-3 text-right text-ink-2">{p.pingMs > 0 ? `${fmtInt(p.pingMs)} ms` : "—"}</td>
                    <td className="px-6 py-3 text-right text-ink-2">{fmtDuration(now / 1000 - p.connSince)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

type ConnectTab = "rpc" | "miners" | "p2p";

function Connect({ s }: { s: Status }) {
  const [tab, setTab] = useState<ConnectTab>("rpc");
  const c = s.connect;
  const host = c.host || window.location.hostname;
  const hasCreds = Boolean(c.rpcUser && c.rpcPass);

  return (
    <div className="space-y-5">
      <Tabs<ConnectTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "rpc", label: "Wallets & apps" },
          { id: "miners", label: "Miners" },
          { id: "p2p", label: "Other nodes" },
        ]}
      />
      {tab === "p2p" ? (
        <>
          <p className="text-sm text-ink-2">
            Other Pearl nodes connect to yours on the peer-to-peer port. Forward it on your router to accept incoming peers and help the network.
          </p>
          <CopyField label="Address" value={`${host}:${c.p2pPort}`} />
        </>
      ) : (
        <>
          <p className="text-sm text-ink-2">
            {tab === "rpc"
              ? "Point wallets and apps at your node's RPC interface. It uses TLS with a self-signed certificate: download it and add it to the app."
              : "Mining software (for example pearl-gateway) gets block templates from your node over RPC. Use these details in its node settings."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><CopyField label="RPC URL" value={`https://${host}:${c.rpcPort}`} /></div>
            {hasCreds ? (
              <>
                <CopyField label="Username" value={c.rpcUser!} />
                <CopyField label="Password" value={c.rpcPass!} secret />
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-line-2 px-3 py-2.5 text-xs text-ink-3 sm:col-span-2">
                The RPC username and password are hidden here. Find them in your node's configuration.
              </p>
            )}
          </div>
          {c.certUrl && (
            <a href={c.certUrl} download className="inline-flex text-sm font-medium text-nacre hover:underline">
              Download TLS certificate (rpc.cert)
            </a>
          )}
        </>
      )}
    </div>
  );
}

function PlugIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v5" />
    </svg>
  );
}
