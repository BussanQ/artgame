import { CURRENT_COMBAT_VERSION } from "../src/engine/types";
import { advanceSonic } from "../src/engine/wild-skills";
import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  damage,
  heal,
  gainMana,
  advanceAirSkills,
  type CombatContext,
} from "../src/engine/abilities";
import {
  isPhoenixEgg,
  hatchPhoenix,
  phoenixFlameCells,
} from "../src/engine/phoenix";
import { usesEnergy, skillReady, attackTargets } from "../src/engine/triggers";
import { fighterSprite } from "../src/engine/summons";
import { analyzeBattle } from "../src/engine/battle-analysis";
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
import { pieceStrength } from "../src/engine/ai";
import type { Fighter, Piece } from "../src/engine/types";
const p = (defId: string, uid: number, star = 1, position = 35): Piece => ({
  defId,
  uid,
  star,
  position,
});
const f = (id: string, uid: number, side: 0 | 1 = 0, star = 1) =>
  Object.assign(army([p(id, uid, star)], side)[0], {
    x: 3,
    y: side ? 3 : 4,
    shield: 0,
    mana: 100,
  });
const context = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});
describe("不死鸟火种与重生", () => {
  it("声波致死化蛋清除全部声波，不能崩溃或把同批剩余伤害带进火种", () => {
    const phoenix = f("phoenix", 1, 0, 2),
      bat = f("bat", 2, 1),
      otherBat = f("bat", 3, 1);
    const c = context(phoenix, bat, otherBat);
    phoenix.hp = 1;
    phoenix.magicResist = 0;
    phoenix.sonic = [
      { source: bat.uid, next: c.tick, remaining: 5, damage: 100 },
      { source: otherBat.uid, next: c.tick, remaining: 5, damage: 900 },
    ];
    expect(() => advanceSonic(c)).not.toThrow();
    expect(isPhoenixEgg(phoenix)).toBe(true);
    expect(phoenix.hp).toBe(800);
    expect(phoenix.sonic).toBeUndefined();
    expect(c.events.filter((e) => e.target === phoenix.uid)).toHaveLength(1);
    c.tick += 4;
    advanceSonic(c);
    expect(phoenix.hp).toBe(800);
    c.tick += 8;
    hatchPhoenix(c);
    expect(phoenix.hp).toBe(2000);
    expect(phoenix.sonic).toBeUndefined();
  });

  it("一星正常阵亡，二/三星分别留下800/1600生命火种且保持身份与占位", () => {
    for (const star of [1, 2, 3]) {
      const a = f("phoenix", 1, 0, star),
        b = f("guard", 2, 1),
        c = context(a, b);
      const original = {
        uid: a.uid,
        x: a.x,
        y: a.y,
        star: a.star,
        attack: a.attack,
      };
      const before = a.hp;
      expect(damage(c, b, a, 99999, "true")).toBe(before);
      expect(a).toMatchObject(original);
      expect(isPhoenixEgg(a)).toBe(star >= 2);
      expect(a.hp).toBe(star === 1 ? 0 : 800 * 2 ** (star - 2));
      expect(c.events[0].amount).toBe(before);
      if (star >= 2) {
        expect(a.air?.flying).toBe(false);
        expect(a.phoenix?.eggUntil).toBe(22);
        expect(fighterSprite(a)).toBe("phoenix-egg");
        expect(attackTargets(b, c.fighters)).toContain(a);
        expect(usesEnergy(a)).toBe(false);
        expect(skillReady(a)).toBe(false);
      }
    }
  });
  it("火种不治疗、不回能、不加盾；不能被魅惑，孵化不计作治疗", () => {
    const a = f("phoenix", 1, 0, 2),
      b = f("guard", 2, 1),
      deer = f("deer", 3),
      spider = f("spider", 4, 1);
    const c = context(a, b, deer, spider);
    damage(c, b, a, 99999, "true");
    a.hp = 300;
    heal(c, deer, a, 9999);
    gainMana(a, 100, c.tick);
    expect(a.hp).toBe(300);
    expect(a.mana).toBe(0);
    castSkill(c, deer, b);
    expect(a.shield).toBe(0);
    expect(a.hp).toBe(300);
    castSkill(c, spider, a);
    expect(a.charm).toBeUndefined();
    c.tick = 21;
    hatchPhoenix(c);
    expect(isPhoenixEgg(a)).toBe(true);
    c.tick = 22;
    hatchPhoenix(c);
    expect(a.hp).toBe(2000);
    expect(a.maxHp).toBe(2000);
    expect(a.phoenix?.hatched).toBe(true);
    expect(a.mana).toBe(0);
    expect(a.air?.flying).toBe(true);
    expect(a.healing).toBe(0);
    expect(fighterSprite(a)).toBe("phoenix");
    damage(c, b, a, 99999, "true");
    expect(a.hp).toBe(0);
    c.tick = 40;
    hatchPhoenix(c);
    expect(a.hp).toBe(0);
  });
  it("火种被击碎后永不孵化，过量伤害不透过本体一次打碎两条生命", () => {
    const a = f("phoenix", 1, 0, 2),
      b = f("guard", 2, 1),
      c = context(a, b);
    damage(c, b, a, 999999, "true");
    expect(a.hp).toBe(800);
    damage(c, b, a, 900, "true");
    expect(a.hp).toBe(0);
    c.tick = 100;
    hatchPhoenix(c);
    expect(a.hp).toBe(0);
    expect(a.phoenix?.hatched).toBe(false);
  });
  it("变蛋终止引导、负面状态与魅惑，装备生命在重生时恢复", () => {
    const a = army([{ ...p("phoenix", 1, 2), items: ["heart"] }], 0)[0],
      b = f("guard", 2, 1),
      c = context(a, b);
    a.mana = 100;
    castSkill(c, a, b);
    const body = a.maxHp,
      attack = a.attack;
    a.charm = { side: 0, attack, until: 100 };
    a.side = 1;
    a.attack *= 1.5;
    a.sonic = [{ source: 2, next: 11, remaining: 4, damage: 30 }];
    a.stunUntil = 30;
    damage(c, b, a, 99999, "true");
    expect(a.air?.cast).toBeUndefined();
    expect(a.sonic).toBeUndefined();
    expect(a.charm).toBeUndefined();
    expect(a.side).toBe(0);
    expect(a.attack).toBe(attack);
    expect(a.stunUntil).toBe(0);
    c.tick = 22;
    hatchPhoenix(c);
    expect(a.maxHp).toBe(body);
    expect(a.hp).toBe(body);
  });
  it("火种落地后失去空军闪避和对空克制，重生恢复空军属性", () => {
    const a = f("phoenix", 1, 0, 2),
      b = f("cannon", 2, 1),
      r = f("bat", 3, 1),
      c = context(a, b, r);
    a.armor = 0;
    a.air!.evasion = 1;
    r.groundBonus = 0.35;
    damage(c, b, a, 99999, "true");
    expect(damage(c, r, a, 100)).toBe(135);
    expect(damage(c, b, a, 100)).toBe(100);
    c.tick = 22;
    hatchPhoenix(c);
    expect(damage(c, r, a, 100)).toBe(0);
    expect(damage(c, b, a, 100)).toBe(150);
  });
});
describe("燎原矩形引导", () => {
  it("引擎与表现共用定向5×3范围，边缘裁剪且不打身后", () => {
    const cells = phoenixFlameCells({ x: 3, y: 6 }, { x: 3, y: 3 });
    expect(cells).toHaveLength(15);
    expect(cells).toContainEqual({ x: 2, y: 1 });
    expect(cells).not.toContainEqual({ x: 3, y: 6 });
    expect(phoenixFlameCells({ x: 0, y: 0 }, { x: 4, y: 0 })).toHaveLength(10);
    expect(phoenixFlameCells({ x: 7, y: 7 }, { x: 0, y: 7 })).toHaveLength(10);
  });
  it("每秒一段共4次，以当前占位命中；释放时冻结伤害与方向", () => {
    const a = f("phoenix", 1),
      b = f("guard", 2, 1),
      outside = f("guard", 3, 1),
      c = context(a, b, outside);
    a.x = 3;
    a.y = 6;
    b.x = 3;
    b.y = 4;
    b.hp = b.maxHp = 5000;
    b.magicResist = 0;
    outside.x = 5;
    outside.y = 4;
    const base = a.attack * 0.9;
    expect(castSkill(c, a, b)).toBe(true);
    a.attack *= 10;
    const outsideHp = outside.hp;
    for (const tick of [11, 12, 13]) {
      c.tick = tick;
      expect(advanceAirSkills(c, a)).toBe(true);
    }
    expect(b.hp).toBe(5000);
    for (const tick of [14, 18, 22, 26]) {
      c.tick = tick;
      advanceAirSkills(c, a);
    }
    expect(b.hp).toBe(5000 - 4 * Math.round(base));
    expect(outside.hp).toBe(outsideHp);
    expect(a.air?.cast).toBeUndefined();
    expect(c.effects.filter((e) => e.name === "不死烈焰")).toHaveLength(4);
    expect(
      c.events
        .filter((e) => e.attacker === 1)
        .every((e) => e.skill && !e.primary),
    ).toBe(true);
  });
  for (const reason of ["stun", "charm", "death"] as const)
    it(reason + "中断后不再喷火", () => {
      const a = f("phoenix", 1, 0, 2),
        b = f("guard", 2, 1),
        c = context(a, b);
      castSkill(c, a, b);
      if (reason === "stun") {
        b.mana = 100;
        castSkill(c, b, a);
      }
      if (reason === "charm")
        a.charm = { side: 0, attack: a.attack, until: 30 };
      if (reason === "death") damage(c, b, a, 99999, "true");
      const hp = b.hp;
      c.tick = 15;
      advanceAirSkills(c, a);
      expect(a.air?.cast).toBeUndefined();
      expect(b.hp).toBe(hp);
    });
  it("喷火被反伤打成火种立即停止，不能借新生命完成余下目标伤害", () => {
    const a = f("phoenix", 1, 0, 2),
      b = f("guard", 2, 1),
      d = f("guard", 3, 1),
      c = context(a, b, d);
    a.y = 6;
    b.y = 4;
    d.y = 3;
    a.hp = 10;
    b.reflection = 20;
    castSkill(c, a, b);
    const hp = d.hp;
    c.tick = 14;
    advanceAirSkills(c, a);
    expect(isPhoenixEgg(a)).toBe(true);
    expect(d.hp).toBe(hp);
    expect(a.air?.cast).toBeUndefined();
  });
  it("完整、快速、Worker及占位统计一致；最后一枚火种不会提前结束战斗", () => {
    const left = [p("phoenix", 1, 2)],
      right = [p("guard", 2, 3)];
    const original = structuredClone([left, right]),
      b = simulate(left, right),
      fast = simulateOutcome(left, right);
    const w = compute({
      kind: "replay",
      left,
      right,
      version: CURRENT_COMBAT_VERSION,
    });
    expect(w.kind).toBe("replay");
    if (w.kind !== "replay") return;
    expect(JSON.stringify(w.battle)).toBe(JSON.stringify(b));
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect([fast.winner, fast.damage]).toEqual([b.winner, b.damage]);
    expect([left, right]).toEqual(original);
    expect(
      b.frames.some((fr) => fr.effects.some((e) => e.name === "涅槃火种")),
    ).toBe(true);
    expect(
      b.frames.some((fr) => fr.effects.some((e) => e.name === "浴火重生")),
    ).toBe(true);
    for (const fr of b.frames) {
      const live = fr.fighters.filter((f) => f.hp > 0);
      expect(new Set(live.map((f) => f.x + ":" + f.y)).size).toBe(live.length);
      const egg = fr.fighters.find(isPhoenixEgg);
      if (egg && egg.hp > 0)
        expect(
          fr.events.some((e) => e.attacker === egg.uid && !e.reflected),
        ).toBe(false);
    }
    for (const row of analyzeBattle(b).sides.flatMap((s) => s.fighters))
      expect(row.damage).toBe(
        b.frames.at(-1)!.fighters.find((f) => f.uid === row.uid)!.damage,
      );
  });
  it("AI识别二星的重生价值，技能装备对喷火有价值", () => {
    expect(pieceStrength(p("phoenix", 1, 2))).toBeGreaterThan(
      pieceStrength(p("phoenix", 1)) * 2,
    );
    expect(itemScore(p("phoenix", 1), "staff")).toBeGreaterThan(
      itemScore(p("phoenix", 1), "blade"),
    );
  });
});
describe("0.16到0.17卡池迁移", () => {
  for (const phase of ["prepare", "battle", "result", "finished"] as const)
    it(phase + "保留旧资源、战斗和历史，仅补新卡池", () => {
      const g = createGame(137, "classic");
      g.combatVersion = "metamorph";
      let result: ReturnType<typeof startRound>;
      if (phase !== "prepare") {
        const me = g.players[0];
        if (me.shop[0]) g.pool[me.shop[0]]++;
        me.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[me.shop[0]]--;
        buy(g, me, 0);
        me.pieces[0].position = 35;
        if (phase === "finished") me.hp = 1;
        result = startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
      }
      expect(g.phase).toBe(phase);
      delete g.pool.phoenix;
      const before = structuredClone(g);
      const decoded = decodeSave(
        JSON.stringify({
          schema: 15,
          rules: "singleplayer-0.16",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 0, speed: 1, paused: false },
        }),
      );
      expect(decoded.status).toBe("migrated");
      expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
      expect(decoded.data!.game).toEqual({
        ...before,
        combatVersion:
          phase === "prepare" ? CURRENT_COMBAT_VERSION : "metamorph",
        pool: { ...before.pool, phoenix: COPIES[UNIT.phoenix.cost] },
      });
      expect(validGame(decoded.data!.game)).toBe(true);
      if (phase === "battle")
        expect(JSON.stringify(resumeRound(decoded.data!.game)!.battle)).toBe(
          JSON.stringify(result!.battle),
        );
    });
});
