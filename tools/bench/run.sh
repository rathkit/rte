#!/usr/bin/env bash
# Runs the benchmark harness against the built editor, with the network switched off, like the browser checks.
#   RTE_PLAYWRIGHT=<node_modules folder that has playwright> tools/bench/run.sh [--quick] [--out results.json] [--class "machine class"]
set -eu
: "${RTE_PLAYWRIGHT:?set RTE_PLAYWRIGHT}"
here=$(cd "$(dirname "$0")/../.." && pwd)
exec unshare -rn bash -c '
  set -eu
  root=$1; shift
  ip link set lo up
  port_file=$(mktemp)
  node "$root/tools/conformance/serve.mjs" > "$port_file" &
  server=$!
  trap "kill $server 2>/dev/null || true; rm -f $port_file" EXIT
  while [ ! -s "$port_file" ]; do sleep 0.1; done
  base="http://127.0.0.1:$(cat "$port_file")/conformance/"
  node "$root/tools/bench/run.mjs" "$base" "$@"
' bash "$here" "$@"
