import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { damage, castSkill, type CombatContext } from "../src/engine/abilities";
import {
  rollAssassinCritical,
  seedAssassinStrikes,
} from "../src/engine/assassins";
import { bladeStrike } from "../src/engine/bladethrall";
import { startBladeStorm } from "../src/engine/swordthrall";
import { callWolfPack } from "../src/engine/summons";
import { synergies } from "../src/engine/synergies";
import { UNIT, RULES } from "../src/data/units";
import { unitDefinition } from "../src/data/unit-stats";
import {
  PANGOLIN_BURROW,
  skillDescription,
  skillName,
} from "../src/data/skills";
import { traitTiers } from "../src/data/traits";
import { ASSASSIN_DEMO } from "../src/data/assassin-demo";
import { analyzeBattle } from "../src/engine/battle-analysis";
import {
  createGame,
  buy,
  sell,
  roll,
  buyXp,
  move,
  startRound,
  resumeRound,
  settle,
  nextRound,
} from "../src/engine/game";
import { claimReward, itemScore } from "../src/engine/equipment";
import { prepareBot, abilityCredit } from "../src/engine/ai";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import {
  availableUnits,
  rotationTraits,
  isRecruitable,
  type Series,
} from "../src/engine/rotation";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { codexMarkup, codexFilters, filteredUnits } from "../src/ui/unit-codex";
import { recruitmentMarkup } from "../src/ui/recruitment";
import { rotationMarkup } from "../src/ui/rotation";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import { compute } from "../src/compute/job";
import { BattleSoundTrack } from "../src/audio/cues";
import { burrowPose } from "../src/render/beast-presentation";
import { REST_POSE } from "../src/render/melee";
import {
  CURRENT_COMBAT_VERSION,
  type Piece,
  type Fighter,
} from "../src/engine/types";
import frozen from "./fixtures/pre-v042-replays.json";

const ids = [
  "axethrall",
  "pangolin",
  "panda",
  "lingjiu",
  "ghostjet",
  "ironrooster",
];
const line = (units = ids, offset = 0): Piece[] =>
  units.map((defId, i) => ({
    defId,
    uid: offset + i + 1,
    star: 1,
    position: 32 + i,
  }));
function contact() {
  const fighters = army(line(ids.slice(0, 3)), 0);
  const source = fighters[0],
    target = army([{ defId: "guard", uid: 201, star: 3, position: 35 }], 1)[0];
  Object.assign(source, { x: 3, y: 3 });
  Object.assign(target, { x: 3, y: 2, armor: 0, shield: 0, magicResist: 0 });
  const ctx: CombatContext = {
    fighters: [...fighters, target],
    tick: 10,
    effects: [],
    events: [],
  };
  return { source, target, ctx };
}
function burrow(star = 1) {
  const source = army(
    [{ defId: "pangolin", uid: 101, star, position: 43 }],
    0,
  )[0];
  const target = army(
    [{ defId: "guard", uid: 201, star: 3, position: 35 }],
    1,
  )[0];
  Object.assign(source, { x: 3, y: 5, mana: 100 });
  Object.assign(target, { x: 3, y: 2, shield: 0, magicResist: 0 });
  const ctx: CombatContext = {
    fighters: [source, target],
    tick: 10,
    events: [],
    effects: [],
  };
  return { source, target, ctx };
}

