import { catalogCost } from "../data/catalog";
import { availableUnits, isRecruitable, randomBans } from "./rotation";
import { CURRENT_COMBAT_VERSION } from "./types";
import { mergePieces, pieceCopies } from "./progression";
import { previewPurchase, previewSale } from "./recruitment";
import { income } from "./economy";
export { income } from "./economy";
import { prepareBot } from "./ai";
import { encounterFor, encounterArmy } from "../data/encounters";
import { rewardChoices, itemScore } from "./equipment";
import { COPIES, ODDS, RULES, UNIT, UNITS, XP } from "../data/units";
import { random } from "./random";
import { opponentProfiles } from "../data/ai-profiles";
import { simulate, simulateOutcome } from "./battle";
import type { Game, Player, Piece, Battle } from "./types";
export function createGame(
  seed = 20261102,
  mode: "rotation" | "classic" = "rotation",
): Game {
  const bannedSeries = mode === "rotation" ? randomBans(seed) : undefined;
  const g: Game = {
    seed: seed >>> 0,
    ...(bannedSeries ? { bannedSeries } : {}),
    catalogVersion: CURRENT_COMBAT_VERSION,
    combatVersion: CURRENT_COMBAT_VERSION,
    difficulty: "standard",
    nextUid: 1,
    round: 1,
    phase: "prepare",
    players: [],
    pool: Object.fromEntries(
      UNITS.map((u) => [
        u.id,
        isRecruitable({ bannedSeries }, u.id) ? COPIES[u.cost] : 0,
      ]),
    ),
    message: "招募棋子，点击备战席棋子，再点击己方棋格部署。",
    history: [],
    encountersFromRound: 1,
    reward: null,
  };
  const names = [
    "你 · 指挥官",
    "北境哨兵",
    "渡鸦",
    "荒原旅者",
    "零号机",
    "白夜",
    "深海回声",
    "铁幕",
  ];
  const doctrines = opponentProfiles(
    seed,
    bannedSeries ? availableUnits({ bannedSeries }) : undefined,
  );
  g.players = names.map((name, id) => ({
    id,
    name,
    ...(id > 0 ? { aiProfile: doctrines[id - 1] } : {}),
    hp: 100,
    gold: 10,
    level: 3,
    xp: 0,
    streak: 0,
    pieces: [],
    shop: [],
    locked: false,
    inventory: [],
  }));
  for (const p of g.players) roll(g, p, false);
  return g;
}
export function roll(g: Game, p: Player, paid = true): boolean {
  if (g.phase !== "prepare" || (paid && p.gold < RULES.reroll)) return false;
  if (paid) p.gold -= RULES.reroll;
  for (const id of p.shop) if (id) g.pool[id]++;
  p.shop = [];
  const units = availableUnits(g);
  for (let i = 0; i < RULES.shop; i++) {
    const totals = [0, 0, 0, 0, 0, 0];
    for (const unit of units) totals[unit.cost] += g.pool[unit.id];
    const choices = units.filter(
      (u) => g.pool[u.id] > 0 && ODDS[p.level - 1][u.cost - 1] > 0,
    );
    const weight = (unit: (typeof units)[number]) =>
      (ODDS[p.level - 1][unit.cost - 1] * g.pool[unit.id]) / totals[unit.cost];
    let pick = random(g) * choices.reduce((n, u) => n + weight(u), 0);
    const unit = choices.find((u) => (pick -= weight(u)) < 0) ?? choices.at(-1);
    p.shop.push(unit?.id ?? null);
    if (unit) g.pool[unit.id]--;
  }
  return true;
}
export function merge(
  p: Player,
  version: Game["combatVersion"] = CURRENT_COMBAT_VERSION,
): void {
  mergePieces(p, version);
}
export function buy(g: Game, p: Player, index: number): boolean {
  const id = p.shop[index];
  if (g.phase !== "prepare" || !id || !UNIT[id] || p.gold < catalogCost(g, id))
    return false;
  const quote = previewPurchase(g, p, index);
  if (!quote.allowed || !quote.after) return false;
  p.gold = quote.after.gold;
  p.shop[index] = null;
  g.nextUid++;
  p.pieces = quote.after.pieces;
  p.inventory = quote.after.inventory;
  return true;
}
export function move(
  g: Game,
  p: Player,
  uid: number,
  position: number | null,
): boolean {
  if (
    g.phase !== "prepare" ||
    (position !== null &&
      (!Number.isInteger(position) || position < 32 || position > 63))
  )
    return false;
  const piece = p.pieces.find((x) => x.uid === uid);
  if (!piece) return false;
  const target = p.pieces.find(
    (x) => x.position === position && position !== null,
  );
  if (
    piece.position === null &&
    position !== null &&
    !target &&
    p.pieces.filter((x) => x.position !== null).length >= p.level
  )
    return false;
  if (
    piece.position !== null &&
    position === null &&
    p.pieces.filter((x) => x.position === null).length >= RULES.bench
  )
    return false;
  if (target) target.position = piece.position;
  piece.position = position;
  return true;
}
export function sell(g: Game, p: Player, uid: number): boolean {
  const quote=previewSale(g,p,uid);
  if(!quote)return false;
  p.gold=quote.after.gold;
  p.inventory=quote.after.inventory;
  p.pieces=quote.after.pieces;
  g.pool[quote.defId]+=quote.copies;
  return true;
}
export function addXp(p: Player, amount: number) {
  p.xp += amount;
  while (p.level < RULES.maxLevel && p.xp >= XP[p.level]) {
    p.xp -= XP[p.level];
    p.level++;
  }
  if (p.level === RULES.maxLevel) p.xp = 0;
}
export function buyXp(g: Game, p: Player): boolean {
  if (g.phase !== "prepare" || p.gold < 5 || p.level === 10) return false;
  p.gold -= 5;
  addXp(p, 5);
  return true;
}
export interface RoundResult {
  round: number;
  seed: number;
  combatVersion: Game["combatVersion"];
  left: Piece[];
  right: Piece[];
  opponent: Pick<Player, "id" | "name" | "pieces">;
  kind: "pvp" | "pve";
  battle: Battle;
  outcomes: { playerId: number; won: boolean; damage: number }[];
}
export function startRound(g: Game): RoundResult | null {
  if (
    g.phase !== "prepare" ||
    !g.players[0].pieces.some((x) => x.position !== null)
  )
    return null;
  for (const p of g.players.filter((p) => p.id !== 0 && p.hp > 0))
    prepareBot(g, p, { buy, sell, roll, buyXp });
  g.phase = "battle";
  return resumeRound(g);
}
/** Rebuild a saved battle without buying, rolling, or consuming random state again. */
export function resumeRound(g: Game): RoundResult | null {
  if (g.phase !== "battle") return null;
  const alive = g.players.filter((p) => p.hp > 0);
  const enemy = alive.filter((p) => p.id !== 0);
  const encounter = encounterFor(g);
  const opponent = encounter
    ? { id: -1, name: encounter.name, pieces: encounterArmy(encounter) }
    : enemy[(g.round - 1) % enemy.length];
  if (!opponent) return null;
  const battle = simulate(
    g.players[0].pieces,
    opponent.pieces,
    g.combatVersion,
  );
  const outcomes: RoundResult["outcomes"] = [];
  // Each player defends independently; odd population needs no special bye/ghost state.
  for (const p of alive) {
    const other =
      encounter || p.id === 0
        ? opponent
        : alive[
            (alive.indexOf(p) + 1 + ((g.round - 1) % (alive.length - 1))) %
              alive.length
          ];
    const b =
      p.id === 0
        ? battle
        : simulateOutcome(p.pieces, other.pieces, g.combatVersion);
    outcomes.push({
      playerId: p.id,
      won: b.winner === 0,
      damage: b.winner === 0 ? 0 : b.damage,
    });
  }
  return {
    round: g.round,
    combatVersion: g.combatVersion,
    kind: encounter ? "pve" : "pvp",
    seed: g.seed,
    left: structuredClone(
      g.players[0].pieces.filter((p) => p.position !== null),
    ),
    right: structuredClone(opponent.pieces.filter((p) => p.position !== null)),
    opponent,
    battle,
    outcomes,
  };
}
export function settle(g: Game, result: RoundResult): void {
  if (
    g.phase !== "battle" ||
    result.round !== g.round ||
    result.combatVersion !== g.combatVersion ||
    result.seed !== g.seed ||
    g.history.some((r) => r.round === g.round)
  )
    return;
  const previousHp = g.players[0].hp,
    previousGold = g.players[0].gold,
    inventory = [...g.players[0].inventory],
    bench = structuredClone(
      g.players[0].pieces.filter((piece) => piece.position === null),
    );
  for (const o of result.outcomes) {
    const p = g.players[o.playerId];
    p.hp = Math.max(0, p.hp - o.damage);
    if (result.kind === "pvp")
      p.streak = o.won ? Math.max(0, p.streak) + 1 : Math.min(0, p.streak) - 1;
    if (p.hp === 0) {
      p.eliminatedRound = g.round;
      for (const x of p.pieces) g.pool[x.defId] += pieceCopies(x);
      for (const id of p.shop) if (id) g.pool[id]++;
      p.shop = [];
      p.pieces = [];
      p.inventory = [];
    } else {
      p.gold += income(p, result.kind === "pvp" && o.won, g.round);
      addXp(p, 1);
    }
  }
  const won = result.battle.winner === 0;
  g.history.push({
    round: g.round,
    combatVersion: g.combatVersion,
    opponentId: result.opponent.id,
    opponentName: result.opponent.name,
    kind: result.kind,
    winner: result.battle.winner,
    damage: previousHp - g.players[0].hp,
    income: g.players[0].gold - previousGold,
    hp: g.players[0].hp,
    gold: g.players[0].gold,
    left: structuredClone(result.left),
    right: structuredClone(result.right),
    bench,
    inventory,
  });
  g.message = won
    ? "防守成功。金币与经验已结算。"
    : result.battle.winner === null
      ? "战斗超时 / 平局，扣除 3 点生命。"
      : "防守失利。调整站位与羁绊，再战一轮。";
  g.phase =
    g.players[0].hp <= 0 ||
    g.players.filter((p) => p.hp > 0).length <= 1 ||
    g.round >= RULES.maxRounds
      ? "finished"
      : "result";
  if (result.kind === "pve" && g.phase !== "finished") {
    for (const outcome of result.outcomes) {
      const p = g.players[outcome.playerId];
      if (p.hp <= 0) continue;
      const choices = rewardChoices(g, outcome.won ? 3 : 2);
      if (p.id === 0) g.reward = { round: g.round, choices };
      else {
        const best = choices.sort(
          (a, b) =>
            Math.max(
              0,
              ...p.pieces.map((x) => itemScore(x, b, g.combatVersion)),
            ) -
            Math.max(
              0,
              ...p.pieces.map((x) => itemScore(x, a, g.combatVersion)),
            ),
        )[0];
        p.inventory.push(best);
      }
    }
    g.message += " 选择一件战利品后进入准备阶段。";
  }
}
export function nextRound(g: Game) {
  if (g.phase !== "result" || g.reward) return;
  const previousVersion = g.combatVersion;
  g.round++;
  g.combatVersion = CURRENT_COMBAT_VERSION;
  g.phase = "prepare";
  for (const p of g.players.filter((p) => p.hp > 0)) {
    if (previousVersion !== CURRENT_COMBAT_VERSION) mergePieces(p, g.combatVersion);
    if (!p.locked) roll(g, p, false);
  }
}
export function rankings(g: Game) {
  return [...g.players].sort(
    (a, b) =>
      b.hp - a.hp ||
      (b.eliminatedRound ?? 999) - (a.eliminatedRound ?? 999) ||
      a.id - b.id,
  );
}
