import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  advanceAirSkills,
  castSkill,
  type CombatContext,
} from "../src/engine/abilities";
import { silence } from "../src/engine/infantry-skills";
import {
  CURRENT_COMBAT_VERSION,
  type Fighter,
  type Piece,
} from "../src/engine/types";
import {
  buy,
  createGame,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { COPIES, RULES } from "../src/data/units";
import { abilityCredit, deployLineup } from "../src/engine/ai";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { compute } from "../src/compute/job";
const p = (
  defId: string,
  uid: number,
  star = 1,
  position: number | null = 35,
): Piece => ({ defId, uid, star, position });
const f = (defId: string, uid: number, side: 0 | 1 = 0, star = 1): Fighter =>
  Object.assign(army([p(defId, uid, star)], side)[0], {
    x: 0,
    y: side === 0 ? 7 : 0,
    mana: 100,
    shield: 0,
    magicResist: 0,
  });
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});

describe("特种兵锁定重狙", () => {
  it.each([1, 2, 3])(
    "%i星瞄准0.75秒才结算，技能强度快照、单体眩晕和10秒冷却",
    (star) => {
      const shooter = f("specialist", 1, 0, star),
        target = f("turtle", 2, 1, 3),
        other = f("turtle", 3, 1, 3),
        c = ctx(shooter, target, other);
      other.x = 1;
      shooter.skillPower = 1.5;
      expect(castSkill(c, shooter, target)).toBe(true);
      expect(shooter.mana).toBe(0);
      expect(shooter.skillReadyAt).toBe(50);
      shooter.skillPower = 3;
      shooter.attack = 9999;
      c.tick = 12;
      advanceAirSkills(c, shooter);
      expect(c.events).toHaveLength(0);
      c.tick = 13;
      advanceAirSkills(c, shooter);
      expect(c.events).toHaveLength(1);
      expect(c.events[0]).toMatchObject({
        target: 2,
        amount: 450 * 2 ** (star - 1),
        damageType: "magic",
        skill: true,
      });
      expect(target.stunUntil).toBe(17);
      expect(other.hp).toBe(other.maxHp);
      expect(shooter.signature!.casts).toBe(1);
      expect(shooter.air!.cast).toBeUndefined();
      shooter.mana = 100;
      c.tick = 49;
      expect(castSkill(c, shooter, target)).toBe(false);
      expect(shooter.mana).toBe(100);
      c.tick = 50;
      expect(castSkill(c, shooter, target)).toBe(true);
    },
  );
  it("锁定单位在射程内走位会跟踪，不因更近的敌人出现而转火", () => {
    const shooter = f("specialist", 1),
      target = f("guard", 2, 1, 3),
      near = f("guard", 3, 1),
      c = ctx(shooter, target, near);
    expect(castSkill(c, shooter, target)).toBe(true);
    target.x = 1;
    target.y = 1;
    near.y = 6;
    c.tick = 11;
    advanceAirSkills(c, shooter);
    expect(shooter.air!.cast!.to).toEqual({ x: 1, y: 1 });
    c.tick = 13;
    advanceAirSkills(c, shooter);
    expect(c.events.map((e) => e.target)).toEqual([2]);
    expect(c.events[0].to).toEqual({ x: 1, y: 1 });
  });
  it.each(["dead", "hidden", "friendly", "out-of-range"] as const)(
    "锁定目标%s时取消且不转火/退费",
    (kind) => {
      const shooter = f("specialist", 1),
        target = f("ghostjet", 2, 1),
        other = f("guard", 3, 1),
        c = ctx(shooter, target, other);
      other.y = 1;
      castSkill(c, shooter, target);
      if (kind === "dead") target.hp = 0;
      if (kind === "hidden") target.air!.phaseUntil = 20;
      if (kind === "friendly") target.side = 0;
      if (kind === "out-of-range") target.x = 1;
      c.tick = 11;
      advanceAirSkills(c, shooter);
      expect(shooter.air!.cast).toBeUndefined();
      c.tick = 13;
      advanceAirSkills(c, shooter);
      expect(c.events).toHaveLength(0);
      expect(shooter.mana).toBe(0);
      expect(shooter.skillReadyAt).toBe(50);
    },
  );
  it.each(["stun", "silence", "charm", "death"] as const)(
    "施法者%s立即中断且不返还能量",
    (kind) => {
      const shooter = f("specialist", 1),
        target = f("guard", 2, 1, 3),
        c = ctx(shooter, target);
      castSkill(c, shooter, target);
      c.tick = 11;
      if (kind === "stun") shooter.stunUntil = 20;
      if (kind === "silence") silence(c, target, shooter, 8);
      if (kind === "charm")
        shooter.charm = { until: 20, attack: shooter.attack, side: 0 };
      if (kind === "death") shooter.hp = 0;
      advanceAirSkills(c, shooter);
      c.tick = 13;
      advanceAirSkills(c, shooter);
      expect(c.events).toHaveLength(0);
      expect(shooter.air!.cast).toBeUndefined();
      expect(shooter.mana).toBe(0);
      expect(shooter.skillReadyAt).toBe(50);
    },
  );
  it("开始瞄准检查能量、距离、眩晕、沉默、阵营和隐蔽，失败不消耗", () => {
    const shooter = f("specialist", 1),
      target = f("ghostjet", 2, 1),
      c = ctx(shooter, target);
    shooter.mana = 99;
    expect(castSkill(c, shooter, target)).toBe(false);
    shooter.mana = 100;
    target.x = 1;
    expect(castSkill(c, shooter, target)).toBe(false);
    target.x = 0;
    shooter.stunUntil = 11;
    expect(castSkill(c, shooter, target)).toBe(false);
    shooter.stunUntil = 0;
    shooter.silenceUntil = 11;
    expect(castSkill(c, shooter, target)).toBe(false);
    shooter.silenceUntil = 0;
    target.side = 0;
    expect(castSkill(c, shooter, target)).toBe(false);
    target.side = 1;
    target.air!.phaseUntil = 20;
    expect(castSkill(c, shooter, target)).toBe(false);
    expect(shooter.mana).toBe(100);
    expect(shooter.signature!.casts).toBe(0);
    target.air!.phaseUntil = 0;
    expect(castSkill(c, shooter, target)).toBe(true);
  });
  it("护盾、法抗和实际伤害独立计数，命中眩晕打断敌人蓄力", () => {
    const shooter = f("specialist", 1),
      target = f("arhat", 2, 1, 3),
      c = ctx(shooter, target);
    target.shield = 200;
    target.magicResist = 0.2;
    target.armor = 100;
    target.windup = { until: 20, target: 1, damage: 999 };
    castSkill(c, shooter, target);
    c.tick = 13;
    advanceAirSkills(c, shooter);
    expect(c.events[0]).toMatchObject({ amount: 40, absorbed: 200 });
    expect(target.windup).toBeUndefined();
    expect(target.stunUntil).toBe(17);
  });
  it.each(["immortal", "phoenix"] as const)(
    "%s免疫额外眩晕，伤害仍走正常生命周期",
    (kind) => {
      const shooter = f("specialist", 1),
        target = f(kind === "phoenix" ? "phoenix" : "vine", 2, 1, 2),
        c = ctx(shooter, target);
      if (kind === "immortal")
        target.immortal = { duration: 16, until: 40, spent: true };
      else {
        target.hp = 1;
      }
      castSkill(c, shooter, target);
      c.tick = 13;
      advanceAirSkills(c, shooter);
      expect(target.stunUntil).toBe(0);
      if (kind === "immortal") expect(c.events[0].immune).toBe(true);
      else expect(target.phoenix!.eggUntil).toBeGreaterThan(c.tick);
    },
  );
  it("致死反伤后不继续施法，不产生第二次射击", () => {
    const shooter = f("specialist", 1),
      target = f("turtle", 2, 1, 3),
      c = ctx(shooter, target);
    target.reflection = 9999;
    castSkill(c, shooter, target);
    c.tick = 13;
    advanceAirSkills(c, shooter);
    expect(shooter.hp).toBe(0);
    expect(shooter.air!.cast).toBeUndefined();
    c.tick = 14;
    advanceAirSkills(c, shooter);
    expect(c.events.filter((e) => e.attacker === 1)).toHaveLength(1);
  });
});

