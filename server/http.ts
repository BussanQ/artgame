import { randomInt } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Room, RoomError } from "./room";
import type { Order } from "../src/online/protocol";

async function readBody(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new RoomError("请求过大", 413);
    chunks.push(Buffer.from(chunk));
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (data && typeof data === "object" && !Array.isArray(data)) return data;
  } catch { /* handled below */ }
  throw new RoomError("请求格式错误", 400);
}

export function roomService(accessToken: string | undefined) {
  const rooms = new Map<string, Room>();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (!room.members.size || now - room.touched > 10 * 60_000) rooms.delete(code);
      else room.tick(now);
    }
  }, 500);
  timer.unref();

  async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const path = req.url?.split("?")[0];
    if (!path?.startsWith("/api/online/")) { next(); return; }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    try {
      if (!accessToken || req.headers.authorization !== `Bearer ${accessToken}`)
        throw new RoomError("访问被拒绝", 403);
      if (req.method !== "POST" || !req.headers["content-type"]?.startsWith("application/json"))
        throw new RoomError("需要 JSON 请求", 400);
      const data = await readBody(req);
      const now = Date.now();
      if (path === "/api/online/create") {
        if (rooms.size >= 256) throw new RoomError("房间已满，请稍后再试", 503);
        let code: string;
        do { code = String(randomInt(100000, 1000000)); } while (rooms.has(code));
        const room = new Room(code, now);
        rooms.set(code, room);
        res.end(JSON.stringify(room.join(now)));
        return;
      }
      const room = rooms.get(data.code);
      if (!room) throw new RoomError("房间不存在或已关闭", 404);
      room.tick(now);
      if (path === "/api/online/join") {
        res.end(JSON.stringify(room.join(now)));
        return;
      }
      const id = room.identify(data.secret, now);
      if (path === "/api/online/order") {
        const member = room.members.get(id)!;
        if (!data.order || typeof data.order.kind !== "string") throw new RoomError("无效操作", 400);
        const view = room.view(id, now);
        if (data.sequence !== member.sequence || data.round !== view.round || data.phase !== view.phase)
          throw new RoomError("对局已更新，请重试");
        room.order(id, data.order as Order, now);
        member.sequence++;
        if (data.order.kind === "leave") {
          if (!room.members.size) rooms.delete(room.code);
          res.end("{}");
          return;
        }
      } else if (path !== "/api/online/state") throw new RoomError("接口不存在", 404);
      res.end(JSON.stringify(room.view(id, Date.now())));
    } catch (e) {
      res.statusCode = e instanceof RoomError ? e.status : 500;
      if (!(e instanceof RoomError)) console.error("联机房间请求失败", e);
      res.end(JSON.stringify({ error: e instanceof RoomError ? e.message : "房间服务暂不可用" }));
    }
  }
  return { handle, close: () => clearInterval(timer) };
}
