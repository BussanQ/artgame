import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { advanceAirSkills, castSkill, type CombatContext } from "../src/engine/abilities";
import { advanceBombardments, bombardmentContact, bombardmentDirection } from "../src/engine/bombardment";
import { BOMBARDMENT, skillDescription, skillName } from "../src/data/skills";
import { BOMBARDMENT_DEMO } from "../src/data/bombardment-demo";
import { unitDefinition } from "../src/data/unit-stats";
import { UNITS, RULES } from "../src/data/units";
import { traitTiers } from "../src/data/traits";
import { COMBAT_VERSIONS, CURRENT_COMBAT_VERSION, type Fighter, type Piece } from "../src/engine/types";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { nextRound } from "../src/engine/game";
import { pieceCopies } from "../src/engine/progression";
import { abilityCredit, pieceStrength } from "../src/engine/ai";
import { bombardmentLabels, bombardmentPose } from "../src/render/bombardment";
import { compactBattleLabels } from "../src/render/battle-inspection";
import { REST_POSE } from "../src/render/melee";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import frozen from "./fixtures/pre-v060-ark-replays.json";
import paid from "./fixtures/opening-ai-reserve.json";

const piece = (defId: string, uid: number, star = 1): Piece => ({ defId, uid, star, position: 51 });
function setup(star = 1) {
  const source = army([piece("ark", 1, star)], 0)[0],
    target = army([piece("guard", 2)], 1)[0];
  Object.assign(source, { x: 3, y: 6, mana: 100 });
  Object.assign(target, { x: 3, y: 4, hp: 10000, maxHp: 10000, magicResist: 0 });
  const ctx: CombatContext = { fighters: [source, target], tick: 0, events: [], effects: [] };
  return { source, target, ctx };
}
function launch(state: ReturnType<typeof setup>) {
  const events = state.ctx.events.length, launched = state.source.bombardment!.launched;
  expect(castSkill(state.ctx, state.source, state.target)).toBe(true);
  expect(state.ctx.events).toHaveLength(events);
  state.ctx.tick += BOMBARDMENT.windup;
  expect(advanceAirSkills(state.ctx, state.source)).toBe(true);
  expect(state.source.bombardment!.launched).toBe(launched + 1);
  expect(state.source.air!.cast).toBeUndefined();
  return state;
}
function advance(ctx: CombatContext, ticks = BOMBARDMENT.length / BOMBARDMENT.speed) {
  for (let i = 0; i < ticks; i++) { ctx.tick++; advanceBombardments(ctx); }
}
function oldVersion(name: string) {
  const version = COMBAT_VERSIONS.find(v => v === name);
  if (!version) throw Error(`Unknown historical version: ${name}`);
  return version;
}

