import { CURRENT_COMBAT_VERSION } from "../src/engine/types";
import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  damage,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import {
  callRetinue,
  fighterName,
  fighterSprite,
  summonOwnerName,
} from "../src/engine/summons";
import { synergies } from "../src/engine/synergies";
import { usesEnergy } from "../src/engine/triggers";
import {
  createGame,
  buy,
  move,
  resumeRound,
  settle,
  nextRound,
} from "../src/engine/game";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { COPIES, UNIT, LEGION_ADDITIONS } from "../src/data/units";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { claimReward } from "../src/engine/equipment";
import type { Piece } from "../src/engine/types";
const p = (id: string, uid: number, position = 35, star = 1): Piece => ({
  defId: id,
  uid,
  position,
  star,
});
function fixture(id = "adept", star = 1) {
  const source = army([p(id, 1, 43, star)], 0)[0],
    enemy = army([p("titan", 2, 35, 3)], 1)[0];
  source.mana = 100;
  const ctx: CombatContext = {
    fighters: [source, enemy],
    tick: 1,
    effects: [],
    events: [],
  };
  return { source, enemy, ctx };
}
describe("召唤职业与傀儡战线", () => {
  it("真人受八秒间隔及两个存活上限限制，阵亡后可补充，不消耗失败施法能量", () => {
    const { source, enemy, ctx } = fixture();
    expect(castSkill(ctx, source, enemy)).toBe(true);
    source.mana = 100;
    ctx.tick = 32;
    const before = structuredClone(ctx);
    expect(callRetinue(ctx, source)).toBe(false);
    expect(ctx).toEqual(before);
    ctx.tick = 33;
    expect(callRetinue(ctx, source)).toBe(true);
    source.mana = 100;
    ctx.tick = 65;
    expect(callRetinue(ctx, source)).toBe(false);
    expect(source.mana).toBe(100);
    ctx.fighters.find((f) => f.summon)!.hp = 0;
    expect(callRetinue(ctx, source)).toBe(true);
    const pets = ctx.fighters.filter((f) => f.summon);
    expect(pets).toHaveLength(3);
    expect(pets.filter((f) => f.hp > 0)).toHaveLength(2);
    expect(new Set(pets.map((f) => f.uid)).size).toBe(3);
    expect(pets.every((f) => f.uid < 0)).toBe(true);
  });
  it("须弥鲨只召唤一次，盾卫落点眩晕只命中相邻敌人一次", () => {
    const { source, enemy, ctx } = fixture("shark");
    Object.assign(enemy, { x: 2, y: 4 });
    const far = army([p("guard", 3)], 1)[0];
    Object.assign(far, { x: 7, y: 0 });
    ctx.fighters.push(far);
    expect(castSkill(ctx, source, enemy)).toBe(true);
    const pets = ctx.fighters.filter((f) => f.summon);
    expect(pets).toHaveLength(2);
    expect(pets.every((f) => f.hp === 800 && f.armor === 8)).toBe(true);
    expect(enemy.stunUntil).toBe(3);
    expect(far.stunUntil).toBe(0);
    expect(
      ctx.effects.filter((e) => e.kind === "stun" && e.target === enemy.uid),
    ).toHaveLength(1);
    expect(usesEnergy(source)).toBe(false);
    gainMana(source, 100, 40);
    expect(source.mana).toBe(0);
    source.mana = 100;
    ctx.tick = 40;
    expect(callRetinue(ctx, source)).toBe(false);
  });
  it("相邻格被占满时保留施法机会，只有一个落点时只召一个，不越界重叠", () => {
    const { source, ctx } = fixture("shark");
    const blockers = [
      [3, 4],
      [2, 5],
      [4, 5],
      [3, 6],
    ].map(([x, y], i) => ({ ...army([p("guard", 10 + i)], 0)[0], x, y }));
    ctx.fighters.push(...blockers);
    const before = structuredClone(ctx);
    expect(callRetinue(ctx, source)).toBe(false);
    expect(ctx).toEqual(before);
    blockers[0].hp = 0;
    expect(callRetinue(ctx, source)).toBe(true);
    expect(ctx.fighters.filter((f) => f.summon)).toHaveLength(1);
    const live = ctx.fighters.filter((f) => f.hp > 0);
    expect(new Set(live.map((f) => `${f.x},${f.y}`)).size).toBe(live.length);
  });
  it("召唤按不同棋子计数，备战和重复不计；全队及新召唤物受法术保护", () => {
    const pieces = [p("adept", 1, 43), p("shark", 2, 35), p("guard", 3, 36)];
    const team = army(pieces, 0);
    expect(team.every((f) => Math.abs(f.magicResist - 0.35) < 1e-10)).toBe(
      true,
    );
    expect(
      synergies([...pieces, p("shark", 4, 37)]).find((s) => s.trait === "召唤")!
        .count,
    ).toBe(2);
    const three = army([...pieces, p("wolf", 4, 37)], 0);
    expect(three.every((f) => f.magicResist === 0.45)).toBe(true);
    const reserve = army([pieces[0], { ...pieces[1], position: null }], 0);
    expect(reserve[0].magicResist).toBe(0.2);
    team[0].mana = 100;
    const ctx: CombatContext = {
      fighters: team,
      tick: 1,
      effects: [],
      events: [],
    };
    callRetinue(ctx, team[0]);
    const pet = team.find((f) => f.summon)!;
    expect(pet.magicResist).toBeCloseTo(0.35);
    expect(pet.attack).toBe(48);
    const enemy = army([p("infantry", 99)], 1)[0];
    expect(damage(ctx, enemy, pet, 100, "magic")).toBe(65);
    expect(army(pieces, 0, "summons").every((f) => f.magicResist === 0.2)).toBe(
      true,
    );
  });
  it("星级和技能强度影响召唤属性，不继承装备、再生、支援或施法；主人阵亡不移除宠物", () => {
    const source = army(
      [{ ...p("adept", 1, 43, 2), items: ["staff", "heart", "warblade"] }],
      0,
    )[0];
    const enemy = army([p("titan", 2)], 1)[0];
    source.mana = 100;
    const ctx: CombatContext = {
      fighters: [source, enemy],
      tick: 1,
      events: [],
      effects: [],
    };
    callRetinue(ctx, source);
    const pet = ctx.fighters.find((f) => f.summon)!;
    expect(pet.hp).toBe(988);
    expect(pet.attack).toBe(125);
    expect(pet.regeneration + pet.supportHeal + pet.lifesteal).toBe(0);
    expect(usesEnergy(pet)).toBe(false);
    gainMana(pet, 100, 1);
    expect(pet.mana).toBe(0);
    expect(callRetinue(ctx, pet)).toBe(false);
    damage(ctx, enemy, source, 99999, "true");
    expect(pet.hp).toBe(988);
    expect([
      fighterName(pet),
      fighterSprite(pet),
      summonOwnerName(pet),
    ]).toEqual(["灵木傀儡", "puppet-spirit", "真人"]);
  });
  it("完整召唤混战确定、无出生当步行动，快速结算和贡献统计一致", () => {
    const left = [
      p("adept", 1, 49, 2),
      p("shark", 2, 34, 2),
      p("wolf", 3, 36, 2),
      p("fish", 4, 50, 2),
    ];
    left[0].items = ["staff"];
    left[1].items = ["staff"];
    const right = [
      p("guard", 11, 35, 3),
      p("titan", 12, 36, 2),
      p("cannon", 13, 59, 2),
      p("monk", 14, 44, 2),
    ];
    const battle = simulate(left, right);
    expect(simulate(left, right)).toEqual(battle);
    const fast = simulateOutcome(left, right);
    expect(fast.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    expect(fast.final.tick).toBe(battle.frames.at(-1)!.tick);
    expect(fast.winner).toBe(battle.winner);
    const pets = battle.frames.at(-1)!.fighters.filter((f) => f.summon);
    expect(new Set(pets.map((f) => f.summon?.kind ?? "wolf"))).toEqual(
      new Set(["puppet", "sentinel", "wolf"]),
    );
    for (const frame of battle.frames) {
      const alive = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
      for (const pet of frame.fighters.filter(
        (f) => f.summon?.born === frame.tick,
      ))
        expect(frame.events.some((e) => e.attacker === pet.uid)).toBe(false);
    }
    const report = analyzeBattle(battle, battle.frames.length - 1);
    expect(JSON.stringify(report)).toContain("sentinel");
  });
  it.each(["prepare", "battle", "result"] as const)(
    "0.8 %s 存档仅补卡池，进行中的旧战斗和战报保留",
    (phase) => {
      const g = createGame(137, "classic");
      g.combatVersion = "summons";
      for (const player of g.players)
        player.shop = player.shop.map((id) => {
          if (id && LEGION_ADDITIONS.includes(id)) {
            g.pool[id]++;
            return null;
          }
          return id;
        });
      for (const id of LEGION_ADDITIONS) delete g.pool[id];
      const player = g.players[0];
      if (player.shop[0]) g.pool[player.shop[0]!]++;
      g.pool.guard--;
      player.shop[0] = "guard";
      buy(g, player, 0);
      move(g, player, player.pieces[0].uid, 35);
      if (phase !== "prepare") g.phase = "battle";
      const round = phase !== "prepare" ? resumeRound(g) : null;
      if (phase === "result") settle(g, round!);
      const before = structuredClone(g);
      const result = decodeSave(
        JSON.stringify({
          schema: 7,
          rules: "singleplayer-0.8",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 1, speed: 2, paused: true },
        }),
      );
      expect(result.status).toBe("migrated");
      expect(result.data!.schema).toBe(SAVE_SCHEMA);
      const restored = result.data!.game;
      expect(validGame(restored)).toBe(true);
      for (const id of LEGION_ADDITIONS)
        expect(restored.pool[id]).toBe(COPIES[UNIT[id].cost]);
      expect(restored.players).toEqual(before.players);
      expect(restored.history).toEqual(before.history);
      expect(restored.combatVersion).toBe(
        phase === "prepare" ? CURRENT_COMBAT_VERSION : "summons",
      );
      if (phase === "battle")
        expect(resumeRound(restored)!.battle).toEqual(round!.battle);
      if (phase === "result") {
        if (restored.reward) claimReward(restored, 0);
        nextRound(restored);
        expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
      }
    },
  );
});
