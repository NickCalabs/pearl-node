# syntax=docker/dockerfile:1
# pearl-dashboard: a single static Go binary with the web app embedded.
# Both build stages run on the build machine's own CPU ($BUILDPLATFORM): the web
# build is CPU-independent and Go cross-compiles, so arm64 needs no emulation.

FROM --platform=$BUILDPLATFORM node:24-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json web/.npmrc ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.26.6-alpine AS server
ARG TARGETOS TARGETARCH
WORKDIR /src/server
COPY server/go.mod ./
COPY server/*.go ./
COPY --from=web /src/server/web ./web
RUN go vet ./... && go test ./...
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /out/pearl-dashboard .

FROM scratch
COPY --from=server /out/pearl-dashboard /pearl-dashboard
LABEL org.opencontainers.image.title="pearl-dashboard" \
      org.opencontainers.image.description="Read-only web dashboard for a Pearl (PRL) full node" \
      org.opencontainers.image.licenses="ISC" \
      org.opencontainers.image.source="https://github.com/NickCalabs/pearl-node"
# Same uid as pearld, so it can read the node's rpc.cert and data dir.
USER 1000:1000
EXPOSE 8080
ENTRYPOINT ["/pearl-dashboard"]
