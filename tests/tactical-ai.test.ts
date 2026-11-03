import { describe, it, expect } from "vitest";
import { simulate, simulateOutcome } from "../src/engine/battle";
import { createGame, buy, sell, roll, buyXp } from "../src/engine/game";
import {
  prepareBot,
  deployLineup,
  deployTactically,
  tacticalOpponent,
  tacticalScore,
} from "../src/engine/ai";
import { equipBot } from "../src/engine/equipment";
import { UNITS } from "../src/data/units";
import { ENCOUNTERS, encounterArmy } from "../src/data/encounters";
import type { Piece } from "../src/engine/types";
const army = (ids: string[], offset = 0): Piece[] =>
  ids.map((defId, i) => ({
    uid: offset + i + 1,
    defId,
    star: (i % 3) + 1,
    position: 32 + i,
    items: i === 0 ? ["aegis"] : [],
  }));
describe("战术试算与抱团站位", () => {
  it.each([
    "legacy",
    "tactics",
    "balanced",
    "signature",
    "summons",
    "legions",
    "brood",
    "fleet",
  ] as const)("%s 轻量试算与完整快照的胜败/扣血/末帧一致", (version) => {
    const fixtures: [Piece[], Piece[]][] = [
      [
        army(UNITS.slice(0, 10).map((u) => u.id)),
        army(
          UNITS.slice(10, 20).map((u) => u.id),
          100,
        ),
      ],
      [
        army(["guard", "fish", "deer", "monk", "cannon", "tiger"]),
        encounterArmy(ENCOUNTERS[7]),
      ],
      [
        army(["panda", "wolf", "shadowblade"]),
        army(["guard", "infantry", "sniper"], 100),
      ],
      [[], army(["guard"], 100)],
      [[], []],
    ];
    for (const [left, right] of fixtures) {
      const before = structuredClone([left, right]),
        full = simulate(left, right, version),
        fast = simulateOutcome(left, right, version);
      expect(fast.winner).toBe(full.winner);
      expect(fast.damage).toBe(full.damage);
      expect(fast.final.fighters).toEqual(full.frames.at(-1)!.fighters);
      expect(fast.final.tick).toBe(full.frames.at(-1)!.tick);
      expect([left, right]).toEqual(before);
    }
  });
  it("抱团和分散均不创造棋子或装备，十人口落位唯一且保留备战", () => {
    const p = createGame().players[0];
    p.level = 10;
    p.pieces = army(UNITS.slice(0, 16).map((u) => u.id));
    const before = p.pieces.map(({ position, ...piece }) => piece);
    for (const formation of ["spread", "compact"] as const) {
      deployLineup(p, "standard", formation);
      const board = p.pieces.filter((p) => p.position !== null);
      expect(board).toHaveLength(10);
      expect(new Set(board.map((p) => p.position)).size).toBe(10);
      expect(board.every((p) => p.position! >= 32 && p.position! < 64)).toBe(
        true,
      );
      expect(p.pieces.map(({ position, ...piece }) => piece)).toEqual(before);
    }
  });
  it("挑战试算只改部署，不消耗资源、修改对手或提前准备其他 AI", () => {
    const g = createGame(119);
    g.round = 4;
    g.difficulty = "veteran";
    const p = g.players[1];
    p.level = 5;
    p.pieces = army([
      "guard",
      "infantry",
      "sniper",
      "cannon",
      "monk",
      "fish",
      "lion",
    ]);
    for (const enemy of g.players.filter((x) => x !== p)) {
      enemy.pieces = army(
        ["panda", "wolf", "bull", "pangolin", "shadowblade"],
        enemy.id * 100 + 1000,
      );
      enemy.level = 5;
    }
    const before = structuredClone(g),
      opponent = tacticalOpponent(g, p),
      baseline = structuredClone(p);
    deployLineup(baseline, "veteran");
    equipBot(g, baseline);
    const originalScore = tacticalScore(baseline.pieces, opponent);
    deployTactically(g, p);
    const projected = structuredClone(p);
    equipBot(g, projected);
    expect(tacticalScore(projected.pieces, opponent)).toBeGreaterThanOrEqual(
      originalScore,
    );
    expect(p.pieces.map(({ position, ...piece }) => piece)).toEqual(
      before.players[1].pieces.map(({ position, ...piece }) => piece),
    );
    expect({ ...p, pieces: [] }).toEqual({ ...before.players[1], pieces: [] });
    expect(g.players.filter((x) => x !== p)).toEqual(
      before.players.filter((x) => x.id !== p.id),
    );
    expect(g.seed).toBe(before.seed);
    expect(g.pool).toEqual(before.pool);
    expect(g.nextUid).toBe(before.nextUid);
    const repeated = structuredClone(before);
    deployTactically(repeated, repeated.players[1]);
    expect(repeated).toEqual(g);
  });
  it("休闲靠自然经验，标准与挑战仍可通过付费购买经验升级", () => {
    for (const difficulty of ["relaxed", "standard", "veteran"] as const) {
      const g = createGame(73),
        p = g.players[1];
      g.round = 12;
      g.difficulty = difficulty;
      p.gold = 100;
      for (let index = 0; index < 5; index++) buy(g, p, index);
      let xpCalls = 0;
      prepareBot(g, p, {
        buy,
        sell,
        roll,
        buyXp: (game, player) => {
          xpCalls++;
          return buyXp(game, player);
        },
      });
      if (difficulty === "relaxed") {
        expect(xpCalls).toBe(0);
        expect(p.level).toBe(3);
      } else {
        expect(xpCalls).toBeGreaterThan(0);
        expect(p.level).toBeGreaterThan(3);
      }
      expect(p.gold).toBeGreaterThanOrEqual(0);
      expect(p.gold).toBeLessThanOrEqual(100);
    }
  });
  it("野怪轮使用公开守军；进入战斗后不允许改阵", () => {
    const g = createGame();
    const p = g.players[1];
    p.pieces = army(["guard", "infantry", "fish"]);
    expect(tacticalOpponent(g, p)).toEqual(encounterArmy(ENCOUNTERS[0]));
    g.phase = "battle";
    const before = structuredClone(g);
    deployTactically(g, p);
    expect(g).toEqual(before);
  });
});
