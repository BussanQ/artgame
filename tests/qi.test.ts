import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  damage,
  combatAttack,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import { advanceWindup } from "../src/engine/wild-skills";
import {
  ARHAT_QI,
  skillName,
  skillRole,
  skillDescription,
} from "../src/data/skills";
import { RULES, UNIT } from "../src/data/units";
import { unitDefinition, unitSprite } from "../src/data/unit-stats";
import { traitTiers } from "../src/data/traits";
import { synergies } from "../src/engine/synergies";
import { mergeCount } from "../src/engine/progression";
import { abilityCredit } from "../src/engine/ai";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import { fighterSprite } from "../src/engine/summons";
import { drawSkillEffect, drawStatuses } from "../src/render/skill-effects";
import { fighterBattleMarkup } from "../src/render/battle-inspection";
import {
  rangedPose,
  rangedActionName,
  drawRangedAttack,
} from "../src/render/ranged";
import { REST_POSE } from "../src/render/melee";
import { pieceDetails, pieceDetailMarkup } from "../src/ui/bench-tooltip";
import { AURORA_DEMO } from "../src/data/aurora-demo";
import { BattleSoundTrack } from "../src/audio/cues";
import {
  createGame,
  buy,
  move,
  startRound,
  settle,
  resumeRound,
  nextRound,
} from "../src/engine/game";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { claimReward } from "../src/engine/equipment";
import { isRecruitable } from "../src/engine/rotation";
import { compute } from "../src/compute/job";
import {
  CURRENT_COMBAT_VERSION,
  type Fighter,
  type Piece,
  type Battle,
  type CombatVersion,
} from "../src/engine/types";
import frozen from "./fixtures/pre-v048-replays.json";