describe("刺杀职业暴击", () => {
  it.each([1, 2, 3, 4, 5, 6])(
    "%i种成员按3/6提供10%/20%概率，移除旧固定攻击加成",
    (count) => {
      const pieces = [
        ...line(ids.slice(0, count)),
        ...line(["infantry", "bladethrall"], 100),
      ];
      pieces.slice(-2).forEach((p, i) => {
        p.position = 56 + i;
      });
      const formation = synergies(pieces).find((s) => s.trait === "刺杀")!;
      expect(formation.tiers).toEqual([3, 6]);
      expect(formation.tier).toBe(count < 3 ? 0 : count < 6 ? 1 : 2);
      for (const fighter of army(pieces, 0)) {
        const assassin = UNIT[fighter.defId].traits.includes("刺杀");
        if (assassin && count >= 3)
          expect(fighter.assassinCrit).toMatchObject({
            chance: count >= 6 ? 0.2 : 0.1,
            multiplier: 4.5,
            attempts: 0,
            crits: 0,
          });
        else expect(fighter.assassinCrit).toBeUndefined();
        // Two puppets independently add 10%; the assassin formation never adds flat attack.
        const puppet = UNIT[fighter.defId].traits.includes("傀儡");
        expect(fighter.attack).toBeCloseTo(
          UNIT[fighter.defId].attack * (puppet ? 1.1 : 1),
        );
      }
    },
  );
  it("同名高星和备战席不凑六人，召唤物不获得主人职业暴击", () => {
    const pieces = line([...ids, "wolf"]);
    pieces[5].position = null;
    pieces.push({ ...pieces[0], uid: 99, star: 3, position: 56 });
    expect(synergies(pieces).find((s) => s.trait === "刺杀")).toMatchObject({
      count: 6,
      tier: 2,
    });
    pieces[6].position = null;
    expect(synergies(pieces).find((s) => s.trait === "刺杀")).toMatchObject({
      count: 5,
      tier: 1,
    });
    pieces[6].position = 57;
    const ctx: CombatContext = {
      fighters: army(pieces, 0),
      tick: 10,
      effects: [],
      events: [],
    };
    const wolf = ctx.fighters.find((f) => f.defId === "wolf")!;
    wolf.mana = 100;
    expect(callWolfPack(ctx, wolf)).toBe(true);
    const pups = ctx.fighters.filter((f) => f.summon);
    expect(pups.length).toBeGreaterThan(0);
    expect(pups.every((f) => !f.assassinCrit)).toBe(true);
  });
  it.each([0.1, 0.2])(
    "%s概率的独立攻击序列可复现且接近配置，非十次保底",
    (chance) => {
      const sample = (uid: number) => {
        const source = contact().source;
        source.uid = uid;
        source.assassinCrit!.chance = chance;
        return Array.from({ length: 500 }, () => rollAssassinCritical(source));
      };
      const rolls = Array.from({ length: 32 }, (_, i) => sample(i + 1)).flat();
      expect(rolls.filter(Boolean).length / rolls.length).toBeCloseTo(
        chance,
        1,
      );
      expect(
        Math.abs(rolls.filter(Boolean).length / rolls.length - chance),
      ).toBeLessThan(0.015);
      expect(sample(17)).toEqual(sample(17));
      expect(sample(17)).not.toEqual(sample(18));
      const sequence = sample(17);
      const groups = Array.from(
        { length: 50 },
        (_, i) => sequence.slice(i * 10, i * 10 + 10).filter(Boolean).length,
      );
      expect(new Set(groups).size).toBeGreaterThan(1);
    },
  );
  it("双方开场阵容改变随机流，不读取或推进商店随机数", () => {
    const game = createGame(137),
      before = game.seed;
    const a = contact().ctx.fighters,
      b = structuredClone(a),
      c = structuredClone(a);
    c.at(-1)!.maxHp++;
    seedAssassinStrikes(a);
    seedAssassinStrikes(b);
    seedAssassinStrikes(c);
    expect(a[0].assassinCrit!.seed).toBe(b[0].assassinCrit!.seed);
    expect(a[0].assassinCrit!.seed).not.toBe(c[0].assassinCrit!.seed);
    expect(game.seed).toBe(before);
  });
  it("4.5倍仍经普通攻击护甲、护盾、吸血与反伤，统计只计实际伤害", () => {
    const { source, target, ctx } = contact();
    source.assassinCrit!.chance = 1;
    source.hp = 200;
    source.lifesteal = 0.2;
    target.armor = 10;
    target.shield = 100;
    target.reflection = 20;
    target.magicResist = 0.9;
    expect(damage(ctx, source, target, 100)).toBe(181);
    expect(ctx.events[0]).toMatchObject({
      assassinCritical: true,
      empowered: true,
      skill: false,
      amount: 181,
      absorbed: 100,
      damageType: "physical",
    });
    expect(source.hp).toBe(216);
    expect(source.assassinCrit).toMatchObject({ attempts: 1, crits: 1 });
    expect(ctx.events.filter((e) => e.reflected)).toHaveLength(1);
  });
  it.each(["skill", "periodic", "reflected"])(
    "%s伤害不抽取刺杀暴击",
    (kind) => {
      const { source, target, ctx } = contact();
      source.assassinCrit!.chance = 1;
      damage(
        ctx,
        source,
        target,
        100,
        "magic",
        kind === "skill",
        true,
        0,
        false,
        kind === "reflected",
        kind === "periodic",
      );
      expect(source.assassinCrit!.attempts).toBe(0);
      expect(ctx.events[0].assassinCritical).toBeUndefined();
    },
  );
  it.each(["dead", "stunned", "friendly", "distant", "concealed"])(
    "%s不消耗合法攻击序列",
    (state) => {
      const { source, target, ctx } = contact();
      if (state === "dead") source.hp = 0;
      if (state === "stunned") source.stunUntil = 11;
      if (state === "friendly") target.side = 0;
      if (state === "distant") target.y = 0;
      if (state === "concealed") {
        target.defId = "fish";
        ctx.fighters.push({ ...target, uid: 202, defId: "guard", x: 4, y: 2 });
      }
      damage(ctx, source, target, 100);
      expect(source.assassinCrit!.attempts).toBe(0);
    },
  );
  it("已出手的闪避或残魂免伤仍消耗判定，暴击不使技能免伤挡住普攻", () => {
    const evade = contact();
    evade.source.assassinCrit!.chance = 1;
    Object.assign(evade.target.air!, { flying: true, evasion: 1 });
    damage(evade.ctx, evade.source, evade.target, 100);
    expect(evade.ctx.events[0]).toMatchObject({
      assassinCritical: true,
      evaded: true,
      amount: 0,
    });
    expect(evade.source.assassinCrit!.attempts).toBe(1);
    const soul = contact();
    soul.source.assassinCrit!.chance = 1;
    soul.target.immortal = { until: 30, spent: true, duration: 16 };
    damage(soul.ctx, soul.source, soul.target, 100);
    expect(soul.ctx.events[0]).toMatchObject({
      assassinCritical: true,
      immune: true,
      amount: 0,
    });
    const storm = contact();
    storm.source.assassinCrit!.chance = 1;
    storm.target.bladeStorm = { until: 30, next: 11, remaining: 6, damage: 50 };
    expect(damage(storm.ctx, storm.source, storm.target, 100)).toBe(450);
    expect(storm.ctx.events[0].skill).toBe(false);
  });
  it("沉默和封能不阻止普通暴击；真伤普攻保持真伤", () => {
    const { source, target, ctx } = contact();
    source.assassinCrit!.chance = 1;
    source.silenceUntil = 30;
    source.manaLockUntil = 30;
    source.trueAttack = true;
    target.armor = 999;
    expect(damage(ctx, source, target, 100)).toBe(450);
    expect(ctx.events[0]).toMatchObject({
      damageType: "true",
      assassinCritical: true,
    });
  });
  it("灵鹫在3格仍可普通暴击，满能量不空放近身音波", () => {
    const fighters = army(line(["lingjiu", "ghostjet", "axethrall"]), 0);
    const source = fighters[0],
      target = army(line(["guard"], 200), 1)[0];
    Object.assign(source, { x: 3, y: 5, mana: 100 });
    Object.assign(target, { x: 3, y: 2, armor: 0, shield: 0 });
    source.assassinCrit!.chance = 1;
    const ctx: CombatContext = {
      fighters: [...fighters, target],
      tick: 10,
      events: [],
      effects: [],
    };
    expect(castSkill(ctx, source, target)).toBe(false);
    expect(source.mana).toBe(100);
    expect(damage(ctx, source, target, 100)).toBe(450);
    expect(ctx.events[0]).toMatchObject({
      ranged: true,
      skill: false,
      assassinCritical: true,
    });
  });
  it("刀奴个人被动仍独立10%，六刺杀不会给先锋刀奴附加暴击", () => {
    const ctx: CombatContext = {
      fighters: army([...line(ids), ...line(["bladethrall"], 100)], 0),
      tick: 10,
      events: [],
      effects: [],
    };
    const blade = ctx.fighters.at(-1)!;
    expect(blade.bladeCrit).toBeDefined();
    expect(blade.assassinCrit).toBeUndefined();
    const target = army(line(["guard"], 200), 1)[0];
    target.x = blade.x;
    target.y = blade.y - 1;
    ctx.fighters.push(target);
    expect(bladeStrike(ctx, blade, target)).toBe(true);
    expect(blade.bladeCrit!.attempts).toBe(1);
    expect(ctx.events.every((e) => !e.assassinCritical)).toBe(true);
  });
  it("单个刺杀也跳向后排，未激活暴击；旧版本单刺保留原位", () => {
    const left = line(["pangolin"]),
      right = line(["guard", "infantry"], 100);
    right[1].position = 60;
    const modern = simulate(left, right).frames[0].fighters;
    const source = modern.find((f) => f.uid === 1)!,
      back = modern.find((f) => f.uid === 102)!;
    expect(Math.abs(source.x - back.x) + Math.abs(source.y - back.y)).toBe(1);
    expect(source.assassinCrit).toBeUndefined();
    expect(
      simulate(left, right, "wildfront").frames[0].fighters[0],
    ).toMatchObject({ x: 0, y: 4 });
    expect(new Set(modern.map((f) => `${f.x},${f.y}`)).size).toBe(
      modern.length,
    );
  });
});

