import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { damage, gainMana, type CombatContext } from "../src/engine/abilities";
import { enterUndying } from "../src/engine/immortality";
import { callWolfPack, callRetinue } from "../src/engine/summons";
import { synergies } from "../src/engine/synergies";
import { UNIT, UNITS, RULES } from "../src/data/units";
import { ITEM, equipmentStats } from "../src/data/items";
import { unitDefinition } from "../src/data/unit-stats";
import { traitTiers } from "../src/data/traits";
import { skillDescription } from "../src/data/skills";
import { ABNORMAL_DEMO } from "../src/data/abnormal-demo";
import { WILDFRONT_DEMO } from "../src/data/wildfront-demo";
import {
  CURRENT_COMBAT_VERSION,
  type Piece,
  type Fighter,
  type CombatVersion,
} from "../src/engine/types";
import {
  createGame,
  buy,
  move,
  startRound,
  settle,
  resumeRound,
  nextRound,
} from "../src/engine/game";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { claimReward } from "../src/engine/equipment";
import {
  SERIES,
  isRecruitable,
  availableUnits,
  rotationTraits,
} from "../src/engine/rotation";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { filteredUnits, codexFilters } from "../src/ui/unit-codex";
import { drawStatuses } from "../src/render/skill-effects";
import {
  compactBattleLabels,
  fighterBattleMarkup,
} from "../src/render/battle-inspection";
import { compute } from "../src/compute/job";
import frozen from "./fixtures/pre-v045-replays.json";

const line = (ids: string[], offset = 0): Piece[] =>
  ids.map((defId, i) => ({
    uid: offset + i + 1,
    defId,
    star: 1,
    position: 32 + i,
  }));
const abnormal = [
  "monk",
  "eyebug",
  "spider",
  "eel",
  "vine",
  "skytoad",
  "grenadier",
];
const context = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 1,
  effects: [],
  events: [],
});
const fighter = (id: string, side: 0 | 1 = 0) =>
  army(line([id], side * 100), side)[0];
const historical: [string, string[], string[]][] = [
  ["chariot", ["装甲", "攻城"], ["装甲", "狙击", "攻城"]],
  ["titan", ["装甲", "爆破"], ["装甲", "护卫", "爆破"]],
  ["staffthrall", ["傀儡", "护卫"], ["傀儡", "先锋"]],
  ["thunderlord", ["灵能", "狙击"], ["灵能", "爆破"]],
  ["wolf", ["野兽", "召唤"], ["野兽", "刺杀", "召唤"]],
  ["bonedragon", ["不朽", "攻城", "猛禽"], ["不朽", "爆破", "猛禽"]],
  ["vine", ["不朽", "异能"], ["不朽", "护卫"]],
  ["monk", ["熊猫", "异能"], ["熊猫", "护卫"]],
];

describe("四月/五月分类与版本化职业", () => {
  it.each(historical)(
    "%s采用S03分类，开战和备战详情不混用新旧职业",
    (id, current, old) => {
      expect(UNIT[id].traits).toEqual(current);
      expect(unitDefinition(id, "counterplay").traits).toEqual(old);
      expect(unitDefinition(id, "fleet").traits).toEqual(old);
      expect(pieceDetails(line([id])[0]).traits.map((t) => t.name)).toEqual(
        current,
      );
      expect(
        pieceDetails(line([id])[0], "counterplay").traits.map((t) => t.name),
      ).toEqual(old);
    },
  );
  it("修正仅涉及职业，所有系列禁用及原有卡池成员保持相同", () => {
    for (const unit of UNITS) {
      expect(SERIES.filter((t) => unit.traits.includes(t))).toEqual(
        SERIES.filter((t) =>
          unitDefinition(unit.id, "counterplay").traits.includes(t),
        ),
      );
      for (let i = 0; i < SERIES.length; i++) {
        const bans = [
          SERIES[i],
          SERIES[(i + 1) % SERIES.length],
          SERIES[(i + 2) % SERIES.length],
        ];
        expect(isRecruitable({ bannedSeries: bans }, unit.id)).toBe(
          !bans.some((t) =>
            unitDefinition(unit.id, "counterplay").traits.includes(t),
          ),
        );
      }
    }
  });
  it("雷震子进入狙击、投石车退出；鬼狼开场留在部署格并能正常召狼", () => {
    const pieces = line(["infantry", "sniper", "thunderlord", "chariot"]);
    const now = army(pieces, 0),
      old = army(pieces, 0, "counterplay");
    expect(now.find((f) => f.defId === "thunderlord")!.armorPenetration).toBe(
      4,
    );
    expect(
      now.find((f) => f.defId === "chariot")!.armorPenetration,
    ).toBeUndefined();
    expect(
      old.find((f) => f.defId === "thunderlord")!.armorPenetration,
    ).toBeUndefined();
    expect(old.find((f) => f.defId === "chariot")!.armorPenetration).toBe(4);
    const wolf = line(["wolf"]);
    wolf[0].position = 59;
    const current = simulate(wolf, line(["guard"], 100)).frames[0].fighters[0];
    const previous = simulate(wolf, line(["guard"], 100), "counterplay")
      .frames[0].fighters[0];
    expect([current.x, current.y]).toEqual([3, 7]);
    expect([previous.x, previous.y]).not.toEqual([3, 7]);
    current.mana = 100;
    const ctx = context(current);
    expect(callWolfPack(ctx, current)).toBe(true);
    expect(ctx.fighters.filter((f) => f.summon)).toHaveLength(2);
  });
  it("图鉴筛选和随机禁用的可达档位跟随所查看的版本", () => {
    const previous = codexFilters.trait;
    try {
      codexFilters.trait = "异能";
      expect(
        filteredUnits()
          .map((u) => u.id)
          .sort(),
      ).toEqual([...abnormal].sort());
      expect(
        filteredUnits({ combatVersion: "counterplay" }).map((u) => u.id),
      ).not.toContain("monk");
    } finally {
      codexFilters.trait = previous;
    }
    const game = { bannedSeries: ["异虫", "海神", "不朽"] as const };
    const banned = { bannedSeries: [...game.bannedSeries] };
    const row = rotationTraits(banned).find((t) => t.trait === "异能")!;
    expect(row).toMatchObject({ total: 7, available: 3, tiers: [2, 4, 6] });
    expect(
      availableUnits(banned).filter((u) => u.traits.includes("异能")),
    ).toHaveLength(3);
    expect(
      rotationTraits({ ...banned, combatVersion: "counterplay" }).find(
        (t) => t.trait === "异能",
      )!.tiers,
    ).toEqual([2]);
  });
});

