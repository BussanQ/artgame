import { chooseLineup, lineupScore, deployLineup } from "../src/engine/ai";
import { AI_PROFILES } from "../src/data/ai-profiles";
import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  advanceAirSkills,
  damage,
  type CombatContext,
} from "../src/engine/abilities";
import { compute } from "../src/compute/job";
import {
  createGame,
  buy,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { COPIES, UNIT } from "../src/data/units";
import { itemScore } from "../src/engine/equipment";
import type { Fighter, Piece } from "../src/engine/types";
const p = (defId: string, uid: number, star = 1, position = 35): Piece => ({
  defId,
  uid,
  star,
  position,
});
const f = (id: string, uid: number, side: 0 | 1 = 0, star = 1): Fighter =>
  Object.assign(army([p(id, uid, star)], side)[0], {
    x: 3,
    y: side ? 3 : 4,
    mana: 100,
    shield: 0,
  });
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});
describe("军医持续范围治疗", () => {
  it("无合法伤员不消耗能量；忽略敌人、阵亡、残魂、火种和范围外伤员", () => {
    const medic = f("medic", 1),
      enemy = f("guard", 2, 1),
      dead = f("guard", 3),
      soul = f("vine", 4),
      egg = f("phoenix", 5, 0, 2),
      far = f("guard", 6);
    enemy.hp = 1;
    dead.hp = 0;
    soul.hp = 1;
    soul.immortal = { duration: 16, until: 30, spent: true };
    egg.hp = 1;
    egg.phoenix = {
      eggUntil: 30,
      spent: true,
      bodyMaxHp: egg.maxHp,
      hatched: false,
    };
    far.hp = 1;
    far.x = 6;
    const c = ctx(medic, enemy, dead, soul, egg, far);
    expect(castSkill(c, medic, enemy)).toBe(false);
    expect(medic.mana).toBe(100);
    medic.hp -= 1;
    expect(castSkill(c, medic, enemy)).toBe(true);
    c.tick = 14;
    advanceAirSkills(c, medic);
    expect(
      c.effects.filter((e) => e.kind === "heal").map((e) => e.target),
    ).toEqual([1]);
  });
  it("一秒后首次，四次脉冲按当前友军和固定区域治疗，走出停止、走入生效", () => {
    const medic = f("medic", 1),
      ally = f("guard", 2),
      other = f("guard", 3),
      enemy = f("guard", 4, 1);
    ally.hp = other.hp = enemy.hp = 100;
    other.x = 6;
    ally.x = 5;
    const c = ctx(medic, ally, other, enemy);
    castSkill(c, medic, enemy);
    expect(medic.air?.cast?.to).toEqual({ x: 3, y: 4 });
    c.tick = 13;
    advanceAirSkills(c, medic);
    expect(ally.hp).toBe(100);
    c.tick = 14;
    advanceAirSkills(c, medic);
    expect(ally.hp).toBe(175);
    expect(other.hp).toBe(100);
    expect(enemy.hp).toBe(100);
    ally.x = 6;
    other.x = 3;
    medic.x = 7; // Frozen field must not follow a moved caster.
    for (c.tick = 15; c.tick <= 26; c.tick++) advanceAirSkills(c, medic);
    expect(ally.hp).toBe(175);
    expect(other.hp).toBe(325);
    expect(medic.healing).toBe(300);
    expect(medic.air?.cast).toBeUndefined();
    expect(advanceAirSkills(c, medic)).toBe(false);
  });
  for (const star of [1, 2, 3])
    it(`${star}星锁定技能强度、每名友军四次且只统计实际治疗`, () => {
      const medic = f("medic", 1, 0, star),
        ally = f("guard", 2, 0, 3),
        enemy = f("guard", 3, 1);
      ally.hp = 100;
      medic.hp = medic.maxHp - 10;
      medic.skillPower = 1.2;
      const c = ctx(medic, ally, enemy);
      castSkill(c, medic, enemy);
      medic.skillPower = 9;
      for (c.tick = 11; c.tick <= 26; c.tick++) advanceAirSkills(c, medic);
      const amount = 4 * Math.round((50 + star * 25) * 1.2);
      expect(ally.hp).toBe(100 + amount);
      expect(medic.hp).toBe(medic.maxHp);
      expect(medic.healing).toBe(amount + 10);
      expect(
        c.effects
          .filter((e) => e.kind === "heal")
          .reduce((n, e) => n + e.amount, 0),
      ).toBe(medic.healing);
      expect(c.events).toHaveLength(0);
    });
  for (const reason of ["stun", "charm", "death"])
    it(`${reason}打断后不再治疗`, () => {
      const medic = f("medic", 1),
        ally = f("guard", 2),
        enemy = f("guard", 3, 1);
      ally.hp = 1;
      const c = ctx(medic, ally, enemy);
      castSkill(c, medic, enemy);
      if (reason === "stun") medic.stunUntil = 99;
      if (reason === "charm")
        medic.charm = { until: 99, attack: medic.attack, side: 0 };
      if (reason === "death") damage(c, enemy, medic, 99999, "true");
      c.tick = 14;
      advanceAirSkills(c, medic);
      expect(medic.air?.cast).toBeUndefined();
      expect(ally.hp).toBe(1);
    });
  it("脉冲重新检查阵营和生命，不治疗已被魅惑为敌军或后来阵亡的目标", () => {
    const medic = f("medic", 1),
      ally = f("guard", 2),
      dead = f("guard", 3),
      enemy = f("guard", 4, 1);
    ally.hp = dead.hp = 10;
    const c = ctx(medic, ally, dead, enemy);
    castSkill(c, medic, enemy);
    ally.side = 1;
    dead.hp = 0;
    c.tick = 14;
    advanceAirSkills(c, medic);
    expect(ally.hp).toBe(10);
    expect(dead.hp).toBe(0);
    expect(medic.healing).toBe(0);
  });
  it("完整、快速和Worker一致，引导时不能移动或普攻，治疗计入结果", () => {
    const left = [p("guard", 1, 3, 35), p("medic", 2, 2, 43)],
      right = [p("turtle", 3, 3, 35), p("infantry", 4, 2, 43)];
    const b = simulate(left, right),
      fast = simulateOutcome(left, right),
      worker = compute({ kind: "replay", left, right, version: "metamorph" });
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect([fast.winner, fast.damage]).toEqual([b.winner, b.damage]);
    expect(worker.kind).toBe("replay");
    if (worker.kind === "replay") expect(worker.battle).toEqual(b);
    expect(
      b.frames.at(-1)!.fighters.find((f) => f.uid === 2)!.healing,
    ).toBeGreaterThan(0);
    let channelFrames = 0;
    for (let i = 1; i < b.frames.length; i++) {
      const a = b.frames[i - 1].fighters.find((f) => f.uid === 2)!,
        n = b.frames[i].fighters.find((f) => f.uid === 2)!;
      if (a.air?.cast && n.air?.cast) {
        channelFrames++;
        expect([n.x, n.y]).toEqual([a.x, a.y]);
        expect(b.frames[i].events.some((e) => e.attacker === 2)).toBe(false);
      }
    }
    expect(channelFrames).toBeGreaterThan(0);
    expect(itemScore(p("medic", 2), "staff")).toBeGreaterThan(
      itemScore(p("medic", 2), "blade"),
    );
    expect(UNIT.medic.traits).toEqual(["步兵", "支援"]);
  });
});
describe("0.18存档增量迁移", () => {
  for (const phase of ["prepare", "battle", "result", "finished"] as const)
    it(phase + "保留资源和旧战斗，仅增加军医池", () => {
      const g = createGame(137);
      let battle: ReturnType<typeof startRound> | undefined;
      // Remove medic from shops before constructing a genuine old-roster fixture.
      for (const pl of g.players)
        for (let i = 0; i < pl.shop.length; i++)
          if (pl.shop[i] === "medic") {
            g.pool.medic++;
            pl.shop[i] = "infantry";
            g.pool.infantry--;
          }
      g.pool.medic = 0; // Exclude the new species while the old-version AI takes its turn.
      if (phase !== "prepare") {
        const pl = g.players[0];
        if (pl.shop[0]) g.pool[pl.shop[0]]++;
        pl.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[pl.shop[0]]--;
        buy(g, pl, 0);
        pl.pieces[0].position = 35;
        if (phase === "finished") pl.hp = 1;
        battle = startRound(g);
        if (phase === "result" || phase === "finished") settle(g, battle!);
      }
      // AI may recruit in startRound; remove only unclaimed new-unit pool entry.
      // The old fixture uses seeded shops above; assert it contains no new unit.
      expect(
        g.players
          .flatMap((pl) => [...pl.pieces.map((p) => p.defId), ...pl.shop])
          .includes("medic"),
      ).toBe(false);
      expect(g.phase).toBe(phase);
      delete g.pool.medic;
      const before = structuredClone(g);
      const decoded = decodeSave(
        JSON.stringify({
          schema: 17,
          rules: "singleplayer-0.18",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 0, speed: 1, paused: false },
        }),
      );
      expect(decoded.status).toBe("migrated");
      expect(decoded.data?.schema).toBe(SAVE_SCHEMA);
      expect(decoded.data!.game).toEqual({
        ...before,
        pool: { ...before.pool, medic: COPIES[1] },
      });
      expect(validGame(decoded.data!.game)).toBe(true);
      if (phase === "battle")
        expect(resumeRound(decoded.data!.game)!.battle).toEqual(battle!.battle);
    });
});

