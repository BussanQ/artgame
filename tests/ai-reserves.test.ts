import { describe, it, expect } from "vitest";
import { createGame, buy, sell, roll, buyXp } from "../src/engine/game";
import {
  prepareBot,
  reservePriority,
  savingsTarget,
  chooseLineup,
  lineupScore,
} from "../src/engine/ai";
import { AI_PROFILES } from "../src/data/ai-profiles";
import { synergies } from "../src/engine/synergies";
import { pieceCopies } from "../src/engine/progression";
import { validGame } from "../src/engine/persistence";
import type { Piece } from "../src/engine/types";
function fixture() {
  const g = createGame(137, "classic"),
    p = g.players[4];
  for (const player of g.players) {
    for (const id of player.shop) if (id) g.pool[id]++;
    player.shop = [null, null, null, null, null];
  }
  p.aiProfile = "fleet";
  p.gold = 0;
  const give = (defId: string, star = 1, position: number | null = null) => {
    const piece: Piece = { uid: g.nextUid++, defId, star, position };
    g.pool[defId] -= pieceCopies(piece);
    p.pieces.push(piece);
    return piece;
  };
  give("master", 3, 35);
  give("titan", 3, 36);
  give("turtle", 3, 34);
  const offer = (id: string) => {
    p.shop[0] = id;
    g.pool[id]--;
  };
  const sold: number[] = [];
  const actions = {
    buy,
    sell(game: typeof g, player: typeof p, uid: number) {
      const ok = sell(game, player, uid);
      if (ok) sold.push(uid);
      return ok;
    },
    roll,
    buyXp,
  };
  return { g, p, give, offer, sold, actions };
}
function fleetReserve(f: ReturnType<typeof fixture>) {
  for (const [id, star] of [
    ["bomber", 2],
    ["repair", 1],
    ["repair", 1],
    ["fish", 1],
    ["eel", 1],
    ["ghostjet", 1],
    ["skycrab", 1],
    ["adept", 1],
  ] as const)
    f.give(id, star);
  expect(validGame(f.g)).toBe(true);
}
describe("AI备战席与连败投入", () => {
  it("没有购买需要时保留合法八格备战席，不强制出售刚升星棋子", () => {
    const f = fixture();
    fleetReserve(f);
    const before = f.p.pieces.map((p) => p.uid);
    prepareBot(f.g, f.p, f.actions);
    expect(f.sold).toEqual([]);
    expect(f.p.pieces.map((p) => p.uid)).toEqual(before);
    expect(f.p.pieces.filter((p) => p.position === null)).toHaveLength(8);
    expect(validGame(f.g)).toBe(true);
  });
  it("保留价值区分已合成棋子与下一张购买欲望，也保护同星对子", () => {
    const f = fixture();
    const bomber = f.give("bomber", 2),
      single = f.give("bomber");
    expect(reservePriority(f.p, bomber)).toBeGreaterThan(
      reservePriority(f.p, single),
    );
    const repair = f.give("repair");
    const alone = reservePriority(f.p, repair);
    f.give("repair");
    expect(reservePriority(f.p, repair)).toBeGreaterThan(alone);
  });
  it("满备战席直接购买完成升星，保留其他二星并遵守卡池守恒", () => {
    const f = fixture();
    fleetReserve(f);
    f.offer("repair");
    f.p.gold = 1;
    prepareBot(f.g, f.p, f.actions);
    expect(f.sold).toEqual([]);
    expect(f.p.pieces.filter((p) => p.defId === "repair")).toHaveLength(1);
    expect(f.p.pieces.find((p) => p.defId === "repair")!.star).toBe(2);
    expect(f.p.pieces.find((p) => p.defId === "bomber")!.star).toBe(2);
    expect(f.p.gold).toBe(0);
    expect(validGame(f.g)).toBe(true);
  });
  it("满席补买更有价值棋子时只卖一枚弱备战，不卖二星轰炸机或升星对子", () => {
    const f = fixture();
    fleetReserve(f);
    f.offer("ark");
    f.p.gold = 4;
    const bomber = f.p.pieces.find((p) => p.defId === "bomber")!.uid,
      repairs = f.p.pieces
        .filter((p) => p.defId === "repair")
        .map((p) => p.uid);
    prepareBot(f.g, f.p, f.actions);
    expect(f.sold).toHaveLength(1);
    expect(f.sold).not.toContain(bomber);
    expect(repairs.every((id) => !f.sold.includes(id))).toBe(true);
    expect(f.p.pieces.some((p) => p.defId === "ark")).toBe(true);
    expect(validGame(f.g)).toBe(true);
  });
  it("新异虫种类能在满席触发旧异虫合并，无需先卖棋子", () => {
    const f = fixture();
    f.p.id = 6;
    f.p.aiProfile = "insects";
    for (const id of [
      "eyebug",
      "eyebug",
      "repair",
      "bomber",
      "eel",
      "ghostjet",
      "skycrab",
      "adept",
    ])
      f.give(id);
    f.offer("blastbug");
    f.p.gold = 2;
    prepareBot(f.g, f.p, f.actions);
    f.p.id = 4;
    expect(f.sold).toEqual([]);
    expect(f.p.pieces.find((p) => p.defId === "eyebug")).toMatchObject({
      star: 2,
      copies: 2,
    });
    expect(validGame(f.g)).toBe(true);
  });
  it("连续失利和中低血量降低储蓄目标，健康时保留风格，残局花完预算", () => {
    const f = fixture();
    f.g.round = 12;
    expect(savingsTarget(f.g, f.p)).toBe(30);
    f.p.streak = -3;
    expect(savingsTarget(f.g, f.p)).toBe(20);
    f.p.hp = 55;
    expect(savingsTarget(f.g, f.p)).toBe(10);
    f.p.hp = 35;
    expect(savingsTarget(f.g, f.p)).toBe(0);
    f.p.hp = 100;
    f.g.round = 25;
    expect(savingsTarget(f.g, f.p)).toBe(0);
  });
});

