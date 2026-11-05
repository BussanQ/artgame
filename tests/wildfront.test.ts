import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  attackInterval,
  castSkill,
  damage,
  type CombatContext,
} from "../src/engine/abilities";
import { effectiveArmor } from "../src/engine/triggers";
import { retargetStaff } from "../src/engine/staffthrall";
import { callWolfPack, callRetinue } from "../src/engine/summons";
import { enterPhoenixEgg, hatchPhoenix } from "../src/engine/phoenix";
import { synergies } from "../src/engine/synergies";
import { UNIT, RULES } from "../src/data/units";
import { unitArmor, unitDefinition } from "../src/data/unit-stats";
import { equipmentStats } from "../src/data/items";
import { traitTiers } from "../src/data/traits";
import { skillDescription, skillName } from "../src/data/skills";
import { AI_PROFILES } from "../src/data/ai-profiles";
import { chooseLineup, lineupScore, prepareBot } from "../src/engine/ai";
import { mergeCount } from "../src/engine/progression";
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
import { claimReward } from "../src/engine/equipment";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import {
  isRecruitable,
  rotationTraits,
  type Series,
} from "../src/engine/rotation";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { codexMarkup } from "../src/ui/unit-codex";
import { rotationMarkup } from "../src/ui/rotation";
import { compute } from "../src/compute/job";
import { CURRENT_COMBAT_VERSION, type Piece } from "../src/engine/types";
import { WILDFRONT_DEMO } from "../src/data/wildfront-demo";
import frozen from "./fixtures/pre-v041-replays.json";

const beasts = [
  "elephant",
  "venombeast",
  "pangolin",
  "wolf",
  "deer",
  "bloodhawk",
];
const vanguards = [
  "elephant",
  "bladethrall",
  "swordthrall",
  "cavalry",
  "master",
  "treant",
];
const line = (ids: string[], offset = 0): Piece[] =>
  ids.map((defId, i) => ({
    defId,
    uid: offset + i + 1,
    star: 1,
    position: 32 + i,
  }));
const context = (pieces: Piece[]): CombatContext => ({
  fighters: army(pieces, 0),
  tick: 10,
  effects: [],
  events: [],
});

