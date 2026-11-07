import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  castSkill,
  combatAttack,
  damage,
  gainMana,
  type CombatContext,
} from "../src/engine/abilities";
import {
  AURORA,
  skillDescription,
  skillName,
  skillRole,
} from "../src/data/skills";
import { UNIT, RULES } from "../src/data/units";
import { ITEM } from "../src/data/items";
import { unitDefinition, unitSprite } from "../src/data/unit-stats";
import { fighterSprite } from "../src/engine/summons";
import { recruitmentMarkup } from "../src/ui/recruitment";
import { codexMarkup } from "../src/ui/unit-codex";
import { equipmentMarkup, equipmentOverviewMarkup } from "../src/ui/equipment";
import { deploymentMarkup } from "../src/ui/deployment";
import { scoutingMarkup } from "../src/ui/scouting";
import { AURORA_DEMO } from "../src/data/aurora-demo";
import { COALITION_DEMO } from "../src/data/coalition-demo";
import { traitTiers } from "../src/data/traits";
import { synergies } from "../src/engine/synergies";
import { mergeCount } from "../src/engine/progression";
import { abilityCredit } from "../src/engine/ai";
import { BattleSoundTrack } from "../src/audio/cues";
import { drawSkillEffect, drawStatuses } from "../src/render/skill-effects";
import {
  compactBattleLabels,
  fighterBattleMarkup,
} from "../src/render/battle-inspection";
import { pieceDetailMarkup } from "../src/ui/bench-tooltip";
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
  type CombatVersion,
} from "../src/engine/types";
import frozen from "./fixtures/pre-v047-replays.json";

const piece = (id = "skycrab", star = 1, uid = 1): Piece => ({
  defId: id,
  star,
  uid,
  position: 35,
});
const pair = (star = 1) => {
  const source = army([piece("skycrab", star)], 0)[0];
  const target = army([piece("guard", 3, 101)], 1)[0];
  Object.assign(source, { x: 3, y: 3, mana: 100 });
  Object.assign(target, { x: 3, y: 2, hp: 50000, maxHp: 50000 });
  const ctx: CombatContext = {
    fighters: [source, target],
    tick: 10,
    events: [],
    effects: [],
  };
  return { source, target, ctx };
};
const canvas = (texts: string[] = [], shapes: string[] = []) =>
  new Proxy(
    {},
    {
      get: (_, key) =>
        key === "fillText"
          ? (text: string) => texts.push(text)
          : () => shapes.push(String(key)),
      set: () => true,
    },
  ) as CanvasRenderingContext2D;

