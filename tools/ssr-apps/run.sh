#!/usr/bin/env bash
# Builds and serves one real server-rendered app in a container with no network, and drives it in three browsers.
#   RTE_PLAYWRIGHT=<node_modules folder that has playwright> tools/ssr-apps/run.sh <next|nuxt|sveltekit|angular>
# Needs the app installed once (the only step that uses the network, and it runs no install scripts):
#   tools/ssr-apps/install.sh <app>
# Needs Docker and the repository's built packages (pnpm build). The app's container is on an internal network, so it can reach nothing;
# a relay (a few lines of Node, nothing of the app's) joins that network to the host's loopback so the browsers can reach the app.
set -eu
app=${1:?usage: run.sh <app>}
: "${RTE_PLAYWRIGHT:?set RTE_PLAYWRIGHT}"
here=$(cd "$(dirname "$0")/../.." && pwd)
dir=$here/tools/ssr-apps/$app
[ -d "$dir/node_modules" ] || { echo "run.sh: install first: tools/ssr-apps/install.sh $app" >&2; exit 2; }
[ -f "$here/packages/rte-core/dist/index.js" ] || { echo "run.sh: run pnpm build first" >&2; exit 2; }
image=${RTE_SSR_IMAGE:-rte-bench:$(tr -d '[:space:]' < "$here/tools/bench.ref")}
id=rte-ssr-$app-$$
cleanup() { docker rm -f "$id-app" "$id-relay" >/dev/null 2>&1 || true; docker network rm "$id" >/dev/null 2>&1 || true; }
[ -n "${RTE_SSR_KEEP:-}" ] || trap cleanup EXIT
docker network create --internal "$id" >/dev/null
docker run -d --name "$id-app" --network "$id" --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --memory 4g --pids-limit 1024 --tmpfs /work:rw,exec,size=2g -e HOME=/work/home -e CI=true -e NEXT_TELEMETRY_DISABLED=1 -e pnpm_config_verify_deps_before_run=false \
  -v "$here":/rte:ro --entrypoint bash "$image" -c '
    set -eu
    mkdir -p /work/app && cd /work/app
    cp -r /rte/tools/ssr-apps/'"$app"'/. .
    mkdir -p node_modules/@rathkit
    for dir in /rte/packages/*; do
      n=$(basename "$dir"); mkdir -p "node_modules/@rathkit/$n"
      cp "$dir/package.json" "node_modules/@rathkit/$n/"; cp -r "$dir/dist" "node_modules/@rathkit/$n/dist"
      [ -d "$dir/css" ] && cp -r "$dir/css" "node_modules/@rathkit/$n/css" || true
    done
    pnpm run build > /work/build.log 2>&1 || { cat /work/build.log; exit 1; }
    exec pnpm run start
  ' >/dev/null
docker run -d --name "$id-relay" --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" -p 127.0.0.1::8080 \
  -e TARGET="$id-app" --entrypoint node "$image" -e '
    const net = require("node:net");
    net.createServer((c) => { const u = net.connect(3000, process.env.TARGET); c.pipe(u).pipe(c); u.on("error", () => c.destroy()); c.on("error", () => u.destroy()); }).listen(8080, "0.0.0.0");
  ' >/dev/null
docker network connect "$id" "$id-relay"
port=$(docker port "$id-relay" 8080/tcp | head -1 | sed 's/.*://')
for _ in $(seq 1 120); do
  curl -fs --max-time 2 "http://127.0.0.1:$port/" >/dev/null 2>&1 && break
  [ "$(docker inspect -f '{{.State.Running}}' "$id-app")" = true ] || { docker logs "$id-app" >&2; exit 1; }
  sleep 1
done
curl -fs --max-time 2 "http://127.0.0.1:$port/" >/dev/null || { docker logs "$id-app" >&2; docker logs "$id-relay" >&2; echo "run.sh: the app did not come up (port $port)" >&2; exit 1; }
RTE_PLAYWRIGHT="$RTE_PLAYWRIGHT" node "$here/tools/ssr-apps/run.mjs" "$app" "http://127.0.0.1:$port/"
