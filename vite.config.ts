import { roomService } from "./server/http";
import { randomBytes } from "node:crypto";
import { defineConfig, loadEnv, type Connect } from "vite";

function accessGate(token: string | undefined): Connect.NextHandleFunction {
  // Subresources share a browser session. Each page navigation still needs its URL token.
  const session = randomBytes(32).toString("hex");
  return (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const supplied = url.searchParams.getAll("token");
    const valid = Boolean(token) && supplied.length === 1 && supplied[0] === token;
    const name = `red_tides_assets_${req.socket.localPort}`;
    const hasSession = req.headers.cookie?.split(";").some((cookie) => cookie.trim() === `${name}=${session}`);
    const navigation = req.headers["sec-fetch-mode"] === "navigate" ||
      req.headers.accept?.includes("text/html") || /\/$|\.html?$/i.test(url.pathname);

    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Vary", "Cookie, Accept, Sec-Fetch-Mode");
    if (!valid && (!token || supplied.length || navigation || !hasSession)) {
      res.statusCode = token ? 403 : 503;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Content-Type-Options", "nosniff");
      const title = token ? "访问被拒绝" : "服务暂不可用";
      res.end(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${res.statusCode} · ${title}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #14231f; color: #e9e9de; font: 16px/1.6 system-ui, sans-serif; }
    main { max-width: 30rem; margin: 1.5rem; padding-left: 1.25rem; border-left: 3px solid #bd9d69; }
    h1 { margin: 0; font-size: 1.6rem; }
  </style>
</head>
<body><main><h1>${res.statusCode} · ${title}</h1></main></body>
</html>`);
      return;
    }
    if (valid) {
      res.setHeader("Set-Cookie", `${name}=${session}; Path=/; HttpOnly; SameSite=Strict`);
      res.setHeader("Cache-Control", "private, no-store");
    }
    next();
  };
}

export default defineConfig(({ mode, isSsrBuild }) => {
  const { GAME_ACCESS_TOKEN } = loadEnv(mode, process.cwd(), "GAME_ACCESS_TOKEN");
  function install(server: import("vite").ViteDevServer | import("vite").PreviewServer) {
    const rooms = roomService(GAME_ACCESS_TOKEN);
    server.httpServer?.once("close", rooms.close);
    server.middlewares.use(rooms.handle);
    server.middlewares.use(accessGate(GAME_ACCESS_TOKEN));
  }
  return {
    publicDir: isSsrBuild ? false : "public",
    plugins: [{
      name: "game-access",
      configureServer: install,
      configurePreviewServer: install,
    }],
  };
});
