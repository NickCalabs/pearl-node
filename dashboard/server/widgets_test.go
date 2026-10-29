package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestFormatters(t *testing.T) {
	cases := []struct{ got, want string }{
		{groupInt(135561), "135,561"},
		{groupInt(999), "999"},
		{compactInt(135561), "135.6K"},
		{compactInt(4200), "4,200"},
		{percent(0.3831), "38.3%"},
		{percent(0.0512), "5.12%"},
		{percent(0.9996), "99.9%"}, // rounds down: never 100% before synced
		{percent(1), "99.9%"},
		{duration(3720), "1h 2m"},
		{duration(90061), "1d 1h"},
	}
	for _, c := range cases {
		if c.got != c.want {
			t.Errorf("got %q, want %q", c.got, c.want)
		}
	}
	if v, u := splitUnit(10.7e9, []string{"B", "KB", "MB", "GB"}); v != "10.7" || u != "GB" {
		t.Errorf("splitUnit = %s %s", v, u)
	}
	if v, u := splitUnit(2.62e18, []string{"H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s"}); v != "2.62" || u != "EH/s" {
		t.Errorf("hashrate = %s %s", v, u)
	}
}

func TestSyncWidget(t *testing.T) {
	eta := int64(3720)
	syncing := Status{Reachable: true, Sync: SyncInfo{Phase: "blocks", Blocks: 51912, NetworkHeight: 135506, Progress: 0.383, EtaSec: &eta}}
	w := syncWidgetFor(syncing)
	if w.Type != "text-with-progress" || w.Text != "38.3%" || w.ProgressLabel != "About 1h 2m left" || w.Refresh != "5s" {
		t.Errorf("syncing widget = %+v", w)
	}
	synced := Status{Reachable: true, Sync: SyncInfo{Phase: "synced", Blocks: 135561, Progress: 1}}
	if w := syncWidgetFor(synced); w.Text != "Synced" || w.Progress != 1 || w.ProgressLabel != "Block 135,561" {
		t.Errorf("synced widget = %+v", w)
	}
	if w := syncWidgetFor(Status{}); w.Text != "Offline" {
		t.Errorf("offline widget = %+v", w)
	}
}

func TestStatsWidgetHasFourItemsAndNoSecrets(t *testing.T) {
	s := Status{Reachable: true, Connect: ConnectInfo{RPCUser: "pearl", RPCPass: "secret-pass"}}
	b, _ := json.Marshal(statsWidgetFor(s))
	if strings.Contains(string(b), "secret-pass") {
		t.Fatal("stats widget leaks the RPC password")
	}
	var w statsWidget
	_ = json.Unmarshal(b, &w)
	if w.Type != "four-stats" || len(w.Items) != 4 {
		t.Fatalf("stats widget = %s", b)
	}
	b, _ = json.Marshal(syncWidgetFor(s))
	if strings.Contains(string(b), "secret-pass") {
		t.Fatal("sync widget leaks the RPC password")
	}
}
