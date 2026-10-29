import { useEffect, useState } from "react";
import type { Status } from "./types";
import { AppIcon, CopyField, Meter, Modal, Panel, SectionTitle, Stat, StatusLine, Tabs } from "./ui";
import { BlockPearl, ParametricPearl } from "./Pearl";
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
        <header className="mb-8 flex items-center justify-between gap-4 sm:mb-10">
          <div className="flex min-w-0 items-center gap-4">
            <AppIcon className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" />
            <div className="min-w-0">
              <h1 className="truncate font-serif text-[26px] leading-tight sm:text-[32px]">Pearl Node</h1>
              <p className="truncate text-sm text-ink-3">
                {s?.node.version ? `pearld ${s.node.version}` : "pearld"}
                {s?.node.network ? ` · ${s.node.network}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            disabled={!s}
            className="shrink-0 rounded-full border border-rule-strong px-5 py-2.5 text-sm text-ink transition hover:border-accent hover:text-accent disabled:opacity-40"
          >
            Connect
          </button>
        </header>

        {!s ? (
          <Panel className="p-8">
            <p className="text-sm text-ink-2">{fetchError ? `Can't reach the dashboard server (${fetchError}).` : "Loading…"}</p>
          </Panel>
        ) : (
          <main className="space-y-10">
            <Hero s={s} now={now} dashboardOffline={Boolean(fetchError)} />
            <Stats s={s} />
            <LatestBlocks s={s} now={now} />
            <Peers s={s} now={now} />
            <footer className="flex flex-wrap justify-between gap-2 border-t border-rule pt-5 text-xs text-ink-3">
              <span>Unofficial community app · runs Pearl's official pearld</span>
              <span>
                ↓ {fmtBytes(s.traffic.recvBytes)} · ↑ {fmtBytes(s.traffic.sentBytes)} · updated {fmtAgo(s.updatedAt, now)}
              </span>
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
  const encrypted = peers.list.filter((p) => p.encrypted).length;

  return (
    <Panel className="overflow-hidden">
      <div className="grid md:grid-cols-[1.05fr_1fr]">
        <div className="flex min-h-[380px] flex-col justify-between gap-10 p-7 sm:p-10">
          {offline ? (
            <StatusLine tone="error">{dashboardOffline ? "Dashboard offline" : "Node not responding"}</StatusLine>
          ) : synced ? (
            <StatusLine tone="good">In sync · running for {fmtDuration(s.node.uptimeSec)}</StatusLine>
          ) : (
            <StatusLine tone="progress">Running for {fmtDuration(s.node.uptimeSec)}</StatusLine>
          )}

          <div>
            {offline ? (
              <>
                <div className="eyebrow">Status</div>
                <div className="serif-num mt-3 text-6xl leading-none sm:text-7xl">Offline</div>
                <p className="mt-4 max-w-md text-sm text-ink-2">
                  The dashboard can't reach pearld. If the node was just started or restarted, give it a minute.
                </p>
                {s.error && <p className="mt-4 rounded-lg border border-rule bg-elevated px-3 py-2 font-mono text-xs text-ink-2">{s.error}</p>}
              </>
            ) : synced ? (
              <>
                <div className="eyebrow">Block height</div>
                <div className="serif-num mt-3 text-6xl leading-none sm:text-8xl">{fmtInt(sync.blocks)}</div>
                <p className="mt-4 text-sm text-ink-2">Last block {fmtAgo(sync.tipTime, now)}</p>
              </>
            ) : early ? (
              <>
                <div className="eyebrow">{sync.phase === "headers" ? "Downloading headers" : "Finding peers"}</div>
                <div className="serif-num mt-3 text-5xl leading-[1.05] sm:text-6xl">Getting ready</div>
                <p className="mt-4 max-w-md text-sm text-ink-2">
                  {sync.phase === "headers"
                    ? "Fetching block headers and checking their proofs. Block-by-block progress starts after this step."
                    : "Looking for other Pearl nodes to connect to."}
                </p>
              </>
            ) : (
              <>
                <div className="eyebrow">Synchronizing</div>
                <div className="serif-num mt-3 text-7xl leading-none sm:text-8xl">{fmtPercent(sync.progress)}</div>
                <p className="mt-4 text-sm text-ink-2">
                  <span className="text-ink">{fmtInt(sync.blocks)}</span> of {fmtInt(sync.networkHeight)} blocks
                </p>
                <div className="mt-6 max-w-md">
                  <Meter value={sync.progress} label="Sync progress" />
                  <div className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-xs text-ink-3">
                    <span>{sync.etaSec != null ? `About ${fmtDuration(sync.etaSec)} left` : "Estimating time left…"}</span>
                    {sync.blocksPerMin > 0 && <span>{fmtInt(sync.blocksPerMin)} blocks / min</span>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="relative flex flex-col items-center justify-center border-t border-rule px-6 pb-7 pt-4 md:border-l md:border-t-0">
          <div className="w-full max-w-[420px]">
            <ParametricPearl progress={sync.progress} synced={synced} waiting={early || offline} peers={peers.list} />
          </div>
          <ul className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-ink-3">
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 rounded-full bg-oyster" /> {peers.outbound} outgoing
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 rounded-full border border-oyster" /> {peers.inbound} incoming
            </li>
            <li>{encrypted} of {peers.total} encrypted</li>
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function Stats({ s }: { s: Status }) {
  const { chain, sync, peers } = s;
  const synced = sync.phase === "synced";
  const at = synced ? "Current" : `At block ${fmtCompact(sync.blocks)}`;
  return (
    <div>
      <SectionTitle>Node</SectionTitle>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6 [&>*]:bg-surface">
        <Stat label="Block height" value={fmtInt(sync.blocks)} detail={`Network ${fmtInt(sync.networkHeight)}`} />
        <Stat label="Peers" value={fmtInt(peers.total)} detail={`${peers.outbound} out · ${peers.inbound} in`} />
        <Stat label="Blockchain" value={fmtBytes(chain.sizeBytes)} detail={chain.pruned ? "Pruned" : "Full copy on disk"} />
        <Stat label="Mempool" value={fmtInt(chain.mempoolTxs)} detail={`tx · ${fmtBytes(chain.mempoolBytes)}`} />
        <Stat label="Hashrate" value={chain.networkHashps > 0 ? fmtHashrate(chain.networkHashps) : "—"} detail={at} />
        <Stat label="Difficulty" value={fmtCompact(chain.difficulty)} detail={at} />
      </div>
    </div>
  );
}

function LatestBlocks({ s, now }: { s: Status; now: number }) {
  const blocks = s.blocks ?? [];
  if (blocks.length === 0) return null;
  return (
    <div>
      <SectionTitle aside="Each pearl is drawn from its block hash">Latest blocks</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {blocks.map((b) => (
          <article key={b.hash} className="overflow-hidden rounded-2xl border border-rule bg-surface transition-colors hover:border-rule-strong">
            <div className="relative aspect-square bg-canvas">
              <BlockPearl hash={b.hash} />
            </div>
            <div className="border-t border-rule px-3.5 py-3">
              <div className="serif-num text-xl leading-none">{fmtInt(b.height)}</div>
              <div className="mt-1.5 text-xs text-ink-3">{fmtAgo(new Date(b.time * 1000).toISOString(), now)}</div>
              <div className="mt-2 truncate font-mono text-[11px] text-ink-3" title={b.hash}>
                {b.hash.slice(0, 6)}…{b.hash.slice(-6)}
              </div>
              <div className="mt-0.5 text-[11px] text-ink-3">{b.txCount} tx · {fmtBytes(b.sizeBytes)}</div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Peers({ s, now }: { s: Status; now: number }) {
  const list = s.peers.list;
  return (
    <div>
      <SectionTitle aside="Addresses are hidden">Peers</SectionTitle>
      <Panel className="overflow-hidden">
        {list.length === 0 ? (
          <p className="p-6 text-sm text-ink-2">No peers connected yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-rule">
                  <th className="eyebrow px-6 py-3 font-normal">Direction</th>
                  <th className="eyebrow px-3 py-3 font-normal">Software</th>
                  <th className="eyebrow px-3 py-3 text-right font-normal">Height</th>
                  <th className="eyebrow px-3 py-3 text-right font-normal">Ping</th>
                  <th className="eyebrow px-6 py-3 text-right font-normal">Connected</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {list.map((p) => (
                  <tr key={p.id} className="border-b border-rule last:border-0">
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-2.5 text-ink-2">
                        <span aria-hidden className={`h-2 w-2 rounded-full ${p.inbound ? "border border-oyster" : "bg-oyster"}`} />
                        {p.inbound ? "Incoming" : "Outgoing"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink">
                      {fmtAgent(p.userAgent)}
                      {p.encrypted && <span className="ml-2 text-xs text-ink-3" title="Encrypted connection (BIP324)">encrypted</span>}
                      {p.syncPeer && <span className="ml-2 text-xs text-accent">sync peer</span>}
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
    <div className="space-y-6">
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
          <p className="text-sm leading-relaxed text-ink-2">
            Other Pearl nodes connect to yours on the peer-to-peer port. Forward it on your router to accept incoming peers and help the network.
          </p>
          <CopyField label="Address" value={`${host}:${c.p2pPort}`} />
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-ink-2">
            {tab === "rpc"
              ? "Point wallets and apps at your node's RPC interface. It uses TLS with a self-signed certificate: download it and add it to the app."
              : "Mining software (for example pearl-gateway) gets block templates from your node over RPC. Use these details in its node settings."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><CopyField label="RPC URL" value={`https://${host}:${c.rpcPort}`} /></div>
            {hasCreds ? (
              <>
                <CopyField label="Username" value={c.rpcUser!} />
                <CopyField label="Password" value={c.rpcPass!} secret />
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-rule-strong px-3.5 py-2.5 text-xs text-ink-3 sm:col-span-2">
                The RPC username and password are hidden here. Find them in your node's configuration.
              </p>
            )}
          </div>
          {c.certUrl && (
            <a href={c.certUrl} download className="inline-flex text-sm text-accent hover:text-accent-hover">
              Download TLS certificate (rpc.cert) →
            </a>
          )}
        </>
      )}
    </div>
  );
}
