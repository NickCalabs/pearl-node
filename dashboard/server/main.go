// pearl-dashboard serves a read-only web dashboard for a pearld node.
//
// Configuration (environment):
//
//	PEARLD_RPC_URL        https://pearld:44107
//	PEARLD_RPC_USER       RPC username (required)
//	PEARLD_RPC_PASS       RPC password (required)
//	PEARLD_RPC_CERT       path to pearld's rpc.cert (default /pearld/rpc.cert)
//	PEARLD_DATA_DIR       block data dir, for the chain size (default /pearld/data)
//	LISTEN                address to serve on (default :8080)
//	POLL_SECONDS          how often to ask pearld (default 5)
//	CONNECT_HOST          hostname wallets/miners should use, shown in the UI (optional)
//	P2P_PORT / RPC_PORT   ports shown in the UI (default 44108 / 44107)
//	SHOW_RPC_CREDENTIALS  "true" to show the RPC username/password in the UI.
//	                      Only enable this when the dashboard is behind a login
//	                      (for example Umbrel's app proxy).
package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

//go:embed all:web
var webFS embed.FS

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(key)); err == nil && v > 0 {
		return v
	}
	return def
}

func main() {
	user, pass := os.Getenv("PEARLD_RPC_USER"), os.Getenv("PEARLD_RPC_PASS")
	if user == "" || pass == "" {
		log.Fatal("PEARLD_RPC_USER and PEARLD_RPC_PASS must be set")
	}
	certPath := env("PEARLD_RPC_CERT", "/pearld/rpc.cert")

	connect := ConnectInfo{
		Host:    os.Getenv("CONNECT_HOST"),
		P2PPort: envInt("P2P_PORT", 44108),
		RPCPort: envInt("RPC_PORT", 44107),
		CertURL: "api/rpc.cert",
	}
	if os.Getenv("SHOW_RPC_CREDENTIALS") == "true" {
		connect.RPCUser, connect.RPCPass = user, pass
	}

	p := &poller{
		rpc:     newRPCClient(env("PEARLD_RPC_URL", "https://pearld:44107"), user, pass, certPath),
		dataDir: env("PEARLD_DATA_DIR", "/pearld/data"),
		connect: connect,
		every:   time.Duration(envInt("POLL_SECONDS", 5)) * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go p.run(ctx)

	static, err := fs.Sub(webFS, "web")
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(p.current())
	})
	// The cert is public (pearld sends it on every TLS connection). Wallets need
	// it to connect to the RPC port.
	mux.HandleFunc("GET /api/rpc.cert", func(w http.ResponseWriter, r *http.Request) {
		b, err := os.ReadFile(certPath)
		if err != nil {
			http.Error(w, "certificate not available yet", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/x-pem-file")
		w.Header().Set("Content-Disposition", `attachment; filename="pearld-rpc.cert"`)
		_, _ = w.Write(b)
	})
	// Umbrel home-screen widgets (no secrets; see widgets.go).
	mux.HandleFunc("GET /api/widget/sync", widgetHandler(p, syncWidgetFor))
	mux.HandleFunc("GET /api/widget/stats", widgetHandler(p, statsWidgetFor))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.Handle("GET /", spa(static))

	srv := &http.Server{
		Addr:              env("LISTEN", ":8080"),
		Handler:           securityHeaders(mux),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()
	log.Printf("pearl-dashboard listening on %s", srv.Addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

// spa serves the built web app, falling back to index.html for unknown paths.
func spa(static fs.FS) http.Handler {
	files := http.FileServerFS(static)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path[1:]
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(static, path); err != nil {
			r.URL.Path = "/"
		}
		// Vite puts content-hashed files in assets/; everything else may change.
		if strings.HasPrefix(path, "assets/") && r.URL.Path != "/" {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy",
			"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'self'")
		next.ServeHTTP(w, r)
	})
}
