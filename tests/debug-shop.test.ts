import { describe, expect, it } from "vitest";
import { catalogUnit } from "../src/data/catalog";
import { RULES, UNITS } from "../src/data/units";
import { queueShopCommand, removeShopCommand } from "../src/engine/debug-shop";
import { buy, createGame, move, nextRound, roll } from "../src/engine/game";
import { decodeSave, SaveStore, SAVE_KEY, SAVE_SCHEMA, validGame, type StoragePort } from "../src/engine/persistence";
import { isRecruitable } from "../src/engine/rotation";
import type { Game } from "../src/engine/types";
import { debugShopMarkup } from "../src/ui/debug-shop";
import { recruitmentMarkup } from "../src/ui/recruitment";

const setup = () => {
  const game = createGame(8301, "classic");
  return { game, player: game.players[0] };
};
const commandFor = (game: Game, id: string) => `/${catalogUnit(game, id).name}`;
const highCost = (game: Game) => UNITS.find((u) => catalogUnit(game, u.id).cost === 5)!.id;
const playback = { time: 0, speed: 2 as const, paused: true };
class MemoryStorage implements StoragePort {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}
/** Move real copies to bot reserves without running a battle or changing the total supply. */
function holdStock(game: Game, id: string) {
  for (const bot of game.players.slice(1)) {
    while (game.pool[id] > 0 && bot.pieces.length < RULES.bench) {
      bot.pieces.push({ uid: game.nextUid++, defId: id, star: 1, position: null });
      game.pool[id]--;
    }
  }
}
function checkpoint(phase: Game["phase"]) {
  const { game, player } = setup();
  buy(game, player, 0);
  move(game, player, player.pieces[0].uid, 35);
  player.locked = true;
  game.phase = phase;
  if (phase === "finished") game.round = RULES.maxRounds;
  if (phase === "result" || phase === "finished")
    game.history = Array.from({ length: game.round }, (_, i) => ({
      combatVersion: game.combatVersion, round: i + 1, opponentId: 1,
      opponentName: game.players[1].name, kind: "pvp", winner: 0, damage: 1,
      income: 5, hp: player.hp, gold: player.gold, left: structuredClone(player.pieces), right: [],
    }));
  expect(validGame(game)).toBe(true);
  return game;
}

