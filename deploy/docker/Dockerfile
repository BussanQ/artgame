FROM node:24-bookworm-slim AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run build && npm run build:online

FROM nginx:latest
COPY --from=build /usr/local/bin/node /usr/local/bin/node
RUN node --version && mkdir -m 0700 -p /etc/nginx/private
COPY --from=build /build/dist/ /usr/share/nginx/html/
COPY --from=build /build/dist-server/start.js /opt/red-tides/room.mjs
COPY deploy/nginx/red-tides.locations.conf /etc/nginx/red-tides.locations.conf
COPY deploy/docker/game.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 deploy/docker/start.sh /usr/local/bin/start-game
EXPOSE 80
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/start-game"]
