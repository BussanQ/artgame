import { equipmentStats } from "../src/data/items";
import { TAOTIE_DEMO } from "../src/data/taotie-demo";
import { project } from "../src/render/projection";
import { pickBattleFighter } from "../src/render/battle-inspection";
import { BattleSoundTrack } from "../src/audio/cues";
import { matchSummaryMarkup } from "../src/ui/match-summary";
import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  combatAttack,
  gainMana,
  damage,
  type CombatContext,
} from "../src/engine/abilities";
import {
  TAOTIE,
  skillDescription,
  skillName,
  skillRole,
} from "../src/data/skills";
import { UNIT, RULES, COPIES } from "../src/data/units";
import { unitDefinition, unitSprite } from "../src/data/unit-stats";
import { catalogCost, catalogUnit, catalogVersion } from "../src/data/catalog";
import {
  createGame,
  buy,
  sell,
  roll,
  move,
  startRound,
  resumeRound,
  settle,
  nextRound,
} from "../src/engine/game";
import { salePrice, pieceCopies, mergeCount } from "../src/engine/progression";
import { previewPurchase } from "../src/engine/recruitment";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { isRecruitable } from "../src/engine/rotation";
import { prepareBot, abilityCredit } from "../src/engine/ai";
import { claimReward } from "../src/engine/equipment";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import { pieceDetails, pieceDetailMarkup } from "../src/ui/bench-tooltip";
import { recruitmentMarkup } from "../src/ui/recruitment";
import { filteredUnits, codexFilters } from "../src/ui/unit-codex";
import { taotieScale } from "../src/render/taotie";
import { compactBattleLabels } from "../src/render/battle-inspection";
import { drawStatuses, drawSkillEffect } from "../src/render/skill-effects";
import { compute } from "../src/compute/job";
import {
  CURRENT_COMBAT_VERSION,
  type Piece,
  type Fighter,
  type CombatVersion,
} from "../src/engine/types";
import frozen from "./fixtures/pre-v049-replays.json";

const piece = (id = "skytoad", star = 1, uid = 1): Piece => ({
  defId: id,
  star,
  uid,
  position: 35,
});
const pair = (star = 1, version: CombatVersion = CURRENT_COMBAT_VERSION) => {
  const source = army([piece("skytoad", star)], 0, version)[0],
    target = army([piece("guard", 1, 101)], 1, version)[0];
  Object.assign(source, { x: 3, y: 3, hp: 700 * 2 ** (star - 1), mana: 100 });
  Object.assign(target, {
    x: 3,
    y: 2,
    hp: 500,
    maxHp: 500,
    shield: 100,
    reflection: 0,
  });
  return {
    source,
    target,
    ctx: {
      fighters: [source, target],
      tick: 10,
      events: [],
      effects: [],
    } as CombatContext,
  };
};
const clearShops = (g: ReturnType<typeof createGame>) => {
  for (const p of g.players) {
    for (const id of p.shop) if (id) g.pool[id]++;
    p.shop = [null, null, null, null, null];
  }
};
const legacyGame = () => {
  const g = createGame(137, "classic");
  clearShops(g);
  g.catalogVersion = "qi";
  g.combatVersion = "qi";
  g.pool.skytoad = COPIES[4];
  g.pool.thunderlord = COPIES[5];
  return g;
};
const encode = (game: ReturnType<typeof createGame>) =>
  JSON.stringify({
    schema: 47,
    rules: "singleplayer-0.48",
    savedAt: 1,
    revision: 1,
    game,
    playback: { time: 3, speed: 2, paused: true },
  });
const canvas = (texts: string[] = []) =>
  new Proxy(
    { fillText: (t: string) => texts.push(t) },
    { get: (t, p) => (p in t ? t[p as keyof typeof t] : () => {}) },
  ) as unknown as CanvasRenderingContext2D;

