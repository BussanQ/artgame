import { synergyPanelMarkup } from "../src/ui/synergies";
import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  damage,
  gainMana,
  castSkill,
  ATTACK_MANA,
  type CombatContext,
} from "../src/engine/abilities";
import { synergies } from "../src/engine/synergies";
import { callWolfPack, callRetinue } from "../src/engine/summons";
import { usesEnergy } from "../src/engine/triggers";
import { setFlight } from "../src/engine/sea-ward";
import { enterPhoenixEgg, hatchPhoenix } from "../src/engine/phoenix";
import { UNIT, RULES } from "../src/data/units";
import { ITEM } from "../src/data/items";
import { traitTiers } from "../src/data/traits";
import { unitDefinition } from "../src/data/unit-stats";
import { COALITION_DEMO } from "../src/data/coalition-demo";
import { drawStatuses } from "../src/render/skill-effects";
import {
  compactBattleLabels,
  fighterBattleMarkup,
} from "../src/render/battle-inspection";
import { pieceDetails } from "../src/ui/bench-tooltip";
import {
  rotationTraits,
  isRecruitable,
  playableRotation,
  availableUnits,
  randomBans,
  SERIES,
} from "../src/engine/rotation";
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
import { compute } from "../src/compute/job";
import {
  CURRENT_COMBAT_VERSION,
  type Piece,
  type Fighter,
  type CombatVersion,
} from "../src/engine/types";
import frozen from "./fixtures/pre-v046-replays.json";

const line = (ids: string[], offset = 0): Piece[] =>
  ids.map((defId, i) => ({
    defId,
    uid: offset + i + 1,
    star: 1,
    position: 32 + i,
  }));
const fighter = (id: string, side: 0 | 1 = 0) =>
  army(line([id], side * 100), side)[0];
const context = (...fighters: Fighter[]): CombatContext => ({
  fighters,
  tick: 1,
  events: [],
  effects: [],
});
const air = ["repair", "bomber", "ghostjet", "ark"];
const raptors = ["bloodhawk", "bat", "skytoad", "bonedragon"];
const supports = ["medic", "repair", "deer", "acolyte"];
const summoners = ["wolf", "adept", "shark"];
const siegers = ["chariot", "cannon", "tiger", "bull", "ark", "skycrab"];

describe("空军与猛禽：累计总量和全部空中友军", () => {
  it.each([1, 2, 3, 4])(
    "%i空军只有2/4档15/35%%，地面同伴不享受闪避",
    (count) => {
      const ids = [...air.slice(0, count), "fish", "guard"],
        team = army(line(ids), 0);
      const expected = count < 2 ? 0 : count < 4 ? 0.15 : 0.35;
      for (const f of team)
        expect(f.air!.evasion).toBe(UNIT[f.defId].flying ? expected : 0);
      expect(traitTiers("lineages").空军[1].bonus.evasion).toBe(0.45);
    },
  );
  it.each([1, 2, 3, 4])(
    "%i猛禽按2/4档惠及其他飞行棋子，技能和对空普攻不加成",
    (count) => {
      const team = army(
          line([...raptors.slice(0, count), "repair", "guard"]),
          0,
        ),
        source = team.find((f) => f.defId === "repair")!,
        ground = team.at(-1)!;
      const bonus = count < 2 ? 0 : count < 4 ? 0.15 : 0.35;
      expect(source.air!.groundBonus ?? 0).toBe(bonus);
      expect(source.groundBonus).toBeUndefined();
      ground.armor = ground.shield = 0;
      ground.hp = ground.maxHp = 2000;
      expect(damage(context(source, ground), source, ground, 100)).toBe(
        Math.round(100 * (1 + bonus)),
      );
      expect(
        damage(context(source, ground), source, ground, 100, "true", true),
      ).toBe(100);
      const flying = fighter("repair", 1);
      flying.armor = flying.shield = flying.air!.evasion = 0;
      expect(damage(context(source, flying), source, flying, 100)).toBe(100);
      setFlight(source, false);
      expect(damage(context(source, ground), source, ground, 100)).toBe(100);
      setFlight(source, true);
      expect(damage(context(source, ground), source, ground, 100)).toBe(
        Math.round(100 * (1 + bonus)),
      );
    },
  );
  it("血鹰变身落地后丢失对地收益；凤凰化蛋与重生按飞行状态处理", () => {
    const pieces = line([...raptors, ...air, "phoenix"]);
    pieces.at(-1)!.star = 2;
    const team = army(pieces, 0),
      hawk = team[0],
      phoenix = team.at(-1)!,
      target = fighter("guard", 1);
    Object.assign(hawk, { mana: 100, x: 3, y: 3 });
    Object.assign(target, {
      x: 3,
      y: 2,
      armor: 0,
      shield: 0,
      hp: 5000,
      maxHp: 5000,
    });
    const ctx = context(...team, target);
    expect(castSkill(ctx, hawk, target)).toBe(true);
    expect(hawk.air!.flying).toBe(false);
    expect(hawk.air!.evasion).toBe(0);
    expect(damage(ctx, hawk, target, 100)).toBe(100);
    phoenix.hp = 0;
    expect(enterPhoenixEgg(ctx, phoenix)).toBe(true);
    expect(phoenix.air!.flying).toBe(false);
    ctx.tick = phoenix.phoenix!.eggUntil;
    hatchPhoenix(ctx);
    expect(phoenix.air!.flying).toBe(true);
    expect(phoenix.air!.groundBonus).toBe(0.35);
    expect(phoenix.air!.evasion).toBe(0.35);
  });
});

