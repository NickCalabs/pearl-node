package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"
)

// Only these RPC methods can ever be called. All are read-only.
var allowedMethods = map[string]bool{
	"getblockchaininfo": true,
	"getnetworkinfo":    true,
	"getmininginfo":     true,
	"getpeerinfo":       true,
	"getnettotals":      true,
	"getmempoolinfo":    true,
	"getblockheader":    true,
	"getblockhash":      true,
	"getblock":          true,
	"uptime":            true,
}

type rpcClient struct {
	url, user, pass string
	certPath        string

	mu     sync.Mutex
	client *http.Client
	pinned []byte // DER of the cert the current client trusts
}

func newRPCClient(url, user, pass, certPath string) *rpcClient {
	return &rpcClient{url: url, user: user, pass: pass, certPath: certPath}
}

// httpClient returns a client that trusts exactly the certificate in certPath.
// pearld's self-signed cert only names its own hostname and localhost, so we
// pin the cert instead of checking names. pearld can regenerate the cert (for
// example on a fresh data dir), so the file is re-read whenever it changes.
func (c *rpcClient) httpClient() (*http.Client, error) {
	pemBytes, err := os.ReadFile(c.certPath)
	if err != nil {
		return nil, fmt.Errorf("read rpc cert: %w", err)
	}
	block, _ := pem.Decode(pemBytes)
	if block == nil || block.Type != "CERTIFICATE" {
		return nil, errors.New("rpc cert: no PEM certificate found")
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.client != nil && bytes.Equal(c.pinned, block.Bytes) {
		return c.client, nil
	}
	want := block.Bytes
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			MinVersion:         tls.VersionTLS12,
			InsecureSkipVerify: true, // replaced by the exact-match check below
			VerifyPeerCertificate: func(raw [][]byte, _ [][]*x509.Certificate) error {
				if len(raw) == 0 || !bytes.Equal(raw[0], want) {
					return errors.New("pearld presented an unexpected TLS certificate")
				}
				return nil
			},
		},
		MaxIdleConns:    4,
		IdleConnTimeout: 90 * time.Second,
	}
	c.client = &http.Client{Transport: tr, Timeout: 15 * time.Second}
	c.pinned = want
	return c.client, nil
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *rpcError) Error() string { return fmt.Sprintf("rpc error %d: %s", e.Code, e.Message) }

// call runs one allowlisted RPC method and decodes its result into out.
func (c *rpcClient) call(ctx context.Context, method string, out any, params ...any) error {
	if !allowedMethods[method] {
		return fmt.Errorf("rpc method %q is not allowed", method)
	}
	hc, err := c.httpClient()
	if err != nil {
		return err
	}
	if params == nil {
		params = []any{}
	}
	body, _ := json.Marshal(map[string]any{"jsonrpc": "1.0", "id": method, "method": method, "params": params})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.user, c.pass)
	req.Header.Set("Content-Type", "application/json")

	resp, err := hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return errors.New("pearld rejected the RPC username/password")
	}
	var envelope struct {
		Result json.RawMessage `json:"result"`
		Error  *rpcError       `json:"error"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return fmt.Errorf("%s: HTTP %d: bad response", method, resp.StatusCode)
	}
	if envelope.Error != nil {
		return envelope.Error
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(envelope.Result, out)
}
