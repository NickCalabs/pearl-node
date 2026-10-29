#!/usr/bin/env bash
# Checks the official pearld image the way we run it. Used by CI and locally.
#
#   pearld/test/check-image.sh [<image ref>] <amd64|arm64>
#
# The image ref defaults to the pin in pearld/image.
#
# Both arches: `pearld --version` matches the tag; pearld starts as uid 1000 with
#   HOME=/data (how our apps run it, since the image defaults to root) and creates
#   its database there.
# amd64 only: the binary has no "x86 ISA needed: v3/v4" marker and runs on an
#   emulated Nehalem CPU (x86-64-v2, no AVX/AVX2). Needs readelf and qemu-x86_64.
# arm64 on an x86 host needs binfmt/QEMU (docker/setup-qemu-action in CI).
set -euo pipefail

if [ $# -eq 1 ]; then
  ref=$(tr -d '[:space:]' < "$(dirname "$0")/../image"); arch=$1
else
  ref=$1; arch=$2
fi
fail() { echo "FAIL: $*" >&2; exit 1; }
SUDO=""; [ "$(id -u)" = 0 ] || SUDO=sudo   # test data is owned by uid 1000

tag=${ref##*:v}; tag=${tag%%@*}           # ...:v1.5.5@sha256:... -> 1.5.5
docker pull -q --platform "linux/$arch" "$ref" >/dev/null

tmp=$(mktemp -d)
cleanup() { docker rm -f "pearld-check-$$" >/dev/null 2>&1 || true; $SUDO rm -rf "$tmp"; }
trap cleanup EXIT

got=$(docker run --rm --platform "linux/$arch" "$ref" --version)
echo "version: $got (tag $tag)"
[[ "$got" == "pearld version $tag"* ]] || fail "version does not match tag"

# Non-root start: no peers, no RPC; just open the database and stop.
mkdir -p "$tmp/data" && $SUDO chown 1000:1000 "$tmp/data"
docker run -d --name "pearld-check-$$" --platform "linux/$arch" \
  --user 1000:1000 -e HOME=/data -v "$tmp/data:/data" \
  "$ref" --norpc --connect=127.0.0.1:1 >/dev/null
for _ in $(seq 1 60); do
  docker logs "pearld-check-$$" 2>&1 | grep -q "Block database loaded" && break
  [ "$(docker inspect -f '{{.State.Running}}' "pearld-check-$$")" = true ] || break
  sleep 2
done
docker logs "pearld-check-$$" 2>&1 | grep -q "Block database loaded" \
  || { docker logs --tail 20 "pearld-check-$$"; fail "pearld did not start as uid 1000"; }
echo "non-root start: ok"
docker rm -f "pearld-check-$$" >/dev/null

if [ "$arch" = amd64 ]; then
  cid=$(docker create --platform linux/amd64 "$ref")
  mkdir -p "$tmp/rootfs" && docker export "$cid" | tar -x -C "$tmp/rootfs"
  docker rm -v "$cid" >/dev/null

  note=$(readelf -n "$tmp/rootfs/usr/local/bin/pearld" | grep -i "x86 ISA needed" || true)
  echo "ISA note: ${note:-none}"
  if grep -qE "x86-64-v[34]" <<<"$note"; then fail "binary is marked as needing x86-64-v3 or v4"; fi

  out=$(qemu-x86_64 -cpu Nehalem -L "$tmp/rootfs" "$tmp/rootfs/usr/local/bin/pearld" --version 2>&1) \
    || fail "does not run on emulated Nehalem: $out"
  echo "Nehalem (no AVX2): $out"
fi

echo "OK: $ref ($arch)"