describe("方舟集团轰炸", () => {
  for (const [star, amount, cooldown] of [[1, 250, 56], [2, 400, 48], [3, 650, 40]])
    it(`${star}星使用${amount}固定法伤和${cooldown / 4}秒冷却，每个目标只受一击`, () => {
      const state = launch(setup(star)); advance(state.ctx);
      expect(state.target.hp).toBe(10000 - amount);
      expect(state.source.skillReadyAt).toBe(cooldown);
      expect(state.ctx.events.filter(e => e.skill && !e.reflected)).toHaveLength(1);
      expect(state.source.bombardment).toMatchObject({ launched: 1, hits: 1, raids: [] });
    });

  it("矩形包含侧边和末端，排除身后、超长和过宽目标；斜向也使用相同宽度", () => {
    const path = { from: { x: 3, y: 7 }, dx: 0, dy: -1 };
    expect(bombardmentContact(path, { x: 4.5, y: 2 })).toBe(true);
    expect(bombardmentContact(path, { x: 4.501, y: 2 })).toBe(false);
    expect(bombardmentContact(path, { x: 3, y: -1 })).toBe(true);
    expect(bombardmentContact(path, { x: 3, y: -1.01 })).toBe(false);
    expect(bombardmentContact(path, { x: 3, y: 7.01 })).toBe(false);
    expect(bombardmentContact(path, { x: 3, y: 3 }, 0, 2)).toBe(false);
    const diagonal = { from: { x: 0, y: 0 }, ...bombardmentDirection({ x: 0, y: 0 }, { x: 4, y: 4 })! };
    expect(bombardmentContact(diagonal, { x: 3, y: 1 })).toBe(true);
    expect(bombardmentContact(diagonal, { x: 3.2, y: 1 })).toBe(false);
    expect(bombardmentDirection(path.from, path.from)).toBeNull();
  });

  it("机群依次推进，只按当前落弹条带结算；友军不受伤，隐身和飞行敌人可被范围波及", () => {
    const state = setup(), ally = army([piece("guard", 3)], 0)[0], hidden = army([piece("ghostjet", 4)], 1)[0];
    Object.assign(ally, { x: 2, y: 4 });
    Object.assign(hidden, { x: 4, y: 3, hp: 10000, maxHp: 10000, magicResist: 0 }); hidden.air!.phaseUntil = 100;
    state.ctx.fighters.push(ally, hidden); launch(state);
    advance(state.ctx, 3); expect(state.target.hp).toBe(10000);
    advance(state.ctx, 1); expect(state.target.hp).toBe(9750);
    state.target.y = 3; // Moving back across this raid must not create another hit.
    advance(state.ctx);
    expect(state.target.hp).toBe(9750); expect(hidden.hp).toBe(9750); expect(ally.hp).toBe(ally.maxHp);
    expect(state.source.bombardment!.hits).toBe(2);
  });

  it("起手锁定方向，后续移动可躲开，目标消失不会追踪或取消已决定的路径", () => {
    const state = setup(); expect(castSkill(state.ctx, state.source, state.target)).toBe(true);
    state.target.x = 7; state.target.air!.phaseUntil = 100;
    state.ctx.tick = BOMBARDMENT.windup; advanceAirSkills(state.ctx, state.source); advance(state.ctx);
    expect(state.ctx.events).toEqual([]); expect(state.source.bombardment!.launched).toBe(1);
  });

  for (const control of ["stun", "silence", "charm", "death"])
    it(`${control}打断未出动机群，不退还已消耗的能量和冷却`, () => {
      const state = setup(), { source, ctx, target } = state;
      expect(castSkill(ctx, source, target)).toBe(true);
      if (control === "stun") source.stunUntil = 10;
      if (control === "silence") source.silenceUntil = 10;
      if (control === "charm") source.charm = { side: 0, until: 10, attack: source.attack };
      if (control === "death") source.hp = 0;
      ctx.tick = BOMBARDMENT.windup; advanceAirSkills(ctx, source); advance(ctx);
      expect(source.air!.cast).toBeUndefined(); expect(source.bombardment!.launched).toBe(0);
      expect(source.mana).toBe(0); expect(source.skillReadyAt).toBe(56);
      expect(ctx.effects.some(e => e.name === "施法中断")).toBe(true); expect(ctx.events).toEqual([]);
    });

  it("出动后死亡、眩晕、沉默和变阵营均不取消机群，保留起手法强而不取攻击力", () => {
    const state = setup(2); state.source.skillPower = 1.5;
    launch(state); Object.assign(state.source, { hp: 0, side: 1, stunUntil: 100, silenceUntil: 100, skillPower: 10, attack: 10000 });
    advance(state.ctx);
    expect(state.target.hp).toBe(9400); expect(state.source.bombardment!.hits).toBe(1);
  });

  it("一次落弹中反伤杀死方舟，其他目标和后续条带仍会命中", () => {
    const state = setup(), other = structuredClone(state.target), later = structuredClone(state.target);
    other.uid = 3; other.x = 4; later.uid = 4; later.y = 2;
    state.source.hp = 1; state.target.reflection = 10; state.ctx.fighters.push(other, later);
    launch(state); advance(state.ctx);
    expect(state.source.hp).toBe(0); expect(other.hp).toBe(9750); expect(later.hp).toBe(9750);
    expect(state.source.bombardment!.hits).toBe(3);
  });

  it("每个命中独立计算护盾和魔抗；免伤目标不虚增命中数，也不被同一机群重试", () => {
    const state = setup(), immune = army([piece("swordthrall", 3)], 1)[0];
    Object.assign(state.target, { shield: 100, magicResist: 0.2 });
    Object.assign(immune, { x: 4, y: 4 }); immune.bladeStorm = { until: 100, next: 100, remaining: 6, damage: 100 };
    state.ctx.fighters.push(immune); launch(state); advance(state.ctx, 4);
    expect(state.target.hp).toBe(9900); expect(state.target.shield).toBe(0);
    expect(immune.hp).toBe(immune.maxHp); delete immune.bladeStorm;
    advance(state.ctx); expect(immune.hp).toBe(immune.maxHp); expect(state.source.bombardment!.hits).toBe(1);
  });

  it("冷却期间保留能量且不能覆盖机群，结束后另一轮可以再次命中", () => {
    const state = launch(setup()); advance(state.ctx); state.source.mana = 100;
    state.ctx.tick = 55; expect(castSkill(state.ctx, state.source, state.target)).toBe(false); expect(state.source.mana).toBe(100);
    state.ctx.tick = 56; launch(state); advance(state.ctx);
    expect(state.source.bombardment!.launched).toBe(2); expect(state.target.hp).toBe(9500);
  });

  it("不合法的初始目标不扣能量、不进入冷却", () => {
    for (const reason of ["range", "hidden", "friendly", "dead", "coincident"]) {
      const { source, target, ctx } = setup();
      if (reason === "range") target.y = 0;
      if (reason === "hidden") target.air!.phaseUntil = 100;
      if (reason === "friendly") target.side = 0;
      if (reason === "dead") target.hp = 0;
      if (reason === "coincident") target.y = source.y;
      expect(castSkill(ctx, source, target)).toBe(false); expect(source.mana).toBe(100);
      expect(source.skillReadyAt).toBeUndefined(); expect(ctx.effects).toEqual([]);
    }
  });

  it("客户端字段接入本体、图鉴和备战详情，旧版本仍显示贯穿光束", () => {
    expect(unitDefinition("ark")).toMatchObject({ cost: 4, hp: 650, attack: 32, armor: 5, range: 5, interval: 4.8, skill: "集团轰炸" });
    const current = pieceDetails(piece("ark", 1)), old = pieceDetails(piece("ark", 1), "secret-orb");
    expect(current).toMatchObject({ hp: 650, attack: 32, skill: "集团轰炸", interval: 1.2 });
    expect(old).toMatchObject({ hp: 1050, attack: 100, skill: "虚空重炮", interval: 1 });
    expect(skillDescription("ark")).toContain("250/400/650"); expect(skillDescription("ark", "secret-orb")).toContain("贯穿");
    expect(skillName("ark")).toBe("集团轰炸");
  });

  it("战报、快速结算及完整播放一致，起手阻止移动和普攻，出动后恢复行动", () => {
    const input = structuredClone(BOMBARDMENT_DEMO), full = simulate(input.left, input.right), quick = simulateOutcome(input.left, input.right);
    expect(input).toEqual(BOMBARDMENT_DEMO); expect(quick.final.fighters).toEqual(full.frames.at(-1)!.fighters);
    expect(quick.winner).toBe(full.winner); expect(quick.damage).toBe(full.damage);
    const final = analyzeBattle(full), ark = final.sides[0].fighters.find(f => f.defId === "ark")!;
    expect(ark.bombardment!.launched).toBeGreaterThan(0); expect(ark.bombardment!.hits).toBeGreaterThan(1);
    expect(analyzeBattle(full, 0).sides[0].fighters.find(f => f.defId === "ark")!.bombardment).toEqual({ launched: 0, hits: 0 });
    expect(battleAnalysisMarkup(final, "damage", "轰炸", full.frames.length - 1, full.frames.at(-1)!.tick)).toContain("机群出动");
    let previous: Fighter | undefined;
    for (const frame of full.frames) {
      const f = frame.fighters.find(f => f.defId === "ark")!;
      if (f.air?.cast?.kind === "bombardment") {
        expect(frame.events.filter(e => e.attacker === f.uid && !e.skill && !e.reflected)).toHaveLength(0);
        if (previous?.air?.cast?.kind === "bombardment") expect([f.x, f.y]).toEqual([previous.x, previous.y]);
      }
      previous = f;
    }
    expect(full.frames.some(frame => frame.fighters.some(f => f.bombardment?.raids.length &&
      frame.events.some(e => e.attacker === f.uid && !e.skill && !e.reflected)))).toBe(true);
  });

  it("状态提示和独立起手动作只读取战斗数据，法强估值有上限", () => {
    const { source, target, ctx } = setup(); castSkill(ctx, source, target); const before = structuredClone(source);
    expect(compactBattleLabels(source, 1)).toContain("机群起飞"); expect(bombardmentPose(source, 2)).not.toEqual(REST_POSE);
    expect(bombardmentLabels(source, 2).join()).toContain("集团轰炸冷却"); expect(source).toEqual(before);
    const base = piece("ark", 1), equipped = { ...base, items: ["staff"] };
    expect(abilityCredit(equipped)).toBeGreaterThan(abilityCredit(base)); expect(abilityCredit(equipped)).toBeLessThanOrEqual(0.6);
    expect(pieceStrength(piece("ark", 1, 2))).toBeGreaterThan(pieceStrength(equipped));
  });
});