// Regression extracted from seed 307, round 19: the old beam pruned both support planes.
describe("完整羁绊候选", () => {
  it("个体较弱的拼图不会在四空军完成前被裁掉，返回更高团队评分且不改输入", () => {
    const player = createGame(undefined, "classic").players[4];
    player.aiProfile = "fleet";
    player.level = 8;
    const ids = [
      "skycrab",
      "panda",
      "infantry",
      "repair",
      "chariot",
      "bomber",
      "bull",
      "wolf",
      "chariot",
      "eel",
      "skycrab",
      "ghostjet",
      "ark",
      "chariot",
      "ark",
      "wasp",
    ];
    const stars = [2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 2, 2, 1, 1, 1, 1],
      uids = [
        1, 2, 4, 40, 79, 167, 193, 220, 252, 253, 255, 286, 313, 314, 326, 327,
      ];
    player.pieces = ids.map((defId, i) => ({
      uid: uids[i],
      defId,
      star: stars[i],
      position: null,
      items: i === 4 ? ["warblade", "staff"] : i === 6 ? ["plate"] : [],
    }));
    const before = structuredClone(player);
    const chosen = chooseLineup(player, "standard");
    expect(player).toEqual(before);
    player.id = 0;
    delete player.aiProfile;
    const recommended = chooseLineup(player, "standard");
    expect(
      synergies(recommended.map((p, i) => ({ ...p, position: 32 + i }))).find(
        (s) => s.trait === "空军",
      ),
    ).toMatchObject({ count: 4, tier: 2 });
    player.id = 4;
    player.aiProfile = "fleet";
    expect(chosen).toHaveLength(8);
    expect(new Set(chosen.map((p) => p.uid)).size).toBe(8);
    expect(
      synergies(chosen.map((p, i) => ({ ...p, position: 32 + i }))).find(
        (s) => s.trait === "空军",
      ),
    ).toMatchObject({ count: 4, tier: 2 });
    const previous = [2, 79, 193, 220, 255, 286, 313, 327].map(
      (uid) => player.pieces.find((p) => p.uid === uid)!,
    );
    expect(lineupScore(chosen, AI_PROFILES[4])).toBeGreaterThan(
      lineupScore(previous, AI_PROFILES[4]),
    );
  });
});