describe("支援的真实死亡结算", () => {
  it.each([1, 2, 3, 4])(
    "%i支援按2/4档200/500生命、10/20能量，其他友军不冒充支援",
    (count) => {
      const team = army(line([...supports.slice(0, count), "guard"]), 0),
        expected = count < 2 ? 0 : count < 4 ? 200 : 500;
      expect(team.at(-1)!.supportHeal).toBe(0);
      for (const f of team.slice(0, -1)) {
        expect(f.supportHeal).toBe(expected);
        expect(f.supportMana).toBe(count < 2 ? 0 : count < 4 ? 10 : 20);
      }
    },
  );
  it("四支援阵亡治疗存活友军与幼狼，不能复活；每名支援只触发一次，满血不虚计治疗", () => {
    const team = army(line([...supports, "wolf", "guard"]), 0),
      medic = team[0],
      wolf = team[4],
      guard = team[5],
      enemy = fighter("guard", 1);
    const ctx = context(...team, enemy);
    wolf.mana = 100;
    expect(callWolfPack(ctx, wolf)).toBe(true);
    const pet = ctx.fighters.find((f) => f.summon)!;
    pet.hp = 1;
    guard.hp = 100;
    guard.mana = 0;
    team[2].hp = 0;
    medic.hp = 1;
    damage(ctx, enemy, medic, 100, "true", true);
    expect(guard.hp).toBe(600);
    expect(guard.mana).toBe(20);
    expect(pet.hp).toBe(pet.maxHp);
    expect(pet.mana).toBe(0);
    expect(team[2].hp).toBe(0);
    expect(medic.hp).toBe(0);
    expect(medic.supportHeal).toBe(0);
    const before = structuredClone(ctx);
    damage(ctx, enemy, medic, 100, "true", true);
    expect(ctx).toEqual(before);
  });
});