describe("后台定向招募指令", () => {
  it.each(["投石车", "  投石车  ", "  / 投石车  "])("输入 %s 只排队，不预扣金币、库存或随机数", (command) => {
    const { game } = setup(), before = structuredClone(game);
    expect(queueShopCommand(game, command).ok).toBe(true);
    expect(game).toEqual({ ...before, debugShopQueue: ["chariot"] });
    expect(validGame(game)).toBe(true);
  });
  it("设置数量可一次加入多枚，并保留原有队列顺序和游戏资源", () => {
    const { game } = setup();
    queueShopCommand(game, "/投石车");
    const before = structuredClone(game);
    expect(queueShopCommand(game, "/维修机", 3)).toMatchObject({ ok: true, message: expect.stringContaining("× 3") });
    expect(game).toEqual({ ...before, debugShopQueue: ["chariot", "repair", "repair", "repair"] });
    expect(queueShopCommand(game, "/维修机").ok).toBe(true);
    expect(game.debugShopQueue).toHaveLength(5);
    expect(validGame(game)).toBe(true);
  });
  it.each([0, -1, 1.5, 6, NaN, Infinity])("非法数量 %s 整批拒绝且不改变状态", (quantity) => {
    const { game } = setup(), before = structuredClone(game);
    expect(queueShopCommand(game, "/维修机", quantity)).toMatchObject({ ok: false, message: expect.stringContaining("整数") });
    expect(game).toEqual(before);
  });
  it("批量数量超过队列剩余容量时不截断或部分添加", () => {
    const { game } = setup();
    expect(queueShopCommand(game, "/维修机", 4).ok).toBe(true);
    const before = structuredClone(game);
    expect(queueShopCommand(game, "/投石车", 2)).toMatchObject({ ok: false, message: expect.stringContaining("剩余 1 格") });
    expect(game).toEqual(before);
    expect(validGame(game)).toBe(true);
  });
  it("批量库存按已有同名排队数量计算，不足时整批拒绝", () => {
    const { game } = setup(), id = highCost(game);
    holdStock(game, id);
    const owner = game.players.find((p) => p.pieces.length >= 3)!;
    for (let i = 0; i < 3; i++) { owner.pieces.pop(); game.pool[id]++; }
    expect(queueShopCommand(game, commandFor(game, id)).ok).toBe(true);
    const before = structuredClone(game);
    expect(queueShopCommand(game, commandFor(game, id), 3)).toMatchObject({ ok: false, message: expect.stringContaining("仅余 2 份") });
    expect(game).toEqual(before);
    expect(queueShopCommand(game, commandFor(game, id), 2).ok).toBe(true);
    expect(game.debugShopQueue).toEqual([id, id, id]);
    expect(validGame(game)).toBe(true);
  });
  it.each(["", "/", " /  ", "/chariot", "/不存在的兵种", '/\"><img src=x onerror=alert(1)>'])(
    "无效指令 %s 不改变任何游戏状态", (command) => {
      const { game } = setup(), before = structuredClone(game);
      expect(queueShopCommand(game, command).ok).toBe(false);
      expect(game).toEqual(before);
    });
  it("本局禁用兵种不能加入队列", () => {
    const game = createGame(8301), id = UNITS.find((u) => !isRecruitable(game, u.id))!.id;
    const before = structuredClone(game);
    expect(queueShopCommand(game, commandFor(game, id))).toMatchObject({ ok: false, message: expect.stringContaining("禁用") });
    expect(game).toEqual(before);
  });
  it.each(["battle", "result", "finished"] as const)("%s 阶段不能输入指令", (phase) => {
    const game = checkpoint(phase), before = structuredClone(game);
    expect(queueShopCommand(game, "/投石车").ok).toBe(false);
    expect(game).toEqual(before);
  });
  it("最多五条，可以重复安排同一个兵种并分别移除", () => {
    const { game } = setup();
    for (let i = 0; i < 5; i++) expect(queueShopCommand(game, "/维修机").ok).toBe(true);
    const before = structuredClone(game);
    expect(queueShopCommand(game, "/投石车").ok).toBe(false);
    expect(game).toEqual(before);
    expect(removeShopCommand(game, 2)).toBe(true);
    expect(game.debugShopQueue).toEqual(Array(4).fill("repair"));
    expect(removeShopCommand(game, -1)).toBe(false);
    expect(removeShopCommand(game, 9)).toBe(false);
    expect(removeShopCommand(game, 0.5)).toBe(false);
    while (game.debugShopQueue) removeShopCommand(game, 0);
    expect(Object.hasOwn(game, "debugShopQueue")).toBe(false);
    expect(validGame(game)).toBe(true);
  });
  it("低等级可安排五费卡，刷新只扣两金，购买仍受原价限制", () => {
    const { game, player } = setup(), id = highCost(game);
    player.gold = 6;
    expect(queueShopCommand(game, commandFor(game, id)).ok).toBe(true);
    expect(roll(game, player)).toBe(true);
    expect(player.shop[0]).toBe(id);
    expect(player.gold).toBe(4);
    expect(game.debugShopQueue).toBeUndefined();
    const before = structuredClone(game);
    expect(buy(game, player, 0)).toBe(false);
    expect(game).toEqual(before);
    player.gold = 5;
    expect(buy(game, player, 0)).toBe(true);
    expect(player.gold).toBe(0);
    expect(player.pieces[0]).toMatchObject({ defId: id, star: 1, position: null });
    expect(validGame(game)).toBe(true);
  });
  it("一次批量加入三枚占三个商店格，实际购买后照常合成", () => {
    const { game, player } = setup();
    expect(queueShopCommand(game, "/维修机", 3).ok).toBe(true);
    roll(game, player);
    expect(player.shop.slice(0, 3)).toEqual(["repair", "repair", "repair"]);
    expect(game.debugShopQueue).toBeUndefined();
    for (let i = 0; i < 3; i++) expect(buy(game, player, i)).toBe(true);
    expect(player.gold).toBe(5);
    expect(player.pieces).toHaveLength(1);
    expect(player.pieces[0]).toMatchObject({ defId: "repair", star: 2 });
    expect(validGame(game)).toBe(true);
  });
  it("余额或阶段导致刷新失败时不消费队列", () => {
    const { game, player } = setup();
    queueShopCommand(game, "/投石车");
    player.gold = 1;
    let before = structuredClone(game);
    expect(roll(game, player)).toBe(false);
    expect(game).toEqual(before);
    game.phase = "battle"; player.gold = 10;
    before = structuredClone(game);
    expect(roll(game, player)).toBe(false);
    expect(game).toEqual(before);
  });
  it("AI 刷新不消费玩家指令且与未排队的 AI 随机结果相同", () => {
    const { game } = setup(), control = structuredClone(game);
    queueShopCommand(game, "/投石车");
    roll(game, game.players[1]); roll(control, control.players[1]);
    expect(game).toEqual({ ...control, debugShopQueue: ["chariot"] });
    expect(validGame(game)).toBe(true);
  });
  it("无可用库存不能排队，当前商店返还的副本可用于下次刷新", () => {
    const { game, player } = setup(), id = highCost(game);
    holdStock(game, id);
    const before = structuredClone(game);
    expect(queueShopCommand(game, commandFor(game, id)).ok).toBe(false);
    expect(game).toEqual(before);
    const owner = game.players.find((p) => p.pieces.some((p) => p.defId === id))!;
    owner.pieces.pop();
    const old = player.shop[0]!;
    game.pool[old]++;
    player.shop[0] = id;
    expect(validGame(game)).toBe(true);
    expect(queueShopCommand(game, commandFor(game, id)).ok).toBe(true);
    expect(queueShopCommand(game, commandFor(game, id)).ok).toBe(false);
    roll(game, player);
    expect(player.shop[0]).toBe(id);
    expect(game.pool[id]).toBe(0);
    expect(game.debugShopQueue).toBeUndefined();
    expect(validGame(game)).toBe(true);
  });
  it("排队后缺货保留该条，其余可用指令先出现，补货后再消费", () => {
    const { game, player } = setup(), id = highCost(game);
    queueShopCommand(game, commandFor(game, id));
    queueShopCommand(game, "/投石车");
    holdStock(game, id);
    roll(game, player);
    expect(player.shop[0]).toBe("chariot");
    expect(game.debugShopQueue).toEqual([id]);
    expect(validGame(game)).toBe(true);
    const owner = game.players.find((p) => p.pieces.some((p) => p.defId === id))!;
    owner.pieces.pop(); game.pool[id]++;
    roll(game, player);
    expect(player.shop[0]).toBe(id);
    expect(game.debugShopQueue).toBeUndefined();
    expect(validGame(game)).toBe(true);
  });
  it("锁定商店的自然过轮保留指令，未锁定的下一轮免费刷新生效", () => {
    const game = checkpoint("result"), player = game.players[0];
    game.debugShopQueue = ["chariot"];
    const shop = [...player.shop], gold = player.gold;
    nextRound(game);
    expect(player.shop).toEqual(shop);
    expect(game.debugShopQueue).toEqual(["chariot"]);
    expect(validGame(game)).toBe(true);
    game.phase = "result";
    game.history.push({ ...structuredClone(game.history[0]), round: 2 });
    player.locked = false;
    nextRound(game);
    expect(player.gold).toBe(gold);
    expect(player.shop[0]).toBe("chariot");
    expect(game.debugShopQueue).toBeUndefined();
    expect(validGame(game)).toBe(true);
  });
  it("无指令时与改动前的固定种子商店一致，定向刷新不额外消耗随机数", () => {
    const { game, player } = setup();
    // Captured from f39b740's unmodified shop logic at seed 8301.
    const golden = [
      { seed: 1383827044, gold: 8, shop: ["stormcaller", "irondog", "stormcaller", "irondog", "sniper"] },
      { seed: 3421230935, gold: 6, shop: ["vajra", "eyebug", "master", "irondog", "medic"] },
      { seed: 2546030494, gold: 4, shop: ["repair", "repair", "repair", "medic", "repair"] },
    ];
    for (const expected of golden) {
      roll(game, player);
      expect({ seed: game.seed, gold: player.gold, shop: player.shop }).toEqual(expected);
      expect(validGame(game)).toBe(true);
    }
    const forced = structuredClone(game), normal = structuredClone(game);
    queueShopCommand(forced, "/投石车");
    roll(forced, forced.players[0]); roll(normal, normal.players[0]);
    expect(forced.seed).toBe(normal.seed);
    expect(validGame(forced)).toBe(true);
  });
});

