#!/usr/bin/env bash
# Runs the browser checks against the built editor, with the network switched off for the whole run.
#   RTE_PLAYWRIGHT=<node_modules folder that has playwright> tools/browser-checks/run.sh
set -eu
: "${RTE_PLAYWRIGHT:?set RTE_PLAYWRIGHT}"
here=$(cd "$(dirname "$0")/../.." && pwd)
exec unshare -rn bash -c '
  set -eu
  ip link set lo up
  port_file=$(mktemp)
  node "$1/tools/conformance/serve.mjs" > "$port_file" &
  server=$!
  trap "kill $server 2>/dev/null || true; rm -f $port_file" EXIT
  while [ ! -s "$port_file" ]; do sleep 0.1; done
  RTE_PLAYWRIGHT="$2" node "$1/tools/browser-checks/run.mjs" "http://127.0.0.1:$(cat "$port_file")/conformance/"
' bash "$here" "$RTE_PLAYWRIGHT"