describe("野兽攻速与先锋护甲", () => {
  it.each([0, 1, 2, 3, 4, 5, 6])(
    "%i种野兽的范围、累计自身与全军攻速",
    (count) => {
      const pieces = [
        ...line(beasts.slice(0, count)),
        ...line(["infantry"], 100),
      ];
      pieces.at(-1)!.position = 56;
      const formation = synergies(pieces).find((s) => s.trait === "野兽");
      if (count) {
        expect(formation!.tiers).toEqual([2, 4, 6]);
        expect(formation!.tier).toBe(
          count < 2 ? 0 : count < 4 ? 1 : count < 6 ? 2 : 3,
        );
      } else expect(formation).toBeUndefined();
      for (const fighter of army(pieces, 0)) {
        const personal =
          count >= 2 && UNIT[fighter.defId].traits.includes("野兽");
        const speed =
          (count >= 6 ? 0.6 : count >= 4 ? 0.25 : 0) + (personal ? 0.15 : 0);
        expect(fighter.formationHaste ?? 0).toBeCloseTo(speed);
        expect(fighter.teamHaste ?? 0).toBe(
          count >= 6 ? 0.6 : count >= 4 ? 0.25 : 0,
        );
        // Attack speed changes rate, not base attack or a fixed number of seconds.
        expect(attackInterval(fighter, 0)).toBeCloseTo(
          Math.max(1, UNIT[fighter.defId].interval / (1 + speed)),
        );
        expect(fighter.attack).toBeCloseTo(UNIT[fighter.defId].attack);
      }
    },
  );

  it("同名高星、备战席和后生召唤物不增加开战羁绊人数", () => {
    const pieces = line(beasts);
    pieces.at(-1)!.position = null;
    pieces.push({ ...pieces[0], uid: 99, star: 3, position: 56 });
    expect(synergies(pieces).find((s) => s.trait === "野兽")).toMatchObject({
      count: 5,
      tier: 2,
    });
    const ctx = context(pieces),
      source = ctx.fighters.find((f) => f.defId === "wolf")!;
    source.mana = 100;
    expect(callWolfPack(ctx, source)).toBe(true);
    expect(ctx.fighters.filter((f) => f.summon)).toHaveLength(2);
    for (const f of ctx.fighters)
      expect(f.formationHaste).toBeCloseTo(f.summon ? 0.25 : 0.4);
    expect(synergies(pieces).find((s) => s.trait === "野兽")!.count).toBe(5);
  });

  it("低间隔棋子的15%攻速会累积小数冷却，真实连续普攻更快而非逐次舍整", () => {
    const pieces = line(["pangolin", "deer"]);
    pieces[0].position = 35;
    pieces[1].position = 56;
    const control = structuredClone(pieces);
    control[1].position = null;
    // A passive-only opponent avoids a guard's stun changing the attack schedule.
    const enemy = line(["staffthrall"], 100);
    enemy[0].items = ["fortress", "plate"];
    const ticks = (left: Piece[]) =>
      simulate(left, enemy, "wildfront")
        .frames.flatMap((frame) =>
          frame.events
            .filter(
              (event) => event.attacker === 1 && !event.skill && event.primary,
            )
            .map(() => frame.tick),
        )
        .slice(0, 4);
    const ordinary = ticks(control),
      accelerated = ticks(pieces);
    expect(ordinary).toHaveLength(4);
    expect(accelerated).toHaveLength(4);
    expect(ordinary[0]).toBe(accelerated[0]);
    expect(accelerated[3] - accelerated[0]).toBeLessThan(
      ordinary[3] - ordinary[0],
    );
    expect(
      accelerated.some((tick, i) => i > 0 && tick - accelerated[i - 1] === 2),
    ).toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 6])(
    "%i种先锋只增加自身护甲，不复制旧生命与回血",
    (count) => {
      const pieces = [
        ...line(vanguards.slice(0, count)),
        ...line(["infantry"], 100),
      ];
      pieces.at(-1)!.position = 56;
      const formation = synergies(pieces).find((s) => s.trait === "先锋")!;
      expect(formation.tiers).toEqual([3, 6]);
      expect(formation.tier).toBe(count < 3 ? 0 : count < 6 ? 1 : 2);
      const armor = count < 3 ? 0 : count < 6 ? 6 : 14;
      for (const fighter of army(pieces, 0)) {
        expect(fighter.armor).toBe(
          unitArmor(UNIT[fighter.defId], 1) +
            (fighter.defId === "infantry" ? 0 : armor),
        );
        expect(fighter.maxHp).toBe(UNIT[fighter.defId].hp);
        expect(fighter.regeneration).toBe(0);
        expect(fighter.armorRegen).toBeUndefined();
      }
    },
  );

  it("先锋与逐星护甲、装备、步兵减甲、普攻破甲、酸蚀共同参与真实物理减伤", () => {
    const pieces = line(vanguards);
    pieces[0].star = 3;
    pieces[0].items = ["plate"];
    const target = army(pieces, 1)[0],
      attacker = army(line(["infantry"]), 0)[0];
    target.shield = 0;
    expect(target.armor).toBe(
      unitArmor(UNIT.elephant, 3) + equipmentStats(["plate"]).armor + 14,
    );
    const before = structuredClone(target);
    const ctx: CombatContext = {
      fighters: [attacker, target],
      tick: 10,
      effects: [],
      events: [],
    };
    const mitigated = damage(ctx, attacker, target, 100, "physical");
    Object.assign(target, before, { armor: before.armor - 14 });
    const ordinary = damage(ctx, attacker, target, 100, "physical");
    expect(mitigated).toBeLessThan(ordinary);
    Object.assign(target, before, {
      infantryArmorBreak: 3,
      armorBreak: 2,
      armorBreakUntil: 30,
      corrosion: [{ source: 99, armor: 7, until: 30 }],
    });
    expect(effectiveArmor(target, 10)).toBe(before.armor - 10);
    expect(damage(ctx, attacker, target, 100, "physical")).toBe(
      Math.round((100 * 100) / (100 + Math.max(0, before.armor - 12) * 6)),
    );
    expect(effectiveArmor(target, 30)).toBe(before.armor - 3);
  });

  it("攻速与棍奴疾风、装备、临时加速、减速共同结算并限制到一战斗步", () => {
    const pieces = [...line(beasts), ...line(["staffthrall"], 100)];
    pieces.at(-1)!.position = 56;
    pieces.at(-1)!.items = ["coil"];
    const source = army(pieces, 0).at(-1)!;
    source.gale!.target = 201;
    source.gale!.stacks = 5;
    expect(source.interval).toBe(
      UNIT.staffthrall.interval * (1 - equipmentStats(["coil"]).haste),
    );
    expect(attackInterval(source, 10)).toBeCloseTo(source.interval / 2.1);
    source.hasteUntil = 20;
    source.slow = { until: 20, multiplier: 2 };
    expect(attackInterval(source, 10)).toBeCloseTo(
      (source.interval / 2.1) * 0.7 * 2,
    );
    expect(attackInterval(source, 20)).toBeCloseTo(source.interval / 2.1);
    source.interval = 0.25;
    expect(attackInterval(source, 10)).toBe(1);
  });

  it("棍奴换目标只移除疾风增速，剩余冷却仍保留野兽全队攻速", () => {
    const pieces = [...line(beasts), ...line(["staffthrall"], 100)];
    pieces.at(-1)!.position = 56;
    const source = army(pieces, 0).at(-1)!;
    source.gale!.target = 201;
    source.gale!.stacks = 5;
    source.cooldown = 2;
    retargetStaff(source);
    expect(source.gale).toMatchObject({ target: null, stacks: 0 });
    expect(source.cooldown).toBeCloseTo((2 * 2.1) / 1.6);
    expect(source.formationHaste).toBe(0.6);
    expect(attackInterval(source, 10)).toBeCloseTo(source.interval / 1.6);
  });

  it.each([2, 4, 6])(
    "%i野兽：幼狼、真人傀儡与须弥盾卫只继承全队攻速",
    (count) => {
      const ids = ["wolf", ...beasts.filter((id) => id !== "wolf")].slice(
        0,
        count,
      );
      const pieces = [...line(ids), ...line(["adept", "shark"], 100)];
      pieces.slice(-2).forEach((p, i) => {
        p.position = 56 + i;
      });
      const ctx = context(pieces),
        before = structuredClone(pieces);
      for (const id of ["wolf", "adept", "shark"]) {
        const source = ctx.fighters.find((f) => f.defId === id)!;
        source.mana = 100;
        expect(
          id === "wolf" ? callWolfPack(ctx, source) : callRetinue(ctx, source),
        ).toBe(true);
        const summoned = ctx.fighters.filter(
          (f) => f.summon?.owner === source.uid,
        );
        expect(summoned.length).toBeGreaterThan(0);
        for (const fighter of summoned) {
          const speed = count === 6 ? 0.6 : count === 4 ? 0.25 : 0;
          expect(fighter.formationHaste ?? 0).toBe(speed);
          expect(fighter.teamHaste ?? 0).toBe(speed);
          expect(attackInterval(fighter, 10)).toBeCloseTo(
            Math.max(1, fighter.interval / (1 + speed)),
          );
          expect(fighter.regeneration).toBe(0);
        }
        source.hp = 0;
        expect(summoned.every((f) => f.hp > 0)).toBe(true);
      }
      expect(pieces).toEqual(before);
    },
  );

  it("四野兽与六傀儡可在十人口共存，攻速和攻击分开继承且不重复应用", () => {
    const pieces = line([
      "wolf",
      "elephant",
      "venombeast",
      "deer",
      "adept",
      "shark",
      "axethrall",
      "swordthrall",
      "bladethrall",
      "shieldthrall",
    ]);
    const ctx = context(pieces);
    for (const fighter of ctx.fighters) {
      expect(fighter.attack).toBeCloseTo(
        UNIT[fighter.defId].attack *
          (UNIT[fighter.defId].traits.includes("傀儡") ? 1.45 : 1.2),
      );
      expect(fighter.formationHaste).toBe(
        UNIT[fighter.defId].traits.includes("野兽") ? 0.4 : 0.25,
      );
    }
    const source = ctx.fighters.find((f) => f.defId === "wolf")!;
    source.mana = 100;
    expect(callWolfPack(ctx, source)).toBe(true);
    for (const fighter of ctx.fighters.filter((f) => f.summon)) {
      expect(fighter.attack).toBe(48);
      expect(fighter.formationHaste).toBe(0.25);
      expect(fighter.teamAttack).toBe(0.2);
    }
  });

  it("血鹰变身和不死鸟化蛋重生保留开战攻速，未转移到持久棋子", () => {
    const pieces = [...line(beasts), ...line(["phoenix"], 100)];
    pieces.at(-1)!.position = 56;
    pieces.at(-1)!.star = 2;
    const before = structuredClone(pieces),
      ctx = context(pieces);
    const source = ctx.fighters.find((f) => f.defId === "bloodhawk")!;
    const target = army(line(["guard"], 200), 1)[0];
    ctx.fighters.push(target);
    source.mana = 100;
    expect(castSkill(ctx, source, target)).toBe(true);
    expect(source.hawkForm?.active).toBe(true);
    expect(source.formationHaste).toBe(0.75);
    const phoenix = ctx.fighters.find((f) => f.defId === "phoenix")!;
    phoenix.hp = 0;
    expect(enterPhoenixEgg(ctx, phoenix)).toBe(true);
    ctx.tick = phoenix.phoenix!.eggUntil;
    hatchPhoenix(ctx);
    expect(phoenix.phoenix!.hatched).toBe(true);
    expect(phoenix.formationHaste).toBe(0.6);
    expect(pieces).toEqual(before);
  });

  it("旧puppets仍为野兽2/3减间隔及两先锋生命回复，后续能力未丢失", () => {
    const pieces = line(beasts.slice(0, 3));
    for (const fighter of army(pieces, 0, "puppets")) {
      const definition = unitDefinition(fighter.defId, "puppets");
      expect(fighter.interval).toBe(definition.interval - 1.25);
      expect(fighter.maxHp).toBe(definition.hp + 100);
      expect(fighter.regeneration).toBe(8);
      expect(fighter.formationHaste).toBeUndefined();
    }
    const modern = army([...line(beasts), ...line(["bloodhawk"], 100)], 0);
    expect(modern.find((f) => f.defId === "bloodhawk")!.hawkForm).toBeDefined();
    expect(skillName("bloodhawk")).toBe(skillName("bloodhawk", "puppets"));
    for (const id of ["wolf", "adept", "shark"]) {
      expect(skillDescription(id)).toContain("4/6野兽");
      expect(skillDescription(id)).toContain(skillDescription(id, "puppets"));
    }
    expect(mergeCount(line(["blastbug", "spider"]), "blastbug", 1)).toBe(2);
  });
});

