# umbrel-pearl

Pearl (PRL) full-node app for umbrelOS. Work in progress, not released.

See BRIEF.md for goals and status.

## pearld image

`Dockerfile` builds `pearld` and `prlctl` from upstream source
([pearl-research-labs/pearl](https://github.com/pearl-research-labs/pearl), pinned tag + commit)
on alpine/musl, for:

- **linux/amd64** at **x86-64-v2**: runs on CPUs without AVX2 (Celeron/Pentium/Atom such as the N3450,
  where the official release binary fails with `CPU ISA level is lower than required`).
  See [docs/cpu-compat.md](docs/cpu-compat.md) for why.
- **linux/arm64** (armv8-a, e.g. Raspberry Pi 4/5). Not built or tested yet; comes with CI.

It runs as uid/gid 1000 and keeps its data in `/data/.pearld`. Ports: 44108 P2P, 44107 RPC (TLS).

```sh
docker buildx build --platform linux/amd64 --load -t pearld:local .
docker run -d --name pearld -v pearld-data:/data/.pearld -p 44108:44108 pearld:local
```

Build args: `PEARL_VERSION` (tag), `PEARL_COMMIT` (must match the tag), `RUST_VERSION`.
