package main

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Status is what /api/status returns. Peer IP addresses are deliberately left
// out, so screenshots of the dashboard are safe to share.
type Status struct {
	UpdatedAt time.Time `json:"updatedAt"`
	Reachable bool      `json:"reachable"`
	Error     string    `json:"error,omitempty"`

	Node    NodeInfo    `json:"node"`
	Sync    SyncInfo    `json:"sync"`
	Chain   ChainInfo   `json:"chain"`
	Peers   PeersInfo   `json:"peers"`
	Traffic TrafficInfo `json:"traffic"`
	Connect ConnectInfo `json:"connect"`
}

type NodeInfo struct {
	Version   string `json:"version"`   // e.g. "1.5.5"
	UserAgent string `json:"userAgent"` // e.g. "/pearlwire:0.5.0/pearld:1.5.5/"
	Network   string `json:"network"`
	UptimeSec int64  `json:"uptimeSec"`
}

type SyncInfo struct {
	// "connecting" (no peers yet), "headers", "blocks" or "synced"
	Phase         string    `json:"phase"`
	Blocks        int64     `json:"blocks"`
	Headers       int64     `json:"headers"`
	NetworkHeight int64     `json:"networkHeight"` // highest height reported by peers
	Progress      float64   `json:"progress"`      // 0..1, blocks / networkHeight
	TipTime       time.Time `json:"tipTime"`
	BlocksPerMin  float64   `json:"blocksPerMin"` // over the last few minutes
	EtaSec        *int64    `json:"etaSec"`       // nil if unknown
}

type ChainInfo struct {
	Difficulty    float64 `json:"difficulty"`
	NetworkHashps float64 `json:"networkHashps"`
	SizeBytes     int64   `json:"sizeBytes"` // block database on disk
	Pruned        bool    `json:"pruned"`
	MempoolTxs    int64   `json:"mempoolTxs"`
	MempoolBytes  int64   `json:"mempoolBytes"`
	BestBlockHash string  `json:"bestBlockHash"`
}

type PeersInfo struct {
	Total    int    `json:"total"`
	Inbound  int    `json:"inbound"`
	Outbound int    `json:"outbound"`
	List     []Peer `json:"list"`
}

type Peer struct {
	ID        int64   `json:"id"`
	Inbound   bool    `json:"inbound"`
	UserAgent string  `json:"userAgent"`
	Height    int64   `json:"height"`
	PingMs    float64 `json:"pingMs"`
	ConnSince int64   `json:"connSince"` // unix seconds
	BytesSent int64   `json:"bytesSent"`
	BytesRecv int64   `json:"bytesRecv"`
	Encrypted bool    `json:"encrypted"` // BIP324 v2 transport
	SyncPeer  bool    `json:"syncPeer"`
}

type TrafficInfo struct {
	RecvBytes int64 `json:"recvBytes"`
	SentBytes int64 `json:"sentBytes"`
}

// ConnectInfo tells wallets and miners how to reach this node.
type ConnectInfo struct {
	Host    string `json:"host,omitempty"`
	P2PPort int    `json:"p2pPort"`
	RPCPort int    `json:"rpcPort"`
	RPCUser string `json:"rpcUser,omitempty"` // only if SHOW_RPC_CREDENTIALS=true
	RPCPass string `json:"rpcPass,omitempty"`
	CertURL string `json:"certUrl,omitempty"`
}

type heightSample struct {
	at     time.Time
	blocks int64
}

type poller struct {
	rpc     *rpcClient
	dataDir string
	connect ConnectInfo
	every   time.Duration

	mu      sync.RWMutex
	status  Status
	samples []heightSample

	sizeMu sync.Mutex
	size   int64
	sizeAt time.Time
}

func (p *poller) current() Status {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.status
}

