import { createServer } from "node:http";
import { roomService } from "./http";

if (!process.env.GAME_ACCESS_TOKEN) throw new Error("需要设置 GAME_ACCESS_TOKEN");
const rooms = roomService(process.env.GAME_ACCESS_TOKEN);
const server = createServer((req, res) => {
  void rooms.handle(req, res, () => { res.writeHead(404).end(); });
});
server.on("close", rooms.close);
const host = process.env.ONLINE_HOST ?? "127.0.0.1";
const port = Number(process.env.ONLINE_PORT ?? 5175);
server.listen(port, host, () => console.log(`联机房间服务监听 ${host}:${port}`));
