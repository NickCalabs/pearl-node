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

## Performance

The hot code (ZK proof verification in Rust/plonky2, Go block validation) is baseline in the release
and x86-64-v2 in ours, so ours should be the same speed or slightly faster, not slower.
See the benchmark section below for measurements.