describe("异能全军普攻吸血", () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7])(
    "%i种上阵异能按5/10/20%%累计，全军受益且备战与重名不重复计数",
    (count) => {
      const pieces = [
        ...line(abnormal.slice(0, count)),
        { ...line(["infantry"], 100)[0], position: 59 },
      ];
      const team = army(pieces, 0);
      const expected = count < 2 ? 0 : count < 4 ? 0.05 : count < 6 ? 0.1 : 0.2;
      expect(
        team.every(
          (f) =>
            (f.teamLifesteal ?? 0) === expected && f.lifesteal === expected,
        ),
      ).toBe(true);
      const copies = [...pieces, { ...line(["monk"], 200)[0], position: null }];
      if (count) copies.push({ ...pieces[0], uid: 300, position: 60 });
      expect(
        synergies(copies).find((s) => s.trait === "异能")?.count ?? 0,
      ).toBe(count);
      expect(
        traitTiers(CURRENT_COMBAT_VERSION).异能.map((t) => t.count),
      ).toEqual([2, 4, 6]);
    },
  );
  it("旧异能仍压制回能，新异能不压制；骑兵的独立减3回能继续生效", () => {
    const pieces = line(["eyebug", "spider"]),
      enemies = line(["guard"], 100);
    const now = simulate(pieces, enemies).frames[0].fighters.find(
      (f) => f.side === 1,
    )!;
    const old = simulate(
      pieces,
      enemies,
      "counterplay",
    ).frames[0].fighters.find((f) => f.side === 1)!;
    now.mana = old.mana = 0;
    gainMana(now, 20, 0);
    gainMana(old, 20, 0);
    expect(now.mana).toBe(20);
    expect(old.mana).toBe(15);
    const cavalry = simulate(
      line(["eyebug", "spider", "motorcycle", "birdrider"]),
      enemies,
    ).frames[0].fighters.find((f) => f.side === 1)!;
    cavalry.mana = 0;
    gainMana(cavalry, 20, 0);
    expect(cavalry.mana).toBe(17);
    expect(skillDescription("acolyte")).toContain("骑兵压制");
    expect(skillDescription("acolyte", "counterplay")).toContain("异能压制");
  });
  it.each([
    [0, 0, 1000, 100, 20],
    [0, 60, 1000, 40, 8],
    [0, 150, 1000, 0, 0],
    [0, 0, 10, 10, 2],
    [10, 0, 1000, 63, 13],
  ])(
    "护甲%s、护盾%s、生命%s：仅按实际生命伤害%s回复%s",
    (armor, shield, hp, amount, healed) => {
      const source = army(
        [
          ...line(abnormal.slice(0, 6)),
          { ...line(["infantry"], 100)[0], position: 59 },
        ],
        0,
      ).at(-1)!;
      const target = fighter("guard", 1);
      Object.assign(source, { hp: source.maxHp - 100 });
      Object.assign(target, { armor, shield, hp, maxHp: hp });
      const ctx = context(source, target),
        before = source.hp;
      expect(damage(ctx, source, target, 100)).toBe(amount);
      expect(source.hp - before).toBe(healed);
      expect(source.healing).toBe(healed);
      expect(
        ctx.effects
          .filter((e) => e.kind === "heal")
          .reduce((n, e) => n + e.amount, 0),
      ).toBe(healed);
      if (healed)
        expect(ctx.effects.find((e) => e.kind === "heal")!.name).toBe(
          "普攻吸血",
        );
    },
  );
  it.each(["physical", "magic", "true"] as const)(
    "%s技能不触发吸血；反伤和持续伤害也不触发",
    (type) => {
      for (const flags of [
        { skill: true, reflected: false, periodic: false },
        { skill: false, reflected: true, periodic: false },
        { skill: false, reflected: false, periodic: true },
      ]) {
        const source = army(line(abnormal.slice(0, 6)), 0)[0],
          target = fighter("guard", 1);
        source.hp -= 100;
        target.shield = 0;
        const before = source.hp;
        damage(
          context(source, target),
          source,
          target,
          50,
          type,
          flags.skill,
          true,
          0,
          false,
          flags.reflected,
          flags.periodic,
        );
        expect(source.hp).toBe(before);
        expect(source.healing).toBe(0);
      }
    },
  );
  it("装备吸血与异能相加，装备上限不吞掉羁绊，满血及小额伤害不虚记治疗", () => {
    const pieces = line(abnormal.slice(0, 6));
    pieces[0].items = ["siphon", "siphon", "siphon"];
    const source = army(pieces, 0)[0],
      target = fighter("guard", 1);
    expect(equipmentStats(pieces[0].items).lifesteal).toBe(0.6);
    expect(source.lifesteal).toBeCloseTo(0.8);
    target.shield = target.armor = 0;
    const ctx = context(source, target);
    damage(ctx, source, target, 100);
    expect(source.healing).toBe(0);
    source.hp -= 30;
    damage(ctx, source, target, 100);
    expect(source.hp).toBe(source.maxHp);
    expect(source.healing).toBe(30);
    source.hp -= 30;
    damage(ctx, source, target, 1);
    expect(source.healing).toBe(31);
  });
  it("闪避与不朽免伤不产生吸血；残魂攻击不能把自己治疗回生命体", () => {
    const source = army(line(abnormal.slice(0, 6)), 0)[0];
    source.hp -= 100;
    const target = fighter("repair", 1);
    target.air!.evasion = 1;
    const ctx = context(source, target),
      before = source.hp;
    damage(ctx, source, target, 100);
    expect(ctx.events[0].evaded).toBe(true);
    expect(source.hp).toBe(before);
    const soul = army(
      line([
        "vine",
        "bonedragon",
        ...abnormal.filter((id) => id !== "vine").slice(0, 5),
      ]),
      0,
    )[0];
    soul.hp = 0;
    const soulCtx = context(soul, fighter("guard", 1));
    expect(enterUndying(soulCtx, soul)).toBe(true);
    damage(soulCtx, soul, soulCtx.fighters[1], 100, "true");
    expect(soul.hp).toBe(1);
    expect(soul.healing).toBe(0);
    source.hp -= 100;
    damage(context(source, soul), source, soul, 100);
    expect(source.healing).toBe(0);
  });
  it.each(["wolf", "adept", "shark"])(
    "%s后续召唤只继承20%%团队吸血，不继承主人的装备，主人死亡不撤销",
    (owner) => {
      const pieces = [
        ...line(abnormal.slice(0, 6)),
        { ...line([owner], 100)[0], position: 59, items: ["siphon"] },
      ];
      const fighters = army(pieces, 0),
        source = fighters.at(-1)!;
      expect(source.lifesteal).toBeCloseTo(0.45);
      source.mana = 100;
      const ctx = context(...fighters);
      ctx.tick = 100;
      expect(
        owner === "wolf" ? callWolfPack(ctx, source) : callRetinue(ctx, source),
      ).toBe(true);
      const summon = ctx.fighters.find((f) => f.summon)!;
      expect(summon.lifesteal).toBe(0.2);
      expect(summon.teamLifesteal).toBe(0.2);
      source.hp = 0;
      summon.hp -= 100;
      const target = fighter("guard", 1);
      target.shield = target.armor = 0;
      ctx.fighters.push(target);
      const hp = summon.hp;
      damage(ctx, summon, target, 100);
      expect(summon.hp - hp).toBe(20);
      expect(source.hp).toBe(0);
    },
  );
  it("双方分别锁定自己的羁绊，死亡或临时魅惑不借用对手的吸血档位", () => {
    const battle = simulate(
      line(abnormal.slice(0, 6)),
      line(abnormal.slice(0, 2), 100),
    );
    const [source, target] = [
      battle.frames[0].fighters[0],
      battle.frames[0].fighters[6],
    ];
    expect(source.lifesteal).toBe(0.2);
    expect(target.lifesteal).toBe(0.05);
    const oldSide = source.side;
    source.charm = { until: 10, attack: 1, side: oldSide };
    source.side = 1;
    source.hp -= 100;
    target.shield = target.armor = 0;
    damage(context(source, target), source, target, 100);
    expect(source.healing).toBe(20);
    expect(target.lifesteal).toBe(0.05);
  });
});