describe("三召唤的伤害回能", () => {
  it("只有三种召唤开场锁定40%%，不附赠法抗；旧lineages保留2/3档防御", () => {
    for (const count of [1, 2, 3]) {
      const pieces = line([...summoners.slice(0, count), "infantry"]),
        team = army(pieces, 0);
      expect(
        team.every((f) => (f.damageManaBonus ?? 0) === (count === 3 ? 0.4 : 0)),
      ).toBe(true);
      expect(team.every((f) => f.magicResist === 0.2)).toBe(true);
      if (count >= 2)
        expect(army(pieces, 0, "lineages").at(-1)!.magicResist).toBe(
          count === 2 ? 0.35 : 0.45,
        );
    }
  });
  it.each([
    [0, 1, 35],
    [3, 1, 32],
    [3, 0.75, 23.25],
    [30, 1, 5],
  ])(
    "骑兵减%s、倍率%s时一次攻击总回能%s，不能重复扣平减",
    (penalty, multiplier, expected) => {
      const source = army(line([...summoners, "infantry"]), 0).at(-1)!,
        target = fighter("guard", 1);
      Object.assign(source, {
        mana: 0,
        energyPenalty: penalty,
        energyMultiplier: multiplier,
        attackManaReady: true,
      });
      target.armor = target.shield = 0;
      gainMana(source, ATTACK_MANA, 1);
      const ctx = context(source, target);
      damage(ctx, source, target, 100);
      expect(source.mana).toBeCloseTo(expected);
      expect(source.attackManaReady).toBe(false);
      const before = source.mana;
      damage(ctx, source, target, 10);
      expect(source.mana).toBe(before);
    },
  );
  it("护盾吸收、闪避、技能、反伤和持续伤害不赚额外回能，支援与受击回能不放大", () => {
    const source = army(line([...summoners, "infantry"]), 0).at(-1)!,
      target = fighter("guard", 1);
    source.mana = 0;
    source.attackManaReady = true;
    target.shield = 1000;
    const ctx = context(source, target);
    gainMana(source, 25, 1);
    damage(ctx, source, target, 100);
    expect(source.mana).toBe(25);
    target.shield = 0;
    damage(ctx, source, target, 10, "true", true);
    damage(ctx, source, target, 10, "true", false, true, 0, false, true);
    damage(ctx, source, target, 10, "true", false, true, 0, false, false, true);
    expect(source.mana).toBe(25);
    damage(ctx, source, target, 10);
    expect(source.mana).toBe(35);
    gainMana(source, 20, 1);
    expect(source.mana).toBe(55);
    damage(ctx, target, source, 1, "true", true);
    expect(source.mana).toBe(65);
    source.attackManaReady = true;
    source.mana = 0;
    target.air!.flying = true;
    target.air!.evasion = 1;
    damage(ctx, source, target, 10);
    expect(source.mana).toBe(0);
  });
  it("封能、满能量、无能量技能及主人阵亡后的召唤均不产生虚假回能", () => {
    const team = army(line([...summoners, "infantry"]), 0),
      source = team.at(-1)!,
      target = fighter("guard", 1),
      ctx = context(...team, target);
    target.armor = target.shield = 0;
    source.mana = 100;
    source.attackManaReady = true;
    damage(ctx, source, target, 10);
    expect(ctx.effects.filter((e) => e.name === "召唤回能")).toHaveLength(0);
    source.mana = 0;
    source.manaLockUntil = 10;
    source.attackManaReady = true;
    damage(ctx, source, target, 10);
    expect(source.mana).toBe(0);
    const wolf = team[0];
    wolf.mana = 100;
    expect(callWolfPack(ctx, wolf)).toBe(true);
    wolf.hp = 0;
    const pet = ctx.fighters.find((f) => f.summon)!;
    expect(pet.damageManaBonus).toBe(0.4);
    pet.attackManaReady = true;
    damage(ctx, pet, target, 10);
    expect(pet.mana).toBe(0);
    expect(usesEnergy(pet)).toBe(false);
  });
  it("真实战斗的普通攻击获得35能量并记录实际额外回能，不能重算整场或赠送初始能量", () => {
    const pieces = line([...summoners, "infantry"]),
      right = line(["staffthrall"], 100);
    right[0].position = 35;
    const before = structuredClone(pieces),
      battle = simulate(pieces, right),
      opening = battle.frames[0].fighters.find((f) => f.uid === 4)!;
    expect(opening.mana).toBe(0);
    expect(battle.frames[1].fighters.find((f) => f.uid === 4)!.mana).toBe(35);
    expect(battle.frames[1].effects).toContainEqual(
      expect.objectContaining({
        source: 4,
        kind: "energize",
        name: "召唤回能",
        amount: 10,
      }),
    );
    expect(pieces).toEqual(before);
  });
});