describe("穿山甲遁地与历史定义", () => {
  it("遁地具有独立下潜和破土姿态，减少动态效果时回到静止", () => {
    expect(burrowPose(0)).toEqual(REST_POSE);
    expect(burrowPose(1)).toEqual(REST_POSE);
    expect(burrowPose(0.5, true)).toEqual(REST_POSE);
    expect(burrowPose(0.5).lift).toBeLessThan(0);
    expect(burrowPose(0.5).alpha).toBeLessThan(0.2);
    expect(burrowPose(0.5).scaleY).toBeLessThan(0.5);
    expect(burrowPose(0.75).alpha).toBeGreaterThan(burrowPose(0.5).alpha);
  });
  it("当前基础字段取S04，旧版本仍是先锋720生命和破阵冲击", () => {
    expect(UNIT.pangolin).toMatchObject({
      cost: 1,
      traits: ["野兽", "刺杀"],
      hp: 500,
      attack: 55,
      armor: 5,
      interval: 6,
      initialMana: 25,
      skill: "遁地",
    });
    expect(unitDefinition("pangolin", "wildfront")).toMatchObject({
      traits: ["野兽", "先锋"],
      hp: 720,
      attack: 42,
      armor: 6,
      interval: 3,
      skill: "破阵冲击",
    });
    expect(pieceDetails(line(["pangolin"])[0])).toMatchObject({
      hp: 500,
      attack: 55,
      armor: 5,
      interval: 1.5,
      skill: "遁地",
    });
    expect(pieceDetails(line(["pangolin"])[0], "wildfront")).toMatchObject({
      hp: 720,
      attack: 42,
      armor: 6,
      interval: 0.75,
      skill: "破阵冲击",
    });
    expect(skillDescription("lingjiu")).toContain("单名刺杀");
    expect(skillName("pangolin", "wildfront")).toBe("破阵冲击");
  });
  it.each([1, 2, 3])(
    "%i星3格突袭为固定法伤与单体击飞，不受普通攻击或暴击倍率影响",
    (star) => {
      const { source, target, ctx } = burrow(star),
        before = { x: source.x, y: source.y };
      source.attack = 9999;
      source.skillPower = 1.5;
      source.assassinCrit = {
        chance: 1,
        multiplier: 4.5,
        attempts: 0,
        crits: 0,
      };
      target.armor = 999;
      target.magicResist = 0.25;
      target.air!.evasion = 1;
      target.air!.flying = true;
      expect(castSkill(ctx, source, target)).toBe(true);
      expect(ctx.events[0]).toMatchObject({
        amount: Math.round(PANGOLIN_BURROW.damage[star - 1] * 1.5 * 0.75),
        damageType: "magic",
        skill: true,
      });
      expect(ctx.events[0].assassinCritical).toBeUndefined();
      expect(source.assassinCrit.attempts).toBe(0);
      expect(source).toMatchObject({ mana: 0, skillReadyAt: 90 });
      expect(
        Math.abs(source.x - target.x) + Math.abs(source.y - target.y),
      ).toBe(1);
      expect(target.knockup).toEqual({ start: 10, until: 14 });
      expect(target.armorBreak).toBe(0);
      expect(target.corrosion).toBeUndefined();
      expect(target.air!.flying).toBe(true);
      expect(ctx.effects.find((e) => e.kind === "teleport")).toMatchObject({
        name: "遁地",
        from: before,
      });
    },
  );
  it.each(["stun", "silence", "charm", "dead", "cooldown", "far", "friendly"])(
    "%s禁止施放，不移动、不扣能量",
    (state) => {
      const { source, target, ctx } = burrow();
      if (state === "stun") source.stunUntil = 11;
      if (state === "silence") source.silenceUntil = 11;
      if (state === "charm")
        source.charm = { side: 0, until: 20, attack: source.attack };
      if (state === "dead") source.hp = 0;
      if (state === "cooldown") source.skillReadyAt = 11;
      if (state === "far") target.y = 0;
      if (state === "friendly") target.side = 0;
      expect(castSkill(ctx, source, target)).toBe(false);
      expect(source).toMatchObject({ x: 3, y: 5, mana: 100 });
      expect(ctx.events).toHaveLength(0);
    },
  );
  it("无相邻空格保留能量；已相邻时可原地释放；边角不越界、不挤走其他棋子", () => {
    const { source, target, ctx } = burrow();
    for (const [i, [x, y]] of [
      [3, 3],
      [4, 2],
      [3, 1],
      [2, 2],
    ].entries())
      ctx.fighters.push({ ...target, uid: 210 + i, x, y });
    expect(castSkill(ctx, source, target)).toBe(false);
    expect(source.mana).toBe(100);
    ctx.fighters = ctx.fighters.filter((f) => f.x !== 3 || f.y !== 3);
    source.y = 3;
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(source).toMatchObject({ x: 3, y: 3 });
    const edge = burrow();
    Object.assign(edge.target, { x: 0, y: 0 });
    Object.assign(edge.source, { x: 0, y: 3 });
    expect(castSkill(edge.ctx, edge.source, edge.target)).toBe(true);
    expect(edge.source.x).toBeGreaterThanOrEqual(0);
    expect(edge.source.y).toBeGreaterThanOrEqual(0);
    expect(new Set(edge.ctx.fighters.map((f) => `${f.x},${f.y}`)).size).toBe(
      edge.ctx.fighters.length,
    );
  });
  it("冷却从施放起计，期间正常蓄能，满能量也不能提前重放", () => {
    const f = burrow();
    expect(castSkill(f.ctx, f.source, f.target)).toBe(true);
    f.source.mana = 100;
    f.ctx.tick = 89;
    expect(castSkill(f.ctx, f.source, f.target)).toBe(false);
    expect(f.source.mana).toBe(100);
    f.ctx.tick = 90;
    expect(castSkill(f.ctx, f.source, f.target)).toBe(true);
    expect(f.source.skillReadyAt).toBe(170);
  });
  it("旋转技能免伤和残魂免伤阻挡遁地伤害与击飞", () => {
    for (const immune of ["storm", "soul"]) {
      const f = burrow();
      if (immune === "storm")
        f.target.bladeStorm = { until: 30, next: 11, remaining: 6, damage: 50 };
      else f.target.immortal = { until: 30, duration: 16, spent: true };
      expect(castSkill(f.ctx, f.source, f.target)).toBe(true);
      expect(f.ctx.events[0]).toMatchObject({ immune: true, amount: 0 });
      expect(f.target.knockup).toBeUndefined();
    }
  });
});