const piece = (id = "arhat", star = 1, uid = 1): Piece => ({
  defId: id,
  star,
  uid,
  position: 35,
});
const pair = (star = 1) => {
  const source = army([piece("arhat", star)], 0)[0];
  const target = army([piece("guard", 3, 101)], 1)[0];
  Object.assign(source, { x: 3, y: 3, mana: 100 });
  Object.assign(target, { x: 3, y: 2, hp: 50000, maxHp: 50000 });
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
const frame = (c: CombatContext): Battle["frames"][number] =>
  structuredClone({
    tick: c.tick,
    fighters: c.fighters,
    events: c.events,
    effects: c.effects,
  });
const canvas = (texts: string[] = [], shapes: string[] = []) =>
  new Proxy(
    {},
    {
      get: (_, key) =>
        key === "fillText"
          ? (s: string) => texts.push(s)
          : () => shapes.push(String(key)),
      set: () => true,
    },
  ) as CanvasRenderingContext2D;

describe("罗汉气波掌", () => {
  it("卡片技能随版本选择，费用、分类和基础身板保留", () => {
    expect(UNIT.arhat.cost).toBe(3);
    expect(unitDefinition("arhat").skill).toBe("气波掌");
    expect(unitDefinition("arhat").traits).toEqual(["陆行者", "狙击"]);
    expect(skillName("arhat")).toBe("气波掌");
    expect(skillRole("arhat")).toBe("晶核蓄能");
    expect(skillDescription("arhat")).toContain("250/450/650");
    for (const v of ["fleet", "coalitions", "aurora"] as CombatVersion[]) {
      expect(unitDefinition("arhat", v).skill).toBe("破妄真言");
      expect(skillName("arhat", v)).toBe("破妄真言");
      expect(skillDescription("arhat", v)).toContain("300%");
      expect(army([piece()], 0, v)[0].qiSkill).toBeUndefined();
    }
  });
  it.each([1, 2, 3])(
    "%i星采用S04身板、五格射程和2.2秒间隔，旧身板仍可重建",
    (star) => {
      const current = army([piece("arhat", star)], 0)[0];
      expect(current.maxHp).toBe(550 * 2 ** (star - 1));
      expect(current.attack).toBe(160 * 2 ** (star - 1));
      expect(current.armor).toBe(5);
      expect(current.range).toBe(5);
      expect(current.interval / 4).toBe(2.2);
      expect(pieceDetails(piece("arhat", star))).toMatchObject({
        hp: current.maxHp,
        attack: current.attack,
        range: 5,
        armor: 5,
        interval: 2.2,
      });
      const old = army([piece("arhat", star)], 0, "aurora")[0];
      expect(old.maxHp).toBe(750 * 2 ** (star - 1));
      expect(old.attack).toBe(60 * 2 ** (star - 1));
      expect(old.range).toBe(4);
      expect(old.interval / 4).toBe(1);
    },
  );
  it.each([1, 2, 3])(
    "%i星固定伤害按施放时法强冻结，普攻真伤不会改变技能分类",
    (star) => {
      const { source, target, ctx } = pair(star);
      source.attack = 99999;
      source.skillPower = 1.3;
      target.armor = 999;
      expect(source.trueAttack).toBe(true);
      expect(castSkill(ctx, source, target)).toBe(true);
      expect(ctx.events).toEqual([]);
      expect(source.windup).toMatchObject({ until: 14, damageType: "magic" });
      source.attack = 1;
      source.skillPower = 9;
      for (ctx.tick = 11; ctx.tick < 14; ctx.tick++) {
        expect(advanceWindup(ctx, source)).toBe(true);
        expect(ctx.events).toHaveLength(0);
      }
      advanceWindup(ctx, source);
      const amount = Math.round([250, 450, 650][star - 1] * 1.3 * 0.8);
      expect(ctx.events).toHaveLength(1);
      expect(ctx.events[0]).toMatchObject({
        amount,
        skill: true,
        damageType: "magic",
      });
      expect(target.hp).toBe(50000 - amount);
      expect(source.windup).toBeUndefined();
      expect(
        ctx.effects.filter((e) => e.kind === "pulse" && e.name === "气波掌"),
      ).toHaveLength(1);
    },
  );
  const invalid: [
    string,
    (s: Fighter, t: Fighter, c: CombatContext) => void,
  ][] = [
    [
      "能量不足",
      (s) => {
        s.mana = 99;
      },
    ],
    [
      "冷却未结束",
      (s, _, c) => {
        s.skillReadyAt = c.tick + 1;
      },
    ],
    [
      "眩晕",
      (s, _, c) => {
        s.stunUntil = c.tick + 1;
      },
    ],
    [
      "沉默",
      (s, _, c) => {
        s.silenceUntil = c.tick + 1;
      },
    ],
    [
      "魅惑",
      (s, _, c) => {
        s.charm = { until: c.tick + 1, side: 0, attack: s.attack };
      },
    ],
    [
      "阵亡",
      (s) => {
        s.hp = 0;
      },
    ],
    [
      "目标阵亡",
      (_, t) => {
        t.hp = 0;
      },
    ],
    [
      "友方目标",
      (s, t) => {
        t.side = s.side;
      },
    ],
    [
      "超出射程",
      (_, t) => {
        t.x = 7;
        t.y = 0;
      },
    ],
    [
      "目标隐蔽",
      (_, t, c) => {
        t.air!.phaseUntil = c.tick + 1;
      },
    ],
  ];
  it.each(invalid)("%s时保留能量、冷却和动作状态", (_, invalidate) => {
    const { source, target, ctx } = pair();
    invalidate(source, target, ctx);
    const before = structuredClone(ctx);
    expect(castSkill(ctx, source, target)).toBe(false);
    expect(ctx).toEqual(before);
  });
  it("10秒从蓄力开始计算，满能量等待；边界允许下一次施放", () => {
    const { source, target, ctx } = pair();
    castSkill(ctx, source, target);
    expect(source.skillReadyAt).toBe(50);
    gainMana(source, 100, 11);
    expect(castSkill(ctx, source, target)).toBe(false);
    ctx.tick = 14;
    advanceWindup(ctx, source);
    ctx.tick = 49;
    expect(castSkill(ctx, source, target)).toBe(false);
    expect(source.mana).toBe(100);
    ctx.tick = 50;
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(source.skillReadyAt).toBe(90);
    expect(source.windup!.until).toBe(54);
  });
  it.each(["stun", "silence", "charm", "death"])(
    "蓄力中%s只中断一次，不返还能量或冷却",
    (reason) => {
      const { source, target, ctx } = pair();
      castSkill(ctx, source, target);
      if (reason === "stun") source.stunUntil = 20;
      if (reason === "silence") source.silenceUntil = 20;
      if (reason === "charm")
        source.charm = { until: 20, side: 0, attack: source.attack };
      if (reason === "death") source.hp = 0;
      ctx.tick = 12;
      expect(advanceWindup(ctx, source)).toBe(true);
      expect(advanceWindup(ctx, source)).toBe(false);
      expect(source.windup).toBeUndefined();
      expect(source.mana).toBe(0);
      expect(source.skillReadyAt).toBe(50);
      expect(ctx.events).toEqual([]);
      expect(ctx.effects.filter((e) => e.kind === "silence")).toHaveLength(1);
    },
  );
  it.each(["dead", "friendly", "hidden", "out-of-range"])(
    "锁定目标%s后不转火、不退款，留下目标丢失反馈",
    (reason) => {
      const { source, target, ctx } = pair();
      const replacement = { ...structuredClone(target), uid: 102, x: 4 };
      ctx.fighters.push(replacement);
      castSkill(ctx, source, target);
      if (reason === "dead") target.hp = 0;
      if (reason === "friendly") target.side = source.side;
      if (reason === "hidden") target.air!.phaseUntil = 20;
      if (reason === "out-of-range") {
        target.x = 7;
        target.y = 0;
      }
      ctx.tick = 14;
      advanceWindup(ctx, source);
      expect(ctx.events).toEqual([]);
      expect(replacement.hp).toBe(50000);
      expect(source.skillReadyAt).toBe(50);
      expect(source.mana).toBe(0);
      expect(ctx.effects.at(-1)).toMatchObject({
        source: source.uid,
        kind: "silence",
        name: "目标丢失",
      });
    },
  );
  it("真实控制技能立即打断，普通攻击仍由陆行者连携转为真伤", () => {
    const { source, target, ctx } = pair();
    castSkill(ctx, source, target);
    target.mana = 100;
    castSkill(ctx, target, source);
    expect(source.windup).toBeUndefined();
    expect(source.skillReadyAt).toBe(50);
    ctx.tick = 100;
    source.stunUntil = 0;
    target.armor = 999;
    target.shield = 0;
    damage(ctx, source, target, combatAttack(source, ctx.tick));
    expect(ctx.events.at(-1)).toMatchObject({
      damageType: "true",
      skill: false,
      amount: 160,
    });
  });
  it("技能经过护盾/法防/反伤，不触发普攻吸血，也不附加控制", () => {
    const { source, target, ctx } = pair();
    source.hp = 100;
    source.lifesteal = 1;
    target.shield = 160;
    target.reflection = 20;
    castSkill(ctx, source, target);
    ctx.tick = 14;
    advanceWindup(ctx, source);
    expect(ctx.events.find((e) => !e.reflected)).toMatchObject({
      amount: 40,
      absorbed: 160,
    });
    expect(target.hp).toBe(49960);
    expect(source.hp).toBe(80);
    expect(source.healing).toBe(0);
    expect(target.stunUntil).toBe(0);
  });
  it("技能免伤可挡住气波掌，不影响此次消耗和冷却", () => {
    const { source, target, ctx } = pair();
    castSkill(ctx, source, target);
    target.bladeStorm = { until: 30, next: 11, remaining: 6, damage: 1 };
    ctx.tick = 14;
    advanceWindup(ctx, source);
    expect(ctx.events[0]).toMatchObject({ amount: 0, immune: true });
    expect(source.skillReadyAt).toBe(50);
  });
  it("下一场恢复零能量/无冷却，永久棋子没有蓄力或图像版本标记", () => {
    const input = piece();
    const before = structuredClone(input);
    const source = army([input], 0)[0];
    source.mana = 100;
    source.skillReadyAt = 99;
    expect(input).toEqual(before);
    const next = army([input], 0)[0];
    expect(next.mana).toBe(0);
    expect(next.skillReadyAt).toBeUndefined();
    expect(next.windup).toBeUndefined();
  });
  it("继承极光、八项连携和异虫规则，AI使用固定法伤而非旧真伤倍率", () => {
    expect(traitTiers("qi")).toBe(traitTiers("aurora"));
    expect(synergies(AURORA_DEMO.left)).toEqual(
      synergies(AURORA_DEMO.left, "aurora"),
    );
    expect(army([piece("skycrab")], 0)[0].aurora).toEqual({ stacks: 0 });
    expect(unitSprite("skycrab")).toBe("skycrab-aurora");
    expect(skillDescription("skycrab")).toContain("575/825/1075");
    expect(
      mergeCount([piece("eyebug"), piece("blastbug", 1, 2)], "eyebug", 1),
    ).toBe(2);
    for (const star of [1, 2, 3]) {
      const p = piece("arhat", star),
        score = abilityCredit(p);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(0.6);
      expect(abilityCredit({ ...p, items: ["blade"] })).toBe(score);
      expect(abilityCredit({ ...p, items: ["staff"] })).toBeGreaterThan(score);
    }
  });
});

describe("晶核形象、动作与施法反馈", () => {
  it("新旧罗汉和空蟹的图鉴、战场及战斗分析统一选择对应形象", () => {
    expect(unitSprite("arhat")).toBe("arhat-qi");
    expect(unitSprite("arhat", "aurora")).toBe("arhat");
    expect(pieceDetailMarkup(piece())).toContain("arhat-qi.png");
    expect(pieceDetailMarkup(piece(), "aurora")).toContain("/arhat.png");
    expect(pieceDetails(piece()).action).toBe("晶核掌击");
    expect(rangedActionName("arhat", "aurora")).toBe("合掌推出法印");
    for (const v of ["qi", "aurora", "coalitions"] as CombatVersion[]) {
      const fighters = army([piece(), piece("skycrab", 1, 2)], 0, v);
      const b: Battle = {
        frames: [{ tick: 0, fighters, events: [], effects: [] }],
        winner: null,
        damage: 3,
      };
      const a = analyzeBattle(b);
      expect(a.sides[0].fighters.map(fighterSprite)).toEqual(
        fighters.map(fighterSprite),
      );
      const html = battleAnalysisMarkup(a, "damage", "图片检查", 0, 0);
      expect(html).toContain(v === "qi" ? "arhat-qi.png" : "/arhat.png");
      expect(html).toContain(
        v === "coalitions" ? "/skycrab.png" : "skycrab-aurora.png",
      );
    }
  });
  it("晶核掌击独立于旧法印动作，起止待机且所有姿态有限", () => {
    for (const skill of [false, true]) {
      expect(rangedPose("arhat", 0, skill, true)).toEqual(REST_POSE);
      expect(rangedPose("arhat", 1, skill, true)).toEqual(REST_POSE);
      for (let i = 0; i <= 40; i++)
        expect(
          Object.values(rangedPose("arhat", i / 40, skill, true)).every(
            Number.isFinite,
          ),
        ).toBe(true);
      expect(rangedPose("arhat", 0.65, skill, true)).not.toEqual(
        rangedPose("arhat", 0.65, skill),
      );
    }
    const shapes: string[] = [];
    drawRangedAttack(
      canvas([], shapes),
      "arhat",
      0.55,
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      false,
      true,
    );
    expect(shapes).toContain("stroke");
  });
  it("蓄力与冷却在固定详情可见，减少动态效果保留技能名称", () => {
    const { source, target, ctx } = pair();
    castSkill(ctx, source, target);
    let labels: string[] = [];
    drawStatuses(canvas(), source, 11, 1, true, {
      compact: true,
      onLabels: (value) => {
        labels = value;
      },
    });
    expect(labels).toContain("晶核蓄力 0.8s");
    expect(labels).toContain("气波掌冷却 9.8s");
    expect(fighterBattleMarkup(source, 11, labels)).toContain("晶核蓄力");
    ctx.tick = 14;
    advanceWindup(ctx, source);
    const effect = ctx.effects.find(
      (e) => e.kind === "pulse" && e.name === "气波掌",
    )!;
    const texts: string[] = [],
      shapes: string[] = [];
    drawSkillEffect(canvas(texts, shapes), effect, 1);
    expect(shapes).toContain("stroke");
    drawSkillEffect(canvas(texts), effect, 1, true);
    expect(texts).toContain("气波掌");
  });
  it.each(["interrupt", "lost-target"])(
    "战斗分析只统计当前片段的%s反馈，不泄露将来",
    (mode) => {
      const { source, target, ctx } = pair();
      castSkill(ctx, source, target);
      const frames = [frame(ctx)];
      ctx.effects = [];
      ctx.events = [];
      if (mode === "interrupt") source.stunUntil = 30;
      else target.hp = 0;
      ctx.tick = 14;
      advanceWindup(ctx, source);
      frames.push(frame(ctx));
      const b: Battle = { frames, winner: null, damage: 3 };
      const before = structuredClone(b),
        early = analyzeBattle(b, 0).sides[0].fighters[0],
        later = analyzeBattle(b, 1).sides[0].fighters[0];
      expect(early.interruptions).toBe(0);
      expect(early.lostTargets).toBe(0);
      expect(later.casts).toBe(1);
      expect(later.interruptions).toBe(mode === "interrupt" ? 1 : 0);
      expect(later.lostTargets).toBe(mode === "lost-target" ? 1 : 0);
      const html = battleAnalysisMarkup(
        analyzeBattle(b),
        "damage",
        "施法反馈",
        1,
        14,
      );
      expect(html).toContain(
        mode === "interrupt" ? "中断 1 次" : "目标丢失 1 次",
      );
      expect(b).toEqual(before);
    },
  );
  it("真实八对八包含重复蓄力和释放，完整/快速/Worker相同且蓄力不普攻", () => {
    const b = simulate(AURORA_DEMO.left, AURORA_DEMO.right),
      starts = b.frames.flatMap((f, i) =>
        f.effects
          .filter(
            (e) => e.source === 207 && e.kind === "cast" && e.name === "气波掌",
          )
          .map(() => i),
      );
    expect(starts.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(
        ARHAT_QI.cooldown,
      );
    for (const start of starts) {
      for (let i = start; i < start + ARHAT_QI.windup; i++)
        expect(
          b.frames[i].events.some((e) => e.attacker === 207 && !e.skill),
        ).toBe(false);
      expect(
        b.frames[start + ARHAT_QI.windup].effects.some(
          (e) => e.source === 207 && e.name === "气波掌" && e.kind === "pulse",
        ),
      ).toBe(true);
    }
    const fast = simulateOutcome(AURORA_DEMO.left, AURORA_DEMO.right);
    expect(fast.winner).toBe(b.winner);
    expect(fast.damage).toBe(b.damage);
    expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    const job = compute({
      kind: "replay",
      ...AURORA_DEMO,
      version: CURRENT_COMBAT_VERSION,
    });
    expect(job.kind === "replay" && job.battle).toEqual(b);
    const source = analyzeBattle(b).sides[1].fighters.find(
      (f) => f.uid === 207,
    )!;
    expect(source.casts).toBe(starts.length);
    expect(source.qiSkill).toBe(true);
    const sound = new BattleSoundTrack();
    sound.reset(b, starts[0] + 4);
    expect(
      sound.take(b, starts[0] + 4, true).filter((e) => e.kind === "beam"),
    ).toHaveLength(1);
  });
  for (const entry of frozen.fixtures)
    it(`修改前0.47回放${entry.name}逐帧保持`, async () => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(
            simulate(
              entry.left,
              entry.right,
              frozen.combatVersion as CombatVersion,
            ),
          ),
        ),
      );
      expect(
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(entry.hash);
    });
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`0.47/${banned}/${phase}只迁移下一准备阶段，资源和历史保留`, () => {
        const game = createGame(137, "classic");
        game.combatVersion = "aurora";
        for (const p of game.players) {
          for (const id of p.shop) if (id) game.pool[id]++;
          p.shop = [null, null, null, null, null];
        }
        if (banned) {
          game.bannedSeries = ["野兽", "熊猫", "装甲"];
          for (const id of Object.keys(game.pool))
            if (!isRecruitable(game, id)) game.pool[id] = 0;
        }
        const me = game.players[0];
        me.shop[0] = phase === "finished" ? "medic" : "arhat";
        game.pool[me.shop[0]]--;
        expect(buy(game, me, 0)).toBe(true);
        expect(move(game, me, me.pieces[0].uid, 35)).toBe(true);
        if (phase === "finished") me.hp = 1;
        const result = phase === "prepare" ? null : startRound(game);
        if (phase === "result" || phase === "finished") settle(game, result!);
        expect(game.phase).toBe(phase);
        const before = structuredClone(game),
          decoded = decodeSave(
            JSON.stringify({
              schema: 46,
              rules: "singleplayer-0.47",
              savedAt: 1,
              revision: 1,
              game,
              playback: { time: 3, speed: 2, paused: true },
            }),
          );
        expect(decoded.status).toBe("migrated");
        expect(decoded.data).toMatchObject({
          schema: SAVE_SCHEMA,
          rules: RULES.version,
          playback: { time: 3, speed: 2, paused: true },
        });
        const restored = decoded.data!.game;
        expect(restored).toEqual({
          ...before,
          combatVersion:
            phase === "prepare" ? CURRENT_COMBAT_VERSION : "aurora",
        });
        if (phase === "battle") {
          expect(resumeRound(restored)!.battle).toEqual(result!.battle);
          settle(restored, resumeRound(restored)!);
        }
        if (restored.phase === "result") {
          if (restored.reward) claimReward(restored, 0);
          nextRound(restored);
          expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(restored.history[0].combatVersion).toBe("aurora");
        }
        expect(validGame(restored)).toBe(true);
      });
});
