#!/usr/bin/env bash
# Builds the check apps and drives them in a browser, with the network switched off for the whole run.
#   RTE_PLAYWRIGHT=<node_modules folder that has playwright> RTE_PACK=<rathkit-pack binary> tools/framework-checks/run.sh
# Needs the frameworks installed once:  (cd tools/framework-checks && pnpm install --frozen-lockfile)
set -eu
: "${RTE_PLAYWRIGHT:?set RTE_PLAYWRIGHT}"
: "${RTE_PACK:?set RTE_PACK}"
here=$(cd "$(dirname "$0")/../.." && pwd)
node "$here/tools/framework-checks/build.mjs"
exec unshare -rn bash -c '
  set -eu
  ip link set lo up
  port_file=$(mktemp)
  node "$1/tools/conformance/serve.mjs" > "$port_file" &
  server=$!
  trap "kill $server 2>/dev/null || true; rm -f $port_file" EXIT
  while [ ! -s "$port_file" ]; do sleep 0.1; done
  RTE_PLAYWRIGHT="$2" node "$1/tools/framework-checks/run.mjs" "http://127.0.0.1:$(cat "$port_file")"
' bash "$here" "$RTE_PLAYWRIGHT"