describe("真实演示、经营、信息和旧局", () => {
  it("六刺演示产生真实暴击和遁地，完整/快速/Worker一致，统计不泄露未来", () => {
    const before = structuredClone(ASSASSIN_DEMO),
      battle = simulate(before.left, before.right);
    expect(
      synergies(before.left).find((s) => s.trait === "刺杀"),
    ).toMatchObject({ count: 6, tier: 2 });
    expect(
      battle.frames.some((f) => f.events.some((e) => e.assassinCritical)),
    ).toBe(true);
    expect(
      battle.frames.some((f) => f.effects.some((e) => e.name === "遁地")),
    ).toBe(true);
    const beginning = analyzeBattle(battle, 0),
      end = analyzeBattle(battle);
    expect(
      beginning.sides[0].fighters.every((f) => (f.criticalHits ?? 0) === 0),
    ).toBe(true);
    expect(
      end.sides[0].fighters.reduce((n, f) => n + (f.criticalHits ?? 0), 0),
    ).toBe(
      battle.frames
        .flatMap((f) => f.events)
        .filter(
          (e) =>
            e.attacker < 200 && e.assassinCritical && !e.evaded && !e.immune,
        ).length,
    );
    expect(
      end.sides[0].fighters.find((f) => f.defId === "pangolin")!.knockups,
    ).toBe(
      battle.frames
        .flatMap((fr) => fr.effects)
        .filter(
          (e) => e.source === 101 && e.kind === "stun" && e.name === "击飞",
        ).length,
    );
    expect(
      battleAnalysisMarkup(
        end,
        "damage",
        "六刺突袭",
        battle.frames.length - 1,
        battle.frames.at(-1)!.tick,
      ),
    ).toContain("暴击命中");
    const quick = simulateOutcome(before.left, before.right);
    expect(quick.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    expect(quick.winner).toBe(battle.winner);
    expect(quick.damage).toBe(battle.damage);
    expect(
      compute({ kind: "replay", ...before, version: CURRENT_COMBAT_VERSION }),
    ).toEqual({
      kind: "replay",
      battle,
    });
    for (const frame of battle.frames) {
      const alive = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
    }
    expect(ASSASSIN_DEMO).toEqual(before);
    const sounds = new BattleSoundTrack();
    sounds.take(battle, 0, true);
    const cues = sounds.take(battle, 5, true);
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.some((cue) => cue.priority === 2)).toBe(true);
  });
  it("图鉴筛选、招募、禁用可达性与旧版本定义保持一致", () => {
    const game = createGame(137, "classic");
    game.players[0].shop[0] = "pangolin";
    expect(recruitmentMarkup(game, game.players[0], false)).toContain(
      "野兽 / 刺杀",
    );
    expect(
      recruitmentMarkup(
        { ...game, combatVersion: "wildfront" },
        game.players[0],
        false,
      ),
    ).toContain("野兽 / 先锋");
    const before = { ...codexFilters };
    Object.assign(codexFilters, {
      trait: "刺杀",
      query: "穿山甲",
      availability: "all",
      cost: "all",
      range: "all",
    });
    try {
      expect(filteredUnits(game).map((u) => u.id)).toEqual(["pangolin"]);
      expect(filteredUnits({ ...game, combatVersion: "wildfront" })).toEqual(
        [],
      );
    } finally {
      Object.assign(codexFilters, before);
    }
    expect(codexMarkup(game)).toContain("4.5倍暴击");
    const modern = rotationTraits(game),
      old = rotationTraits({ ...game, combatVersion: "wildfront" });
    expect(modern.find((t) => t.trait === "刺杀")!.total).toBe(
      old.find((t) => t.trait === "刺杀")!.total + 1,
    );
    expect(modern.find((t) => t.trait === "先锋")!.total).toBe(
      old.find((t) => t.trait === "先锋")!.total - 1,
    );
    const banned = {
      bannedSeries: ["野兽", "海神", "空军"] as Series[],
      combatVersion: CURRENT_COMBAT_VERSION,
    };
    expect(isRecruitable(banned, "pangolin")).toBe(false);
    expect(rotationMarkup(banned)).toContain("6档不可达");
    expect(availableUnits(banned).some((u) => u.id === "pangolin")).toBe(false);
  });
  it("AI正常付费招募与技能装备估值采用新定义，不赠予属性", () => {
    const game = createGame(137, "classic"),
      bot = game.players[1];
    bot.aiProfile = "assassins";
    prepareBot(game, bot, { buy, sell, roll, buyXp });
    expect(validGame(game)).toBe(true);
    expect(bot.gold).toBeLessThanOrEqual(10);
    const piece = line(["pangolin"])[0];
    expect(abilityCredit({ ...piece, items: ["staff"] })).toBeGreaterThan(
      abilityCredit(piece),
    );
    expect(itemScore(piece, "staff")).toBeGreaterThan(0);
    expect(itemScore(piece, "staff")).toBeGreaterThan(
      itemScore(piece, "staff", "wildfront"),
    );
  });
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}0.41迁移仅准备期升级，保留经济、卡池、风格、历史和播放`, () => {
        const game = createGame(137, "classic");
        game.combatVersion = "wildfront";
        for (const player of game.players) {
          for (const id of player.shop) if (id) game.pool[id]++;
          player.shop = [null, null, null, null, null];
        }
        if (banned) {
          game.bannedSeries = ["野兽", "海神", "空军"];
          for (const id of Object.keys(game.pool))
            if (!isRecruitable(game, id)) game.pool[id] = 0;
        }
        const me = game.players[0];
        me.shop[0] = phase === "finished" ? "medic" : "guard";
        game.pool[me.shop[0]]--;
        buy(game, me, 0);
        move(game, me, me.pieces[0].uid, 35);
        if (phase === "finished") me.hp = 1;
        const result = phase === "prepare" ? null : startRound(game);
        if (phase === "result" || phase === "finished") settle(game, result!);
        expect(game.phase).toBe(phase);
        const before = structuredClone(game),
          decoded = decodeSave(
            JSON.stringify({
              schema: 40,
              rules: "singleplayer-0.41",
              savedAt: 1,
              revision: 1,
              game,
              playback: { time: 3, speed: 2, paused: true },
            }),
          );
        expect(decoded.status).toBe("migrated");
        expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
        expect(decoded.data!.rules).toBe(RULES.version);
        const restored = decoded.data!.game;
        expect(restored).toEqual({
          ...before,
          combatVersion:
            phase === "prepare" ? CURRENT_COMBAT_VERSION : "wildfront",
        });
        expect(decoded.data!.playback).toEqual({
          time: 3,
          speed: 2,
          paused: true,
        });
        if (phase === "battle") {
          expect(resumeRound(restored)!.battle).toEqual(result!.battle);
          settle(restored, resumeRound(restored)!);
        }
        if (restored.phase === "result") {
          if (restored.reward) claimReward(restored, 0);
          nextRound(restored);
          expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(restored.history[0].combatVersion).toBe("wildfront");
        }
        expect(validGame(restored)).toBe(true);
      });
  for (const entry of frozen.fixtures)
    it(`0.41旧回放${entry.name}逐帧保持修改前哈希`, async () => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(entry.left, entry.right, "wildfront")),
        ),
      );
      expect(
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(entry.hash);
    });
});
