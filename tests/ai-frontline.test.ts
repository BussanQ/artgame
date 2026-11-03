import { describe, expect, it } from "vitest";
import { frontlineFactor, chooseLineup, deployLineup } from "../src/engine/ai";
import { createGame } from "../src/engine/game";
import { simulateOutcome } from "../src/engine/battle";
import { ENCOUNTERS, encounterArmy } from "../src/data/encounters";
import type { Piece } from "../src/engine/types";

const piece = (
  defId: string,
  star = 2,
  items: string[] = [],
  uid = 1,
): Piece => ({ uid, defId, star, items, position: null });
const ranged = () =>
  ["sniper", "cannon", "ark", "bat", "phoenix", "fish"].map((id, i) =>
    piece(id, 2, [], i + 10),
  );

describe("前排保护参与选阵", () => {
  it("不会为了坦克名额强行撤下高星输出", () => {
    const player = createGame().players[0];
    player.level = 5;
    player.pieces = [
      piece("guard", 1),
      ...["sniper", "cannon", "ark", "bat", "tiger"].map((id, i) =>
        piece(id, 3, [], i + 2),
      ),
    ];
    const selected = chooseLineup(player, "standard");
    expect(selected).toHaveLength(5);
    expect(selected.every((p) => p.star === 3)).toBe(true);
  });
  it("一枚脆弱近战不能让六枚后排得到与成熟坦克相同的保护评分", () => {
    const back = ranged();
    expect(frontlineFactor([piece("guard", 1), ...back])).toBeLessThan(
      frontlineFactor([piece("guard", 3, ["aegis"]), ...back]),
    );
    expect(frontlineFactor(back)).toBeCloseTo(0.82);
    expect(frontlineFactor([piece("guard", 3, ["aegis"]), ...back])).toBe(1);
  });
  it("前排生命和护甲装备提高保护能力，输出法杖不冒充防具", () => {
    const back = ranged();
    const naked = frontlineFactor([piece("guard", 1), ...back]);
    expect(frontlineFactor([piece("guard", 1, ["staff"]), ...back])).toBe(
      naked,
    );
    for (const item of ["plate", "core", "aegis"])
      expect(
        frontlineFactor([piece("guard", 1, [item]), ...back]),
      ).toBeGreaterThan(naked);
  });
  it("站位在前排的轰炸机能掩护后排，不因两格射程被误当作后排", () => {
    expect(frontlineFactor([piece("bomber"), ...ranged()])).toBeGreaterThan(
      frontlineFactor([piece("ark"), ...ranged()]),
    );
  });
  it("实际激活跳后排的刺杀棋子不再为留下的远程充当前排", () => {
    const team = [piece("wolf"), piece("panda"), ...ranged()];
    expect(frontlineFactor(team, true)).toBeCloseTo(0.82);
    expect(frontlineFactor(team, false)).toBeGreaterThan(
      frontlineFactor(team, true),
    );
    expect(frontlineFactor([piece("guard"), ...team], true)).toBeGreaterThan(
      0.82,
    );
    // An entirely diving team does not need cover for ranged units that also dive.
    expect(
      frontlineFactor([piece("ghostjet"), piece("panda"), piece("wolf")], true),
    ).toBe(1);
  });
  it("小阵容和纯近战不硬塞坦克；评分有界、顺序无关、不修改棋子", () => {
    expect(frontlineFactor([piece("sniper"), piece("cannon")])).toBe(1);
    expect(
      frontlineFactor(
        [piece("panda"), piece("wolf"), piece("shadowblade")],
        true,
      ),
    ).toBe(0.94);
    const team = [piece("shark", 2, ["staff"]), ...ranged()];
    const before = structuredClone(team);
    const value = frontlineFactor(team);
    expect(value).toBeGreaterThanOrEqual(0.82);
    expect(value).toBeLessThanOrEqual(1);
    expect(frontlineFactor([...team].reverse())).toBeCloseTo(value);
    expect(team).toEqual(before);
  });
  it("长局持有阵容不再因一个刺杀近战而撤掉所有护卫，正常战斗验证保护作用", () => {
    const player = createGame().players[0];
    player.level = 8;
    player.pieces = [
      "fish",
      "infantry",
      "guard",
      "wolf",
      "sniper",
      "bat",
      "cannon",
      "shark",
      "adept",
      "phoenix",
      "ark",
    ].map((id, i) =>
      piece(
        id,
        id === "cannon" ? 1 : 2,
        id === "cannon"
          ? ["overdrive"]
          : ["fish", "shark"].includes(id)
            ? ["staff"]
            : [],
        i + 1,
      ),
    );
    const before = structuredClone(player);
    expect(chooseLineup(player, "standard").map((p) => p.defId)).toContain(
      "guard",
    );
    expect(player).toEqual(before);
    const previous = structuredClone(player);
    previous.pieces = previous.pieces.filter(
      (p) => !["guard", "infantry", "sniper"].includes(p.defId),
    );
    deployLineup(previous, "standard");
    deployLineup(player, "standard");
    expect(player.pieces.filter((p) => p.position !== null)).toHaveLength(8);
    expect(player.pieces.map(({ position, ...p }) => p)).toEqual(
      before.pieces.map(({ position, ...p }) => p),
    );
    const enemy = encounterArmy(ENCOUNTERS.find((e) => e.round === 25)!);
    const oldBattle = simulateOutcome(previous.pieces, enemy, "metamorph");
    const battle = simulateOutcome(player.pieces, enemy, "metamorph");
    const enemyHp = (result: typeof battle) =>
      result.final.fighters
        .filter((f) => (f.homeSide ?? f.side) === 1)
        .reduce((n, f) => n + Math.max(0, f.hp), 0);
    expect(enemyHp(battle)).toBeLessThan(enemyHp(oldBattle));
    expect(
      battle.winner === 0 || battle.final.tick > oldBattle.final.tick,
    ).toBe(true);
  });
});
