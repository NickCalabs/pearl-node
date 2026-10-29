# pearl-node

A [Pearl](https://github.com/pearl-research-labs/pearl) (PRL) full node in a container, with a web
dashboard, packaged for home servers. Work in progress, not released.

Three layers, each usable without the ones above it:

| Layer | Folder | What it is | Status |
|---|---|---|---|
| Node image | [`pearld/`](pearld/) | `pearld` + `prlctl` Docker image, amd64 + arm64. Runs anywhere Docker runs. | working (amd64 tested) |
| Dashboard | `dashboard/` | Web UI: sync progress, peers, chain size, connection info. Read-only RPC. | planned |
| Packaging | `umbrel/` | umbrelOS app (community store first, then the official store). | planned |

## Node image

`ghcr.io/nickcalabs/pearld` is built from upstream source (pinned tag + commit) on alpine/musl:

- **linux/amd64** at **x86-64-v2**: runs on CPUs without AVX2 (Celeron/Pentium/Atom such as the N3450,
  where the official release binary fails with `CPU ISA level is lower than required`).
  See [docs/cpu-compat.md](docs/cpu-compat.md) for why.
- **linux/arm64** (armv8-a, e.g. Raspberry Pi 4/5), built in CI under emulation.

It runs as uid/gid 1000 and keeps its data in `/data/.pearld`. Ports: 44108 P2P, 44107 RPC (TLS).

```sh
docker run -d --name pearld -v pearld-data:/data/.pearld -p 44108:44108 ghcr.io/nickcalabs/pearld:v1.5.5
```

Build and check it yourself:

```sh
docker buildx build --platform linux/amd64 --load -t pearld:local pearld
pearld/test/check-image.sh pearld:local amd64   # needs readelf + qemu-x86_64
```

Build args: `PEARL_VERSION` (tag), `PEARL_COMMIT` (must match the tag), `RUST_VERSION`.

## CI

- [`pearld-image.yml`](.github/workflows/pearld-image.yml): builds amd64 + arm64, runs
  `check-image.sh` (no v3 ISA marker, runs on an emulated Nehalem CPU, uid 1000), and on `main` publishes
  one multi-arch image tagged `vX.Y.Z`, `sha-<commit>` and `latest`. The run summary shows the digest
  to pin.
- [`upstream-watch.yml`](.github/workflows/upstream-watch.yml): every 6 h, if upstream has a newer
  release, it opens a PR bumping `PEARL_VERSION`/`PEARL_COMMIT` and builds it. Merging publishes the image.

## License

ISC, like upstream.
