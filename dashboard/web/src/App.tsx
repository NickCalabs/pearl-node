import { useEffect, useState } from "react";
import type { Status } from "./types";
import { Card, CopyField, Meter, PearlMark, StatTile, StatusPill, Tabs, type Tone } from "./ui";
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

// Re-render every few seconds so "x min ago" stays fresh between polls.
function useNow(ms = 10000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function headline(s: Status | null, fetchError: string | null): { tone: Tone; label: string } {
  if (fetchError) return { tone: "critical", label: "Dashboard offline" };
  if (!s) return { tone: "muted", label: "Loading" };
  if (!s.reachable) return { tone: "critical", label: "Node not responding" };
  switch (s.sync.phase) {
    case "synced": return { tone: "good", label: "Synced" };
    case "blocks": return { tone: "accent", label: `Syncing ${fmtPercent(s.sync.progress)}` };
    case "headers": return { tone: "accent", label: "Downloading headers" };
    default: return { tone: "muted", label: "Finding peers" };
  }
}

export default function App() {
  const { status: s, fetchError } = useStatus();
  const now = useNow();
  const head = headline(s, fetchError);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PearlMark />
            <div>
              <h1 className="text-lg font-semibold leading-tight">Pearl Node</h1>
              <p className="text-xs text-ink-3">
                {s?.node.version ? `pearld ${s.node.version}` : "pearld"}
                {s?.node.network ? ` · ${s.node.network}` : ""}
              </p>
            </div>
          </div>
          <StatusPill tone={head.tone}>{head.label}</StatusPill>
        </header>

        {!s ? (
          <Card>
            <p className="text-sm text-ink-2">{fetchError ? `Can't reach the dashboard server (${fetchError}).` : "Loading…"}</p>
          </Card>
        ) : (
          <main className="space-y-4">
            <SyncHero s={s} now={now} />
            <Stats s={s} />
            <Connect s={s} />
            <Peers s={s} now={now} />
            <footer className="pt-2 text-center text-xs text-ink-3">
              Updated {fmtAgo(s.updatedAt, now)}
              {s.node.userAgent ? ` · ${s.node.userAgent}` : ""}
            </footer>
          </main>
        )}
      </div>
    </div>
  );
}

