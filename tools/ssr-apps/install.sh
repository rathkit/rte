#!/usr/bin/env bash
# Installs one app's dependencies from its lockfile, in a container, without running any install script. This is the only step of the
# server-rendering checks that uses the network; run.sh builds and serves with none.
#   tools/ssr-apps/install.sh <next|nuxt|sveltekit|angular> [--update-lock]    (--update-lock writes or changes pnpm-lock.yaml; review the diff)
set -eu
app=${1:?usage: install.sh <app> [--update-lock]}
mode=--frozen-lockfile
[ "${2:-}" = --update-lock ] && mode=--no-frozen-lockfile
here=$(cd "$(dirname "$0")/../.." && pwd)
image=${RTE_SSR_IMAGE:-rte-bench:$(tr -d '[:space:]' < "$here/tools/bench.ref")}
exec docker run --rm --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI=true \
  -v "$here/tools/ssr-apps/$app":/app -w /app --entrypoint pnpm "$image" install "$mode" --ignore-scripts