describe("攻城的目标族群与直接伤害", () => {
  it.each([
    [2, 0],
    [3, 0.2],
    [5, 0.2],
    [6, 0.5],
  ])("%i爆破采用五月累计减抗%s，旧lineages六档仍为60", (count, reduction) => {
    const ids = [
      "titan",
      "blastbug",
      "bomber",
      "stormcaller",
      "motorcycle",
      "irondog",
    ];
    const left = line(ids.slice(0, count)),
      right = line(["guard"], 100);
    const target = simulate(left, right).frames[0].fighters.find(
      (f) => f.side === 1,
    )!;
    expect(target.air!.magicBreak).toBe(reduction);
    expect(target.magicResist).toBeCloseTo(Math.max(-0.25, 0.2 - reduction));
    if (count === 6)
      expect(
        simulate(left, right, "lineages").frames[0].fighters.find(
          (f) => f.side === 1,
        )!.air!.magicBreak,
      ).toBe(0.6);
  });
  it.each([2, 3, 5, 6])("%i攻城累计25/50%%，无新增攻击属性", (count) => {
    const source = army(line(siegers.slice(0, count)), 0)[0];
    expect(source.air!.siege).toBe(count < 3 ? 0 : count < 6 ? 0.25 : 0.5);
    expect(source.attack).toBe(UNIT[source.defId].attack);
  });
  it.each(["titan", "repair", "staffthrall", "shark", "eyebug", "vine"])(
    "对%s所属目标族群的普攻及直接物理/魔法/真实技能都加成，持续及反伤不加成",
    (id) => {
      const source = army(line(siegers), 0)[0];
      for (const type of ["physical", "magic", "true"] as const)
        for (const skill of [false, true]) {
          const target = fighter(id, 1);
          Object.assign(target, {
            hp: 3000,
            maxHp: 3000,
            armor: 0,
            shield: 0,
            magicResist: 0,
          });
          target.air!.evasion = 0;
          expect(
            damage(context(source, target), source, target, 100, type, skill),
          ).toBe(150);
        }
      const target = fighter(id, 1);
      Object.assign(target, {
        hp: 3000,
        maxHp: 3000,
        armor: 0,
        shield: 0,
        magicResist: 0,
      });
      expect(
        damage(
          context(source, target),
          source,
          target,
          100,
          "true",
          true,
          true,
          0,
          false,
          true,
        ),
      ).toBe(100);
      expect(
        damage(
          context(source, target),
          source,
          target,
          100,
          "true",
          true,
          true,
          0,
          false,
          false,
          true,
        ),
      ).toBe(100);
    },
  );
  it("非目标族群不加成，多重种族仅乘一次；旧规则不扩展到不朽或技能", () => {
    const source = army(line(siegers), 0)[0],
      plain = fighter("guard", 1);
    plain.shield = plain.armor = 0;
    expect(damage(context(source, plain), source, plain, 100)).toBe(100);
    const old = army(line(siegers), 0, "lineages")[0],
      immortal = fighter("vine", 1);
    immortal.shield = immortal.armor = 0;
    expect(damage(context(old, immortal), old, immortal, 100)).toBe(100);
    const puppet = fighter("shark", 1);
    puppet.magicResist = 0;
    puppet.shield = 0;
    expect(damage(context(old, puppet), old, puppet, 100, "magic", true)).toBe(
      100,
    );
  });
  it.each(summoners)(
    "%s后续召唤继承攻城，地面召唤不借用空中猛禽增伤或闪避",
    (owner) => {
      const pieces = line(["chariot", "cannon", "tiger", ...summoners]),
        team = army(pieces, 0),
        source = team.find((f) => f.defId === owner)!,
        ctx = context(...team);
      source.mana = 100;
      ctx.tick = 100;
      expect(
        owner === "wolf" ? callWolfPack(ctx, source) : callRetinue(ctx, source),
      ).toBe(true);
      const pet = ctx.fighters.find((f) => f.summon)!;
      expect(pet.air!.siegeDirect).toBe(true);
      expect(pet.air!.siege).toBe(0.25);
      expect(pet.air!.flying).toBe(false);
      expect(pet.air!.evasion).toBe(0);
      const target = fighter("titan", 1);
      target.armor = target.shield = 0;
      ctx.fighters.push(target);
      expect(damage(ctx, pet, target, 100)).toBe(125);
    },
  );
});