describe("军医AI选择", () => {
  it("已有前排和输出时，选择带法杖的军医且不改动候选对象", () => {
    for (const star of [1, 2, 3]) {
      const player = createGame(41).players[1];
      player.level = 3;
      player.pieces = [
        p("guard", 1, star),
        p("infantry", 2, star),
        p("medic", 3, star),
        { ...p("medic", 4, star), items: ["staff"] },
      ];
      player.pieces.forEach((p) => (p.position = null));
      const before = structuredClone(player);
      const naked = lineupScore(player.pieces.slice(0, 3), AI_PROFILES[1]);
      const equipped = lineupScore(
        [player.pieces[0], player.pieces[1], player.pieces[3]],
        AI_PROFILES[1],
      );
      expect(equipped).toBeGreaterThan(naked);
      expect(chooseLineup(player, "standard").map((p) => p.uid)).toEqual([
        1, 2, 4,
      ]);
      expect(player).toEqual(before);
      deployLineup(player, "standard");
      const deployed = player.pieces.filter((p) => p.position !== null);
      expect(deployed).toHaveLength(3);
      expect(new Set(deployed.map((p) => p.position)).size).toBe(3);
      expect(player.pieces.find((p) => p.uid === 4)!.position).toBeGreaterThan(
        player.pieces[0].position!,
      );
    }
  });
});
