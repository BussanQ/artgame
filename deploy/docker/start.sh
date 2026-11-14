#!/bin/bash
set -eu
umask 077

# Keep the generated token across restarts of the same container.
private=/etc/nginx/private
if [[ -z ${GAME_ACCESS_TOKEN:-} ]]; then
    if [[ ! -s $private/access-token ]]; then
        node -e 'console.log(require("node:crypto").randomBytes(24).toString("hex"))' > "$private/access-token"
    fi
    read -r GAME_ACCESS_TOKEN < "$private/access-token"
    echo "游戏访问参数 ?token=$GAME_ACCESS_TOKEN"
fi
export GAME_ACCESS_TOKEN
export ONLINE_HOST=127.0.0.1 ONLINE_PORT=5175

# Nginx reads the raw query argument. URL encoding also keeps it a literal
# inside the private include. Node receives the original token for API auth.
node --input-type=module <<'JS'
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
const token = encodeURIComponent(process.env.GAME_ACCESS_TOKEN);
const session = randomBytes(32).toString("hex");
writeFileSync("/etc/nginx/private/red-tides-keys.conf",
    `set $game_access_token "${token}";\nset $game_asset_session "${session}";\n`);
JS
nginx -t

node /opt/red-tides/room.mjs &
room=$!
nginx -g 'daemon off;' &
web=$!

stop() {
    kill -QUIT "$web" 2>/dev/null || true
    kill -TERM "$room" 2>/dev/null || true
    wait "$web" 2>/dev/null || true
    wait "$room" 2>/dev/null || true
}
trap 'stop; exit 0' TERM INT QUIT
# Exit on either service failing so the container restart policy covers both.
wait -n || true
stop
exit 1
