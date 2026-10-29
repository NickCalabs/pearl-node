// Mirrors dashboard/server/status.go.
export type Phase = "connecting" | "headers" | "blocks" | "synced";

export interface Peer {
  id: number;
  inbound: boolean;
  userAgent: string;
  height: number;
  pingMs: number;
  connSince: number;
  bytesSent: number;
  bytesRecv: number;
  encrypted: boolean;
  syncPeer: boolean;
}

export interface Status {
  updatedAt: string;
  reachable: boolean;
  error?: string;
  node: { version: string; userAgent: string; network: string; uptimeSec: number };
  sync: {
    phase: Phase;
    blocks: number;
    headers: number;
    networkHeight: number;
    progress: number;
    tipTime: string;
    blocksPerMin: number;
    etaSec: number | null;
  };
  chain: {
    difficulty: number;
    networkHashps: number;
    sizeBytes: number;
    pruned: boolean;
    mempoolTxs: number;
    mempoolBytes: number;
    bestBlockHash: string;
  };
  peers: { total: number; inbound: number; outbound: number; list: Peer[] };
  traffic: { recvBytes: number; sentBytes: number };
  connect: {
    host?: string;
    p2pPort: number;
    rpcPort: number;
    rpcUser?: string;
    rpcPass?: string;
    certUrl?: string;
  };
}
