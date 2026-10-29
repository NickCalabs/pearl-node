# pearl-node

A [Pearl](https://github.com/pearl-research-labs/pearl) (PRL) full node for home servers, with a web
dashboard. Work in progress, not released.

It builds on what Pearl already ships: the node is the **official `pearld` Docker image**. This project
adds what's missing around it:

| Layer | Folder | What it is | Status |
|---|---|---|---|
| Node | [`pearld/`](pearld/) | Pin + checks for the official image `ghcr.io/pearl-research-labs/pearl/pearld` | done |
| Dashboard | `dashboard/` | Web UI: sync progress, peers, chain size, connection info. Read-only RPC. | next |
| Packaging | `umbrel/` | umbrelOS app (community store first, then the official store). | planned |

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

## CI

- [`check-image.yml`](.github/workflows/check-image.yml): runs `check-image.sh` on the pinned image for
  amd64 + arm64 whenever `pearld/` changes.
- [`upstream-watch.yml`](.github/workflows/upstream-watch.yml): every 6 h, if Pearl published a newer
  release and its image is on GHCR, it opens a PR pinning the new digest and runs the check on it.

## License

ISC, like upstream.