describe("空蟹客户端卡技能与成长", () => {
  it("费用与基础身板保持，技能名称/说明随战斗版本选择", () => {
    expect(UNIT.skycrab.cost).toBe(2);
    expect(unitDefinition("skycrab").skill).toBe("极光电影");
    expect(skillName("skycrab")).toBe("极光电影");
    expect(skillRole("skycrab")).toBe("成长狙杀");
    expect(skillDescription("skycrab")).toContain("575/825/1075");
    expect(skillDescription("skycrab")).toContain("累计+75%");
    for (const version of [
      "fleet",
      "lineages",
      "coalitions",
    ] as CombatVersion[]) {
      expect(unitDefinition("skycrab", version).skill).toBe("聚能狙杀");
      expect(skillName("skycrab", version)).toBe("聚能狙杀");
      expect(skillDescription("skycrab", version)).toContain("450%");
      expect(army([piece()], 0, version)[0].aurora).toBeUndefined();
    }
  });
  it.each([1, 2, 3])(
    "%i星采用独立固定技能伤害，攻击装备与成长不放大该伤害",
    (star) => {
      const { source, target, ctx } = pair(star);
      source.attack = 99999;
      source.aurora!.stacks = 2;
      source.skillPower = 1.3;
      target.armor = 999;
      expect(castSkill(ctx, source, target)).toBe(true);
      const expected = Math.round([575, 825, 1075][star - 1] * 1.3 * 0.8);
      expect(ctx.events).toHaveLength(1);
      expect(ctx.events[0]).toMatchObject({
        skill: true,
        damageType: "magic",
        amount: expected,
      });
      expect(source.damage).toBe(expected);
      expect(target.hp).toBe(50000 - expected);
    },
  );
  it("施放命中当前可见目标，不偷偷转向高攻击敌人或溅射", () => {
    const { source, target, ctx } = pair();
    const strong = { ...structuredClone(target), uid: 102, x: 4, attack: 9999 };
    const far = {
      ...structuredClone(target),
      uid: 103,
      x: 7,
      y: 0,
      attack: 99999,
    };
    ctx.fighters.push(strong, far);
    castSkill(ctx, source, target);
    expect(ctx.events.map((e) => e.target)).toEqual([target.uid]);
    expect(strong.hp).toBe(50000);
    expect(far.hp).toBe(50000);
  });
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
      "尚在冷却",
      (s, _, c) => {
        s.skillReadyAt = c.tick + 1;
      },
    ],
    [
      "施法者眩晕",
      (s, _, c) => {
        s.stunUntil = c.tick + 1;
      },
    ],
    [
      "施法者沉默",
      (s, _, c) => {
        s.silenceUntil = c.tick + 1;
      },
    ],
    [
      "施法者魅惑",
      (s, _, c) => {
        s.charm = { until: c.tick + 1, attack: s.attack, side: 0 };
      },
    ],
    [
      "施法者阵亡",
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
      "相位隐蔽",
      (_, t, c) => {
        t.air!.phaseUntil = c.tick + 1;
      },
    ],
  ];
  it.each(invalid)("%s时不扣能量、不叠层、不开始冷却", (_, invalidate) => {
    const { source, target, ctx } = pair();
    invalidate(source, target, ctx);
    const before = structuredClone(ctx);
    expect(castSkill(ctx, source, target)).toBe(false);
    expect(ctx).toEqual(before);
  });
  it("满能量仍须等待13秒，边界前保留能量，边界到达方可再次施放", () => {
    const { source, target, ctx } = pair();
    castSkill(ctx, source, target);
    expect(source.skillReadyAt).toBe(62);
    expect(source.mana).toBe(0);
    gainMana(source, 100, 20);
    ctx.tick = 61;
    expect(castSkill(ctx, source, target)).toBe(false);
    expect(source.mana).toBe(100);
    expect(source.aurora!.stacks).toBe(1);
    ctx.tick = 62;
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(source.skillReadyAt).toBe(114);
    expect(source.aurora!.stacks).toBe(2);
  });
  it("25%逐层相加、三层封顶，第四次仍造成固定技能伤害", () => {
    const { source, target, ctx } = pair();
    const base = source.attack;
    for (let cast = 1; cast <= 4; cast++) {
      source.mana = 100;
      ctx.tick = 10 + (cast - 1) * 52;
      expect(castSkill(ctx, source, target)).toBe(true);
      expect(source.aurora!.stacks).toBe(Math.min(cast, 3));
      expect(combatAttack(source, ctx.tick)).toBe(
        base * (1 + Math.min(cast, 3) * 0.25),
      );
    }
    expect(ctx.events.map((e) => e.amount)).toEqual([460, 460, 460, 460]);
    expect(
      ctx.effects.filter((e) => e.name === "极光增幅").map((e) => e.amount),
    ).toEqual([25, 50, 75]);
    expect(source.attack).toBe(base);
  });
  it.each(["护盾全吸收", "技能免疫", "空军闪避"])(
    "%s仍属于成功施放并叠层",
    (mode) => {
      const { source, target, ctx } = pair();
      if (mode === "护盾全吸收") target.shield = 10000;
      if (mode === "技能免疫")
        target.bladeStorm = { until: 100, next: 11, remaining: 6, damage: 1 };
      if (mode === "空军闪避") {
        target.air!.flying = true;
        target.air!.evasion = 1;
      }
      expect(castSkill(ctx, source, target)).toBe(true);
      expect(source.aurora!.stacks).toBe(1);
      expect(source.skillReadyAt).toBe(62);
      if (mode !== "空军闪避") expect(target.hp).toBe(50000);
      else expect(target.hp).toBe(49540);
    },
  );
  it("技能不触发普攻吸血，灵能反伤正常结算", () => {
    const { source, target, ctx } = pair();
    source.hp = 100;
    source.lifesteal = 1;
    target.reflection = 20;
    castSkill(ctx, source, target);
    expect(source.hp).toBe(80);
    expect(source.healing).toBe(0);
    expect(ctx.events.find((e) => e.reflected)).toMatchObject({
      amount: 20,
      damageType: "true",
    });
  });
  it("叠层提升真实普通攻击，护甲/闪避/吸血继续走普攻规则", () => {
    const { source, target, ctx } = pair();
    castSkill(ctx, source, target);
    target.armor = 0;
    source.hp = 100;
    source.lifesteal = 0.2;
    const hp = target.hp;
    damage(ctx, source, target, combatAttack(source, ctx.tick));
    expect(hp - target.hp).toBe(63);
    expect(source.hp).toBe(113);
    target.air!.flying = true;
    target.air!.evasion = 1;
    const before = target.hp;
    damage(ctx, source, target, combatAttack(source, ctx.tick));
    expect(target.hp).toBe(before);
    expect(ctx.events.at(-1)!.evaded).toBe(true);
  });
  it("自身成长与维修/铁鸡强化分别计算，外部增益过期不清空自身层数", () => {
    const { source } = pair();
    source.attack = 68; // one ordinary blade on the 50 attack body
    source.aurora!.stacks = 2;
    source.attackBoost = { until: 20, ratio: 0.25 };
    source.command = [{ source: 9, side: 0, until: 20, attack: 0.4, armor: 0 }];
    expect(combatAttack(source, 10)).toBeCloseTo(68 * 1.5 * 1.4);
    expect(combatAttack(source, 20)).toBe(102);
    expect(source.aurora!.stacks).toBe(2);
  });
  it("本场成长不写入持久棋子，下一场层数、攻击和技能冷却重置", () => {
    const input = piece();
    input.items = ["blade"];
    const before = structuredClone(input);
    const source = army([input], 0)[0];
    source.aurora!.stacks = 3;
    source.skillReadyAt = 100;
    expect(combatAttack(source, 5)).toBe(119);
    expect(input).toEqual(before);
    const next = army([input], 0)[0];
    expect(next.aurora!.stacks).toBe(0);
    expect(next.skillReadyAt).toBeUndefined();
    expect(combatAttack(next, 0)).toBe(68);
  });
  it("直接技能继承三攻城，当前版本继续使用空援/职业/异虫规则", () => {
    const team = ["skycrab", "chariot", "cannon"].map((id, i) => ({
      ...piece(id, 1, i + 1),
      position: 35 + i,
    }));
    const source = army(team, 0)[0];
    const target = army([piece("titan", 3, 100)], 1)[0];
    Object.assign(source, { mana: 100, x: 3, y: 3 });
    Object.assign(target, { x: 3, y: 2 });
    const ctx: CombatContext = {
      fighters: [source, target],
      tick: 0,
      events: [],
      effects: [],
    };
    castSkill(ctx, source, target);
    expect(ctx.events[0].amount).toBe(575); // 575 * 1.25 siege * 0.8 magic defense
    expect(traitTiers("aurora")).toEqual(traitTiers("coalitions"));
    expect(synergies(COALITION_DEMO.left)).toEqual(
      synergies(COALITION_DEMO.left, "coalitions"),
    );
    expect(skillDescription("wolf")).toContain("回能+40%");
    expect(unitDefinition("wolf").traits).toEqual(["野兽", "召唤"]);
    const insects = ["eyebug", "blastbug"].map((id, i) => piece(id, 1, i + 1));
    expect(mergeCount(insects, "eyebug", 1)).toBe(2);
  });
  it("AI按固定技能伤害和有限首层收益估值，法强装备有收益且不保证三层", () => {
    for (const star of [1, 2, 3]) {
      const p = piece("skycrab", star);
      const score = abilityCredit(p);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(0.6);
      expect(abilityCredit({ ...p, items: ["staff"] })).toBeGreaterThan(score);
      expect(abilityCredit({ ...p, items: ["blade"] })).toBe(score);
    }
  });
});

