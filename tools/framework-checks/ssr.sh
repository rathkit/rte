#!/usr/bin/env bash
# Server rendering, stage 1 (ssr.mjs), run in a container with no network. The frameworks are the ones installed in this folder from
# its lockfile; the packages are the repository's built ones (pnpm build first). Needs Docker or Podman (CONTAINER=podman) and an image
# with Node: RTE_SSR_IMAGE (default: the rte-bench image of the commit in tools/bench.ref, which has Node and nothing the check needs from it).
set -eu
engine=${CONTAINER:-docker}
here=$(cd "$(dirname "$0")/../.." && pwd)
ref=$(tr -d '[:space:]' < "$here/tools/bench.ref")
image=${RTE_SSR_IMAGE:-rte-bench:$ref}
[ -d "$here/tools/framework-checks/node_modules" ] || { echo "ssr.sh: install the frameworks first: (cd tools/framework-checks && pnpm install --frozen-lockfile)" >&2; exit 2; }
[ -f "$here/packages/rte-core/dist/index.js" ] || { echo "ssr.sh: run pnpm build first" >&2; exit 2; }
user=(--user "$(id -u):$(id -g)")
[ "$engine" = podman ] && user=(--userns=keep-id)
exec "$engine" run --rm --network none --cap-drop ALL --security-opt no-new-privileges "${user[@]}" \
  --memory 2g --pids-limit 512 --tmpfs /work:rw,exec,size=1g -e HOME=/work/home \
  -v "$here":/rte:ro --entrypoint bash "$image" -c '
    set -eu
    mkdir -p /work/node_modules/@rathkit
    for entry in /rte/tools/framework-checks/node_modules/*; do
      [ "$(basename "$entry")" = "@rathkit" ] || ln -s "$entry" "/work/node_modules/$(basename "$entry")"
    done
    for dir in /rte/packages/*; do
      name=$(basename "$dir")
      mkdir -p "/work/node_modules/@rathkit/$name"
      cp "$dir/package.json" "/work/node_modules/@rathkit/$name/"
      cp -r "$dir/dist" "/work/node_modules/@rathkit/$name/dist"
      [ -d "$dir/css" ] && cp -r "$dir/css" "/work/node_modules/@rathkit/$name/css" || true
    done
    cp /rte/tools/framework-checks/ssr.mjs /work/ssr.mjs
    cd /work && node ssr.mjs
  '
