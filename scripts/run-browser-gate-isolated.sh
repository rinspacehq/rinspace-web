#!/usr/bin/env bash
set -euo pipefail

# The browser and its local preview share a loopback-only network namespace.
# Host Docker interface churn must not abort artifact requests with
# ERR_NETWORK_CHANGED. Run as the existing unprivileged build account.
exec unshare --user --map-root-user --net sh -eu -c '
  ip link set lo up
  exec "$@"
' rinspace-browser-gate "$@"