describe("空蟹表现、旧回放与完整流程", () => {
  it("新形象用于战场和各入口，旧版本仍可读取原形象", () => {
    expect(unitSprite("skycrab")).toBe("skycrab-aurora");
    expect(unitSprite("skycrab", "coalitions")).toBe("skycrab");
    expect(unitSprite("guard")).toBe("guard");
    expect(fighterSprite(army([piece()], 0)[0])).toBe("skycrab-aurora");
    expect(fighterSprite(army([piece()], 0, "coalitions")[0])).toBe("skycrab");
    const game = createGame(137, "classic"),
      p = game.players[0];
    const previous = p.shop[0];
    if (previous) game.pool[previous]++;
    p.shop[0] = "skycrab";
    game.pool.skycrab--;
    p.pieces = [{ ...piece("skycrab", 2), items: ["plate"] }];
    for (const version of ["aurora", "coalitions"] as CombatVersion[]) {
      game.combatVersion = version;
      const expected =
        version === "aurora"
          ? "/assets/units/skycrab-aurora.png"
          : "/assets/units/skycrab.png";
      for (const html of [
        recruitmentMarkup(game, p, false),
        pieceDetailMarkup(p.pieces[0], version),
        codexMarkup(game),
        equipmentMarkup(game, 1, false),
        equipmentOverviewMarkup(game),
        deploymentMarkup(p, 1, false, true, version),
        scoutingMarkup(game, 0),
      ]) {
        expect(html).toContain(expected);
        if (version === "coalitions")
          expect(html).not.toContain("skycrab-aurora.png");
      }
    }
  });
  it("战斗详情同时显示实际攻击、层数和剩余冷却，战场短文字受两条限制", () => {
    const { source, target, ctx } = pair();
    castSkill(ctx, source, target);
    let labels: string[] = [];
    drawStatuses(canvas(), source, 11, 1, true, {
      compact: true,
      onLabels: (value) => {
        labels = value;
      },
    });
    expect(labels).toContain("极光增幅 1/3 · 攻击+25%");
    expect(labels).toContain("极光冷却 12.8s");
    expect(fighterBattleMarkup(source, 11, labels)).toContain("攻击 <b>63</b>");
    expect(compactBattleLabels(source, 11)).toEqual(["极光 1/3"]);
    source.stunUntil = source.silenceUntil = 15;
    expect(compactBattleLabels(source, 11)).toEqual(["眩晕", "沉默"]);
    const detail = pieceDetailMarkup(piece());
    expect(detail).toContain("极光电影");
    expect(detail).toContain("575/825/1075");
    expect(pieceDetailMarkup(piece(), "coalitions")).toContain("聚能狙杀");
  });
  it("极光束和叠层各有画面，减少动态效果保留技能文字", () => {
    const { source, target, ctx } = pair();
    castSkill(ctx, source, target);
    for (const name of ["极光电影", "极光增幅"]) {
      const effect = ctx.effects.find(
        (e) => e.name === name && e.kind !== "cast",
      )!;
      const shapes: string[] = [],
        texts: string[] = [];
      drawSkillEffect(canvas(texts, shapes), effect, 1);
      expect(shapes).toContain("stroke");
      drawSkillEffect(canvas(texts), effect, 1, true);
      expect(texts).toContain(name);
    }
  });
  it("八对八合法阵容自然施放三次，不修改属性/伤害或预设胜者", () => {
    for (const team of [AURORA_DEMO.left, AURORA_DEMO.right]) {
      expect(team).toHaveLength(8);
      expect(new Set(team.map((p) => p.position)).size).toBe(8);
      for (const p of team) {
        expect(p.star).toBeGreaterThanOrEqual(1);
        expect(p.star).toBeLessThanOrEqual(3);
        expect(p.position).toBeGreaterThanOrEqual(32);
        expect(p.position).toBeLessThan(64);
        expect(p.items?.length ?? 0).toBeLessThanOrEqual(3);
        expect(p.encounterPower).toBeUndefined();
        for (const item of p.items ?? []) expect(ITEM[item]).toBeDefined();
      }
    }
    const before = structuredClone(AURORA_DEMO);
    const battle = simulate(AURORA_DEMO.left, AURORA_DEMO.right);
    const casts = battle.frames.flatMap((f, tick) =>
      f.effects
        .filter((e) => e.source === 107 && e.kind === "cast")
        .map(() => tick),
    );
    expect(casts.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < casts.length; i++)
      expect(casts[i] - casts[i - 1]).toBeGreaterThanOrEqual(AURORA.cooldown);
    expect(
      Math.max(
        ...battle.frames.map(
          (f) => f.fighters.find((p) => p.uid === 107)?.aurora?.stacks ?? 0,
        ),
      ),
    ).toBe(3);
    expect(
      battle.frames.some((f) =>
        f.fighters.some(
          (p) =>
            p.uid === 107 && p.mana === 100 && (p.skillReadyAt ?? 0) > f.tick,
        ),
      ),
    ).toBe(true);
    expect(
      battle.frames.some((f) =>
        f.events.some((e) => e.attacker === 107 && !e.skill),
      ),
    ).toBe(true);
    expect(AURORA_DEMO).toEqual(before);
    const fast = simulateOutcome(before.left, before.right);
    expect(fast.winner).toBe(battle.winner);
    expect(fast.damage).toBe(battle.damage);
    expect(fast.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    const job = compute({
      kind: "replay",
      ...before,
      version: CURRENT_COMBAT_VERSION,
    });
    expect(job.kind === "replay" && job.battle).toEqual(battle);
    const sound = new BattleSoundTrack();
    sound.reset(battle, casts[0]);
    const cues = sound
      .take(battle, casts[0], true)
      .filter((c) => c.priority === 2);
    expect(cues.filter((c) => c.kind === "beam")).toHaveLength(1);
  });
  for (const entry of frozen.fixtures)
    it(`修改前0.46回放${entry.name}保持逐帧SHA`, async () => {
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
      it(`0.46/${banned}/${phase}迁移保留共享卡池、经济、装备与历史规则`, () => {
        const game = createGame(137, "classic");
        game.combatVersion = "coalitions";
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
        me.shop[0] = phase === "finished" ? "medic" : "skycrab";
        game.pool[me.shop[0]]--;
        expect(buy(game, me, 0)).toBe(true);
        expect(move(game, me, me.pieces[0].uid, 35)).toBe(true);
        if (phase === "finished") me.hp = 1;
        const result = phase === "prepare" ? null : startRound(game);
        if (phase === "result" || phase === "finished") settle(game, result!);
        expect(game.phase).toBe(phase);
        const before = structuredClone(game);
        const decoded = decodeSave(
          JSON.stringify({
            schema: 45,
            rules: "singleplayer-0.46",
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
            phase === "prepare" ? CURRENT_COMBAT_VERSION : "coalitions",
        });
        if (phase === "battle") {
          expect(resumeRound(restored)!.battle).toEqual(result!.battle);
          settle(restored, resumeRound(restored)!);
        }
        if (restored.phase === "result") {
          if (restored.reward) claimReward(restored, 0);
          nextRound(restored);
          expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(restored.history[0].combatVersion).toBe("coalitions");
        }
        expect(validGame(restored)).toBe(true);
      });
});