describe("方舟版本与存档", () => {
  it("所有旧版本本体逐字段不变，新版本继承既有兵种和连携", () => {
    for (const entry of frozen.definitions) expect(unitDefinition("ark", oldVersion(entry.version))).toEqual(entry.unit);
    // Compare the 0.60 introduction boundary, independently of later unit updates.
    for (const u of UNITS.filter(u => u.id !== "ark")) expect(unitDefinition(u.id, "bombardment")).toEqual(unitDefinition(u.id, "secret-orb"));
    expect(traitTiers(CURRENT_COMBAT_VERSION)).toEqual(traitTiers("secret-orb"));
    const party = ["master", "panda", "monk", "stormcaller", "treant", "acolyte", "thunderlord"]
      .map((id, i) => ({ ...piece(id, i + 1), position: 32 + i }));
    expect(army(party, 0)).toEqual(army(party, 0, "secret-orb"));
  });

  for (const phase of ["prepare", "battle", "result", "finished"] as const)
    it(`0.59 ${phase}迁移不改钱、棋子、卡池、商店、历史或旧目录`, () => {
      // Paid R14 capture supplies resources; result/finished are explicit module fixtures, not played campaigns.
      const input: unknown = structuredClone(paid.game); if (!validGame(input)) throw Error("Invalid reserve capture");
      const game = input; game.phase = phase;
      if (phase === "result" || phase === "finished") {
        game.round--; game.players[0].hp = game.history.at(-1)!.hp;
        if (phase === "finished") {
          const p = game.players[0];
          for (const held of p.pieces) game.pool[held.defId] += pieceCopies(held);
          for (const id of p.shop) if (id) game.pool[id]++;
          p.hp = 0; p.eliminatedRound = game.round; p.pieces = []; p.shop = []; p.inventory = [];
          game.history.at(-1)!.hp = 0;
        }
      }
      expect(validGame(game)).toBe(true); const before = structuredClone(game);
      const saved = { schema: 58, rules: "singleplayer-0.59", savedAt: 1, revision: 1, game,
        playback: { time: 3.5, speed: 2, paused: true } };
      const decoded = decodeSave(JSON.stringify(saved));
      expect(decoded.status).toBe("migrated"); expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
      expect(decoded.data!.rules).toBe(RULES.version);
      expect(decoded.data!.game).toEqual({ ...before, ...(phase === "prepare" ? { combatVersion: CURRENT_COMBAT_VERSION } : {}) });
      expect(decoded.data!.game.catalogVersion).toBe("secret-orb"); expect(decoded.data!.playback).toEqual(saved.playback);
      if (phase === "result") { nextRound(decoded.data!.game); expect(decoded.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION); }
    });

  for (const entry of frozen.fixtures)
    it(`冻结旧${entry.version}方舟完整回放`, async () => {
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(simulate(entry.left, entry.right, oldVersion(entry.version)))));
      expect(Array.from(new Uint8Array(bytes)).map(n => n.toString(16).padStart(2, "0")).join("")).toBe(entry.hash);
    });
});
