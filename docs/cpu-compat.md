# CPU compatibility: why the release `pearld` needs AVX2, and why ours doesn't

## Symptom

The official `pearld` v1.5.5 release binary (`pearl-linux-amd64-v1.5.5.tar.gz`) refuses to start on
CPUs without AVX2, for example the Intel Celeron N3450 found in many small home servers:

```
CPU ISA level is lower than required
```

The glibc dynamic loader prints this message. It reads the binary's `.note.gnu.property` section:

```
$ readelf -n pearld
  Properties: x86 ISA needed: x86-64-baseline, x86-64-v2, x86-64-v3
```

## Cause: the build machine, not Pearl's code

The binary's `.comment` section shows it was built with `GCC (Ubuntu 15.2.0-16ubuntu1)` (Ubuntu 26.04)
and `rustc 1.99.1`. This is GitHub's `ubuntu-latest` runner used by upstream `blockchain_build.yml`.

Ubuntu 25.10 and later can install an **amd64v3 package variant**: glibc and other packages rebuilt
for x86-64-v3. With that variant installed, glibc's `crt1.o` startup object carries an
"ISA needed: v3" note, and the linker copies it into **every** program linked on that machine:

| Toolchain | `int main(){}` gets marked |
|---|---|
| Ubuntu 24.04, GCC 13 | x86-64-baseline |
| Ubuntu 26.04, GCC 15.2, default packages | x86-64-baseline |
| Ubuntu 26.04, GCC 15.2, `APT::Architecture-Variants "amd64v3"` | **x86-64-baseline, v2, v3** (same as the release) |

We did not see the runner's apt config. The evidence is strong but indirect: the exact GCC build
matches, and no other input we checked carries the note. These inputs were checked:

- Upstream v1.5.5 sets no `-march`, `target-cpu`, `RUSTFLAGS`, `GOAMD64` or CGO CPU flags anywhere.
- The release binary itself has `GOAMD64=v1` in its Go build info. Rust's default
  `x86_64-unknown-linux-gnu` target is baseline (fxsr, sse, sse2).
- plonky2's AVX2/AVX-512 code (`poseidon_goldilocks_avx2_bmi2.rs`, packed Goldilocks field) is gated by
  compile-time `cfg(target_feature = "avx2")`, so a default build leaves it out.
- The only C code in the Rust tree comes from the `blake3` and `tikv-jemalloc-sys` crates. Neither
  produces an ISA note (checked on Ubuntu 24.04 and 26.04). blake3's AVX2/AVX-512 kernels are picked at
  runtime with CPUID.
- Ubuntu 26.04 `libgcc.a`, `libgcc_eh.a`, `libstdc++.a`, `libc_nonshared.a` and `libm.a` carry no v3 notes.
- Rebuilding upstream v1.5.5 on stock Ubuntu 24.04 gives a binary marked `x86-64-baseline`.

So the release binary's **code** is baseline x86-64 (apart from blake3's runtime-dispatched kernels).
Only its marker, plus whatever glibc v3 startup code got linked in, demands AVX2.

## Fix in this image

- Build on alpine/musl like upstream `node/Dockerfile`. musl's startup files carry no ISA note, and the
  image does not depend on the host's glibc (that also avoids the glibc 2.39 trap).
- On amd64, set the CPU level explicitly to **x86-64-v2** for every compiler: `RUSTFLAGS=-C target-cpu=x86-64-v2`,
  `CFLAGS/CXXFLAGS=-march=x86-64-v2`, `GOAMD64=v2`. x86-64-v2 (SSE4.2, POPCNT) covers every
  64-bit Intel/AMD CPU since about 2009, including Atom/Celeron Goldmont (N3450, J4105, N4020…).
- arm64 uses the toolchain defaults (armv8-a).

## Verification (2026-10-29, image built from v1.5.5)

- `readelf -n pearld`: no `.note.gnu.property` ISA note. Go build info: `GOAMD64=v2`.
- Under QEMU user-mode `-cpu Nehalem` (SSE4.2, no AVX/AVX2):
  - release binary: `CPU ISA level is lower than required` (same as on an N3450)
  - our binary: synced from mainnet and fully verified 5,382 blocks, ZK proofs included,
    with no illegal-instruction crash.
- Native run: connects to mainnet peers via the DNS seeds and syncs normally.

## Performance

The hot code (ZK proof verification in Rust/plonky2, Go block validation) is baseline x86-64 in the
release and x86-64-v2 in ours, so the CPU level does not slow us down.

Measured: fresh sync from mainnet peers, genesis to height 10,000, `--cpus=2`, same host (Intel
i5-1235U), runs alternated:

| Run | Release v1.5.5 (glibc, Ubuntu 24.04 container) | Ours (alpine/musl, x86-64-v2) |
|---|---|---|
| 1 | 303 s | 311 s |
| 2 | 277 s | 289 s |

Ours is about **3–4 % slower**. Because the CPU level can only help, the likely cause is musl vs glibc
(libc routines, malloc in the C parts, cgo thread handling). For a full ~1 h 35 min sync that is about
4 extra minutes, which is acceptable. A Debian/glibc-based runtime image is an option if it ever matters.
Note: ours always ran second in each pair. Peer/network variance between runs (~25 s) is bigger
than the gap, so treat the gap as approximate.
