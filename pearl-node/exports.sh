# Contract for apps that depend on pearl-node (for example a future miner app).
# Read-only consumers should mount APP_PEARL_NODE_DATA_DIR read-only.
export APP_PEARL_NODE_HOST="pearl-node_pearld_1"
export APP_PEARL_NODE_RPC_PORT="44107"
export APP_PEARL_NODE_P2P_PORT="44108"
export APP_PEARL_NODE_RPC_USER="pearl"
export APP_PEARL_NODE_RPC_PASS="$(derive_entropy "${app_entropy_identifier}-rpc-pass")"
export APP_PEARL_NODE_NETWORK="mainnet"
# pearld runs with HOME=/data, so its files live in .pearld below this.
export APP_PEARL_NODE_DATA_DIR="${EXPORTS_APP_DATA_DIR}/pearld"