describe("构筑、展示、回放与迁移", () => {
  it("图鉴、详情、禁用面板按当前战斗版本显示真实效果", () => {
    const game = createGame(137, "classic");
    expect(game.combatVersion).toBe(CURRENT_COMBAT_VERSION);
    expect(traitTiers("wildfront").先锋.map((t) => t.count)).toEqual([3, 6]);
    expect(
      pieceDetails(line(["elephant"])[0])
        .traits.map((t) => t.description)
        .join(" "),
    ).toContain("野兽攻速 +75%，其他友军及后续召唤物 +60%");
    expect(
      pieceDetails(line(["elephant"])[0], "puppets")
        .traits.map((t) => t.description)
        .join(" "),
    ).toContain("每秒恢复 32");
    expect(codexMarkup(game)).toContain("先锋护甲 +14");
    const banned = {
      bannedSeries: ["野兽", "傀儡", "陆行者"] as Series[],
      combatVersion: CURRENT_COMBAT_VERSION,
    };
    const wild = rotationTraits(banned).find((t) => t.trait === "野兽")!;
    expect(wild.available).toBe(0);
    expect(
      rotationTraits(banned).find((t) => t.trait === "先锋")!.tiers,
    ).toEqual([3, 6]);
    expect(rotationMarkup(banned)).toContain("6档不可达");
    expect(isRecruitable(banned, "elephant")).toBe(false);
  });

  it("AI与推荐布阵实际比较团队攻速和先锋护甲，不凭空增加阵容资源", () => {
    const profile = AI_PROFILES.find((p) => p.id === "beasts")!;
    const pieces = line([...beasts, "infantry", "staffthrall"]);
    const game = createGame(137, "classic"),
      bot = game.players[1];
    bot.aiProfile = "beasts";
    bot.level = 6;
    bot.pieces = structuredClone(pieces);
    const before = structuredClone(bot);
    const chosen = chooseLineup(bot, "standard");
    expect(chosen).toHaveLength(6);
    expect(new Set(chosen.map((p) => p.uid)).size).toBe(6);
    expect(lineupScore(chosen, profile)).toBeGreaterThanOrEqual(
      lineupScore(pieces.slice(0, 6), profile),
    );
    expect(
      synergies(chosen.map((p, i) => ({ ...p, position: 32 + i }))).some(
        (s) => s.trait === "野兽" && s.tier >= 2,
      ),
    ).toBe(true);
    expect(bot).toEqual(before);
    const paid = createGame(23, "classic"),
      buyer = paid.players[1];
    buyer.aiProfile = "beasts";
    prepareBot(paid, buyer, { buy, sell, roll, buyXp });
    expect(validGame(paid)).toBe(true);
    expect(buyer.gold).toBeLessThanOrEqual(10);
    expect(buyer.pieces.length).toBeGreaterThan(0);
  });

  it("八对八荒原先锋包含六野兽六先锋，实际攻速、独立技能、完整/快速/Worker一致", () => {
    const before = structuredClone(WILDFRONT_DEMO);
    expect(
      synergies(before.left).find((s) => s.trait === "野兽"),
    ).toMatchObject({ count: 6, tier: 3 });
    expect(
      synergies(before.left).find((s) => s.trait === "先锋"),
    ).toMatchObject({ count: 6, tier: 2 });
    const battle = simulate(before.left, before.right);
    expect(
      battle.frames[0].fighters
        .filter((f) => f.side === 0)
        .every(
          (f) =>
            f.formationHaste ===
            (UNIT[f.defId].traits.includes("野兽") ? 0.75 : 0.6),
        ),
    ).toBe(true);
    const eventFrame = battle.frames.find((fr) =>
      fr.events.some((e) => !e.skill && e.attacker === 108),
    );
    expect(eventFrame).toBeDefined();
    const deer = eventFrame!.fighters.find((f) => f.uid === 108)!;
    expect(deer.cooldown).toBeCloseTo(attackInterval(deer, eventFrame!.tick));
    expect(
      battle.frames.some((fr) => fr.effects.some((e) => e.name === "击飞")),
    ).toBe(true);
    expect(battle.frames.some((fr) => fr.fighters.some((f) => f.summon))).toBe(
      true,
    );
    for (const frame of battle.frames) {
      const alive = frame.fighters.filter((f) => f.hp > 0);
      expect(new Set(alive.map((f) => `${f.x},${f.y}`)).size).toBe(
        alive.length,
      );
      expect(
        alive.every((f) => f.x >= 0 && f.x < 8 && f.y >= 0 && f.y < 8),
      ).toBe(true);
    }
    const fast = simulateOutcome(before.left, before.right);
    expect(fast.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    expect(fast.winner).toBe(battle.winner);
    expect(fast.damage).toBe(battle.damage);
    expect(
      compute({ kind: "replay", ...before, version: CURRENT_COMBAT_VERSION }),
    ).toEqual({ kind: "replay", battle });
    expect(WILDFRONT_DEMO).toEqual(before);
  });

  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}旧0.40仅在准备期切换，资源、历史和播放不变`, () => {
        const game = createGame(137, "classic");
        game.combatVersion = "puppets";
        for (const player of game.players) {
          for (const id of player.shop) if (id) game.pool[id]++;
          player.shop = [null, null, null, null, null];
        }
        if (banned) {
          game.bannedSeries = ["野兽", "猛禽", "陆行者"];
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
        const before = structuredClone(game);
        const restored = decodeSave(
          JSON.stringify({
            schema: 39,
            rules: "singleplayer-0.40",
            savedAt: 1,
            revision: 1,
            game,
            playback: { time: 3, speed: 2, paused: true },
          }),
        );
        expect(restored.status).toBe("migrated");
        expect(restored.data!.schema).toBe(SAVE_SCHEMA);
        expect(restored.data!.rules).toBe(RULES.version);
        const next = restored.data!.game;
        expect(next).toEqual({
          ...before,
          combatVersion:
            phase === "prepare" ? CURRENT_COMBAT_VERSION : "puppets",
        });
        expect(restored.data!.playback).toEqual({
          time: 3,
          speed: 2,
          paused: true,
        });
        if (phase === "battle") {
          expect(resumeRound(next)!.battle).toEqual(result!.battle);
          settle(next, resumeRound(next)!);
        }
        if (next.phase === "result") {
          if (next.reward) claimReward(next, 0);
          nextRound(next);
          expect(next.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(next.history[0].combatVersion).toBe("puppets");
        }
        expect(validGame(next)).toBe(true);
      });

  for (const entry of frozen.fixtures)
    it(`0.40旧回放${entry.name}逐帧保持修改前哈希`, async () => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(entry.left, entry.right, "puppets")),
        ),
      );
      expect(
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(entry.hash);
    });
});