describe("特种兵整局集成", () => {
  it("完整快照、快速结算、Worker一致，瞄准期间不移动普攻，冷却期继续攻击", () => {
    const left = [p("specialist", 1, 3, 56), p("guard", 2, 3, 35)],
      right = [p("turtle", 101, 3), p("medic", 102, 3, 43)];
    const before = structuredClone([left, right]),
      b = simulate(left, right),
      fast = simulateOutcome(left, right);
    expect(
      compute({ kind: "replay", left, right, version: CURRENT_COMBAT_VERSION }),
    ).toEqual({ kind: "replay", battle: b });
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect(fast.winner).toBe(b.winner);
    expect(fast.damage).toBe(b.damage);
    expect([left, right]).toEqual(before);
    const castFrames = b.frames.filter((fr) =>
      fr.effects.some((e) => e.kind === "cast" && e.source === 1),
    );
    expect(castFrames.length).toBeGreaterThan(0);
    for (let i = 1; i < castFrames.length; i++)
      expect(
        castFrames[i].tick - castFrames[i - 1].tick,
      ).toBeGreaterThanOrEqual(40);
    let channelFrames = 0;
    for (let i = 1; i < b.frames.length; i++) {
      const prev = b.frames[i - 1].fighters.find((f) => f.uid === 1)!,
        now = b.frames[i].fighters.find((f) => f.uid === 1)!;
      if (prev.air?.cast && now.hp > 0) {
        channelFrames++;
        expect([now.x, now.y]).toEqual([prev.x, prev.y]);
        expect(
          b.frames[i].events.some((e) => e.attacker === 1 && !e.skill),
        ).toBe(false);
      }
    }
    expect(channelFrames).toBeGreaterThan(0);
    expect(
      b.frames.some(
        (fr) =>
          fr.events.some((e) => e.attacker === 1 && !e.skill) &&
          (fr.fighters.find((f) => f.uid === 1)!.skillReadyAt ?? 0) > fr.tick,
      ),
    ).toBe(true);
  });
  it("正常付费购买三枚升二星、共享卡池守恒，AI后排部署和装备估值", () => {
    const g = createGame(91, "classic"),
      me = g.players[0];
    for (let i = 0; i < 3; i++) {
      if (me.shop[i]) g.pool[me.shop[i]!]++;
      me.shop[i] = "specialist";
      g.pool.specialist--;
      expect(buy(g, me, i)).toBe(true);
    }
    expect(me.pieces).toHaveLength(1);
    expect(me.pieces[0].star).toBe(2);
    expect(validGame(g)).toBe(true);
    const detail = pieceDetails(me.pieces[0]);
    expect(detail).toMatchObject({
      hp: 900,
      attack: 224,
      armor: 5,
      range: 7,
      interval: 1.75,
      action: "半跪锁定拉栓重狙",
    });
    deployLineup(me, "standard");
    expect(me.pieces[0].position).toBeGreaterThanOrEqual(48);
    expect(
      abilityCredit({ ...me.pieces[0], items: ["staff"] }),
    ).toBeGreaterThan(abilityCredit(me.pieces[0]));
  });
  it.each(["prepare", "battle", "result", "finished"] as const)(
    "0.24 %s存档只增加25份卡池，资源、棋子、历史与回放保留",
    (phase) => {
      const g = createGame(137, "classic"),
        me = g.players[0];
      for (const pl of g.players)
        pl.shop = pl.shop.map((id) => {
          if (id !== "specialist") return id;
          g.pool.specialist++;
          g.pool.infantry--;
          return "infantry";
        });
      g.pool.specialist = 0;
      let result: ReturnType<typeof startRound> = null;
      if (phase !== "prepare") {
        if (me.shop[0]) g.pool[me.shop[0]!]++;
        me.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[me.shop[0]]--;
        buy(g, me, 0);
        me.pieces[0].position = 35;
        if (phase === "finished") me.hp = 1;
        result = startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
      }
      expect(g.phase).toBe(phase);
      delete g.pool.specialist;
      const before = structuredClone(g),
        out = decodeSave(
          JSON.stringify({
            schema: 23,
            rules: "singleplayer-0.24",
            savedAt: 1,
            revision: 1,
            game: g,
            playback: { time: 3, speed: 2, paused: true },
          }),
        );
      expect(out.status).toBe("migrated");
      expect(out.data).toMatchObject({
        schema: SAVE_SCHEMA,
        rules: RULES.version,
        playback: { time: 3, speed: 2, paused: true },
      });
      expect(out.data!.game).toEqual({
        ...before,
        pool: { ...before.pool, specialist: COPIES[3] },
      });
      expect(validGame(out.data!.game)).toBe(true);
      if (phase === "battle")
        expect(resumeRound(out.data!.game)!.battle).toEqual(result!.battle);
    },
  );
});
