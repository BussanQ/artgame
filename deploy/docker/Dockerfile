# 构建阶段沿用 glibc 版 Node，保证 npm ci / vite 与本地开发环境一致。
# 该阶段只有 dist/ 与 dist-server/start.js 会进入最终镜像，node_modules
# 与构建工具都不会出现在运行阶段。
FROM node:24-bookworm-slim AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npm run build && npm run build:online

# 运行阶段：nginx:alpine 约 94MB，原 nginx:latest（Debian trixie）约 261MB。
# 房间服务是 vite 打包后的单文件，只依赖 Node 内置模块，用 Alpine 自带的
# musl 版 nodejs 即可（需 22.12+）；不再从构建阶段拷贝 118MB 的 glibc
# node 二进制，两者 libc 不兼容也无法混用。bash 供 start.sh 使用。
# 注意：nginx:alpine 默认入口被下面的 ENTRYPOINT 覆盖，不执行官方
# /docker-entrypoint.sh，配置文件路径与 Debian 版一致。
FROM nginx:alpine
RUN apk add --no-cache nodejs bash \
 && node --version \
 && mkdir -m 0700 -p /etc/nginx/private
COPY --from=build /build/dist/ /usr/share/nginx/html/
COPY --from=build /build/dist-server/start.js /opt/red-tides/room.mjs
COPY deploy/nginx/red-tides.locations.conf /etc/nginx/red-tides.locations.conf
COPY deploy/docker/game.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 deploy/docker/start.sh /usr/local/bin/start-game
EXPOSE 80
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/start-game"]
