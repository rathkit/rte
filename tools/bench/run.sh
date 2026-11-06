#!/usr/bin/env bash
# Runs the benchmark harness (rathkit/rte-bench) in its container against this checkout's build. Needs Docker or Podman (CONTAINER=podman).
#   pnpm build && tools/bench/run.sh [--quick] [--out FILE] [--class "what this machine is"]
# The harness checkout is RTE_BENCH_DIR (default ../rte-bench); it must be at the commit in tools/bench.ref, so a figure always says which harness made it.
set -eu
here=$(cd "$(dirname "$0")/../.." && pwd)
bench=${RTE_BENCH_DIR:-$here/../rte-bench}
[ -f "$bench/container/run.sh" ] || { echo "run.sh: no rte-bench checkout at $bench (git clone https://github.com/rathkit/rte-bench, or set RTE_BENCH_DIR)" >&2; exit 2; }
want=$(tr -d '[:space:]' < "$here/tools/bench.ref")
have=$(git -C "$bench" rev-parse HEAD)
[ "$have" = "$want" ] || { echo "run.sh: $bench is at ${have:0:12}, tools/bench.ref names ${want:0:12} (git -C $bench checkout $want)" >&2; exit 2; }
args=()
while [ $# -gt 0 ]; do
  case $1 in --out) args+=(--results "/results/$(basename "$2")"); shift 2 ;; --) shift ;; *) args+=("$1"); shift ;; esac
done
exec "$bench/container/run.sh" run --rte "$here" --limits "$here/tools/bench" -- "${args[@]}"
