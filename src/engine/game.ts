import { COPIES, ODDS, RULES, UNIT, UNITS, XP } from "../data/units";
import { random } from "./random";
import { simulate } from "./battle";
import type { Game, Player, Piece, Battle } from "./types";
export function createGame(seed = 20261102): Game {
  const g: Game = {
    seed: seed >>> 0,
    nextUid: 1,
    round: 1,
    phase: "prepare",
    players: [],
    pool: Object.fromEntries(UNITS.map((u) => [u.id, COPIES[u.cost]])),
    message: "招募棋子，点击备战席棋子，再点击己方棋格部署。",
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
  g.players = names.map((name, id) => ({
    id,
    name,
    hp: 100,
    gold: 10,
    level: 3,
    xp: 0,
    streak: 0,
    pieces: [],
    shop: [],
    locked: false,
  }));
  for (const p of g.players) roll(g, p, false);
  return g;
}
export function roll(g: Game, p: Player, paid = true): boolean {
  if (g.phase !== "prepare" || (paid && p.gold < RULES.reroll)) return false;
  if (paid) p.gold -= RULES.reroll;
  for (const id of p.shop) if (id) g.pool[id]++;
  p.shop = [];
  for (let i = 0; i < RULES.shop; i++) {
    const choices = UNITS.filter(
      (u) => g.pool[u.id] > 0 && ODDS[p.level - 1][u.cost - 1] > 0,
    );
    const weight = (id: string) =>
      (ODDS[p.level - 1][UNIT[id].cost - 1] * g.pool[id]) /
      UNITS.filter((u) => u.cost === UNIT[id].cost).reduce(
        (n, u) => n + g.pool[u.id],
        0,
      );
    let pick = random(g) * choices.reduce((n, u) => n + weight(u.id), 0);
    const unit =
      choices.find((u) => (pick -= weight(u.id)) < 0) ?? choices.at(-1);
    p.shop.push(unit?.id ?? null);
    if (unit) g.pool[unit.id]--;
  }
  return true;
}
export function merge(p: Player): void {
  for (const d of UNITS)
    for (let star = 1; star < 3; star++) {
      let same: Piece[];
      while (
        (same = p.pieces.filter((x) => x.defId === d.id && x.star === star))
          .length >= 3
      ) {
        same.sort(
          (a, b) =>
            Number(a.position === null) - Number(b.position === null) ||
            a.uid - b.uid,
        );
        same[0].star++;
        const removed = new Set([same[1].uid, same[2].uid]);
        p.pieces = p.pieces.filter((x) => !removed.has(x.uid));
      }
    }
}
export function buy(g: Game, p: Player, index: number): boolean {
  const id = p.shop[index];
  if (g.phase !== "prepare" || !id || p.gold < UNIT[id].cost) return false;
  const combines =
    p.pieces.filter((x) => x.defId === id && x.star === 1).length >= 2;
  if (
    p.pieces.filter((x) => x.position === null).length >= RULES.bench &&
    !combines
  )
    return false;
  p.gold -= UNIT[id].cost;
  p.shop[index] = null;
  p.pieces.push({ uid: g.nextUid++, defId: id, star: 1, position: null });
  merge(p);
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
  if (g.phase !== "prepare") return false;
  const piece = p.pieces.find((x) => x.uid === uid);
  if (!piece) return false;
  const copies = 3 ** (piece.star - 1);
  p.gold += UNIT[piece.defId].cost * copies;
  g.pool[piece.defId] += copies;
  p.pieces = p.pieces.filter((x) => x.uid !== uid);
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
export function income(p: Player, won: boolean): number {
  return (
    5 +
    Math.min(5, Math.floor(p.gold / 10)) +
    (won ? 1 : 0) +
    Math.min(3, Math.floor(Math.abs(p.streak) / 3))
  );
}
function bot(g: Game, p: Player) {
  if (p.level < Math.min(9, 3 + Math.floor(g.round / 3)) && p.gold >= 10)
    buyXp(g, p);
  for (let tries = 0; tries < 2; tries++) {
    const indices = p.shop
      .map((_, i) => i)
      .sort((a, b) => {
        const score = (i: number) => {
          const id = p.shop[i];
          return id
            ? UNIT[id].cost + p.pieces.filter((x) => x.defId === id).length * 4
            : 0;
        };
        return score(b) - score(a);
      });
    for (const i of indices) if (p.gold > 2) buy(g, p, i);
    if (tries === 0 && p.gold > 14) roll(g, p);
    else break;
  }
  const best = [...p.pieces]
    .sort(
      (a, b) =>
        b.star * 5 + UNIT[b.defId].cost - a.star * 5 - UNIT[a.defId].cost,
    )
    .slice(0, p.level);
  for (const x of p.pieces) x.position = null;
  const used = new Set<number>();
  for (const x of best) {
    const ranged = UNIT[x.defId].range > 1;
    const preferred = ranged
      ? [58, 61, 56, 63, 57, 60, 59, 62, 48, 49]
      : [35, 36, 34, 37, 33, 38, 32, 39, 43, 44];
    const pos = preferred.find((n) => !used.has(n))!;
    x.position = pos;
    used.add(pos);
  }
  while (p.pieces.filter((x) => x.position === null).length > 6) {
    const x = p.pieces.find((x) => x.position === null)!;
    sell(g, p, x.uid);
  }
}
export interface RoundResult {
  opponent: Player;
  battle: Battle;
  outcomes: { playerId: number; won: boolean; damage: number }[];
}
export function startRound(g: Game): RoundResult | null {
  if (
    g.phase !== "prepare" ||
    !g.players[0].pieces.some((x) => x.position !== null)
  )
    return null;
  for (const p of g.players.filter((p) => p.id !== 0 && p.hp > 0)) bot(g, p);
  const alive = g.players.filter((p) => p.hp > 0);
  const enemy = alive.filter((p) => p.id !== 0);
  const opponent = enemy[(g.round - 1) % enemy.length];
  if (!opponent) return null;
  const battle = simulate(g.players[0].pieces, opponent.pieces);
  const outcomes: RoundResult["outcomes"] = [];
  // Each player defends independently; odd population needs no special bye/ghost state.
  for (const p of alive) {
    const other =
      p.id === 0
        ? opponent
        : alive[
            (alive.indexOf(p) + 1 + ((g.round - 1) % (alive.length - 1))) %
              alive.length
          ];
    const b = p.id === 0 ? battle : simulate(p.pieces, other.pieces);
    outcomes.push({
      playerId: p.id,
      won: b.winner === 0,
      damage: b.winner === 0 ? 0 : b.damage,
    });
  }
  g.phase = "battle";
  return { opponent, battle, outcomes };
}
export function settle(g: Game, result: RoundResult): void {
  if (g.phase !== "battle") return;
  for (const o of result.outcomes) {
    const p = g.players[o.playerId];
    p.hp = Math.max(0, p.hp - o.damage);
    p.streak = o.won ? Math.max(0, p.streak) + 1 : Math.min(0, p.streak) - 1;
    if (p.hp === 0) {
      p.eliminatedRound = g.round;
      for (const x of p.pieces) g.pool[x.defId] += 3 ** (x.star - 1);
      for (const id of p.shop) if (id) g.pool[id]++;
      p.shop = [];
      p.pieces = [];
    } else {
      p.gold += income(p, o.won);
      addXp(p, 1);
    }
  }
  const won = result.battle.winner === 0;
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
}
export function nextRound(g: Game) {
  if (g.phase !== "result") return;
  g.round++;
  g.phase = "prepare";
  for (const p of g.players.filter((p) => p.hp > 0))
    if (!p.locked) roll(g, p, false);
}
export function rankings(g: Game) {
  return [...g.players].sort(
    (a, b) =>
      b.hp - a.hp ||
      (b.eliminatedRound ?? 999) - (a.eliminatedRound ?? 999) ||
      a.id - b.id,
  );
}