describe("飞天蛤蟆饕餮", () => {
  it("历史费用和身板分开，新局五费、40%法抗及每秒5恢复，旧qi仍为四费单次吞噬", () => {
    expect(UNIT.skytoad).toMatchObject({
      cost: 5,
      hp: 1000,
      attack: 53,
      range: 3,
      interval: 6.4,
      magicResist: 0.4,
      regeneration: 5,
    });
    const f = army([piece()], 0)[0];
    expect(f).toMatchObject({
      maxHp: 1000,
      attack: 53,
      magicResist: 0.4,
      regeneration: 1.25,
      taotie: { feasts: 0 },
    });
    expect(f.devourSpent).toBeUndefined();
    expect(unitDefinition("skytoad", "qi")).toMatchObject({
      cost: 4,
      hp: 1250,
      attack: 55,
      range: 2,
      interval: 4,
      skill: "吞云噬体",
    });
    expect(army([piece()], 0, "qi")[0]).toMatchObject({
      devourSpent: false,
      maxHp: 1250,
      magicResist: 0.2,
      regeneration: 0,
    });
    expect(skillName("skytoad")).toBe("饕餮");
    expect(skillRole("skytoad")).toBe("吞噬狂暴");
    expect(skillName("skytoad", "qi")).toBe("吞云噬体");
  });
  it.each([1, 2, 3])(
    "%i星致命吞噬后固定回血与攻击，不受攻击或法强放大，并持续8秒",
    (star) => {
      const { source, target, ctx } = pair(star),
        before = source.hp;
      source.skillPower = 9;
      source.attack = 17;
      source.maxHp = 10000;
      target.armor = 999;
      target.magicResist = 0.99;
      expect(castSkill(ctx, source, target)).toBe(true);
      expect(target.hp).toBe(0);
      expect(target.shield).toBe(0);
      expect(source.hp).toBe(before + TAOTIE.healing[star - 1]);
      expect(source.healing).toBe(TAOTIE.healing[star - 1]);
      expect(source.attack).toBe(17);
      expect(combatAttack(source, ctx.tick)).toBe(17 + TAOTIE.attack[star - 1]);
      expect(source.taotie).toMatchObject({
        feasts: 1,
        rage: { until: 42, attack: TAOTIE.attack[star - 1] },
      });
      expect(source.skillReadyAt).toBe(10 + TAOTIE.cooldown[star - 1]);
      expect(combatAttack(source, 42)).toBe(17);
      expect(ctx.events[0]).toMatchObject({
        amount: 500,
        absorbed: 100,
        skill: true,
        damageType: "true",
      });
    },
  );
  it("溢出治疗不记录；致命反伤不会用吞噬回血复活施法者", () => {
    const a = pair();
    a.source.hp = 990;
    a.target.hp = 500;
    castSkill(a.ctx, a.source, a.target);
    expect(a.source.hp).toBe(1000);
    expect(a.source.healing).toBe(10);
    const b = pair();
    b.source.hp = 600;
    b.target.reflection = 1000;
    castSkill(b.ctx, b.source, b.target);
    expect(b.source.hp).toBe(0);
    expect(b.source.taotie?.feasts).toBe(0);
    expect(b.source.taotie?.rage).toBeUndefined();
    expect(b.source.healing).toBe(0);
  });
  it.each([
    "mana",
    "cooldown",
    "stun",
    "silence",
    "charm",
    "health",
    "range",
    "immune-targetless",
  ] as const)("%s不满足施法条件时保留能量且不开冷却", (reason) => {
    const { source, target, ctx } = pair();
    if (reason === "mana") source.mana = 99;
    if (reason === "cooldown") source.skillReadyAt = 11;
    if (reason === "stun") source.stunUntil = 11;
    if (reason === "silence") source.silenceUntil = 11;
    if (reason === "charm")
      source.charm = { side: 0, until: 20, attack: source.attack };
    if (reason === "health") target.hp = source.hp;
    if (reason === "range") target.x = 7;
    if (reason === "immune-targetless") {
      target.hp = 0;
    }
    const before = structuredClone(source);
    expect(castSkill(ctx, source, target)).toBe(false);
    expect(source).toEqual(before);
    expect(ctx.events).toHaveLength(0);
    expect(ctx.effects).toHaveLength(0);
  });
  it("免疫技能伤害仍消耗本次施法，不能获得治疗或狂暴", () => {
    const { source, target, ctx } = pair();
    target.bladeStorm = { until: 20, next: 11, remaining: 4, damage: 1 };
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(target.hp).toBe(500);
    expect(source.mana).toBe(0);
    expect(source.skillReadyAt).toBe(98);
    expect(source.taotie).toEqual({ feasts: 0 });
    expect(source.healing).toBe(0);
  });
  it("吞噬目标选射程内最高当前生命的可见敌人，不选择残魂或友方", () => {
    const { source, target, ctx } = pair();
    const other = { ...structuredClone(target), uid: 102, hp: 600, shield: 0 };
    const soul = {
      ...structuredClone(target),
      uid: 103,
      hp: 650,
      immortal: { spent: true, until: 40, duration: 16 },
    };
    const friendly = {
      ...structuredClone(target),
      uid: 104,
      hp: 660,
      side: 0 as const,
    };
    ctx.fighters.push(other, soul, friendly);
    castSkill(ctx, source, target);
    expect(ctx.events[0].target).toBe(102);
    expect(target.hp).toBe(500);
    expect(soul.hp).toBe(650);
  });
  it("致命伤害触发不朽或涅槃，但每次仅算一次吞噬", () => {
    const a = pair();
    a.target.immortal = { spent: false, until: 0, duration: 16 };
    castSkill(a.ctx, a.source, a.target);
    expect(a.target.immortal.spent).toBe(true);
    expect(a.source.taotie?.feasts).toBe(1);
    const b = pair();
    b.target.defId = "phoenix";
    b.target.star = 2;
    b.target.phoenix = {
      spent: false,
      eggUntil: 0,
      bodyMaxHp: 500,
      hatched: false,
    };
    castSkill(b.ctx, b.source, b.target);
    expect(b.target.phoenix.spent).toBe(true);
    expect(b.source.taotie?.feasts).toBe(1);
  });
  it.each([1, 2, 3])(
    "%i星冷却期间继续回能；边界允许第二次吞噬而非永久禁用",
    (star) => {
      const { source, target, ctx } = pair(star);
      castSkill(ctx, source, target);
      gainMana(source, 100, ctx.tick + 1);
      expect(source.mana).toBe(100);
      const next = {
        ...army([piece("guard", 1, 102)], 1)[0],
        x: 3,
        y: 2,
        hp: 100,
        shield: 0,
      };
      ctx.fighters.push(next);
      ctx.tick = 10 + TAOTIE.cooldown[star - 1] - 1;
      expect(castSkill(ctx, source, next)).toBe(false);
      ctx.tick++;
      expect(castSkill(ctx, source, next)).toBe(true);
      expect(source.taotie?.feasts).toBe(2);
    },
  );
  it("狂暴不叠加；维修临时攻击强化与平攻吸血使用实际攻击", () => {
    const { source, target, ctx } = pair();
    castSkill(ctx, source, target);
    source.attackBoost = { ratio: 0.25, until: 100 };
    expect(combatAttack(source, 11)).toBe((53 + 50) * 1.25);
    expect(combatAttack(source, 42)).toBe(53 * 1.25);
    expect(source.attack).toBe(53);
    expect(abilityCredit(piece(), equipmentStats([]))).toBe(
      abilityCredit(piece(), { ...equipmentStats([]), skillPower: 2 }),
    );
  });
  it("旧qi仍只能吞一次，旧能力说明和旧图不变", () => {
    const { source, target, ctx } = pair(1, "qi");
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(source.devourSpent).toBe(true);
    source.mana = 100;
    target.hp = 100;
    expect(castSkill(ctx, source, target)).toBe(false);
    expect(source.taotie).toBeUndefined();
    expect(skillDescription("skytoad", "qi")).toContain("每场成功施放一次");
    expect(unitSprite("skytoad", "qi")).toBe("skytoad");
  });
  it("狂暴体型与命中测试使用相同有限大小，冷却与成功吞噬可在完整详情查看", () => {
    const { source, target, ctx } = pair();
    castSkill(ctx, source, target);
    expect(taotieScale(source, 11)).toBe(1.18);
    expect(taotieScale(source, 42)).toBe(1);
    expect(compactBattleLabels(source, 11)).toContain("饕餮狂暴");
    let labels: string[] = [];
    drawStatuses(canvas(), source, 11, 1, true, {
      onLabels: (value) => {
        labels = value;
      },
    });
    expect(labels.join(" ")).toContain("饕餮");
    expect(skillDescription("skytoad")).toContain("22/18/14");
    expect(() =>
      drawSkillEffect(
        canvas(),
        ctx.effects.find((e) => e.kind === "devour")!,
        1,
      ),
    ).not.toThrow();
  });
  it("当前继承罗汉、空蟹和异虫规则", () => {
    expect(army([piece("arhat")], 0)[0].qiSkill).toBe(true);
    expect(army([piece("skycrab")], 0)[0].aurora).toEqual({ stacks: 0 });
    expect(mergeCount([piece("eyebug"), piece("spider")], "eyebug", 1)).toBe(2);
  });

  for (const entry of frozen.fixtures)
    it(`修改前0.48回放${entry.name}逐帧保持`, async () => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(entry.left, entry.right, "qi")),
        ),
      );
      expect(
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(entry.hash);
    });
});