describe("指令存档与界面", () => {
  it("排队指令随存档恢复，只在恢复后的成功刷新消费一次", () => {
    const { game } = setup(), storage = new MemoryStorage(), store = new SaveStore(storage);
    store.load(); queueShopCommand(game, "/投石车");
    expect(store.save(game, playback)).toBe("saved");
    const loaded = new SaveStore(storage).load().data!;
    expect(loaded.schema).toBe(SAVE_SCHEMA);
    expect(loaded.game).toEqual(game);
    roll(loaded.game, loaded.game.players[0]);
    expect(loaded.game.players[0].shop[0]).toBe("chariot");
    expect(loaded.game.debugShopQueue).toBeUndefined();
    const reopened = new SaveStore(storage); reopened.load();
    expect(reopened.save(loaded.game, playback)).toBe("saved");
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).game.debugShopQueue).toBeUndefined();
    expect(new SaveStore(storage).load().data!.game).toEqual(loaded.game);
  });
  it.each(["prepare", "battle", "result", "finished"] as const)("0.82 %s 存档只升级格式，战斗版本、资源和播放不变", (phase) => {
    const game = checkpoint(phase);
    game.catalogVersion = "sea-fog";
    const before = structuredClone(game), raw = JSON.stringify({
      schema: 81, rules: "singleplayer-0.82", savedAt: 1, revision: 3, game, playback,
    });
    const loaded = decodeSave(raw);
    expect(loaded.status).toBe("migrated");
    expect(loaded.data).toMatchObject({ schema: 82, rules: RULES.version, revision: 3, savedAt: 1, playback });
    expect(loaded.data!.game).toEqual(before);
    expect(game).toEqual(before);
  });
  it.each([null, "chariot", Array(6).fill("chariot"), ["unknown"], ["__proto__"], [42]])(
    "非法待刷新数据被拒绝：%j", (queue) => {
      const { game } = setup();
      (game as unknown as { debugShopQueue: unknown }).debugShopQueue = queue;
      expect(validGame(game)).toBe(false);
    });
  it("存档中的已禁用指令被拒绝，合法空队列和缺省字段兼容", () => {
    const game = createGame(8301), id = UNITS.find((u) => !isRecruitable(game, u.id))!.id;
    game.debugShopQueue = [id];
    expect(validGame(game)).toBe(false);
    game.debugShopQueue = [];
    expect(validGame(game)).toBe(true);
    delete game.debugShopQueue;
    expect(validGame(game)).toBe(true);
  });
  it("界面转义输入与反馈，展示队列价格和缺货状态，忙碌时禁用编辑", () => {
    const { game, player } = setup(), id = highCost(game);
    queueShopCommand(game, commandFor(game, id)); holdStock(game, id);
    const markup = debugShopMarkup(game, false, '/\"><img src=x>', { ok: false, message: "<script>" });
    expect(markup).toContain("&quot;&gt;&lt;img src=x&gt;");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<img src=x>");
    expect(markup).toContain("等待共享卡池补充");
    expect(markup).toContain("★ · 5 金");
    expect(recruitmentMarkup(game, player, false)).toContain("定向 1 枚");
    const busy = debugShopMarkup(game, true, "/", null);
    expect(busy).toMatch(/id="debug-command"[^>]* disabled/);
    expect(busy).toMatch(/id="debug-quantity"[^>]* disabled/);
    expect(busy).toMatch(/data-action="debug-remove"[^>]* disabled/);
    expect(busy).toContain("当前只可查看");
    expect(validGame(game)).toBe(true);
  });
  it("数量控件显示所选数量与剩余容量，并转义其原始值", () => {
    const { game } = setup();
    queueShopCommand(game, "/维修机", 2);
    const markup = debugShopMarkup(game, false, "/投石车", null, "3");
    expect(markup).toMatch(/id="debug-quantity"[^>]*min="1"[^>]*max="5"[^>]*value="3"/);
    expect(markup).toContain("队列剩余 3 格");
    expect(markup).toContain("整批不添加");
    expect(debugShopMarkup(game, false, "/", null, '\"><script>')).toContain('value="&quot;&gt;&lt;script&gt;"');
  });
});
