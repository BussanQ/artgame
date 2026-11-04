import { CURRENT_COMBAT_VERSION } from "../src/engine/types";
import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  gainMana,
  damage,
  type CombatContext,
} from "../src/engine/abilities";
import { skillReady, usesEnergy } from "../src/engine/triggers";
import { fighterName, fighterSprite } from "../src/engine/summons";
import { skillDescription, skillName } from "../src/data/skills";
import { createGame, startRound, settle, nextRound } from "../src/engine/game";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { claimReward } from "../src/engine/equipment";
import { analyzeBattle } from "../src/engine/battle-analysis";
import type { Piece } from "../src/engine/types";
const piece = (
  uid: number,
  defId = "wolf",
  star = 2,
  position = 35,
): Piece => ({ uid, defId, star, position });
function context(star = 1): CombatContext {
  const fighters = [
    ...army([piece(1, "wolf", star)], 0),
    ...army([piece(2, "guard", 3)], 1),
  ];
  fighters[0].mana = 100;
  return { tick: 2, fighters, events: [], effects: [] };
}
describe("幽狼召唤与战斗生命周期", () => {
  it.each([1, 2, 3])(
    "%s 星召唤独立幼狼，技能强度生效且不继承装备或状态",
    (star) => {
      const ctx = context(star),
        [source, enemy] = ctx.fighters;
      Object.assign(source, {
        skillPower: 1.5,
        armor: 99,
        shield: 999,
        lifesteal: 1,
        stunUntil: 0,
        regeneration: 10,
        supportHeal: 350,
      });
      const location = [source.x, source.y];
      expect(castSkill(ctx, source, enemy)).toBe(true);
      expect([source.x, source.y]).toEqual(location);
      const pups = ctx.fighters.filter((f) => f.summon);
      expect(pups).toHaveLength(2);
      for (const pup of pups) {
        expect(pup).toMatchObject({
          hp: 400 * 2 ** (star - 1) * 1.5,
          attack: 40 * 2 ** (star - 1) * 1.5,
          armor: 2,
          shield: 0,
          lifesteal: 0,
          regeneration: 0,
          supportHeal: 0,
          mana: 0,
          summon: { owner: source.uid, born: 2 },
        });
        expect(pup.packCall).toBeUndefined();
      }
      expect(source).toMatchObject({ packCall: "spent", mana: 0 });
      source.mana = 100;
      expect(castSkill(ctx, source, enemy)).toBe(false);
      expect(ctx.fighters).toHaveLength(4);
    },
  );
  it("四邻格拥挤时保留能量，有一个空格也可召唤且无重叠", () => {
    const ctx = context(),
      [source, enemy] = ctx.fighters;
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ])
      ctx.fighters.push({
        ...structuredClone(enemy),
        uid: ctx.fighters.length + 10,
        x: source.x + dx,
        y: source.y + dy,
      });
    const before = structuredClone(ctx);
    expect(castSkill(ctx, source, enemy)).toBe(false);
    expect(ctx).toEqual(before);
    ctx.fighters.at(-1)!.hp = 0;
    expect(castSkill(ctx, source, enemy)).toBe(true);
    expect(ctx.fighters.filter((f) => f.summon)).toHaveLength(1);
    const alive = ctx.fighters.filter((f) => f.hp > 0);
    expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(alive.length);
  });
  it("负数身份不与现有野怪碰撞，幼狼不回能、不再召唤，父体阵亡不移除幼狼", () => {
    const ctx = context(),
      [source, enemy] = ctx.fighters;
    enemy.uid = -10;
    expect(castSkill(ctx, source, enemy)).toBe(true);
    const pups = ctx.fighters.filter((f) => f.summon);
    expect(pups.map((f) => f.uid)).toEqual([-11, -12]);
    gainMana(pups[0], 100, ctx.tick);
    damage(ctx, enemy, pups[0], 1, "true");
    expect(pups[0].mana).toBe(0);
    pups[0].mana = 100;
    expect(usesEnergy(pups[0])).toBe(false);
    expect(skillReady(pups[0])).toBe(false);
    expect(castSkill(ctx, pups[0], enemy)).toBe(false);
    damage(ctx, enemy, source, 99999, "true");
    expect(source.hp).toBe(0);
    expect(pups.every((f) => f.hp > 0)).toBe(true);
    expect(fighterName(pups[0])).toBe("幽影幼狼");
    expect(fighterSprite(pups[0])).toBe("wolf-spirit");
  });
  it("完整和快速战斗一致，出生当步不行动，召唤不污染原阵容且胜利扣血每只计一点", () => {
    const left = [piece(1)],
      right = [piece(2, "guard")];
    const before = structuredClone({ left, right });
    const battle = simulate(left, right),
      fast = simulateOutcome(left, right);
    expect(simulate(left, right)).toEqual(battle);
    expect(fast.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    expect(fast.winner).toBe(battle.winner);
    expect(fast.damage).toBe(battle.damage);
    expect({ left, right }).toEqual(before);
    const pups = fast.final.fighters.filter((f) => f.summon);
    expect(pups).toHaveLength(2);
    expect(
      battle.frames.some((f) =>
        f.events.some((e) => pups.some((p) => p.uid === e.attacker)),
      ),
    ).toBe(true);
    for (const frame of battle.frames) {
      const alive = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
      for (const event of frame.events) {
        const attacker = frame.fighters.find((f) => f.uid === event.attacker)!;
        if (attacker.summon)
          expect(frame.tick).toBeGreaterThan(attacker.summon.born);
      }
    }
    expect(battle.winner).not.toBeNull();
    const survivors = fast.final.fighters.filter(
      (f) => f.hp > 0 && f.side === battle.winner,
    );
    expect(survivors.some((f) => f.summon)).toBe(true);
    expect(battle.damage).toBe(
      2 + survivors.reduce((n, f) => n + (f.summon ? 1 : f.star), 0),
    );
    const analysis = analyzeBattle(battle);
    expect(analysis.sides[0].fighters.filter((f) => f.summon)).toHaveLength(2);
    expect(analyzeBattle(battle, 0).sides[0].fighters).toHaveLength(1);
    expect(analysis.sides[0].damage).toBe(analysis.sides[1].received);
  });
  it("schema 6 准备阶段升级、在途和历史战斗不改写，资源和战报保持合法", () => {
    const game = createGame(137, "classic"),
      player = game.players[0];
    game.combatVersion = "signature";
    player.pieces.push(piece(game.nextUid++, "wolf", 1));
    game.pool.wolf--;
    const encoded = () =>
      JSON.stringify({
        schema: 6,
        rules: "singleplayer-0.7",
        savedAt: 1,
        revision: 1,
        game,
        playback: { time: 0, speed: 1, paused: false },
      });
    expect(decodeSave(encoded()).data).toMatchObject({
      schema: SAVE_SCHEMA,
      game: { combatVersion: CURRENT_COMBAT_VERSION },
    });
    const result = startRound(game)!;
    const restored = decodeSave(encoded()).data!.game;
    expect(restored).toEqual(game);
    settle(restored, result);
    if (restored.reward) claimReward(restored, 0);
    nextRound(restored);
    expect(validGame(restored)).toBe(true);
    expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
    expect(restored.history[0].combatVersion).toBe("signature");
    const report = restored.history[0];
    expect(simulate(report.left, report.right, report.combatVersion)).toEqual(
      result.battle,
    );
  });
  it("新技能说明与旧回放名称各自准确", () => {
    expect(skillName("wolf")).toBe("幽狼召唤");
    expect(skillDescription("wolf")).toContain("每场仅一次");
    expect(skillName("wolf", "signature")).toBe("幽影突袭");
    expect(skillDescription("wolf", "signature")).toContain(
      "实际生命伤害的 60%",
    );
  });
});
