import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  recordStaffAttack,
  retargetStaff,
  staffArmor,
  staffSpeed,
} from "../src/engine/staffthrall";
import {
  attackInterval,
  castSkill,
  damage,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import {
  attackTargets,
  effectiveArmor,
  skillGauge,
  skillReady,
  usesEnergy,
} from "../src/engine/triggers";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import {
  createGame,
  buy,
  move,
  startRound,
  settle,
  resumeRound,
} from "../src/engine/game";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import {
  availableUnits,
  isRecruitable,
  rotationTraits,
  type Series,
} from "../src/engine/rotation";
import { abilityCredit } from "../src/engine/ai";
import { itemScore } from "../src/engine/equipment";
import { RULES, UNIT } from "../src/data/units";
import { skillDescription } from "../src/data/skills";
import { STAFFTHRALL_DEMO } from "../src/data/staffthrall-demo";
import { compute } from "../src/compute/job";
import { MELEE_ACTIONS, meleePose } from "../src/render/melee";
import { BattleSoundTrack } from "../src/audio/cues";
import {
  CURRENT_COMBAT_VERSION,
  type Game,
  type Piece,
} from "../src/engine/types";
import frozen from "./fixtures/pre-v038-replays.json";

const piece = (defId: string, uid: number, star = 1, position = 35): Piece => ({
  defId,
  uid,
  star,
  position,
});
function fixture(star = 1) {
  const source = Object.assign(army([piece("staffthrall", 101, star)], 0)[0], {
    x: 3,
    y: 3,
  });
  const target = Object.assign(army([piece("guard", 201, 3)], 1)[0], {
    x: 3,
    y: 2,
    hp: 1e6,
    maxHp: 1e6,
    shield: 0,
    armor: 0,
  });
  const other = Object.assign(army([piece("guard", 202, 3)], 1)[0], {
    x: 4,
    y: 3,
    hp: 1e6,
    maxHp: 1e6,
    shield: 0,
    armor: 0,
  });
  const ctx: CombatContext = {
    fighters: [source, target, other],
    tick: 1,
    events: [],
    effects: [],
  };
  return { source, target, other, ctx };
}
function hit(f: ReturnType<typeof fixture>) {
  const count = recordStaffAttack(f.source, f.target);
  return damage(
    f.ctx,
    f.source,
    f.target,
    f.source.attack,
    "physical",
    false,
    true,
    0,
    false,
    false,
    false,
    false,
    count,
  );
}
const envelope = (game: Game, schema = SAVE_SCHEMA, rules = RULES.version) =>
  JSON.stringify({
    schema,
    rules,
    savedAt: 1,
    revision: 1,
    game,
    playback: { time: 3, speed: 2, paused: true },
  });

describe("棍奴疾风", () => {
  it.each([1, 2, 3])(
    "%i星被动按攻击次数叠速，满层才有50护甲且不改永久数值",
    (star) => {
      const f = fixture(star),
        base = 2 ** (star - 1);
      expect(f.source).toMatchObject({
        maxHp: 900 * base,
        attack: 104 * base,
        armor: 5,
        mana: 0,
      });
      expect(UNIT.staffthrall).toMatchObject({
        cost: 4,
        traits: ["傀儡", "护卫"],
        range: 1,
        interval: 5,
      });
      expect(usesEnergy(f.source)).toBe(false);
      expect(skillReady(f.source)).toBe(false);
      gainMana(f.source, 100, f.ctx.tick);
      expect(f.source.mana).toBe(0);
      expect(castSkill(f.ctx, f.source, f.target)).toBe(false);
      for (let n = 1; n <= 12; n++) {
        hit(f);
        const stacks = Math.min(n, 10),
          rate = [0.1, 0.15, 0.2][star - 1];
        expect(f.source.gale?.stacks).toBe(stacks);
        expect(attackInterval(f.source, 1)).toBeCloseTo(
          5 / (1 + stacks * rate),
        );
        expect(effectiveArmor(f.source, 1, f.ctx.fighters)).toBe(
          stacks === 10 ? 55 : 5,
        );
        expect(f.ctx.events.at(-1)).toMatchObject({
          gale: stacks,
          skill: false,
          damageType: "physical",
        });
        expect(f.ctx.events.at(-1)?.empowered).toBeUndefined();
      }
      expect(f.source.armor).toBe(5);
      expect(f.ctx.effects).toEqual([]);
      expect(skillGauge(f.source).progress).toBe(1);
      expect(skillDescription("staffthrall")).toContain(
        "每次攻击获得10%/15%/20%攻速",
      );
    },
  );

  it("换目标移除剩余冷却的加速收益，重新从一层开始", () => {
    const f = fixture(2);
    for (let i = 0; i < 10; i++) hit(f);
    f.source.cooldown = attackInterval(f.source, 1) * 0.4;
    retargetStaff(f.source, f.other);
    expect(f.source.cooldown).toBeCloseTo(2);
    expect(f.source.gale).toEqual({ target: f.other.uid, stacks: 0, side: 0 });
    expect(attackInterval(f.source, 1)).toBe(5);
    expect(staffArmor(f.source)).toBe(0);
    expect(recordStaffAttack(f.source, f.other)).toBe(1);
    expect(effectiveArmor(f.source, 1, f.ctx.fighters)).toBe(5);
  });

  it("同一目标不重复重置，目标远离时保留层数；死亡、隐蔽或友方目标即时撤去护甲", () => {
    const f = fixture();
    for (let i = 0; i < 10; i++) hit(f);
    f.source.cooldown = 0.75;
    retargetStaff(f.source, f.target);
    expect(f.source.cooldown).toBe(0.75);
    f.target.y = 0;
    expect(effectiveArmor(f.source, 1, f.ctx.fighters)).toBe(55);
    f.target.air!.phaseUntil = 100;
    expect(effectiveArmor(f.source, 1, f.ctx.fighters)).toBe(5);
    retargetStaff(
      f.source,
      attackTargets(f.source, f.ctx.fighters, 1).find(
        (e) => e.uid === f.target.uid,
      ),
    );
    expect(f.source.gale?.stacks).toBe(0);
    f.target.air!.phaseUntil = 0;
    f.target.y = 2;
    for (let i = 0; i < 10; i++) hit(f);
    f.target.side = 0;
    expect(effectiveArmor(f.source, 1, f.ctx.fighters)).toBe(5);
    retargetStaff(f.source);
    expect(staffSpeed(f.source)).toBe(0);
    f.target.side = 1;
    f.target.hp = 1e6;
    for (let i = 0; i < 10; i++) hit(f);
    f.target.hp = 0;
    expect(effectiveArmor(f.source, 1, f.ctx.fighters)).toBe(5);
    retargetStaff(f.source);
    expect(f.source.gale?.target).toBeNull();
  });

  it("阵营改变即失去旧层数，魅惑期间可对当前敌方重新叠层", () => {
    const f = fixture();
    for (let i = 0; i < 10; i++) hit(f);
    f.source.side = 1;
    f.target.side = 0;
    expect(staffSpeed(f.source)).toBe(0);
    expect(staffArmor(f.source)).toBe(0);
    retargetStaff(f.source, f.target);
    expect(f.source.gale?.stacks).toBe(0);
    expect(recordStaffAttack(f.source, f.target)).toBe(1);
    expect(f.source.gale?.side).toBe(1);
    f.source.hp = 0;
    expect(recordStaffAttack(f.source, f.target)).toBe(0);
  });

  it("闪避、护盾和不朽免伤仍算攻击次数，不产生虚构伤害或施法", () => {
    const f = fixture();
    f.target.air!.flying = true;
    f.target.air!.evasion = 1;
    expect(hit(f)).toBe(0);
    expect(f.ctx.events.at(-1)).toMatchObject({
      evaded: true,
      gale: 1,
      amount: 0,
    });
    f.target.air!.evasion = 0;
    f.target.shield = 1e5;
    f.target.shieldUntil = 100;
    expect(hit(f)).toBe(0);
    expect(f.ctx.events.at(-1)).toMatchObject({
      gale: 2,
      amount: 0,
      absorbed: 104,
    });
    f.target.immortal = { duration: 16, until: 100, spent: true };
    expect(hit(f)).toBe(0);
    expect(f.ctx.events.at(-1)).toMatchObject({
      gale: 3,
      immune: true,
      amount: 0,
    });
    expect(f.source.damage).toBe(0);
    expect(f.source.signature?.casts).toBe(0);
  });

  it("护甲仅减物伤，与临时护甲及开场减甲相加，法伤和反伤不误享受加成", () => {
    const f = fixture();
    for (let i = 0; i < 10; i++) hit(f);
    f.source.armorBuff = 10;
    f.source.armorBuffUntil = 100;
    f.source.infantryArmorBreak = 9;
    expect(effectiveArmor(f.source, 1, f.ctx.fighters)).toBe(56);
    expect(damage(f.ctx, f.target, f.source, 100, "physical")).toBe(
      Math.round(10000 / 436),
    );
    expect(damage(f.ctx, f.target, f.source, 100, "magic", true)).toBe(80);
    expect(
      damage(
        f.ctx,
        f.target,
        f.source,
        100,
        "true",
        false,
        false,
        0,
        false,
        true,
      ),
    ).toBe(100);
  });

  it("装备、加速与减速共同计算间隔，技能强度和能量不提高被动收益", () => {
    const f = fixture(3);
    f.source.interval = 3.75;
    f.source.hasteUntil = 100;
    f.source.slow = { until: 100, multiplier: 1.5 };
    for (let i = 0; i < 10; i++) hit(f);
    expect(attackInterval(f.source, 1)).toBeCloseTo((3.75 / 3) * 0.7 * 1.5);
    f.source.interval = 1;
    expect(attackInterval(f.source, 1)).toBe(1);
    const p = piece("staffthrall", 1, 2);
    expect(abilityCredit(p)).toBe(abilityCredit({ ...p, items: ["staff"] }));
    expect(itemScore(p, "staff")).toBe(0);
    expect(itemScore(p, "overdrive")).toBeGreaterThan(0);
  });
});

describe("真实战斗与表现", () => {
  it("六对六演示自然达到十层，有独立轮转动作，战报只记录普攻与真实最高层", () => {
    const before = structuredClone(STAFFTHRALL_DEMO);
    const battle = simulate(STAFFTHRALL_DEMO.left, STAFFTHRALL_DEMO.right);
    const attacks = battle.frames.flatMap((fr) =>
      fr.events.filter((e) => e.attacker === 101),
    );
    expect(attacks.some((e) => e.gale === 10)).toBe(true);
    expect(attacks.every((e) => !e.skill && !e.empowered)).toBe(true);
    const last = battle.frames.at(-1)!;
    const summary = simulateOutcome(
      STAFFTHRALL_DEMO.left,
      STAFFTHRALL_DEMO.right,
    );
    expect(summary.winner).toBe(battle.winner);
    expect(summary.damage).toBe(battle.damage);
    expect(summary.final.fighters).toEqual(last.fighters);
    expect(
      compute({
        kind: "replay",
        ...STAFFTHRALL_DEMO,
        version: CURRENT_COMBAT_VERSION,
      }),
    ).toEqual({ kind: "replay", battle });
    const row = analyzeBattle(battle).sides[0].fighters.find(
      (f) => f.uid === 101,
    )!;
    expect(row).toMatchObject({ peakGale: 10, skillDamage: 0, casts: 0 });
    expect(row.normalDamage).toBe(row.damage);
    expect(row.criticalHits).toBeUndefined();
    expect(
      analyzeBattle(battle, 0).sides[0].fighters.find((f) => f.uid === 101)
        ?.peakGale,
    ).toBe(0);
    expect(
      battleAnalysisMarkup(
        analyzeBattle(battle),
        "damage",
        "疾风棍阵",
        battle.frames.length - 1,
        last.tick,
      ),
    ).toContain("疾风最高 10/10层");
    expect(MELEE_ACTIONS.staffthrall.name).toContain("轮转");
    expect(meleePose("staffthrall", 0.4, false)).not.toEqual(
      meleePose("staffthrall", 0.4, true),
    );
    const sounds = new BattleSoundTrack();
    sounds.reset(battle, 0);
    expect(
      sounds
        .take(battle, 39, true)
        .some((c) => c.kind === "impact" && c.priority === 2),
    ).toBe(true);
    expect(STAFFTHRALL_DEMO).toEqual(before);
  });

  it("沉默中仍有连续普攻，战斗开始已眩晕的时间片没有新增攻击", () => {
    const battle = simulate(
      [{ ...piece("staffthrall", 101, 2), items: ["fortress", "heart"] }],
      [piece("shieldthrall", 201, 2, 36), piece("guard", 202, 3, 35)],
    );
    expect(
      battle.frames.some(
        (fr) =>
          fr.fighters.find((f) => f.uid === 101)!.silenceUntil! > fr.tick &&
          fr.events.some((e) => e.attacker === 101 && e.gale),
      ),
    ).toBe(true);
    let blocked = 0;
    for (let i = 1; i < battle.frames.length; i++) {
      const previous = battle.frames[i - 1].fighters.find(
        (f) => f.uid === 101,
      )!;
      if (previous.stunUntil > battle.frames[i].tick && previous.hp > 0) {
        blocked++;
        expect(battle.frames[i].events.some((e) => e.attacker === 101)).toBe(
          false,
        );
      }
    }
    expect(blocked).toBeGreaterThan(0);
    expect(
      battle.frames.every(
        (fr) => fr.fighters.find((f) => f.uid === 101)!.mana === 0,
      ),
    ).toBe(true);
  });

  it("七种傀儡提供替换路径：海神禁用后六档可达，联合灵能后仍不可达", () => {
    const one = { bannedSeries: ["海神", "装甲", "熊猫"] as Series[] };
    expect(rotationTraits(one).find((t) => t.trait === "傀儡")).toMatchObject({
      available: 6,
      total: 7,
    });
    expect(availableUnits(one).some((u) => u.id === "staffthrall")).toBe(true);
    expect(
      availableUnits({ bannedSeries: ["傀儡", "装甲", "熊猫"] }).some(
        (u) => u.id === "staffthrall",
      ),
    ).toBe(false);
    expect(
      rotationTraits({ bannedSeries: ["海神", "灵能", "熊猫"] }).find(
        (t) => t.trait === "傀儡",
      )?.available,
    ).toBe(5);
  });
});

describe("棍奴增量存档与旧回放", () => {
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}只补合法卡池，不改变资源、分配、历史或播放`, () => {
        const g = createGame(137, "classic");
        for (const p of g.players) {
          for (const id of p.shop) if (id) g.pool[id]++;
          p.shop = [null, null, null, null, null];
        }
        g.bannedSeries = (
          banned ? ["傀儡", "猛禽", "陆行者"] : ["装甲", "猛禽", "陆行者"]
        ) as Series[];
        for (const id of Object.keys(g.pool))
          if (!isRecruitable(g, id)) g.pool[id] = 0;
        const me = g.players[0];
        me.shop[0] = phase === "finished" ? "fish" : "guard";
        g.pool[me.shop[0]]--;
        buy(g, me, 0);
        move(g, me, me.pieces[0].uid, 35);
        if (phase === "finished") me.hp = 1;
        if (phase !== "prepare") g.combatVersion = "puppets";
        const result = phase === "prepare" ? null : startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
        expect(g.phase).toBe(phase);
        delete g.pool.staffthrall;
        const before = structuredClone(g),
          decoded = decodeSave(envelope(g, 36, "singleplayer-0.37"));
        expect(decoded.status).toBe("migrated");
        expect(decoded.data!.game).toEqual({
          ...before,
          pool: { ...before.pool, staffthrall: banned ? 0 : 15 },
        });
        expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
        expect(decoded.data!.playback).toEqual({
          time: 3,
          speed: 2,
          paused: true,
        });
        expect(validGame(decoded.data!.game)).toBe(true);
        if (phase === "battle")
          expect(resumeRound(decoded.data!.game)!.battle).toEqual(
            result!.battle,
          );
      });
  for (const f of frozen.fixtures)
    it(`0.37旧回放${f.name}逐帧不变`, async () => {
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(f.left, f.right, "puppets")),
        ),
      );
      expect(
        Array.from(new Uint8Array(hash), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(f.hash);
    });
});
