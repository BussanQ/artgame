import { describe, it, expect } from "vitest";
import {
  abilityCredit,
  pieceStrength,
  chooseLineup,
  deployLineup,
} from "../src/engine/ai";
import { createGame } from "../src/engine/game";
import { UNITS } from "../src/data/units";
import type { Piece } from "../src/engine/types";
const piece = (
  defId: string,
  uid = 1,
  star = 2,
  items: string[] = [],
): Piece => ({ defId, uid, star, items, position: null });
describe("技能与装备参与AI选阵", () => {
  it("同名同星候选不再因为UID优先而把法杖输出手留在备战", () => {
    for (const id of [
      "whale",
      "ark",
      "thunderlord",
      "arhat",
      "phoenix",
      "skycrab",
    ]) {
      const p = createGame(41, "classic").players[0];
      p.level = 1;
      p.pieces = [piece(id, 1), piece(id, 2, 2, ["staff"])];
      const original = structuredClone(p);
      expect(chooseLineup(p, "standard").map((p) => p.uid)).toEqual([2]);
      expect(p).toEqual(original);
      deployLineup(p, "standard");
      expect(p.pieces.find((p) => p.uid === 2)?.position).not.toBeNull();
      expect(p.pieces.find((p) => p.uid === 1)?.position).toBeNull();
    }
  });
  it("法伤、真伤、物理技能均考虑技能装备，而非按费用或攻击方式硬编码", () => {
    for (const id of [
      "whale",
      "stormcaller",
      "vine",
      "infantry",
      "panda",
      "tiger",
      "blastbug",
      "wolf",
    ]) {
      const naked = piece(id),
        equipped = piece(id, 1, 2, ["staff"]);
      expect(pieceStrength(equipped)).toBeGreaterThan(pieceStrength(naked));
    }
  });
  it("玄龟固定护甲不因无用法杖升值；一次吞噬/落地不会无限吃技能强度", () => {
    expect(pieceStrength(piece("turtle", 1, 2, ["staff"]))).toBe(
      pieceStrength(piece("turtle")),
    );
    // Skytoad starts with 25 mana: two staffs already cap the opening energy.
    expect(
      abilityCredit(piece("skytoad", 1, 2, ["staff", "staff", "staff"])),
    ).toBe(abilityCredit(piece("skytoad", 1, 2, ["staff", "staff"])));
    expect(
      abilityCredit(piece("bloodhawk", 1, 2, ["staff"])),
    ).toBeLessThanOrEqual(0.22);
  });
  it("技能估值有上限，星级仍重要，不把装备一星幻鲸强制选过成熟主力", () => {
    for (const u of UNITS)
      for (const star of [1, 2, 3]) {
        const p = piece(u.id, 1, star, ["staff", "staff", "staff"]);
        expect(Number.isFinite(pieceStrength(p))).toBe(true);
        expect(abilityCredit(p)).toBeGreaterThanOrEqual(0);
        expect(abilityCredit(p)).toBeLessThanOrEqual(0.6);
        if (star > 1)
          expect(pieceStrength(p)).toBeGreaterThan(
            pieceStrength({ ...p, star: star - 1 }),
          );
      }
    expect(pieceStrength(piece("whale", 1, 1, ["staff"]))).toBeLessThan(
      pieceStrength(piece("bull", 2, 2)),
    );
  });
  it("范围与控制角色可获额外估值，队友辅助与召唤仍只走各自评分", () => {
    expect(abilityCredit(piece("treant"))).toBeGreaterThan(
      abilityCredit(piece("sniper")),
    );
    for (const id of ["fish", "repair", "acolyte", "adept", "shark", "wolf"])
      expect(abilityCredit(piece(id))).toBe(0);
  });
});
