import { CURRENT_COMBAT_VERSION } from "../src/engine/types";
import { damage } from "../src/engine/abilities";
import { describe, it, expect } from "vitest";
import { TRAIT_TIERS } from "../src/data/traits";
import { UNITS, UNIT, COPIES } from "../src/data/units";
import { AI_PROFILES } from "../src/data/ai-profiles";
import { synergies } from "../src/engine/synergies";
import { army, simulate } from "../src/engine/battle";
import {
  createGame,
  buy,
  sell,
  roll,
  buyXp,
  startRound,
  settle,
  nextRound,
  resumeRound,
} from "../src/engine/game";
import {
  prepareBot,
  chooseLineup,
  deployLineup,
  savingsTarget,
  pieceStrength,
} from "../src/engine/ai";
import { claimReward } from "../src/engine/equipment";
import { decodeSave, validGame } from "../src/engine/persistence";
import type { Piece, Game } from "../src/engine/types";
const piece = (id: string, i: number, star = 1): Piece => ({
  uid: i + 1,
  defId: id,
  star,
  position: 32 + i,
});
function conservation(g: Game) {
  for (const u of UNITS) {
    const total =
      g.pool[u.id] +
      g.players.reduce(
        (n, p) =>
          n +
          p.shop.filter((id) => id === u.id).length +
          p.pieces
            .filter((x) => x.defId === u.id)
            .reduce((m, x) => m + (x.copies ?? 3 ** (x.star - 1)), 0),
        0,
      );
    expect(total).toBe(COPIES[u.cost]);
  }
}
describe("羁绊梯度与 AI 策略", () => {
  it("每档羁绊均能由当前棋子达到，只取最高档，不计重复和备战", () => {
    for (const [trait, tiers] of Object.entries(TRAIT_TIERS)) {
      const units = UNITS.filter((u) => u.traits.some((t) => t === trait));
      expect(units.length).toBeGreaterThanOrEqual(tiers.at(-1)!.count);
      for (const [i, tier] of tiers.entries()) {
        const pieces = units.slice(0, tier.count).map((u, j) => piece(u.id, j));
        pieces.push(
          { ...pieces[0], uid: 999, position: 60 },
          { ...pieces[0], uid: 998, position: null },
        );
        const s = synergies(pieces).find((s) => s.trait === trait)!;
        expect(s.count).toBe(tier.count);
        expect(s.tier).toBe(i + 1);
        expect(s.bonus).toEqual(tier.bonus);
      }
    }
  });
  it("梯度实际改变战斗属性；legacy 重放仍使用旧阈值和旧数值", () => {
    const pieces = [
      piece("guard", 0),
      piece("infantry", 1),
      piece("sniper", 2),
    ];
    const modern = army(pieces, 0),
      legacy = army(pieces, 0, "legacy");
    expect(modern[0].maxHp).toBe(800);
    expect(army(pieces, 0, "metamorph")[0].maxHp).toBe(1100);
    expect(army(pieces, 0, "tactics")[0].maxHp).toBe(1200);
    expect(legacy[0].maxHp).toBe(1000);
    expect(modern[1].attack).toBeCloseTo(58 * 1.15);
    expect(legacy[1].attack).toBe(58);
    const pandas = army(
      [piece("panda", 0), piece("monk", 1), piece("master", 2)],
      0,
    );
    expect(pandas.every((f) => f.mana === 100 && f.skillPower === 1.15)).toBe(
      true,
    );
    const guards = army(
      [
        piece("guard", 0),
        piece("lion", 1),
        piece("monk", 2),
        piece("titan", 3),
      ],
      0,
    );
    expect(guards.every((f) => f.shield === 600)).toBe(true);
    const snipers = army(
      [
        piece("infantry", 0),
        piece("sniper", 1),
        piece("chariot", 2),
        piece("cannon", 3),
      ],
      0,
    );
    expect(snipers.every((f) => f.attackShred === 2)).toBe(true);
    const target = army(
      [{ uid: 100, defId: "guard", star: 1, position: 35 }],
      1,
    )[0];
    damage(
      { fighters: [...snipers, target], tick: 1, events: [], effects: [] },
      snipers[0],
      target,
      100,
    );
    expect(target.armorBreak).toBe(2);
    expect(target.armorBreakUntil).toBe(13);
    expect(target.hp).toBe(800 - Math.round((100 * 100) / 130));
  });
  it("两种刺杀开场切入后排，落点唯一且不越界，旧版不跳跃", () => {
    const left = [piece("panda", 0), piece("wolf", 1)],
      right = [piece("guard", 4), { ...piece("sniper", 5), position: 59 }];
    const b = simulate(left, right),
      old = simulate(left, right, "legacy");
    const first = b.frames[0].fighters,
      oldFirst = old.frames[0].fighters;
    expect(first[0].y).not.toBe(oldFirst[0].y);
    expect(first[1].y).not.toBe(oldFirst[1].y);
    expect(new Set(first.map((f) => `${f.x},${f.y}`)).size).toBe(first.length);
    expect(first.every((f) => f.x >= 0 && f.x < 8 && f.y >= 0 && f.y < 8)).toBe(
      true,
    );
  });
  it("组合选阵不修改输入，保留强势高星棋子，布阵不超人口或重叠", () => {
    const p = createGame(undefined, "classic").players[1];
    p.level = 3;
    p.pieces = [
      piece("guard", 0, 3),
      piece("infantry", 1),
      piece("sniper", 2),
      piece("titan", 3),
      piece("cannon", 4),
      piece("panda", 5),
    ];
    const before = structuredClone(p);
    const best = chooseLineup(p, "standard");
    expect(p).toEqual(before);
    expect(best).toHaveLength(3);
    expect(best.some((x) => x.uid === 1)).toBe(true);
    deployLineup(p, "standard");
    const board = p.pieces.filter((x) => x.position !== null);
    expect(board).toHaveLength(3);
    expect(new Set(board.map((x) => x.position)).size).toBe(3);
    expect(
      board
        .filter((x) => UNIT[x.defId].range > 1)
        .every((x) => x.position! >= 48),
    ).toBe(true);
  });
  it("推荐布阵计入装备，保留同星同种的已武装棋子", () => {
    const p = createGame(undefined, "classic").players[0];
    p.level = 1;
    p.pieces = [
      piece("infantry", 0, 2),
      { ...piece("infantry", 1, 2), items: ["warblade", "overdrive"] },
    ];
    expect(pieceStrength(p.pieces[1])).toBeGreaterThan(
      pieceStrength(p.pieces[0]),
    );
    expect(chooseLineup(p, "standard").map((p) => p.uid)).toEqual([2]);
  });
  it("辅助位于队伍中段且覆盖前排，输出射手仍在后排", () => {
    const p = createGame(undefined, "classic").players[0];
    p.level = 6;
    p.pieces = ["guard", "cavalry", "fish", "deer", "infantry", "monk"].map(
      (id, i) => piece(id, i, 2),
    );
    deployLineup(p, "standard");
    const point = (p: Piece) => ({
      x: p.position! % 8,
      y: Math.floor(p.position! / 8),
    });
    for (const id of ["fish", "deer"]) {
      const support = point(p.pieces.find((p) => p.defId === id)!);
      expect(support.y).toBe(5);
      expect(
        p.pieces
          .filter((p) => ["guard", "cavalry"].includes(p.defId))
          .some((p) => {
            const tank = point(p);
            return (
              Math.abs(tank.x - support.x) + Math.abs(tank.y - support.y) <= 3
            );
          }),
      ).toBe(true);
    }
    expect(
      p.pieces.find((p) => p.defId === "infantry")!.position,
    ).toBeGreaterThanOrEqual(48);
    expect(new Set(p.pieces.map((p) => p.position)).size).toBe(6);
    const enemy = ["lion", "wolf", "bull", "pangolin", "cannon", "sniper"].map(
      (id, i) => ({
        ...piece(id, 100 + i, 2),
        position: [35, 33, 36, 37, 59, 61][i],
      }),
    );
    const result = simulate(p.pieces, enemy);
    const fish = result.frames
      .at(-1)!
      .fighters.find((f) => f.side === 0 && f.defId === "fish")!;
    expect(fish.healing).toBeGreaterThan(0);
    expect(
      result.frames.some((frame) =>
        frame.effects.some(
          (e) =>
            e.kind === "heal" && e.source === fish.uid && e.target !== fish.uid,
        ),
      ),
    ).toBe(true);
  });
  it("不同 AI 有明确构筑偏好，攒息目标会随阶段和危险血量变化", () => {
    expect(
      new Set(AI_PROFILES.slice(1).map((p) => p.traits.join("/"))).size,
    ).toBe(8);
    const g = createGame(undefined, "classic"),
      p = g.players[1];
    p.aiProfile = "infantry";
    g.round = 12;
    expect(savingsTarget(g, p)).toBe(25);
    p.hp = 30;
    expect(savingsTarget(g, p)).toBe(0);
    p.hp = 100;
    g.round = 27;
    expect(savingsTarget(g, p)).toBe(0);
  });
  it("各难度 AI 只使用合法经济操作，卡池守恒，行动可重复且不在战斗中购物", () => {
    for (const difficulty of ["relaxed", "standard", "veteran"] as const) {
      const g = createGame(55, "classic");
      g.difficulty = difficulty;
      const other = structuredClone(g);
      for (const p of g.players.slice(1))
        prepareBot(g, p, { buy, sell, roll, buyXp });
      for (const p of other.players.slice(1))
        prepareBot(other, p, { buy, sell, roll, buyXp });
      expect(g).toEqual(other);
      conservation(g);
      for (const p of g.players.slice(1)) {
        expect(p.gold).toBeGreaterThanOrEqual(0);
        expect(
          p.pieces.filter((x) => x.position !== null).length,
        ).toBeLessThanOrEqual(p.level);
        expect(
          p.pieces.filter((x) => x.position === null).length,
        ).toBeLessThanOrEqual(8);
        expect(p.gold).toBeLessThanOrEqual(10);
      }
      g.phase = "battle";
      const before = structuredClone(g);
      prepareBot(g, g.players[1], { buy, sell, roll, buyXp });
      expect(g).toEqual(before);
    }
  });
  it("schema 2 战斗存档使用 legacy 恢复，进入下一回合才切换新规则", () => {
    const g = createGame(88, "classic");
    g.combatVersion = "legacy";
    g.encountersFromRound = 31;
    buy(g, g.players[0], 0);
    g.players[0].pieces[0].position = 35;
    const battle = startRound(g)!;
    const old = JSON.parse(JSON.stringify(g));
    delete old.combatVersion;
    delete old.difficulty;
    const decoded = decodeSave(
      JSON.stringify({
        schema: 2,
        rules: "singleplayer-0.3",
        savedAt: 1,
        revision: 1,
        game: old,
        playback: { time: 1, speed: 1, paused: true },
      }),
    );
    expect(decoded.status).toBe("migrated");
    const restored = decoded.data!.game;
    expect(restored.combatVersion).toBe("legacy");
    expect(resumeRound(restored)!.battle).toEqual(battle.battle);
    settle(restored, resumeRound(restored)!);
    expect(restored.history[0].combatVersion).toBe("legacy");
    nextRound(restored);
    expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
    expect(validGame(restored)).toBe(true);
  });
});
