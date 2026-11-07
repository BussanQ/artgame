import { catalogUnit } from "../data/catalog";
import { RULES, UNIT, UNITS } from "../data/units";
import { isRecruitable } from "./rotation";
import type { Game } from "./types";

/** Commands request stock on refresh; they never reserve or create pool copies. */
export function queueShopCommand(game: Game, command: string, quantity = 1) {
  if (game.phase !== "prepare" || game.players[0].hp <= 0)
    return { ok: false, message: "请在准备阶段输入指令。" };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > RULES.shop)
    return { ok: false, message: `数量需为 1–${RULES.shop} 的整数。` };
  const name = command.trim().replace(/^\//, "").trim();
  if (!name)
    return { ok: false, message: "请输入兵种完整名称，例如投石车。" };
  const unit = UNITS.find((u) => catalogUnit(game, u.id).name === name);
  if (!unit) return { ok: false, message: "未找到该兵种，请使用图鉴中的完整名称。" };
  if (!isRecruitable(game, unit.id))
    return { ok: false, message: `${name}所属系列已在本局禁用。` };
  const queue = game.debugShopQueue ?? [];
  const slots = RULES.shop - queue.length;
  if (quantity > slots)
    return { ok: false, message: `队列剩余 ${slots} 格，无法一次加入 ${quantity} 枚，请减少数量或移除指令。` };
  const stock = (game.pool[unit.id] ?? 0) + game.players[0].shop.filter((id) => id === unit.id).length;
  const available = Math.max(0, stock - queue.filter((id) => id === unit.id).length);
  if (quantity > available)
    return { ok: false, message: `${name}的共享卡池仅余 ${available} 份可安排，无法一次加入 ${quantity} 枚。` };
  game.debugShopQueue = [...queue, ...Array<string>(quantity).fill(unit.id)];
  return { ok: true, message: `${name} × ${quantity} 已排入下次刷新（${queue.length + quantity}/${RULES.shop}）。` };
}

export function removeShopCommand(game: Game, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= (game.debugShopQueue?.length ?? 0))
    return false;
  game.debugShopQueue!.splice(index, 1);
  if (!game.debugShopQueue!.length) delete game.debugShopQueue;
  return true;
}

/** Called only after returning the player's old shop; unavailable requests remain pending. */
export function takeShopCommand(game: Game) {
  const index = game.debugShopQueue?.findIndex((id) => game.pool[id] > 0 && isRecruitable(game, id)) ?? -1;
  if (index < 0) return undefined;
  const unit = catalogUnit(game, game.debugShopQueue![index]);
  removeShopCommand(game, index);
  return unit;
}

export function validDebugShopQueue(game: Pick<Game, "debugShopQueue" | "bannedSeries" | "combatVersion" | "catalogVersion">) {
  const queue: unknown = game.debugShopQueue;
  return queue === undefined || (Array.isArray(queue) && queue.length <= RULES.shop &&
    queue.every((id) => typeof id === "string" && Object.hasOwn(UNIT, id) && isRecruitable(game, id)));
}
