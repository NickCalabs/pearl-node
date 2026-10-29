# CPU compatibility: the release binary needs AVX2, the official Docker image doesn't

## Summary

| Official artifact (v1.5.5) | Runs on CPUs without AVX2 (e.g. Celeron N3450)? |
|---|---|
| Release tarball `pearl-linux-amd64-v1.5.5.tar.gz` | **No**: `CPU ISA level is lower than required` |
| Docker image `ghcr.io/pearl-research-labs/pearl/pearld:v1.5.5` | **Yes** (see "Verification") |

That is why this project uses the official Docker image.

## Why the release binary fails

The glibc dynamic loader refuses to start the release `pearld` because of its `.note.gnu.property`:

```
$ readelf -n pearld
  Properties: x86 ISA needed: x86-64-baseline, x86-64-v2, x86-64-v3
```

The marker comes from the **build machine, not from Pearl's code**. The binary's `.comment` shows
`GCC (Ubuntu 15.2.0-16ubuntu1)` (Ubuntu 26.04), which is GitHub's `ubuntu-latest` runner used by upstream's
`blockchain_build.yml`. With Ubuntu's **amd64v3 package variant** installed, glibc's `crt1.o` startup object
carries the v3 marker, and the linker copies it into every program linked on that machine:

| Toolchain | `int main(){}` gets marked |
|---|---|
| Ubuntu 24.04, GCC 13 | x86-64-baseline |
| Ubuntu 26.04, GCC 15.2, default packages | x86-64-baseline |
| Ubuntu 26.04, GCC 15.2, `APT::Architecture-Variants "amd64v3"` | **x86-64-baseline, v2, v3** (same as the release) |

We could not see the runner's apt config. The evidence is strong but indirect: the exact GCC build matches,
and nothing else carries the marker:

- Upstream v1.5.5 sets no `-march`, `target-cpu`, `RUSTFLAGS`, `GOAMD64` or CGO CPU flags.
- The release binary reports `GOAMD64=v1`; Rust's default `x86_64-unknown-linux-gnu` target is baseline.
- plonky2's AVX2/AVX-512 code is gated by compile-time `cfg(target_feature = "avx2")`, so it's left out of a
  default build. blake3's AVX2 kernels are chosen at runtime with CPUID.
- The C parts (`blake3`, `tikv-jemalloc-sys`, xmss) and Ubuntu 26.04's static libs carry no marker.
- Rebuilding v1.5.5 on stock Ubuntu 24.04 gives a binary marked `x86-64-baseline`.

The release binary also needs glibc ≥ 2.39, so it won't run on older distros either.

**Possible upstream fix:** build the release binaries on `ubuntu-24.04`, or without the amd64v3 variant.

## Why the official Docker image works

Upstream's `node/Dockerfile` builds inside `golang:*-alpine` with Rust from `rust:*-alpine`. musl's startup
files carry no ISA marker, and none of the compilers target above baseline. The build host's glibc never
enters the picture.

## Verification (2026-10-29)

`pearld/test/check-image.sh` runs these on every pinned image in CI:

- `readelf -n pearld`: no ISA marker.
- `pearld --version` under QEMU user-mode `-cpu Nehalem` (SSE4.2, no AVX/AVX2): runs. The release
  binary fails the same test with the error seen on real N3450 hardware.
- Starts as uid 1000 with `HOME=/data` (the image defaults to root).

One-off sync test: the official image synced mainnet and verified 2,395 blocks, ZK proofs included,
on an emulated Nehalem CPU as uid 1000, with no illegal-instruction crash.
