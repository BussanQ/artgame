import { describe, expect, it } from "vitest";
import { buy, createGame, roll } from "../src/engine/game";
import { previewPurchase } from "../src/engine/recruitment";
import { validGame } from "../src/engine/persistence";
import { recruitmentMarkup } from "../src/ui/recruitment";

function fixture(ids: string[], offer = "guard") {
  const g = createGame(307, "classic"),
    p = g.players[0];
  for (const id of p.shop) if (id) g.pool[id]++;
  p.shop = [offer, null, null, null, null];
  g.pool[offer]--;
  p.gold = 100;
  p.pieces = ids.map((defId, i) => ({
    uid: i + 1,
    defId,
    star: 1,
    position: null,
  }));
  for (const piece of p.pieces) g.pool[piece.defId]--;
  g.nextUid = p.pieces.length + 1;
  return { g, p };
}
const other = ["infantry", "panda", "pangolin", "lion", "fish", "deer"];

describe("只读招募预览与实际交易", () => {
  it.each(["eyebug", "blastbug", "spider", "wasp"])(
    "两枚同名%s只算一种；买入第二种异虫立即合成，并保留场上位置",
    (id) => {
      const { g, p } = fixture([id], id);
      p.pieces[0].position = 32;
      expect(previewPurchase(g, p, 0).upgrades).toHaveLength(0);
      expect(buy(g, p, 0)).toBe(true);
      expect(p.pieces).toHaveLength(2);
      expect(p.pieces.every((piece) => piece.star === 1)).toBe(true);
      expect(recruitmentMarkup(g, p, false)).toContain("已持有 1/2 种");
      expect(validGame(g)).toBe(true);

      const secondKind = id === "eyebug" ? "blastbug" : "eyebug";
      p.shop[1] = secondKind;
      g.pool[secondKind]--;
      const before = structuredClone(g);
      expect(recruitmentMarkup(g, p, false)).toContain(
        "购入后激活：1星异虫2合1",
      );
      const quote = previewPurchase(g, p, 1);
      expect(g).toEqual(before);
      expect(quote.upgrades).toMatchObject([
        { uid: 1, defId: id, star: 2, position: 32, copies: 2 },
      ]);
      expect(buy(g, p, 1)).toBe(true);
      expect(p).toEqual(quote.after);
      expect(p.pieces).toHaveLength(2);
      expect(validGame(g)).toBe(true);
      expect(recruitmentMarkup(g, p, false)).toContain("已持有 2/4 种");
    },
  );
  it("异虫合成不能混星；两种异虫的两枚二星也不会提前升三星", () => {
    const { g, p } = fixture(["eyebug", "blastbug"], "eyebug");
    p.pieces[0].star = 2;
    p.pieces[0].copies = 2;
    g.pool.eyebug--;
    expect(previewPurchase(g, p, 0).upgrades).toHaveLength(0);
    expect(buy(g, p, 0)).toBe(true);
    expect(
      p.pieces.filter((piece) => piece.defId === "eyebug").map((p) => p.star),
    ).toEqual([2, 1]);
    p.shop[0] = "eyebug";
    g.pool.eyebug--;
    expect(buy(g, p, 0)).toBe(true);
    expect(
      p.pieces.filter((piece) => piece.defId === "eyebug").map((p) => p.star),
    ).toEqual([2, 2]);
    expect(recruitmentMarkup(g, p, false)).toContain(
      "二星 → 三星：3枚同名二星",
    );
    expect(validGame(g)).toBe(true);
  });
  it("普通连锁三星、部署保留和装备溢出与实际购买一致", () => {
    const { g, p } = fixture(["guard", "guard", "guard", "guard"]);
    p.pieces[0].star = p.pieces[1].star = 2;
    g.pool.guard -= 4;
    p.pieces[0].position = 32;
    p.pieces[0].items = ["blade", "plate", "staff"];
    p.pieces[2].items = ["coil"];
    const before = structuredClone(g);
    const quote = previewPurchase(g, p, 0);
    expect(g).toEqual(before);
    expect(quote.allowed).toBe(true);
    expect(quote.upgrades).toMatchObject([{ uid: 1, star: 3, position: 32 }]);
    expect(quote.benchAfter).toBe(0);
    expect(quote.after?.inventory).toEqual(["coil"]);
    expect(buy(g, p, 0)).toBe(true);
    expect(p).toEqual(quote.after);
    expect(g.nextUid).toBe(before.nextUid + 1);
    expect(g.pool).toEqual(before.pool);
    expect(validGame(g)).toBe(true);
  });
  it("满备战不能合成时阻止购买且不扣金币或消耗商店", () => {
    const { g, p } = fixture([...other, "monk", "sniper"]);
    const before = structuredClone(g);
    expect(previewPurchase(g, p, 0)).toMatchObject({
      allowed: false,
      benchAfter: 9,
      reason: "备战席已满，需先部署或出售",
    });
    expect(buy(g, p, 0)).toBe(false);
    expect(g).toEqual(before);
  });
  it("满备战直接升星可以购买，预览显示真正的剩余格数", () => {
    const { g, p } = fixture(["guard", "guard", ...other]);
    const quote = previewPurchase(g, p, 0);
    expect(quote).toMatchObject({ allowed: true, benchAfter: 7 });
    expect(quote.upgrades).toMatchObject([{ defId: "guard", star: 2 }]);
    expect(buy(g, p, 0)).toBe(true);
    expect(p).toEqual(quote.after);
    expect(validGame(g)).toBe(true);
  });
  it("新异虫种类释放满备战，预览列出被升级的其他兵种", () => {
    const { g, p } = fixture(["eyebug", "eyebug", ...other], "blastbug");
    const quote = previewPurchase(g, p, 0);
    expect(quote).toMatchObject({ allowed: true, benchAfter: 8 });
    expect(quote.upgrades).toMatchObject([
      { defId: "eyebug", star: 2, copies: 2 },
    ]);
    expect(buy(g, p, 0)).toBe(true);
    expect(p).toEqual(quote.after);
    expect(validGame(g)).toBe(true);
  });
  it("第四种异虫使二星升三星；旧版本仍需三枚", () => {
    const { g, p } = fixture(
      ["eyebug", "eyebug", "blastbug", "spider"],
      "wasp",
    );
    for (const eye of p.pieces.slice(0, 2)) {
      eye.star = 2;
      eye.copies = 2;
    }
    g.pool.eyebug -= 2;
    const quote = previewPurchase(g, p, 0);
    expect(quote.upgrades).toMatchObject([
      { defId: "eyebug", star: 3, copies: 4 },
    ]);
    expect(
      previewPurchase({ ...g, combatVersion: "legions" }, p, 0).upgrades,
    ).toHaveLength(0);
    expect(buy(g, p, 0)).toBe(true);
    expect(p).toEqual(quote.after);
    expect(validGame(g)).toBe(true);
  });
  it("余额和阶段失败保持原状，利息正确处理十金边界及上限", () => {
    const { g, p } = fixture([], "ark");
    p.gold = 55;
    expect(previewPurchase(g, p, 0)).toMatchObject({
      interestBefore: 5,
      interestAfter: 5,
    });
    p.gold = 50;
    expect(previewPurchase(g, p, 0)).toMatchObject({
      interestBefore: 5,
      interestAfter: 4,
    });
    p.gold = 3;
    const before = structuredClone(g);
    expect(previewPurchase(g, p, 0)).toMatchObject({
      allowed: false,
      reason: "还差 1 金",
      interestAfter: 0,
    });
    expect(buy(g, p, 0)).toBe(false);
    expect(g).toEqual(before);
    p.gold = 50;
    g.phase = "battle";
    expect(previewPurchase(g, p, 0)).toMatchObject({
      allowed: false,
      reason: "准备阶段可招募",
    });
    expect(buy(g, p, 0)).toBe(false);
    expect(previewPurchase(g, p, 1).after).toBeNull();
  });
  it("多轮真实商店的预览不改变随机数或卡池，购买结果一致", () => {
    const g = createGame(137, "classic"),
      p = g.players[0];
    p.gold = 100;
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < p.shop.length; i++) {
        const before = structuredClone(g),
          quote = previewPurchase(g, p, i);
        expect(g).toEqual(before);
        expect(buy(g, p, i)).toBe(quote.allowed);
        if (quote.allowed) expect(p).toEqual(quote.after);
        else expect(g).toEqual(before);
        expect(validGame(g)).toBe(true);
      }
      roll(g, p);
    }
  });
});