describe("唯一陆行者与三熊猫", () => {
  it("只上阵一种陆行者时允许同名多枚；多种冲突、备战不计；旧版本保留旧多种生效", () => {
    const pieces = line(["arhat", "arhat", "vajra"]);
    pieces[2].position = null;
    expect(army(pieces, 0).every((f) => f.trueAttack)).toBe(true);
    pieces[2].position = 40;
    const row = synergies(pieces).find((s) => s.trait === "陆行者")!;
    expect(row).toMatchObject({
      count: 2,
      active: false,
      conflicted: true,
      tier: 0,
    });
    const panel = synergyPanelMarkup(synergies(pieces));
    expect(panel).toContain("conflicted");
    expect(panel).toContain("冲突");
    expect(panel.indexOf("conflicted")).toBeLessThan(
      panel.indexOf("inactive-synergies"),
    );
    expect(army(pieces, 0).every((f) => !f.trueAttack)).toBe(true);
    expect(army(pieces, 0, "lineages").every((f) => f.trueAttack)).toBe(true);
    expect(
      pieceDetails(pieces[0]).traits.find((t) => t.name === "陆行者")!
        .description,
    ).toContain("同名可重复");
  });
  it("唯一陆行者的普攻为真实伤害，技能仍遵守自己的伤害类型", () => {
    const source = fighter("arhat"),
      target = fighter("guard", 1);
    Object.assign(target, { hp: 2000, maxHp: 2000, armor: 20, shield: 0 });
    expect(damage(context(source, target), source, target, 100)).toBe(100);
    expect(
      damage(context(source, target), source, target, 100, "physical", true),
    ).toBe(45);
  });
  it.each([1, 2, 3])(
    "%i种熊猫只有三种才满能量，不附赠15%%技能强度",
    (count) => {
      const pieces = line(["panda", "monk", "master"].slice(0, count)),
        team = army(pieces, 0);
      for (const f of team) {
        expect(f.mana).toBe(
          count === 3 ? 100 : (UNIT[f.defId].initialMana ?? 0),
        );
        expect(f.skillPower).toBe(1);
      }
      if (count === 2)
        expect(army(pieces, 0, "lineages").every((f) => f.mana === 50)).toBe(
          true,
        );
    },
  );
});

it("随机禁用允许三召唤暂不可达，保留多条前排与输出构筑，不把两名召唤棋子移除", () => {
  const bannedSeries = ["野兽", "装甲", "陆行者"] as const;
  expect(playableRotation(bannedSeries)).toBe(true);
  const game = { bannedSeries: [...bannedSeries] };
  expect(
    availableUnits(game)
      .filter((u) => u.traits.includes("召唤"))
      .map((u) => u.id)
      .sort(),
  ).toEqual(["adept", "shark"]);
  expect(rotationTraits(game).find((t) => t.trait === "召唤")).toMatchObject({
    available: 2,
    tiers: [3],
  });
});

it("原图13个种族包含骑兵：真实新局禁用后，鸟骑兵和摩托进入零卡池，商店不出现", () => {
  expect(SERIES).toHaveLength(13);
  expect(SERIES).toContain("骑兵");
  const seed = Array.from({ length: 256 }, (_, i) => i).find((i) =>
    randomBans(i).includes("骑兵"),
  );
  expect(seed).toBeDefined();
  const game = createGame(seed!);
  expect(game.bannedSeries).toContain("骑兵");
  for (const id of ["birdrider", "motorcycle"]) {
    expect(game.pool[id]).toBe(0);
    expect(game.players.every((p) => !p.shop.includes(id))).toBe(true);
    expect(availableUnits(game).some((u) => u.id === id)).toBe(false);
  }
  expect(validGame(game)).toBe(true);
});

