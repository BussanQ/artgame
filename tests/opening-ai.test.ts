import { describe, expect, it } from "vitest";
import { equipmentStats } from "../src/data/items";
import { CURRENT_COMBAT_VERSION, type Piece } from "../src/engine/types";
import { army } from "../src/engine/battle";
import { abilityCredit, chooseLineup, pieceStrength, planTactically, prepareBot, reservePriority, scoutControlPurchase } from "../src/engine/ai";
import { completesOpening, openingCollection, openingCores } from "../src/engine/opening-ai";
import { buy, buyXp, roll, sell } from "../src/engine/game";
import { catalogCost } from "../src/data/catalog";
import { validGame } from "../src/engine/persistence";
import captured from "./fixtures/opening-ai-reserve.json";

const piece = (defId: string, uid: number, star = 1): Piece => ({ defId, uid, star, position: null });
function fixture() {
  const input: unknown = structuredClone(captured.game);
  if (!validGame(input)) throw Error("Invalid real paid capture");
  input.difficulty = "standard";
  const player = input.players[0];
  player.aiProfile = "pandas";
  return { game: input, player };
}

describe("开场能量与完整组合经营", () => {
  it("三种熊猫的真实开场能量能提高有限首次技能估值，能量上限不重复收益", () => {
    const pieces = [piece("master", 1), piece("panda", 2), piece("monk", 3)];
    const fighters = army(pieces.map((p, i) => ({ ...p, position: 35 + i })), 0);
    expect(fighters.map(f => f.mana)).toEqual([100, 100, 100]);
    for (const p of pieces) {
      const gear = equipmentStats(p.items);
      expect(abilityCredit(p, gear, 100)).toBeGreaterThan(abilityCredit(p, gear));
      expect(abilityCredit(p, gear, 100)).toBe(abilityCredit(p, gear, 200));
      expect(abilityCredit(p, gear, 100)).toBeLessThanOrEqual(0.6);
    }
    expect(abilityCredit(piece("thunderlord", 4), equipmentStats([]), 100))
      .toBe(abilityCredit(piece("thunderlord", 4)));
  });

  it("完整核心只用不同的已有棋子，保留最强副本且不修改原阵容", () => {
    const pieces = [piece("master", 1), piece("panda", 2), piece("monk", 3), piece("master", 4, 2)];
    const player = { pieces, level: 3 }, before = structuredClone(player);
    const cores = openingCores(player, CURRENT_COMBAT_VERSION, pieceStrength);
    expect(cores).toHaveLength(1);
    expect(cores[0].map(p => p.defId).sort()).toEqual(["master", "monk", "panda"]);
    expect(cores[0].find(p => p.defId === "master")!.uid).toBe(4);
    expect(openingCores({ ...player, level: 2 }, CURRENT_COMBAT_VERSION, pieceStrength)).toEqual([]);
    expect(openingCores({ pieces: [piece("master", 1), piece("master", 2), piece("master", 3)], level: 3 }, CURRENT_COMBAT_VERSION, pieceStrength)).toEqual([]);
    expect(player).toEqual(before);
  });

  it("开场门槛随战斗版本，当前两种不误触发旧两人档", () => {
    const player = { pieces: [piece("master", 1), piece("panda", 2)], level: 3 };
    expect(openingCores(player, "legacy", pieceStrength)).toHaveLength(1);
    expect(openingCores(player, CURRENT_COMBAT_VERSION, pieceStrength)).toEqual([]);
    expect(completesOpening(player, "monk", {}, CURRENT_COMBAT_VERSION)).toBe(true);
    expect(completesOpening(player, "panda", {}, CURRENT_COMBAT_VERSION)).toBe(false);
    expect(completesOpening(player, "monk", { bannedSeries: ["熊猫"] }, CURRENT_COMBAT_VERSION)).toBe(false);
  });

  it("已知禁用或人口不可达时不保护虚构拼图，非偏好构筑不强行收集", () => {
    const { game, player } = fixture();
    expect(openingCollection(player, game, game.combatVersion)?.kinds.size).toBe(2);
    const held = player.pieces.find(p => p.defId === "panda")!;
    expect(reservePriority(player, held, game.combatVersion, game))
      .toBeGreaterThan(reservePriority(player, held, game.combatVersion, { bannedSeries: ["熊猫"] }));
    expect(openingCollection(player, { bannedSeries: ["熊猫"] }, game.combatVersion)).toBeNull();
    const ninja = player.pieces.find(piece => piece.defId === "panda")!;
    player.pieces = player.pieces.filter(piece => piece.uid !== ninja.uid);
    expect(openingCollection(player, game, game.combatVersion)).toBeNull();
    player.pieces.push(ninja);
    player.level = 1;
    expect(openingCollection(player, game, game.combatVersion)).toBeNull();
    player.level = 7; player.aiProfile = "fleet";
    expect(openingCollection(player, game, game.combatVersion)).toBeNull();
  });

  it("真实R14满备战报价能识别三熊猫补强，试算不花钱、不预读随机流", () => {
    const { game, player } = fixture(), before = structuredClone(game);
    const probe = scoutControlPurchase(game, player, player.shop.indexOf("monk"));
    expect(probe.baseline).toBe(planTactically(game, player)!.score);
    expect(probe.improves).toBe(true);
    expect(probe.trials).toBeLessThanOrEqual(40);
    expect(probe.best).toBeGreaterThan(probe.baseline!);
    expect(probe.sellUid).not.toBeNull();
    expect(["master", "panda"]).not.toContain(player.pieces.find(p => p.uid === probe.sellUid)!.defId);
    expect(game).toEqual(before);
    for (const cap of [0, 1, 2, 5, 20, 100, NaN]) {
      const bounded = scoutControlPurchase(game, player, player.shop.indexOf("monk"), cap);
      expect(bounded.trials).toBeLessThanOrEqual(Number.isFinite(cap) ? Math.min(40, cap) : 0);
      expect(game).toEqual(before);
    }
    player.gold = 0;
    expect(scoutControlPurchase(game, player, player.shop.indexOf("monk")).trials).toBe(0);
  });

  it("真实付费事务保留已有拼图、合法腾位并部署三种熊猫，装备与金币守恒", () => {
    const { game, player } = fixture(), gold = player.gold;
    const items = () => [...player.inventory, ...player.pieces.flatMap(p => p.items ?? [])].sort();
    const gear = items(); let spent = 0, income = 0;
    player.id = 1;
    const report = prepareBot(game, player, {
      buy(g, p, index) { const cost = catalogCost(g, p.shop[index]!); const ok = buy(g, p, index); if (ok) spent += cost; return ok; },
      sell(g, p, uid) { const before = p.gold, ok = sell(g, p, uid); if (ok) income += p.gold - before; return ok; },
      roll(g, p) { const before = p.gold, ok = roll(g, p); if (ok) spent += before - p.gold; return ok; },
      buyXp(g, p) { const before = p.gold, ok = buyXp(g, p); if (ok) spent += before - p.gold; return ok; },
    })!;
    player.id = 0; delete player.aiProfile;
    expect(report.scoutedPurchases).toContain("monk");
    expect(report.controlPurchaseTrials).toBeLessThanOrEqual(40);
    expect(report.deploymentTrials).toBeLessThanOrEqual(20);
    expect(player.pieces.filter(p => p.position !== null).map(p => p.defId))
      .toEqual(expect.arrayContaining(["master", "panda", "monk"]));
    expect(player.pieces.filter(p => p.position === null).length).toBeLessThanOrEqual(8);
    expect(player.gold).toBe(gold + income - spent);
    expect(items()).toEqual(gear);
    expect(validGame(game)).toBe(true);
  });

  it("公开对手已经可胜时，不为凑满组合批准额外购买", () => {
    const { game, player } = fixture();
    // Explicit counterfactual test: normal sale transactions simplify the public enemies.
    for (const enemy of game.players.slice(1)) {
      const keep = [...enemy.pieces].sort((a, b) => pieceStrength(a) - pieceStrength(b))[0];
      for (const p of [...enemy.pieces]) if (p.uid !== keep?.uid) expect(sell(game, enemy, p.uid)).toBe(true);
      if (keep) enemy.pieces.find(p=>p.uid===keep.uid)!.position = 35;
    }
    const baseline = planTactically(game, player)!;
    expect(baseline.winner).toBe(0);
    const before = structuredClone(game);
    expect(scoutControlPurchase(game, player, player.shop.indexOf("monk")).improves).toBe(false);
    expect(game).toEqual(before);
    delete player.aiProfile;
    expect(validGame(game)).toBe(true);
  });

  it("同一商店补齐第二名后重新试算先前的第三名报价，不强迫购买", () => {
    const { game, player } = fixture();
    const ninja = player.pieces.find(p=>p.defId==="panda")!;
    expect(sell(game,player,ninja.uid)).toBe(true);
    // Counterfactual module fixture: retain the two real offers and return the
    // other unbought reservations; no piece, gold or probability is injected.
    player.shop.forEach((id,index)=>{
      if(id!==null&&id!=="monk"&&id!=="panda"){game.pool[id]++;player.shop[index]=null;}
    });
    player.hp=35;player.id=1;
    const report=prepareBot(game,player,{buy,sell,buyXp,roll:()=>false})!;
    player.id=0;delete player.aiProfile;
    expect(report.controlPurchaseTrials).toBeGreaterThan(0);
    expect(report.controlPurchaseTrials).toBeLessThanOrEqual(40);
    expect(player.pieces.map(p=>p.defId)).toEqual(expect.arrayContaining(["master","panda"]));
    // Restore counterfactual health to agree with the captured commander's history.
    player.hp=captured.game.players[0].hp;
    expect(validGame(game)).toBe(true);
  });

  it("简单难度保持独立个体选阵，核心试算在错误阶段不启动", () => {
    const { game, player } = fixture();
    const simple={...player,level:3,pieces:[piece("master",1),piece("panda",2),piece("monk",3),
      piece("guard",4,2),piece("elephant",5,2),piece("vajra",6,2)]};
    expect(chooseLineup(simple,"relaxed").every(p=>p.star===2)).toBe(true);
    game.phase = "battle";
    expect(planTactically(game, player)).toBeNull();
    expect(scoutControlPurchase(game, player, player.shop.indexOf("monk")).trials).toBe(0);
  });
});
