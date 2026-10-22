#!/usr/bin/env bash
# Runs a conformance suite against the editor, with the network switched off for the whole run.
#   RTE_CONFORMANCE_DIR=<package folder that holds conformance/run-conformance.js> RTE_PLAYWRIGHT=<node_modules with playwright> \
#     tools/conformance/run.sh <scenarios glob> <expected dir> [runner options]
# The runner and the editor page share a private network namespace that has only a loopback interface.
set -eu
: "${RTE_CONFORMANCE_DIR:?set RTE_CONFORMANCE_DIR}" "${RTE_PLAYWRIGHT:?set RTE_PLAYWRIGHT}"
here=$(cd "$(dirname "$0")/../.." && pwd)
scenarios=$1; expected=$2; shift 2
exec unshare -rn bash -c '
  set -eu
  ip link set lo up
  port_file=$(mktemp)
  node "$1/tools/conformance/serve.mjs" > "$port_file" &
  server=$!
  trap "kill $server 2>/dev/null || true; rm -f $port_file" EXIT
  while [ ! -s "$port_file" ]; do sleep 0.1; done
  cd "$2"
  RATHKIT_URL="http://127.0.0.1:$(cat "$port_file")/conformance/" NODE_PATH="$3" \
    node conformance/run-conformance.js --adapter conformance/adapters/rathkit/adapter.js --scenarios "$4" --expected "$5" "${@:6}"
' bash "$here" "$RTE_CONFORMANCE_DIR" "$RTE_PLAYWRIGHT" "$scenarios" "$expected" "$@"
