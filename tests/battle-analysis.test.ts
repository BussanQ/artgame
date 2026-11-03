import { describe, expect, it } from "vitest";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { army, simulate } from "../src/engine/battle";
import { damage, heal, type CombatContext } from "../src/engine/abilities";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import type { Battle, CombatVersion, Frame, Piece } from "../src/engine/types";

function fixture() {
  const fighters = [
    ...army([{ uid: 1, defId: "monk", star: 1, position: 32 }], 0),
    ...army([{ uid: 2, defId: "guard", star: 1, position: 32 }], 1),
  ];
  const [left, right] = fighters;
  left.hp = left.maxHp - 30;
  right.shield = 100;
  right.hp = 25;
  const ctx: CombatContext = { tick: 1, fighters, events: [], effects: [] };
  const frames: Frame[] = [structuredClone({ ...ctx, tick: 0 })];
  damage(ctx, left, right, 60, "true");
  heal(ctx, left, left, 100); // actual 30, not the requested 100
  frames.push(structuredClone(ctx));
  ctx.tick = 2;
  ctx.events = [];
  ctx.effects = [];
  damage(ctx, left, right, 200, "true", true); // 40 shield + 25 HP; excess excluded
  ctx.effects.push({
    source: 1,
    target: 2,
    kind: "cast",
    amount: 1,
    name: "测试",
    from: left,
    to: right,
  });
  frames.push(structuredClone(ctx));
  return { frames, winner: 0, damage: 3 } as Battle;
}
describe("战斗分析口径与回放隔离", () => {
  it("分开统计实际扣血、破盾、治疗与施法，不计过量值", () => {
    const battle = fixture(),
      before = structuredClone(battle);
    const result = analyzeBattle(battle);
    expect(result.sides[0].fighters[0]).toMatchObject({
      damage: 25,
      normalDamage: 0,
      skillDamage: 25,
      shieldDamage: 100,
      healing: 30,
      casts: 1,
    });
    expect(result.sides[1]).toMatchObject({
      received: 25,
      absorbed: 100,
      survivors: 0,
    });
    expect(result).toMatchObject({ seconds: 0.5, complete: true, winner: 0 });
    expect(battle).toEqual(before);
  });
  it("实时片段不泄露后续伤害、死亡或胜负", () => {
    const result = analyzeBattle(fixture(), 1);
    expect(result).toMatchObject({ complete: false, winner: undefined });
    expect(result.sides[0].fighters[0]).toMatchObject({
      damage: 0,
      shieldDamage: 60,
      casts: 0,
    });
    expect(result.sides[1]).toMatchObject({ survivors: 1, absorbed: 60 });
    expect(result.sides[1].fighters[0].hp).toBe(25);
  });
  it("限制无效帧位置，空战斗可安全显示", () => {
    expect(analyzeBattle(fixture(), -1).seconds).toBe(0);
    expect(analyzeBattle(fixture(), NaN).seconds).toBe(0);
    expect(analyzeBattle(fixture(), 500).complete).toBe(true);
    expect(
      analyzeBattle({ frames: [], winner: null, damage: 0 }),
    ).toMatchObject({ complete: false, winner: undefined, seconds: 0 });
  });
  it.each<CombatVersion>([
    "legacy",
    "tactics",
    "balanced",
    "signature",
    "summons",
    "legions",
    "brood",
  ])("%s 双方统计守恒并与引擎最终计数一致，同名棋子分别保留", (version) => {
    const left: Piece[] = [
      { uid: 1, defId: "monk", star: 2, position: 40 },
      { uid: 2, defId: "guard", star: 2, position: 32 },
      { uid: 3, defId: "guard", star: 1, position: 33 },
      { uid: 4, defId: "fish", star: 2, position: 41 },
    ];
    const right: Piece[] = [
      { uid: 5, defId: "tiger", star: 2, position: 56 },
      { uid: 6, defId: "turtle", star: 2, position: 32 },
      { uid: 7, defId: "deer", star: 2, position: 40 },
    ];
    const battle = simulate(left, right, version);
    const stats = analyzeBattle(battle),
      final = battle.frames.at(-1)!;
    expect(
      stats.sides[0].fighters.filter((f) => f.defId === "guard"),
    ).toHaveLength(2);
    for (const side of stats.sides) {
      expect(side.damage).toBe(stats.sides[1 - side.side].received);
      for (const unit of side.fighters) {
        const fighter = final.fighters.find((f) => f.uid === unit.uid)!;
        expect(unit.damage).toBe(fighter.damage);
        expect(unit.absorbed).toBe(fighter.absorbed);
        expect(unit.healing).toBe(fighter.healing);
        expect(unit.normalDamage + unit.skillDamage).toBe(unit.damage);
      }
    }
  });
  it("分析界面使用实际片段、双方统一刻度，并转义标题", () => {
    const html = battleAnalysisMarkup(
      analyzeBattle(fixture(), 1),
      "absorbed",
      '<img src=x onerror="x">',
      1,
      1,
    );
    expect(html).toContain("战斗片段");
    expect(html).not.toContain("己方胜利");
    expect(html).toContain("&lt;img");
    expect(html).toContain('max="1"');
    expect(html).toContain('value="absorbed" selected');
    expect(html).toContain("width:100.00%");
    expect(html).toContain("己方贡献");
    expect(html).toContain("敌方贡献");
  });
});