func (p *poller) run(ctx context.Context) {
	t := time.NewTicker(p.every)
	defer t.Stop()
	for {
		p.refresh(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// Raw RPC results we use. Field names follow pearld's JSON.
type (
	chainInfoRes struct {
		Chain         string  `json:"chain"`
		Blocks        int64   `json:"blocks"`
		Headers       int64   `json:"headers"`
		BestBlockHash string  `json:"bestblockhash"`
		Difficulty    float64 `json:"difficulty"`
		Pruned        bool    `json:"pruned"`
	}
	networkInfoRes struct {
		Version    int64  `json:"version"`
		Subversion string `json:"subversion"`
	}
	miningInfoRes struct {
		NetworkHashps float64 `json:"networkhashps"`
	}
	peerRes struct {
		ID             int64   `json:"id"`
		Inbound        bool    `json:"inbound"`
		Subver         string  `json:"subver"`
		CurrentHeight  int64   `json:"currentheight"`
		StartingHeight int64   `json:"startingheight"`
		PingTime       float64 `json:"pingtime"` // microseconds
		ConnTime       int64   `json:"conntime"`
		BytesSent      int64   `json:"bytessent"`
		BytesRecv      int64   `json:"bytesrecv"`
		V2             bool    `json:"v2_connection"`
		SyncNode       bool    `json:"syncnode"`
	}
	netTotalsRes struct {
		Recv int64 `json:"totalbytesrecv"`
		Sent int64 `json:"totalbytessent"`
	}
	mempoolRes struct {
		Size  int64 `json:"size"`
		Bytes int64 `json:"bytes"`
	}
	headerRes struct {
		Time int64 `json:"time"`
	}
)

func (p *poller) refresh(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	now := time.Now().UTC()
	st := Status{UpdatedAt: now, Connect: p.connect}

	var ci chainInfoRes
	if err := p.rpc.call(ctx, "getblockchaininfo", &ci); err != nil {
		st.Error = err.Error()
		p.mu.Lock()
		// Keep the last good data on screen, but mark the node unreachable.
		prev := p.status
		prev.Reachable, prev.Error, prev.UpdatedAt = false, st.Error, now
		p.status = prev
		p.mu.Unlock()
		log.Printf("pearld unreachable: %v", err)
		return
	}
	st.Reachable = true

	// The rest is best effort: one failing call shouldn't blank the page.
	var ni networkInfoRes
	var mi miningInfoRes
	var peers []peerRes
	var nt netTotalsRes
	var mp mempoolRes
	var up int64
	var hdr headerRes
	try := func(method string, out any, params ...any) {
		if err := p.rpc.call(ctx, method, out, params...); err != nil {
			log.Printf("%s: %v", method, err)
		}
	}
	try("getnetworkinfo", &ni)
	try("getmininginfo", &mi)
	try("getpeerinfo", &peers)
	try("getnettotals", &nt)
	try("getmempoolinfo", &mp)
	try("uptime", &up)
	try("getblockheader", &hdr, ci.BestBlockHash, true)

	st.Node = NodeInfo{
		Version:   versionString(ni.Version),
		UserAgent: ni.Subversion,
		Network:   ci.Chain,
		UptimeSec: up,
	}
	st.Chain = ChainInfo{
		Difficulty:    ci.Difficulty,
		NetworkHashps: mi.NetworkHashps,
		SizeBytes:     p.chainSize(),
		Pruned:        ci.Pruned,
		MempoolTxs:    mp.Size,
		MempoolBytes:  mp.Bytes,
		BestBlockHash: ci.BestBlockHash,
	}
	st.Traffic = TrafficInfo{RecvBytes: nt.Recv, SentBytes: nt.Sent}

	var netHeight int64
	st.Peers.List = make([]Peer, 0, len(peers))
	for _, pr := range peers {
		h := max(pr.CurrentHeight, pr.StartingHeight)
		netHeight = max(netHeight, h)
		if pr.Inbound {
			st.Peers.Inbound++
		} else {
			st.Peers.Outbound++
		}
		st.Peers.List = append(st.Peers.List, Peer{
			ID: pr.ID, Inbound: pr.Inbound, UserAgent: pr.Subver, Height: h,
			PingMs: pr.PingTime / 1000, ConnSince: pr.ConnTime,
			BytesSent: pr.BytesSent, BytesRecv: pr.BytesRecv,
			Encrypted: pr.V2, SyncPeer: pr.SyncNode,
		})
	}
	st.Peers.Total = len(peers)
	sort.Slice(st.Peers.List, func(i, j int) bool { return st.Peers.List[i].ConnSince < st.Peers.List[j].ConnSince })

	st.Sync = p.syncInfo(now, ci, netHeight, hdr.Time, st.Peers.Total)

	p.mu.Lock()
	p.status = st
	p.mu.Unlock()
}

func (p *poller) syncInfo(now time.Time, ci chainInfoRes, netHeight, tipUnix int64, peerCount int) SyncInfo {
	s := SyncInfo{Blocks: ci.Blocks, Headers: ci.Headers}
	if tipUnix > 0 {
		s.TipTime = time.Unix(tipUnix, 0).UTC()
	}
	// Peers can lag or lie a little; never report a target below what we have.
	s.NetworkHeight = max(netHeight, ci.Headers, ci.Blocks)

	// Block rate over a sliding 5-minute window.
	p.mu.Lock()
	p.samples = append(p.samples, heightSample{now, ci.Blocks})
	cut := 0
	for cut < len(p.samples)-1 && now.Sub(p.samples[cut].at) > 5*time.Minute {
		cut++
	}
	p.samples = p.samples[cut:]
	first := p.samples[0]
	p.mu.Unlock()
	if dt := now.Sub(first.at).Minutes(); dt >= 0.5 && ci.Blocks > first.blocks {
		s.BlocksPerMin = float64(ci.Blocks-first.blocks) / dt
	}

	if s.NetworkHeight > 0 {
		s.Progress = min(1, float64(ci.Blocks)/float64(s.NetworkHeight))
	}
	behind := s.NetworkHeight - ci.Blocks
	switch {
	case peerCount == 0 && behind > 2:
		s.Phase = "connecting"
	case behind <= 2:
		s.Phase = "synced"
		s.Progress = 1
	case ci.Blocks == 0:
		// Before the first block. pearld fetches headers in checkpoint-sized
		// batches and only reports them when a batch is done, so there is no
		// reliable percentage for this phase.
		s.Phase = "headers"
	default:
		s.Phase = "blocks"
	}
	if s.Phase == "blocks" && s.BlocksPerMin > 0 {
		eta := int64(float64(behind) / s.BlocksPerMin * 60)
		s.EtaSec = &eta
	}
	return s
}

// chainSize measures the block database on disk, at most once a minute.
func (p *poller) chainSize() int64 {
	p.sizeMu.Lock()
	defer p.sizeMu.Unlock()
	if p.dataDir == "" || time.Since(p.sizeAt) < time.Minute {
		return p.size
	}
	var total int64
	_ = filepath.WalkDir(p.dataDir, func(_ string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries
		}
		if !d.IsDir() {
			if info, err := d.Info(); err == nil {
				total += info.Size()
			}
		}
		return nil
	})
	p.size, p.sizeAt = total, time.Now()
	return total
}

// versionString turns pearld's 1050500 into "1.5.5".
func versionString(v int64) string {
	if v <= 0 {
		return ""
	}
	return fmt.Sprintf("%d.%d.%d", v/1000000, v/10000%100, v/100%100)
}