describe("空援协同兼容、表现与完整模拟", () => {
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}0.45仅准备期切换，原职业、资源和在途战斗保留`, () => {
        const game = createGame(137, "classic");
        game.combatVersion = "lineages";
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
        const before = structuredClone(game),
          decoded = decodeSave(
            JSON.stringify({
              schema: 44,
              rules: "singleplayer-0.45",
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
            phase === "prepare" ? CURRENT_COMBAT_VERSION : "lineages",
        });
        if (phase === "battle") {
          expect(resumeRound(restored)!.battle).toEqual(result!.battle);
          settle(restored, resumeRound(restored)!);
        }
        if (restored.phase === "result") {
          if (restored.reward) claimReward(restored, 0);
          nextRound(restored);
          expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(restored.history[0].combatVersion).toBe("lineages");
        }
        expect(validGame(restored)).toBe(true);
      });
  for (const entry of frozen.fixtures)
    it(`修改前0.45回放${entry.name}保持逐帧SHA`, async () => {
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
  it("图鉴和可达性使用当前门槛，旧lineages定义与职业不回退", () => {
    const old = rotationTraits({ combatVersion: "lineages" }),
      now = rotationTraits({});
    expect(now.find((t) => t.trait === "猛禽")!.tiers).toEqual([2, 4]);
    expect(old.find((t) => t.trait === "猛禽")!.tiers).toEqual([2, 3]);
    expect(now.find((t) => t.trait === "支援")!.tiers).toEqual([2, 4]);
    expect(now.find((t) => t.trait === "召唤")!.tiers).toEqual([3]);
    expect(now.find((t) => t.trait === "熊猫")!.tiers).toEqual([3]);
    expect(unitDefinition("staffthrall").traits).toEqual(["傀儡", "护卫"]);
    expect(unitDefinition("staffthrall", "lineages").traits).toEqual([
      "傀儡",
      "护卫",
    ]);
    expect(unitDefinition("staffthrall", "counterplay").traits).toEqual([
      "傀儡",
      "先锋",
    ]);
  });
  it("九对九使用合法星级装备、四空四猛禽和四支援三召唤；真实回能/支援出现，完整、快速、Worker一致", () => {
    for (const team of [COALITION_DEMO.left, COALITION_DEMO.right]) {
      expect(team).toHaveLength(9);
      expect(new Set(team.map((p) => p.position)).size).toBe(9);
      for (const p of team) {
        expect(p.star).toBeLessThanOrEqual(3);
        expect(p.items?.length ?? 0).toBeLessThanOrEqual(3);
        for (const item of p.items ?? []) expect(ITEM[item]).toBeDefined();
        expect(p.encounterPower).toBeUndefined();
      }
    }
    const formations = [COALITION_DEMO.left, COALITION_DEMO.right].map((p) =>
      synergies(p),
    );
    for (const trait of ["空军", "猛禽"])
      expect(formations[0].find((s) => s.trait === trait)).toMatchObject({
        count: 4,
        tier: 2,
      });
    expect(formations[1].find((s) => s.trait === "支援")).toMatchObject({
      count: 4,
      tier: 2,
    });
    expect(formations[1].find((s) => s.trait === "召唤")).toMatchObject({
      count: 3,
      tier: 1,
    });
    const before = structuredClone(COALITION_DEMO),
      battle = simulate(COALITION_DEMO.left, COALITION_DEMO.right),
      fast = simulateOutcome(COALITION_DEMO.left, COALITION_DEMO.right);
    expect(fast.winner).toBe(battle.winner);
    expect(fast.damage).toBe(battle.damage);
    expect(fast.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    expect(
      battle.frames.some((fr) =>
        fr.effects.some((e) => e.name === "召唤回能" && e.amount > 0),
      ),
    ).toBe(true);
    expect(
      battle.frames.some((fr) => fr.effects.some((e) => e.name === "支援余辉")),
    ).toBe(true);
    expect(
      compute({
        kind: "replay",
        ...COALITION_DEMO,
        version: CURRENT_COMBAT_VERSION,
      }),
    ).toEqual({ kind: "replay", battle });
    expect(COALITION_DEMO).toEqual(before);
    const source = battle.frames[0].fighters.find((f) => f.defId === "ark")!;
    let labels: string[] = [];
    const canvas = new Proxy(
      {},
      {
        get: (_, key) => (key === "globalAlpha" ? 1 : () => {}),
        set: () => true,
      },
    ) as CanvasRenderingContext2D;
    drawStatuses(canvas, source, 1, 1, true, {
      compact: true,
      onLabels: (value) => {
        labels = value;
      },
    });
    expect(labels).toEqual(
      expect.arrayContaining([
        "空军闪避 35%",
        "猛禽对地普攻 +35%",
        "攻城直接伤害 +25%",
      ]),
    );
    expect(compactBattleLabels(source, 1)).toHaveLength(0);
    expect(fighterBattleMarkup(source, 1, labels)).toContain(
      "猛禽对地普攻 +35%",
    );
  });
});
