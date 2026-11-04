import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  advanceFaithArrow,
  startFaithArrow,
  faithAttackCount,
} from "../src/engine/birdrider";
import {
  damage,
  gainMana,
  castSkill,
  type CombatContext,
} from "../src/engine/abilities";
import { silence } from "../src/engine/infantry-skills";
import { skillGauge, skillReady, usesEnergy } from "../src/engine/triggers";
import {
  type Fighter,
  type Piece,
  CURRENT_COMBAT_VERSION,
} from "../src/engine/types";
import {
  createGame,
  buy,
  sell,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { itemScore } from "../src/engine/equipment";
import { abilityCredit, deployLineup } from "../src/engine/ai";
import { RULES, COPIES } from "../src/data/units";
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
    y: side ? 3 : 7,
    shield: 0,
    armor: 0,
    magicResist: 0,
  });
const ctx = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 10,
  events: [],
  effects: [],
});
function ready(star = 1) {
  const a = f("birdrider", 1, 0, star),
    b = f("turtle", 2, 1, 3),
    c = ctx(a, b);
  a.bird!.shots = faithAttackCount(star);
  expect(startFaithArrow(c, a, b)).toBe(true);
  return { a, b, c };
}

describe("鸟骑兵信仰之箭", () => {
  it.each([1, 2, 3])(
    "%i星先普攻6/5/4次，下次蓄力0.5秒三倍物伤；计数循环且不重复结算",
    (star) => {
      const a = f("birdrider", 1, 0, star),
        b = f("turtle", 2, 1, 3),
        c = ctx(a, b);
      a.attackBoost = { until: 100, ratio: 0.5 };
      a.skillPower = 9;
      expect(skillGauge(a).progress).toBe(0);
      for (let i = 0; i < 7 - star; i++) {
        expect(startFaithArrow(c, a, b)).toBe(false);
        expect(a.bird!.shots).toBe(i + 1);
      }
      expect(skillGauge(a).progress).toBe(1);
      expect(startFaithArrow(c, a, b)).toBe(true);
      expect(a.bird!.shots).toBe(0);
      expect(startFaithArrow(c, a, b)).toBe(false);
      expect(a.bird!.shots).toBe(0);
      a.attack = 9999;
      a.attackBoost = undefined;
      c.tick = 11;
      expect(advanceFaithArrow(c, a)).toBe(true);
      expect(c.events).toHaveLength(0);
      c.tick = 12;
      expect(advanceFaithArrow(c, a)).toBe(true);
      expect(c.events).toHaveLength(1);
      expect(c.events[0]).toMatchObject({
        amount: 54 * 2 ** (star - 1) * 4.5,
        skill: false,
        empowered: true,
        damageType: "physical",
      });
      expect(a.signature!.casts).toBe(1);
      expect(a.bird!.draw).toBeUndefined();
      expect(advanceFaithArrow(c, a)).toBe(false);
      expect(startFaithArrow(c, a, b)).toBe(false);
      expect(a.bird!.shots).toBe(1);
    },
  );
  it("无能量，晶体/法杖不加收益，沉默和封能不中断；射程内跟踪锁定目标", () => {
    const a = army([{ ...p("birdrider", 1), items: ["staff"] }], 0)[0],
      b = f("turtle", 2, 1, 3),
      c = ctx(a, b);
    a.x = 0;
    a.y = 7;
    a.bird!.shots = 6;
    expect(a.mana).toBe(0);
    expect(usesEnergy(a)).toBe(false);
    gainMana(a, 100, 10);
    expect(a.mana).toBe(0);
    expect(skillReady(a)).toBe(false);
    expect(castSkill(c, a, b)).toBe(false);
    a.manaLockUntil = 100;
    expect(startFaithArrow(c, a, b)).toBe(true);
    silence(c, b, a, 10);
    b.x = 1;
    b.y = 4;
    c.tick = 12;
    advanceFaithArrow(c, a);
    expect(c.events[0]).toMatchObject({
      target: 2,
      amount: 162,
      to: { x: 1, y: 4 },
    });
    expect(itemScore(p("birdrider", 1), "crystal")).toBe(0);
    expect(itemScore(p("birdrider", 1), "staff")).toBe(0);
    expect(itemScore(p("birdrider", 1), "blade")).toBeGreaterThan(0);
    expect(abilityCredit({ ...p("birdrider", 1), items: ["staff"] })).toBe(
      abilityCredit(p("birdrider", 1)),
    );
  });
  it.each(["dead", "hidden", "friendly", "range"] as const)(
    "目标%s时取消并消耗强化机会，不转火",
    (kind) => {
      const { a, b, c } = ready();
      const other = f("guard", 3, 1);
      other.y = 6;
      c.fighters.push(other);
      if (kind === "dead") b.hp = 0;
      if (kind === "hidden") b.air!.phaseUntil = 100;
      if (kind === "friendly") b.side = 0;
      if (kind === "range") b.y = 0;
      c.tick = 11;
      advanceFaithArrow(c, a);
      expect(c.events).toHaveLength(0);
      expect(a.bird).toEqual({ shots: 0 });
      c.tick = 12;
      expect(advanceFaithArrow(c, a)).toBe(false);
    },
  );
  it.each(["stun", "charm", "dead"] as const)(
    "施放者%s取消蓄力，不残留射击",
    (kind) => {
      const { a, b, c } = ready();
      if (kind === "stun") a.stunUntil = 20;
      if (kind === "charm") a.charm = { until: 20, attack: a.attack, side: 0 };
      if (kind === "dead") damage(c, b, a, 99999, "true", true);
      c.events = [];
      c.tick = 11;
      advanceFaithArrow(c, a);
      expect(a.bird).toEqual({ shots: 0 });
      c.tick = 12;
      expect(advanceFaithArrow(c, a)).toBe(false);
      expect(c.events).toHaveLength(0);
    },
  );
  it("没有合法目标、眩晕和魅惑期间不提前累计次数", () => {
    const a = f("birdrider", 1),
      b = f("turtle", 2, 1),
      c = ctx(a, b);
    for (const mutate of [
      () => {
        b.hp = 0;
      },
      () => {
        b.hp = b.maxHp;
        b.y = 0;
      },
      () => {
        b.y = 3;
        a.stunUntil = 20;
      },
      () => {
        a.stunUntil = 0;
        a.charm = { until: 20, attack: a.attack, side: 0 };
      },
    ]) {
      mutate();
      expect(startFaithArrow(c, a, b)).toBe(false);
      expect(a.bird!.shots).toBe(0);
    }
  });
  it("按普攻破甲、护盾和吸血处理，不按技能强度增伤", () => {
    const { a, b, c } = ready();
    a.hp = 200;
    a.lifesteal = 0.5;
    a.attackShred = 3;
    b.armor = 10;
    b.shield = 20;
    c.tick = 12;
    advanceFaithArrow(c, a);
    expect(c.events[0]).toMatchObject({
      amount: 94,
      absorbed: 20,
      skill: false,
      empowered: true,
    });
    expect(b.armorBreak).toBe(3);
    expect(a.hp).toBe(247);
    expect(a.mana).toBe(0);
  });
  it("强化箭可被飞行闪避，普通攻击落空仍推进计数", () => {
    const a = f("birdrider", 1),
      b = f("ghostjet", 2, 1),
      c = ctx(a, b);
    b.air!.evasion = 1;
    expect(startFaithArrow(c, a, b)).toBe(false);
    damage(c, a, b, a.attack);
    expect(c.events[0].evaded).toBe(true);
    expect(a.bird!.shots).toBe(1);
    a.bird!.shots = 6;
    expect(startFaithArrow(c, a, b)).toBe(true);
    c.tick = 12;
    advanceFaithArrow(c, a);
    expect(c.events[1]).toMatchObject({
      evaded: true,
      empowered: true,
      amount: 0,
      skill: false,
    });
    expect(a.bird!.shots).toBe(0);
  });
  it("不朽免伤和致死反伤各结算一次，不留下蓄力或额外箭", () => {
    const { a, b, c } = ready();
    b.immortal = { spent: true, until: 100, duration: 16 };
    b.reflection = 9999;
    c.tick = 12;
    advanceFaithArrow(c, a);
    expect(c.events[0]).toMatchObject({
      immune: true,
      empowered: true,
      amount: 0,
    });
    expect(c.events.filter((e) => e.attacker === 1)).toHaveLength(1);
    expect(a.hp).toBe(0);
    expect(a.bird!.draw).toBeUndefined();
  });
});