describe("分类校准与异能的存档及表现", () => {
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}0.44存档仅准备期更新，旧战斗逐帧、资源和播放保留`, () => {
        const game = createGame(137, "classic");
        game.combatVersion = "counterplay";
        for (const p of game.players) {
          for (const id of p.shop) if (id) game.pool[id]++;
          p.shop = [null, null, null, null, null];
        }
        if (banned) {
          game.bannedSeries = ["野兽", "海神", "空军"];
          for (const id of Object.keys(game.pool))
            if (!isRecruitable(game, id)) game.pool[id] = 0;
        }
        const me = game.players[0];
        me.shop[0] = phase === "finished" ? "medic" : "vine";
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
            schema: 43,
            rules: "singleplayer-0.44",
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
            phase === "prepare" ? CURRENT_COMBAT_VERSION : "counterplay",
        });
        if (phase === "battle") {
          expect(resumeRound(restored)!.battle).toEqual(result!.battle);
          settle(restored, resumeRound(restored)!);
        }
        if (restored.phase === "result") {
          if (restored.reward) claimReward(restored, 0);
          nextRound(restored);
          expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(restored.history[0].combatVersion).toBe("counterplay");
        }
        expect(validGame(restored)).toBe(true);
      });
  for (const entry of frozen.fixtures)
    it(`修改前0.44逐帧回放${entry.name}不变`, async () => {
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
  it("吸血进入完整战斗详情，短状态仍留给控制，装备与羁绊贡献都可查", () => {
    const f = army(line(abnormal.slice(0, 6)), 0)[0];
    f.lifesteal += 0.18;
    let labels: string[] = [];
    const canvas = new Proxy(
      {},
      {
        get: (_, key) => (key === "globalAlpha" ? 1 : () => {}),
        set: () => true,
      },
    ) as CanvasRenderingContext2D;
    drawStatuses(canvas, f, 1, 1, true, {
      compact: true,
      onLabels: (value) => {
        labels = value;
      },
    });
    expect(labels).toContain("普攻吸血 38% · 异能20%");
    expect(compactBattleLabels(f, 1)).toEqual([]);
    expect(fighterBattleMarkup(f, 1, labels)).toContain(
      "普攻吸血 38% · 异能20%",
    );
  });
  it("八对八异能续战用合法星级装备，实际产生吸血及召唤，完整/快速/Worker一致", () => {
    const before = structuredClone(ABNORMAL_DEMO);
    for (const team of [ABNORMAL_DEMO.left, ABNORMAL_DEMO.right]) {
      expect(team).toHaveLength(8);
      expect(new Set(team.map((p) => p.position)).size).toBe(8);
      for (const p of team) {
        expect(p.star).toBeGreaterThanOrEqual(1);
        expect(p.star).toBeLessThanOrEqual(3);
        expect(p.items?.length ?? 0).toBeLessThanOrEqual(3);
        for (const id of p.items ?? []) expect(ITEM[id]).toBeDefined();
        expect(p.encounterPower).toBeUndefined();
      }
    }
    expect(
      synergies(ABNORMAL_DEMO.left).find((s) => s.trait === "异能"),
    ).toMatchObject({ count: 6, tier: 3 });
    expect(
      synergies(WILDFRONT_DEMO.left).find((s) => s.trait === "先锋"),
    ).toMatchObject({ count: 6, tier: 2 });
    const battle = simulate(ABNORMAL_DEMO.left, ABNORMAL_DEMO.right);
    const fast = simulateOutcome(ABNORMAL_DEMO.left, ABNORMAL_DEMO.right);
    expect(fast.winner).toBe(battle.winner);
    expect(fast.damage).toBe(battle.damage);
    expect(fast.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    expect(
      battle.frames.some((fr) =>
        fr.effects.some(
          (e) => e.kind === "heal" && e.name === "普攻吸血" && e.amount > 0,
        ),
      ),
    ).toBe(true);
    expect(
      battle.frames.some((fr) =>
        fr.fighters.some((f) => f.summon && f.teamLifesteal === 0.2),
      ),
    ).toBe(true);
    expect(
      compute({
        kind: "replay",
        ...ABNORMAL_DEMO,
        version: CURRENT_COMBAT_VERSION,
      }),
    ).toEqual({ kind: "replay", battle });
    expect(ABNORMAL_DEMO).toEqual(before);
  });
});
