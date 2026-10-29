package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
)

// Umbrel home-screen widgets. umbreld fetches these directly from the
// container (not through app_proxy, without a login), so they must never
// contain secrets. Shapes follow umbrel's widget types
// (packages/ui/src/modules/widgets/shared/constants.ts); umbreld parses
// "refresh" with ms(), so it is a duration string.

type syncWidget struct {
	Type          string  `json:"type"`
	Refresh       string  `json:"refresh"`
	Link          string  `json:"link"`
	Title         string  `json:"title"`
	Text          string  `json:"text"`
	ProgressLabel string  `json:"progressLabel"`
	Progress      float64 `json:"progress"`
}

type statItem struct {
	Title   string `json:"title"`
	Text    string `json:"text"`
	Subtext string `json:"subtext"`
}

type statsWidget struct {
	Type    string     `json:"type"`
	Refresh string     `json:"refresh"`
	Link    string     `json:"link"`
	Items   []statItem `json:"items"`
}

func syncWidgetFor(s Status) syncWidget {
	w := syncWidget{Type: "text-with-progress", Refresh: "5s", Title: "Pearl sync"}
	switch {
	case !s.Reachable:
		w.Text, w.ProgressLabel = "Offline", "Node not responding"
	case s.Sync.Phase == "synced":
		w.Text, w.Progress = "Synced", 1
		w.ProgressLabel = "Block " + groupInt(s.Sync.Blocks)
	case s.Sync.Phase == "blocks":
		w.Progress = s.Sync.Progress
		w.Text = percent(s.Sync.Progress)
		if s.Sync.EtaSec != nil {
			w.ProgressLabel = "About " + duration(*s.Sync.EtaSec) + " left"
		} else {
			w.ProgressLabel = "Block " + groupInt(s.Sync.Blocks) + " of " + groupInt(s.Sync.NetworkHeight)
		}
	case s.Sync.Phase == "headers":
		w.Text, w.ProgressLabel = "Starting", "Downloading headers"
	default:
		w.Text, w.ProgressLabel = "Starting", "Finding peers"
	}
	return w
}

func statsWidgetFor(s Status) statsWidget {
	size, sizeUnit := splitUnit(float64(s.Chain.SizeBytes), []string{"B", "KB", "MB", "GB", "TB"})
	hash, hashUnit := "—", "H/s"
	if s.Chain.NetworkHashps > 0 {
		hash, hashUnit = splitUnit(s.Chain.NetworkHashps, []string{"H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"})
	}
	return statsWidget{
		Type: "four-stats", Refresh: "10s",
		Items: []statItem{
			{Title: "Connections", Text: fmt.Sprint(s.Peers.Total), Subtext: "peers"},
			{Title: "Block height", Text: compactInt(s.Sync.Blocks), Subtext: "blocks"},
			{Title: "Blockchain size", Text: size, Subtext: sizeUnit},
			{Title: "Hashrate", Text: hash, Subtext: hashUnit},
		},
	}
}

func widgetHandler[T any](p *poller, build func(Status) T) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(build(p.current()))
	}
}

// ---- small formatters (kept in sync with web/src/format.ts) ----

func splitUnit(v float64, units []string) (string, string) {
	i := 0
	for math.Abs(v) >= 1000 && i < len(units)-1 {
		v /= 1000
		i++
	}
	switch {
	case i == 0 || v >= 100:
		return fmt.Sprintf("%.0f", v), units[i]
	case v >= 10:
		return fmt.Sprintf("%.1f", v), units[i]
	default:
		return fmt.Sprintf("%.2f", v), units[i]
	}
}

func groupInt(n int64) string {
	s := fmt.Sprint(n)
	if n < 0 {
		return "-" + groupInt(-n)
	}
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

func compactInt(n int64) string {
	switch {
	case n >= 1_000_000:
		return fmt.Sprintf("%.1fM", float64(n)/1e6)
	case n >= 10_000:
		return fmt.Sprintf("%.1fK", float64(n)/1e3)
	default:
		return groupInt(n)
	}
}

func percent(p float64) string {
	// Round down, so it never shows 100% before the node is synced.
	v := math.Min(p*100, 99.99)
	if v < 10 {
		return fmt.Sprintf("%.2f%%", math.Floor(v*100)/100)
	}
	return fmt.Sprintf("%.1f%%", math.Floor(v*10)/10)
}

func duration(sec int64) string {
	d, h, m := sec/86400, sec%86400/3600, sec%3600/60
	switch {
	case d > 0:
		return fmt.Sprintf("%dd %dh", d, h)
	case h > 0:
		return fmt.Sprintf("%dh %dm", h, m)
	case m > 0:
		return fmt.Sprintf("%d min", m)
	default:
		return fmt.Sprintf("%d s", sec)
	}
}