describe("饕餮实战与展示", () => {
  it("吞噬触发殉爆后再结算回复；被殉爆击杀时不会回血复活", () => {
    const a = pair();
    a.target.defId = "blastbug";
    a.target.deathBurst = "ready";
    a.target.shield = 0;
    expect(castSkill(a.ctx, a.source, a.target)).toBe(true);
    expect(a.target.deathBurst).toBe("spent");
    expect(a.source.hp).toBe(895);
    expect(a.source.healing).toBe(300);
    expect(a.source.taotie?.feasts).toBe(1);
    const b = pair();
    b.source.hp = 501;
    b.target.defId = "blastbug";
    b.target.deathBurst = "ready";
    b.target.maxHp = 10000;
    b.target.shield = 0;
    expect(castSkill(b.ctx, b.source, b.target)).toBe(true);
    expect(b.source.hp).toBe(0);
    expect(b.source.healing).toBe(0);
    expect(b.source.taotie?.feasts).toBe(0);
  });
  it("可见目标以当前血量判断，隐蔽/残魂不消耗本次能量", () => {
    const { source, target, ctx } = pair();
    target.air!.phaseUntil = 20;
    expect(castSkill(ctx, source, target)).toBe(false);
    expect(source.mana).toBe(100);
    expect(source.skillReadyAt).toBeUndefined();
    target.air!.phaseUntil = 0;
    target.immortal = { until: 30, spent: true, duration: 16 };
    expect(castSkill(ctx, source, target)).toBe(false);
  });
  it("吞噬的技能伤害不触发普攻吸血；额外攻击随狂暴结束消失", () => {
    const { source, target, ctx } = pair();
    source.maxHp = 2000;
    source.lifesteal = 1;
    const before = source.hp;
    castSkill(ctx, source, target);
    expect(source.hp).toBe(before + 300);
    expect(source.healing).toBe(300);
    const attack = combatAttack(source, 11);
    source.charm = { side: 0, until: 30, attack: source.attack };
    expect(combatAttack(source, 11)).toBe(attack);
    expect(taotieScale(source, 42)).toBe(1);
  });
  it("狂暴放大的可见边缘可点中，到期后命中区域同步恢复", () => {
    const { source, target, ctx } = pair();
    castSkill(ctx, source, target);
    const base = (1 + (source.star - 1) * 0.12) * (0.78 + source.y * 0.035),
      p = project(source.x + 0.5, source.y + 0.65),
      point = { x: p.x + 44 * base, y: p.y - 50 * base };
    expect(pickBattleFighter([source], point, 11)).toBe(source.uid);
    expect(pickBattleFighter([source], point, 42)).toBeNull();
  });
  it("八对八阵容共享份数、位置、星级和装备合法，无隐藏属性", () => {
    const counts = new Map<string, number>();
    for (const side of [TAOTIE_DEMO.left, TAOTIE_DEMO.right]) {
      expect(side).toHaveLength(8);
      expect(new Set(side.map((p) => p.position)).size).toBe(8);
      for (const p of side) {
        expect(p.encounterPower).toBeUndefined();
        expect(p.position).toBeGreaterThanOrEqual(32);
        expect(p.position).toBeLessThan(64);
        expect(p.items?.length ?? 0).toBeLessThanOrEqual(3);
        counts.set(p.defId, (counts.get(p.defId) ?? 0) + pieceCopies(p));
      }
    }
    for (const [id, copies] of counts)
      expect(copies).toBeLessThanOrEqual(COPIES[UNIT[id].cost]);
  });
  it("真实八对八包含重复吞噬、回血、狂暴到期和再激活，完整/快速/Worker一致", () => {
    const b = simulate(TAOTIE_DEMO.left, TAOTIE_DEMO.right);
    const starts = b.frames.flatMap((f) =>
      f.effects
        .filter(
          (e) => e.kind === "cast" && e.source === 107 && e.name === "饕餮",
        )
        .map(() => f.tick),
    );
    expect(starts.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(
        TAOTIE.cooldown[2],
      );
    const first = b.frames[starts[0]].fighters.find((f) => f.uid === 107)!;
    expect(first.taotie?.feasts).toBe(1);
    expect(first.taotie?.rage?.attack).toBe(200);
    expect(
      b.frames[starts[0] + TAOTIE.duration].fighters.find((f) => f.uid === 107)!
        .taotie?.rage,
    ).toBeUndefined();
    expect(
      b.frames
        .flatMap((f) => f.effects)
        .some(
          (e) =>
            e.source === 107 &&
            e.kind === "heal" &&
            e.name === "饕餮回复" &&
            e.amount > 0,
        ),
    ).toBe(true);
    const fast = simulateOutcome(TAOTIE_DEMO.left, TAOTIE_DEMO.right);
    expect(fast.winner).toBe(b.winner);
    expect(fast.damage).toBe(b.damage);
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    const worker = compute({
      kind: "replay",
      ...TAOTIE_DEMO,
      version: CURRENT_COMBAT_VERSION,
    });
    expect(worker.kind === "replay" && worker.battle).toEqual(b);
    const early = analyzeBattle(b, starts[0] - 1),
      late = analyzeBattle(b),
      r = late.sides[0].fighters.find((f) => f.uid === 107)!;
    expect(
      early.sides[0].fighters.find((f) => f.uid === 107)!.taotie?.feasts,
    ).toBe(0);
    expect(r.taotie?.feasts).toBe(starts.length);
    expect(r.healing).toBeGreaterThan(0);
    expect(
      battleAnalysisMarkup(
        late,
        "damage",
        "饕餮狂暴",
        b.frames.length - 1,
        160,
      ),
    ).toContain(`成功吞噬 ${starts.length} 次`);
    const track = new BattleSoundTrack();
    track.reset(b, starts[0]);
    expect(
      track.take(b, starts[0], true).filter((e) => e.kind === "cast"),
    ).toHaveLength(1);
  });
  it("战斗临时狂暴、技能冷却与吞噬次数在新军队重置，不修改永久棋子", () => {
    const p = piece("skytoad", 3),
      before = structuredClone(p);
    const f = army([p], 0)[0];
    f.taotie = { feasts: 3, rage: { until: 100, attack: 200 } };
    f.skillReadyAt = 200;
    const next = army([p], 0)[0];
    expect(next.taotie).toEqual({ feasts: 0 });
    expect(next.skillReadyAt).toBeUndefined();
    expect(combatAttack(next, 0)).toBe(212);
    expect(p).toEqual(before);
  });
  it("整局总结按最后一战版本取罗汉、空蟹形象", () => {
    const g = createGame(137, "classic");
    g.phase = "finished";
    g.players[0].hp = 0;
    g.players[0].eliminatedRound = 1;
    g.history = [
      {
        combatVersion: "taotie",
        round: 1,
        opponentId: 1,
        opponentName: "对手",
        kind: "pvp",
        winner: 1,
        damage: 1,
        income: 5,
        hp: 0,
        gold: 10,
        left: [piece("arhat"), piece("skycrab", 1, 2)],
        right: [piece("guard", 1, 101)],
      },
    ];
    const html = matchSummaryMarkup(g);
    expect(html).toContain("/arhat-qi.png");
    expect(html).toContain("/skycrab-aurora.png");
    g.history[0].combatVersion = "coalitions";
    const old = matchSummaryMarkup(g);
    expect(old).toContain("/arhat.png");
    expect(old).toContain("/skycrab.png");
  });
});

describe("整局价格目录", () => {
  it("新比赛五费10份；旧目录四费15份，战斗升级不改变价格", () => {
    const g = legacyGame();
    g.combatVersion = "taotie";
    expect(catalogVersion(g)).toBe("qi");
    expect(catalogCost(g, "skytoad")).toBe(4);
    expect(catalogUnit(g, "skytoad")).toMatchObject({ cost: 4, hp: 1000 });
    expect(salePrice(piece("skytoad", 3), "qi")).toBe(36);
    expect(salePrice(piece("skytoad", 3), "taotie")).toBe(45);
    const fresh = createGame(137, "classic");
    expect(fresh.catalogVersion).toBe(CURRENT_COMBAT_VERSION);
    expect(
      fresh.pool.skytoad +
        fresh.players.reduce(
          (n, p) => n + p.shop.filter((id) => id === "skytoad").length,
          0,
        ),
    ).toBe(10);
    expect(validGame(g)).toBe(true);
    expect(validGame({ ...g, catalogVersion: "broken" })).toBe(false);
  });
  it("旧比赛中购买预览、实际扣款、出售返款和图鉴一致", () => {
    const g = legacyGame();
    g.combatVersion = "taotie";
    const p = g.players[0];
    p.gold = 4;
    p.shop[0] = "skytoad";
    g.pool.skytoad--;
    const q = previewPurchase(g, p, 0);
    expect(q).toMatchObject({ allowed: true, cost: 4 });
    expect(buy(g, p, 0)).toBe(true);
    expect(p.gold).toBe(0);
    expect(
      pieceDetails(p.pieces[0], g.combatVersion, catalogVersion(g)).sell,
    ).toBe(4);
    Object.assign(codexFilters, {
      availability: "all",
      query: "",
      cost: "all",
      trait: "all",
      star: 1,
      sort: "cost",
      range: "all",
    });
    expect(filteredUnits(g).find((u) => u.id === "skytoad")?.cost).toBe(4);
    expect(
      filteredUnits(createGame(137, "classic")).find((u) => u.id === "skytoad")
        ?.cost,
    ).toBe(5);
    expect(sell(g, p, p.pieces[0].uid)).toBe(true);
    expect(p.gold).toBe(4);
    expect(g.pool.skytoad).toBe(15);
    expect(validGame(g)).toBe(true);
  });
  it("超过新池10份的旧持有量保持守恒，不删除棋子或追加金币", () => {
    const g = legacyGame();
    g.players[0].pieces = [
      piece("skytoad", 3, 1),
      { ...piece("skytoad", 2, 2), position: 36 },
    ];
    g.pool.skytoad = 3;
    g.nextUid = 3;
    expect(validGame(g)).toBe(true);
    delete g.catalogVersion;
    const before = structuredClone(g);
    const d = decodeSave(encode(g));
    expect(d.status).toBe("migrated");
    const restored = d.data!.game;
    expect(restored).toEqual({
      ...before,
      catalogVersion: "qi",
      combatVersion: CURRENT_COMBAT_VERSION,
    });
    expect(
      restored.pool.skytoad +
        restored.players[0].pieces.reduce((n, p) => n + pieceCopies(p), 0),
    ).toBe(15);
    expect(validGame(restored)).toBe(true);
  });
  it("AI按旧四费购买合法商店，不因当前全局五费错误跳过", () => {
    const g = legacyGame();
    g.combatVersion = "taotie";
    const p = g.players[1];
    p.gold = 4;
    p.shop[0] = "skytoad";
    g.pool.skytoad--;
    prepareBot(g, p, { buy, sell, roll, buyXp: () => false });
    expect(p.pieces.some((x) => x.defId === "skytoad")).toBe(true);
    expect(p.gold).toBe(0);
    expect(validGame(g)).toBe(true);
  });
  it("旧六级商店按四费抽蛤蟆，新六级商店不会抽到五费", () => {
    const old = legacyGame(),
      fresh = createGame(137, "classic");
    clearShops(fresh);
    old.combatVersion = "taotie";
    for (const g of [old, fresh]) {
      g.players[0].level = 6;
      g.players[0].gold = 2000;
    }
    let seen = false;
    for (let n = 0; n < 128; n++) {
      roll(old, old.players[0]);
      roll(fresh, fresh.players[0]);
      seen ||= old.players[0].shop.includes("skytoad");
      expect(fresh.players[0].shop.includes("skytoad")).toBe(false);
    }
    expect(seen).toBe(true);
    expect(validGame(old)).toBe(true);
    expect(validGame(fresh)).toBe(true);
  });
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`0.48/${banned}/${phase}按阶段迁移并保留目录、资源、历史与播放`, () => {
        const g = legacyGame();
        delete g.catalogVersion;
        if (banned) {
          g.bannedSeries = ["野兽", "熊猫", "装甲"];
          for (const id of Object.keys(g.pool))
            if (!isRecruitable(g, id)) g.pool[id] = 0;
        }
        const p = g.players[0];
        p.shop[0] = phase === "finished" ? "medic" : "arhat";
        g.pool[p.shop[0]]--;
        expect(buy(g, p, 0)).toBe(true);
        move(g, p, p.pieces[0].uid, 35);
        if (phase === "finished") p.hp = 1;
        const result = phase === "prepare" ? null : startRound(g);
        if (phase === "result" || phase === "finished") settle(g, result!);
        expect(g.phase).toBe(phase);
        const before = structuredClone(g),
          d = decodeSave(encode(g));
        expect(d.status).toBe("migrated");
        expect(d.data).toMatchObject({
          schema: SAVE_SCHEMA,
          rules: RULES.version,
          playback: { time: 3, speed: 2, paused: true },
        });
        const r = d.data!.game;
        expect(r).toEqual({
          ...before,
          catalogVersion: "qi",
          combatVersion: phase === "prepare" ? CURRENT_COMBAT_VERSION : "qi",
        });
        expect(validGame(r)).toBe(true);
        if (phase === "battle")
          expect(resumeRound(r)!.battle).toEqual(result!.battle);
        if (phase === "result") {
          if (r.reward) claimReward(r, 0);
          nextRound(r);
          expect(r.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(r.catalogVersion).toBe("qi");
        }
      });
});
