#!/usr/bin/env bash
# Checks a built pearld image. Used by CI and for local builds.
#
#   pearld/test/check-image.sh <image> <amd64|arm64>
#
# amd64: binary has no "x86 ISA needed: v3" note, and runs on an emulated
#        Nehalem CPU (x86-64-v2, no AVX/AVX2). Needs readelf and qemu-x86_64.
# arm64: binary runs (under binfmt/QEMU on an x86 host).
# both:  runs as uid 1000, data dir is owned by it, version matches the label.
set -euo pipefail

image=$1
arch=$2
fail() { echo "FAIL: $*" >&2; exit 1; }
run() { docker run --rm --platform "linux/$arch" "$@"; }

want=$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$image")
got=$(run "$image" --version)
echo "version: $got (label $want)"
[[ "$got" == "pearld version ${want#v}"* ]] || fail "version does not match label"

[ "$(run --entrypoint id "$image" -u)" = 1000 ] || fail "not running as uid 1000"
[ "$(run --entrypoint stat "$image" -c %u /data/.pearld)" = 1000 ] || fail "/data/.pearld not owned by 1000"
run --entrypoint /usr/local/bin/prlctl "$image" --version >/dev/null || fail "prlctl does not run"

if [ "$arch" = amd64 ]; then
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  cid=$(docker create --platform linux/amd64 "$image")
  docker export "$cid" | tar -x -C "$tmp"
  docker rm -v "$cid" >/dev/null

  note=$(readelf -n "$tmp/usr/local/bin/pearld" | grep -i "x86 ISA needed" || true)
  echo "ISA note: ${note:-none}"
  if grep -qE "x86-64-v[34]" <<<"$note"; then fail "binary is marked as needing x86-64-v3 or v4"; fi

  out=$(qemu-x86_64 -cpu Nehalem -L "$tmp" "$tmp/usr/local/bin/pearld" --version 2>&1) \
    || fail "does not run on emulated Nehalem: $out"
  echo "Nehalem (no AVX2): $out"
fi

echo "OK: $image ($arch)"
