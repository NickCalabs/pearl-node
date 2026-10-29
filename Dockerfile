# syntax=docker/dockerfile:1
#
# pearld + prlctl for umbrelOS.
# Based on upstream node/Dockerfile (alpine/musl, builds Go + Rust from source).
# Differences from upstream:
#   - amd64 is built for x86-64-v2, so it runs on CPUs without AVX2 (e.g. Celeron N3450).
#   - runs as a non-root user (uid/gid 1000) with data in /data/.pearld
#   - upstream source is fetched at a pinned tag and commit

ARG PEARL_VERSION=v1.5.5
ARG PEARL_COMMIT=d7c517d267f10f5bcbbdc366f3e603942f9a5ab5
# Upstream rust-toolchain.toml says channel = "stable", which would download whatever is current.
# Pin it so builds are repeatable. 1.99.1 is what built the v1.5.5 release.
ARG RUST_VERSION=1.99.1

FROM rust:${RUST_VERSION}-alpine AS rust-toolchain

# ===== Go + Rust + Task toolchain =====
FROM golang:1.26.6-alpine AS toolchain

RUN apk add --no-cache curl git build-base musl-dev openssl-dev pkgconfig

COPY --from=rust-toolchain /usr/local/cargo /usr/local/cargo
COPY --from=rust-toolchain /usr/local/rustup /usr/local/rustup
ARG RUST_VERSION
ENV PATH="/usr/local/cargo/bin:${PATH}" \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    RUSTUP_TOOLCHAIN=${RUST_VERSION}

RUN sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -b /usr/local/bin v3.46.4

# ===== Upstream source at a pinned commit =====
FROM toolchain AS source
ARG PEARL_VERSION
ARG PEARL_COMMIT
RUN git clone --depth 1 --branch "${PEARL_VERSION}" https://github.com/pearl-research-labs/pearl /app \
 && test "$(git -C /app rev-parse HEAD)" = "${PEARL_COMMIT}" \
 || { echo "upstream ${PEARL_VERSION} is not commit ${PEARL_COMMIT}"; exit 1; }

# ===== Build =====
FROM source AS builder
ARG TARGETARCH
WORKDIR /app

# CPU baseline. amd64: x86-64-v2 for every compiler (Rust, C, Go) and the linker.
# arm64: toolchain defaults (armv8-a).
RUN set -eu; \
    if [ "$TARGETARCH" = "amd64" ]; then \
      echo 'export RUSTFLAGS="-C target-cpu=x86-64-v2"'                  >  /cpuflags; \
      echo 'export CFLAGS="-O3 -march=x86-64-v2" CXXFLAGS="-O3 -march=x86-64-v2"' >> /cpuflags; \
      echo 'export GOAMD64=v2'                                            >> /cpuflags; \
    else \
      : > /cpuflags; \
    fi

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    . /cpuflags && task build:zk-gobind build:libxmss

# Stamp the commit into `pearld --version`, like upstream CI (not sent over P2P).
RUN --mount=type=cache,target=/root/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    . /cpuflags \
 && export GOFLAGS="-ldflags=-X=github.com/pearl-research-labs/pearl/version.Build=$(git rev-parse --short=7 HEAD)" \
 && task build:pearl && ./bin/pearld --version

# ===== Runtime =====
FROM alpine:3.24 AS runtime
ARG PEARL_VERSION

RUN apk add --no-cache ca-certificates libgcc libstdc++ \
 && addgroup -g 1000 pearl \
 && adduser -D -u 1000 -G pearl -h /data pearl

COPY --from=builder /app/bin/pearld /usr/local/bin/pearld
COPY --from=builder /app/bin/prlctl /usr/local/bin/prlctl
# pearld copies this next-to-the-binary file into a fresh data dir as pearld.conf,
# with a random rpcuser/rpcpass.
COPY --from=builder /app/node/sample-pearld.conf /usr/local/bin/sample-pearld.conf

# Pre-create the data dir so a new named volume inherits pearl:pearl ownership.
RUN mkdir -p /data/.pearld && chown -R pearl:pearl /data && chmod 700 /data/.pearld

LABEL org.opencontainers.image.title="pearld" \
      org.opencontainers.image.description="Pearl (PRL) full node, built for x86-64-v2 / arm64" \
      org.opencontainers.image.version="${PEARL_VERSION}" \
      org.opencontainers.image.licenses="ISC"

USER pearl
WORKDIR /data
VOLUME ["/data/.pearld"]

# 44108  mainnet P2P
# 44107  mainnet RPC (TLS)
EXPOSE 44108 44107

# Absolute path: pearld finds sample-pearld.conf relative to argv[0].
ENTRYPOINT ["/usr/local/bin/pearld"]
