import { pieceCopies } from "../src/engine/progression";
import { claimReward } from "../src/engine/equipment";
import { describe, it, expect } from "vitest";
import {
  createGame,
  buy,
  merge,
  move,
  sell,
  roll,
  buyXp,
  startRound,
  settle,
  nextRound,
} from "../src/engine/game";
import { simulate } from "../src/engine/battle";
import { synergies } from "../src/engine/synergies";
import { COPIES, UNITS } from "../src/data/units";
import type { Game, Piece } from "../src/engine/types";
function conservation(g: Game) {
  for (const u of UNITS) {
    const held = g.players.reduce(
      (n, p) =>
        n +
        p.pieces
          .filter((x) => x.defId === u.id)
          .reduce((k, x) => k + pieceCopies(x), 0) +
        p.shop.filter((id) => id === u.id).length,
      0,
    );
    expect(g.pool[u.id] + held).toBe(COPIES[u.cost]);
    expect(g.pool[u.id]).toBeGreaterThanOrEqual(0);
  }
}
const piece = (
  uid: number,
  defId = "guard",
  position: number | null = null,
  star = 1,
): Piece => ({ uid, defId, position, star });
describe("自走棋必要模块测试", () => {
  it("相同 seed 得到相同商店，初始化与反复刷新保持共享卡池守恒", () => {
    const a = createGame(42, "classic"),
      b = createGame(42, "classic");
    expect(a).toEqual(b);
    a.players[0].gold = 200;
    for (let n = 0; n < 40; n++) {
      roll(a, a.players[0]);
      conservation(a);
    }
  });
  it("购买和出售归还准确份数，金币不足不改变状态", () => {
    const g = createGame(undefined, "classic"),
      p = g.players[0];
    expect(buy(g, p, 0)).toBe(true);
    conservation(g);
    expect(sell(g, p, p.pieces[0].uid)).toBe(true);
    conservation(g);
    p.gold = 0;
    const before = structuredClone(g);
    expect(buy(g, p, 1)).toBe(false);
    expect(roll(g, p)).toBe(false);
    expect(buyXp(g, p)).toBe(false);
    expect(g).toEqual(before);
  });
  it("九枚合成三星，优先保留场上位置", () => {
    const p = createGame(undefined, "classic").players[0];
    p.pieces = Array.from({ length: 9 }, (_, i) =>
      piece(i, "guard", i === 0 ? 35 : null),
    );
    merge(p);
    expect(p.pieces).toEqual([{ ...piece(0, "guard", 35, 3), items: [] }]);
  });
  it("备战席满但可以合成时允许购买，否则拒绝且不扣金", () => {
    const g = createGame(undefined, "classic"),
      p = g.players[0];
    p.gold = 99;
    p.shop = ["guard"];
    p.pieces = [
      piece(100),
      piece(101),
      ...Array.from({ length: 6 }, (_, i) => piece(102 + i, "sniper")),
    ];
    expect(buy(g, p, 0)).toBe(true);
    expect(p.pieces.some((x) => x.defId === "guard" && x.star === 2)).toBe(
      true,
    );
    p.pieces = Array.from({ length: 8 }, (_, i) => piece(200 + i, UNITS[i].id));
    p.shop = ["guard"];
    const gold = p.gold;
    expect(buy(g, p, 0)).toBe(false);
    expect(p.gold).toBe(gold);
  });
  it("人口限制、越界拒绝、满人口交换和战斗阶段禁操作", () => {
    const g = createGame(undefined, "classic"),
      p = g.players[0];
    p.level = 1;
    p.pieces = [piece(1, "guard", 35), piece(2, "sniper")];
    expect(move(g, p, 2, 36)).toBe(false);
    expect(move(g, p, 2, 10)).toBe(false);
    expect(move(g, p, 2, 35)).toBe(true);
    expect(p.pieces[0].position).toBeNull();
    g.phase = "battle";
    expect(move(g, p, 2, 36)).toBe(false);
    expect(sell(g, p, 2)).toBe(false);
    expect(roll(g, p)).toBe(false);
    expect(buyXp(g, p)).toBe(false);
  });
  it("同名不重复触发连携，备战席不参与", () => {
    expect(
      synergies([
        piece(1, "guard", 35),
        piece(2, "guard", 36),
        piece(3, "infantry"),
      ]).find((s) => s.trait === "步兵")?.active,
    ).toBe(false);
    expect(
      synergies([piece(1, "guard", 35), piece(2, "infantry", 36)]).find(
        (s) => s.trait === "步兵",
      )?.active,
    ).toBe(true);
  });
  it("模拟确定、不修改持久阵容、路径无重叠、血量非负", () => {
    const a = [piece(1, "guard", 35, 2), piece(2, "sniper", 59)],
      b = [piece(3, "lion", 35), piece(4, "infantry", 59)];
    const copy = structuredClone(a);
    const first = simulate(a, b);
    expect(first).toEqual(simulate(a, b));
    expect(a).toEqual(copy);
    expect(first.frames.length).toBeGreaterThan(1);
    for (const frame of first.frames) {
      const alive = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
      for (const f of frame.fighters) expect(f.hp).toBeGreaterThanOrEqual(0);
    }
  });
  it("结算幂等、锁定商店保留，并在多轮 AI 演习中保持卡池守恒", () => {
    const g = createGame(87, "classic"),
      p = g.players[0];
    buy(g, p, 0);
    move(g, p, p.pieces[0].uid, 35);
    p.locked = true;
    const shop = [...p.shop];
    for (let n = 0; n < 30 && g.phase !== "finished"; n++) {
      const r = startRound(g)!;
      expect(r).not.toBeNull();
      settle(g, r);
      const after = structuredClone(g);
      settle(g, r);
      expect(g).toEqual(after);
      conservation(g);
      if (g.phase === "result") {
        if (g.reward) expect(claimReward(g, 0)).toBe(true);
        nextRound(g);
        expect(p.shop).toEqual(shop);
      }
    }
    expect(g.phase).toBe("finished");
  });
});