describe("鸟骑兵单机集成", () => {
  it("完整、快速和Worker战果一致，蓄力阶段不移动/额外攻击，普通与强化事件循环", () => {
    const left = [p("birdrider", 1, 3, 56), p("guard", 2, 3)],
      right = [p("turtle", 101, 3), p("medic", 102, 3, 43)];
    const before = structuredClone([left, right]),
      b = simulate(left, right),
      fast = simulateOutcome(left, right);
    expect(
      compute({ kind: "replay", left, right, version: CURRENT_COMBAT_VERSION }),
    ).toEqual({ kind: "replay", battle: b });
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect([fast.winner, fast.damage]).toEqual([b.winner, b.damage]);
    expect([left, right]).toEqual(before);
    const attacks = b.frames.flatMap((fr) =>
      fr.events.filter((e) => e.attacker === 1 && e.primary),
    );
    expect(attacks.filter((e) => e.empowered).length).toBeGreaterThan(0);
    expect(attacks.slice(0, 5).map((e) => !!e.empowered)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
    let drawing = 0;
    for (let i = 1; i < b.frames.length; i++) {
      const prev = b.frames[i - 1].fighters.find((f) => f.uid === 1)!,
        now = b.frames[i].fighters.find((f) => f.uid === 1)!;
      expect(now.mana).toBe(0);
      if (prev.bird?.draw && now.hp > 0) {
        drawing++;
        expect([now.x, now.y]).toEqual([prev.x, prev.y]);
        if (prev.bird.draw.until > b.frames[i].tick)
          expect(b.frames[i].events.some((e) => e.attacker === 1)).toBe(false);
      }
    }
    expect(drawing).toBeGreaterThan(0);
  });
  it("付费购买合成与出售保持共享卡池，图鉴属性和AI后排定位一致", () => {
    const g = createGame(137, "classic"),
      me = g.players[0],
      gold = me.gold;
    for (let i = 0; i < 3; i++) {
      if (me.shop[i]) g.pool[me.shop[i]!]++;
      me.shop[i] = "birdrider";
      g.pool.birdrider--;
      expect(buy(g, me, i)).toBe(true);
    }
    expect(me.gold).toBe(gold - 3);
    expect(me.pieces).toHaveLength(1);
    expect(me.pieces[0].star).toBe(2);
    expect(validGame(g)).toBe(true);
    expect(pieceDetails(me.pieces[0])).toMatchObject({
      hp: 800,
      attack: 108,
      armor: 5,
      range: 4,
      interval: 1.5,
      action: "跨鞍张弓振羽",
    });
    deployLineup(me, "standard");
    expect(me.pieces[0].position).toBeGreaterThanOrEqual(48);
    expect(sell(g, me, me.pieces[0].uid)).toBe(true);
    expect(me.gold).toBe(gold);
    expect(validGame(g)).toBe(true);
  });
  it.each(["prepare", "battle", "result", "finished"] as const)(
    "0.25 %s存档只补45份卡池，保留资源、版本与回放",
    (phase) => {
      const g = createGame(137, "classic"),
        me = g.players[0];
      for (const pl of g.players)
        pl.shop = pl.shop.map((id) => {
          if (id !== "birdrider") return id;
          g.pool.birdrider++;
          g.pool.infantry--;
          return "infantry";
        });
      g.pool.birdrider = 0;
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
      delete g.pool.birdrider;
      const before = structuredClone(g),
        out = decodeSave(
          JSON.stringify({
            schema: 24,
            rules: "singleplayer-0.25",
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
        pool: { ...before.pool, birdrider: COPIES[1] },
      });
      expect(validGame(out.data!.game)).toBe(true);
      if (phase === "battle")
        expect(resumeRound(out.data!.game)!.battle).toEqual(result!.battle);
    },
  );
});