function SyncHero({ s, now }: { s: Status; now: number }) {
  const { sync } = s;
  if (!s.reachable) {
    return (
      <Card>
        <div className="text-xs font-medium text-critical">Node not responding</div>
        <p className="mt-2 text-sm text-ink-2">
          The dashboard can't reach pearld. If the node was just started or restarted, give it a minute.
        </p>
        {s.error && <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-ink-2">{s.error}</p>}
      </Card>
    );
  }

  if (sync.phase === "synced") {
    return (
      <Card>
        <div className="text-xs font-medium text-ink-3">Block height</div>
        <div className="mt-1 text-5xl font-semibold tracking-tight sm:text-6xl">{fmtInt(sync.blocks)}</div>
        <p className="mt-2 text-sm text-ink-2">
          Fully synced with the Pearl network · last block {fmtAgo(sync.tipTime, now)}
        </p>
        <div className="mt-5">
          <Meter value={1} tone="good" label="Sync progress" />
        </div>
      </Card>
    );
  }

  if (sync.phase === "headers" || sync.phase === "connecting") {
    return (
      <Card>
        <div className="text-xs font-medium text-ink-3">Getting started</div>
        <div className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
          {sync.phase === "headers" ? "Downloading headers" : "Finding peers"}
        </div>
        <p className="mt-2 max-w-2xl text-sm text-ink-2">
          {sync.phase === "headers"
            ? "Your node is fetching block headers and checking their proofs before it downloads the blocks. This takes a few minutes; block progress appears after that."
            : "Your node is looking for other Pearl nodes to connect to."}
        </p>
        <div className="mt-5">
          <Meter value={0} tone="accent" indeterminate label="Sync progress" />
        </div>
        <p className="mt-3 text-xs text-ink-3">
          Network height {fmtInt(sync.networkHeight)} · downloaded {fmtBytes(s.traffic.recvBytes)} so far
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="text-xs font-medium text-ink-3">Syncing the Pearl blockchain</div>
      <div className="mt-1 text-5xl font-semibold tracking-tight sm:text-6xl">{fmtPercent(sync.progress)}</div>
      <p className="mt-2 text-sm text-ink-2">
        Block {fmtInt(sync.blocks)} of {fmtInt(sync.networkHeight)}
      </p>
      <div className="mt-5">
        <Meter value={sync.progress} tone="accent" label="Sync progress" />
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-xs text-ink-3">
        <span>{sync.etaSec != null ? `About ${fmtDuration(sync.etaSec)} left` : "Estimating time left…"}</span>
        <span>
          {sync.blocksPerMin > 0 ? `${fmtInt(sync.blocksPerMin)} blocks/min` : ""}
          {sync.tipTime ? ` · at ${new Date(sync.tipTime).toLocaleDateString()}` : ""}
        </span>
      </div>
    </Card>
  );
}

function Stats({ s }: { s: Status }) {
  const { chain, peers, sync } = s;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile label="Block height" value={fmtInt(sync.blocks)} detail={`of ${fmtInt(sync.networkHeight)} on the network`} />
      <StatTile label="Peers" value={fmtInt(peers.total)} detail={`${peers.outbound} outgoing · ${peers.inbound} incoming`} />
      <StatTile label="Blockchain size" value={fmtBytes(chain.sizeBytes)} detail={chain.pruned ? "Pruned" : "Full copy"} />
      <StatTile label="Mempool" value={`${fmtInt(chain.mempoolTxs)} tx`} detail={fmtBytes(chain.mempoolBytes)} />
      <StatTile
        label="Network hashrate"
        value={chain.networkHashps > 0 ? fmtHashrate(chain.networkHashps) : "—"}
        detail={sync.phase === "synced" ? "Estimated from recent blocks" : "Shown once synced"}
      />
      <StatTile label="Difficulty" value={fmtCompact(chain.difficulty)} detail={fmtInt(chain.difficulty)} />
      <StatTile label="Uptime" value={fmtDuration(s.node.uptimeSec)} detail="Since pearld started" />
      <StatTile
        label="Data transferred"
        value={fmtBytes(s.traffic.recvBytes + s.traffic.sentBytes)}
        detail={`↓ ${fmtBytes(s.traffic.recvBytes)} · ↑ ${fmtBytes(s.traffic.sentBytes)}`}
      />
    </div>
  );
}

type ConnectTab = "rpc" | "miners" | "p2p";

function Connect({ s }: { s: Status }) {
  const [tab, setTab] = useState<ConnectTab>("rpc");
  const c = s.connect;
  const host = c.host || window.location.hostname;
  const rpcUrl = `https://${host}:${c.rpcPort}`;
  const hasCreds = Boolean(c.rpcUser && c.rpcPass);

  return (
    <Card
      title="Connect"
      action={
        <Tabs<ConnectTab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "rpc", label: "Wallets & apps" },
            { id: "miners", label: "Miners" },
            { id: "p2p", label: "Other nodes" },
          ]}
        />
      }
    >
      {tab === "p2p" ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">
            Other Pearl nodes can connect to yours on the peer-to-peer port. Open it on your router to help the network.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CopyField label="Address" value={`${host}:${c.p2pPort}`} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">
            {tab === "rpc"
              ? "Point wallets and apps at your node's RPC interface. It uses TLS with a self-signed certificate, so download the certificate and give it to the app."
              : "Mining software (for example pearl-gateway) gets block templates from your node over RPC. Use these details in its node settings."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CopyField label="RPC URL" value={rpcUrl} />
            {hasCreds ? (
              <>
                <CopyField label="Username" value={c.rpcUser!} />
                <CopyField label="Password" value={c.rpcPass!} secret />
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-line px-3 py-2 text-xs text-ink-3 sm:col-span-1">
                The RPC username and password are hidden here. Find them in your node's configuration.
              </div>
            )}
          </div>
          {c.certUrl && (
            <a href={c.certUrl} className="inline-flex text-sm font-medium text-accent hover:underline" download>
              Download TLS certificate (rpc.cert)
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

function Peers({ s, now }: { s: Status; now: number }) {
  const list = s.peers.list;
  return (
    <Card title={`Peers (${list.length})`}>
      {list.length === 0 ? (
        <p className="text-sm text-ink-2">No peers connected yet.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-ink-3">
              <tr className="border-b border-line">
                <th className="px-5 py-2 font-medium sm:px-6">Software</th>
                <th className="px-3 py-2 font-medium">Direction</th>
                <th className="px-3 py-2 text-right font-medium">Height</th>
                <th className="px-3 py-2 text-right font-medium">Ping</th>
                <th className="px-5 py-2 text-right font-medium sm:px-6">Connected</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {list.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 sm:px-6">
                    <span className="text-ink">{fmtAgent(p.userAgent)}</span>
                    {p.encrypted && <span className="ml-2 text-xs text-ink-3" title="Encrypted connection (BIP324)">encrypted</span>}
                    {p.syncPeer && <span className="ml-2 text-xs text-accent">syncing from</span>}
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{p.inbound ? "Incoming" : "Outgoing"}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{p.height ? fmtInt(p.height) : "—"}</td>
                  <td className="px-3 py-2.5 text-right text-ink-2">{p.pingMs > 0 ? `${fmtInt(p.pingMs)} ms` : "—"}</td>
                  <td className="px-5 py-2.5 text-right text-ink-2 sm:px-6">{fmtDuration(now / 1000 - p.connSince)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
