#!/usr/bin/env bash
# Runs the leak test against the built editor, with the network switched off.
#   RTE_PLAYWRIGHT=<node_modules folder that has playwright> tools/leak/run.sh [--quick]
set -eu
: "${RTE_PLAYWRIGHT:?set RTE_PLAYWRIGHT}"
here=$(cd "$(dirname "$0")/../.." && pwd)
exec unshare -rn bash -c '
  set -eu
  root=$1
  ip link set lo up
  port_file=$(mktemp)
  node "$root/tools/conformance/serve.mjs" > "$port_file" &
  server=$!
  trap "kill $server 2>/dev/null || true; rm -f $port_file" EXIT
  while [ ! -s "$port_file" ]; do sleep 0.1; done
  shift
  node "$root/tools/leak/run.mjs" "http://127.0.0.1:$(cat "$port_file")" "$@"
' bash "$here" "$@"
