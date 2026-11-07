import { CURRENT_COMBAT_VERSION } from "../src/engine/types";
import { encounterFor, encounterArmy } from "../src/data/encounters";
import { deployLineup } from "../src/engine/ai";
import { describe, it, expect } from "vitest";
import {
  createGame,
  startRound,
  resumeRound,
  settle,
  nextRound,
} from "../src/engine/game";
import { army, simulate } from "../src/engine/battle";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { claimReward } from "../src/engine/equipment";
import type { Game } from "../src/engine/types";
const oldGame = () => {
  const g = createGame(861, "classic");
  g.combatVersion = "tactics";
  const p = g.players[0];
  p.level = 6;
  for (const [i, defId] of [
    "guard",
    "infantry",
    "sniper",
    "chariot",
    "cannon",
    "titan",
  ].entries()) {
    g.pool[defId] -= 3;
    p.pieces.push({ uid: g.nextUid++, defId, star: 2, position: 32 + i });
  }
  expect(validGame(g)).toBe(true);
  return g;
};
const migrate = (game: Game) =>
  decodeSave(
    JSON.stringify({
      schema: 4,
      rules: "singleplayer-0.5",
      savedAt: 1,
      revision: 1,
      game,
      playback: { time: 5, speed: 2, paused: true },
    }),
  );
describe("0.6 平衡与旧战斗保护", () => {
  it("旧准备存档升级规则但不改卡池、金币、棋子与装备", () => {
    const g = oldGame(),
      result = migrate(g);
    expect(result.status).toBe("migrated");
    expect(result.data!.schema).toBe(SAVE_SCHEMA);
    expect(result.data!.game).toEqual({
      ...g,
      combatVersion: CURRENT_COMBAT_VERSION,
    });
  });
  it("已开始的旧战斗逐帧一致，结算后才切到新规则，历史继续按旧规则回放", () => {
    const g = oldGame(),
      original = startRound(g)!;
    const before = structuredClone(g),
      restored = migrate(g).data!;
    expect(restored.game).toEqual(before);
    expect(restored.playback).toEqual({ time: 5, speed: 2, paused: true });
    const replay = resumeRound(restored.game)!;
    expect(replay.battle).toEqual(original.battle);
    settle(restored.game, replay);
    const settled = structuredClone(restored.game);
    const resultPhase = migrate(settled).data!.game;
    expect(resultPhase).toEqual(settled);
    if (resultPhase.reward) claimReward(resultPhase, 0);
    nextRound(resultPhase);
    expect(resultPhase.combatVersion).toBe(CURRENT_COMBAT_VERSION);
    expect(resultPhase.history[0].combatVersion).toBe("tactics");
    const record = resultPhase.history[0];
    expect(simulate(record.left, record.right, record.combatVersion)).toEqual(
      original.battle,
    );
  });
  it("羁绊调整只作用于新版，旧版数值没有被共享对象覆盖", () => {
    const pieces = oldGame().players[0].pieces,
      old = army(pieces, 0, "tactics"),
      current = army(pieces, 0, "balanced");
    expect(old.find((f) => f.defId === "guard")!.maxHp).toBe(2000);
    expect(current.find((f) => f.defId === "guard")!.maxHp).toBe(1900);
    expect(old.find((f) => f.defId === "infantry")!.attack).toBeCloseTo(
      116 * 1.35,
    );
    expect(current.find((f) => f.defId === "infantry")!.attack).toBeCloseTo(
      116 * 1.25,
    );
    expect(army(pieces, 0, "tactics")).toEqual(old);
  });
  it("旧终局守军仍是原强化与三星投石车，新规则单独调整", () => {
    const base = { round: 30, encountersFromRound: 1 };
    const old = encounterArmy(
      encounterFor({ ...base, combatVersion: "tactics" })!,
    );
    const next = encounterArmy(
      encounterFor({ ...base, combatVersion: "balanced" })!,
    );
    expect(old.map((p) => [p.defId, p.star, p.encounterPower])).toEqual([
      ["titan", 3, 1.2],
      ["titan", 2, 1.2],
      ["cannon", 3, 1],
      ["chariot", 3, 1],
    ]);
    expect(next.map((p) => [p.defId, p.star, p.encounterPower])).toEqual([
      ["titan", 3, 1],
      ["titan", 2, 1],
      ["cannon", 3, 1],
      ["chariot", 2, 1],
    ]);
    expect(army(old, 1, "tactics")[0].maxHp).toBe(8160);
    expect(army(next, 1, "balanced")[0].maxHp).toBe(6800);
  });
  it("同预算刺杀控制组合能克制完整射手防线，互换攻守仍成立", () => {
    const layout = (
      ids: string[],
      offset: number,
      formation: "spread" | "compact",
    ) => {
      const p = createGame(undefined, "classic").players[0];
      p.level = 6;
      p.pieces = ids.map((defId, i) => ({
        uid: offset + i + 1,
        defId,
        star: 2,
        position: 32 + i,
      }));
      deployLineup(p, "standard", formation);
      return p.pieces;
    };
    const counter = layout(
      ["guard", "panda", "lion", "wolf", "shadowblade", "bull"],
      0,
      "spread",
    );
    for (const formation of ["spread", "compact"] as const) {
      const target = layout(
        ["guard", "infantry", "sniper", "chariot", "cannon", "titan"],
        100,
        formation,
      );
      expect(simulate(counter, target, "balanced").winner).toBe(0);
      expect(simulate(target, counter, "balanced").winner).toBe(1);
    }
  });
});
