# pearl-node

A [Pearl](https://github.com/pearl-research-labs/pearl) (PRL) full node for home servers, with a web
dashboard. Work in progress, not released.

It builds on what Pearl already ships: the node is the **official `pearld` Docker image**. This project
adds what's missing around it:

| Layer | Folder | What it is | Status |
|---|---|---|---|
| Node | [`pearld/`](pearld/) | Pin + checks for the official image `ghcr.io/pearl-research-labs/pearl/pearld` | done |
| Dashboard | [`dashboard/`](dashboard/) | Web UI (`ghcr.io/nickcalabs/pearl-dashboard`): sync progress, peers, latest blocks, connection info. Read-only RPC. | working, design TBD |
| Packaging | [`pearl-node/`](pearl-node/) + [`umbrel-app-store.yml`](umbrel-app-store.yml) | umbrelOS community app store (`pearl`) with the `pearl-node` app | passes Umbrel's linter; not yet installed on a real Umbrel |

## Node image

[`pearld/image`](pearld/image) pins the official image by digest. That file is the single source of truth.

The image covers amd64 + arm64 and also runs on CPUs **without AVX2** (Celeron/Pentium/Atom such as the
N3450), unlike the official release tarball. See [docs/cpu-compat.md](docs/cpu-compat.md).

It defaults to root with data in `/root/.pearld`. We run it as uid 1000 instead:

```sh
mkdir -p data && sudo chown 1000:1000 data
docker run -d --name pearld --user 1000:1000 -e HOME=/data -v "$PWD/data:/data" \
  -p 44108:44108 "$(cat pearld/image)"
```

Data then lives in `data/.pearld`. Ports: 44108 P2P, 44107 RPC (TLS, self-signed `rpc.cert`).

Check an image (needs Docker, plus `readelf` and `qemu-x86_64` for amd64):

```sh
pearld/test/check-image.sh amd64        # the pinned image
pearld/test/check-image.sh <ref> arm64  # any other image
```

## Umbrel

This repo is also an Umbrel community app store. Once it's public, add its URL in umbrelOS under
App Store → Community App Stores, then install **Pearl Node**.

The app runs pearld plus the dashboard (behind Umbrel's login on port 4108), publishes P2P 44108 and RPC
44107, and derives its RPC password from Umbrel's per-install seed. Blockchain data is excluded from
Umbrel backups.

## Development

```sh
dev/up.sh   # official pearld + dashboard; dashboard on http://localhost:8083
```

## CI

- [`check-image.yml`](.github/workflows/check-image.yml): runs `check-image.sh` on the pinned image for
  amd64 + arm64 whenever `pearld/` changes.
- [`dashboard-image.yml`](.github/workflows/dashboard-image.yml): builds the dashboard for amd64 + arm64
  (natively, no emulation) and publishes it on `main`.
- [`upstream-watch.yml`](.github/workflows/upstream-watch.yml): every 6 h, if Pearl published a newer
  release and its image is on GHCR, it opens a PR pinning the new digest and runs the check on it.

## License

ISC, like upstream.
