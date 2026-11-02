import { simulateOutcome } from "./battle";
import { encounterFor, encounterArmy } from "../data/encounters";
import { AI_PROFILES, DIFFICULTIES, type AiProfile } from "../data/ai-profiles";
import { SKILLS } from "../data/skills";
import { equipmentStats } from "../data/items";
import { UNIT, RULES } from "../data/units";
import { synergies } from "./synergies";
import { equipBot } from "./equipment";
import type { CombatVersion, Difficulty, Game, Piece, Player } from "./types";

/** A bounded estimate for lineup selection; not an official or simulated combat rating. */
export function pieceStrength(p: Piece): number {
  const u = UNIT[p.defId],
    scale = 2 ** (p.star - 1),
    gear = equipmentStats(p.items);
  return (
    Math.sqrt(
      ((u.hp * scale + gear.hp) * (u.attack * scale + gear.attack)) /
        Math.max(1, u.interval * (1 - gear.haste)),
    ) *
    (1 + (u.armor + gear.armor) * 0.025)
  );
}
export function lineupScore(pieces: Piece[], profile: AiProfile): number {
  const base = pieces.reduce((n, p) => n + pieceStrength(p), 0);
  const active = synergies(pieces.map((p, i) => ({ ...p, position: 32 + i })));
  const bonus = active.reduce((n, s) => n + s.tier * 0.075, 0);
  // A modest, bounded credit for nearby ally healing. Damage-based self-healing (wolf)
  // is deliberately excluded; it does not heal allies or scale from the caster's HP.
  const support = pieces.reduce((n, p) => {
    if (!["fish", "deer", "monk"].includes(p.defId)) return n;
    const skill = SKILLS[p.defId],
      gear = equipmentStats(p.items);
    const hp = UNIT[p.defId].hp * 2 ** (p.star - 1) + gear.hp;
    const recipients = Math.min(pieces.length, p.defId === "deer" ? 2 : 3);
    return (
      n +
      Math.min(
        pieceStrength(p) * 0.15,
        hp * skill.healRatio * (1 + gear.skillPower) * recipients * 0.08,
      )
    );
  }, 0);
  const preferred = pieces.reduce(
    (n, p) =>
      n +
      UNIT[p.defId].traits.filter((t) => profile.traits.includes(t)).length * 8,
    0,
  );
  const mixed =
    pieces.length < 3
      ? 1
      : (pieces.some((p) => UNIT[p.defId].range > 1) ? 1 : 0.94) *
        (pieces.some((p) => UNIT[p.defId].range === 1) ? 1 : 0.82);
  return (base * (1 + bonus) + support + preferred) * mixed;
}
/** Bounded combination search; never duplicates pieces or exceeds population. */
function candidateLineups(p: Player, difficulty: Difficulty): Piece[][] {
  const profile = AI_PROFILES[p.id],
    all = [...p.pieces].sort((a, b) => a.uid - b.uid),
    size = Math.min(p.level, all.length),
    width = DIFFICULTIES[difficulty].beam;
  // Beginner opponents choose individual strength, without searching trait combinations.
  if (difficulty === "relaxed")
    return [
      [...all]
        .sort((a, b) => pieceStrength(b) - pieceStrength(a) || a.uid - b.uid)
        .slice(0, size),
    ];
  let states: { indices: number[]; score: number }[] = [
    { indices: [], score: 0 },
  ];
  for (let depth = 0; depth < size; depth++) {
    const next: typeof states = [];
    for (const state of states)
      for (
        let i = (state.indices.at(-1) ?? -1) + 1;
        i <= all.length - (size - depth);
        i++
      ) {
        const indices = [...state.indices, i];
        next.push({
          indices,
          score: lineupScore(
            indices.map((j) => all[j]),
            profile,
          ),
        });
      }
    states = next
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.indices.join(",").localeCompare(b.indices.join(",")),
      )
      .slice(0, width);
  }
  return states.map((state) => state.indices.map((i) => all[i]));
}
export function chooseLineup(p: Player, difficulty: Difficulty): Piece[] {
  return candidateLineups(p, difficulty)[0] ?? [];
}
export function deployLineup(
  p: Player,
  difficulty: Difficulty,
  formation: "spread" | "compact" = "spread",
) {
  placeLineup(p, chooseLineup(p, difficulty), formation === "compact");
}
function placeLineup(p: Player, best: Piece[], compact = false) {
  const used = new Set<number>();
  for (const piece of p.pieces) piece.position = null;
  for (const piece of best.sort(
    (a, b) => pieceStrength(b) - pieceStrength(a) || a.uid - b.uid,
  )) {
    const u = UNIT[piece.defId];
    const positions = compact
      ? u.range > 1
        ? [63, 62, 55, 61, 54, 60, 53, 59, 52, 58]
        : [47, 46, 53, 45, 52, 44, 51, 43, 50, 42]
      : ["fish", "deer"].includes(u.id)
        ? [43, 44, 42, 45, 51, 52, 50, 53, 49, 54]
        : u.range > 1
          ? [56, 63, 59, 61, 57, 62, 58, 60, 48, 55]
          : u.id === "monk"
            ? [43, 44, 42, 45, 35, 36, 34, 37]
            : u.traits.includes("刺杀")
              ? [32, 39, 33, 38, 40, 47, 35, 36]
              : [35, 36, 34, 37, 33, 38, 32, 39, 43, 44];
    piece.position =
      positions.find((pos) => !used.has(pos)) ??
      Array.from({ length: 32 }, (_, i) => i + 32).find(
        (pos) => !used.has(pos),
      )!;
    used.add(piece.position);
  }
}
/** Visible armies only: no future shops, secret bonuses or free economy actions. */
export function tacticalOpponent(g: Game, p: Player): Piece[] {
  const encounter = encounterFor(g);
  if (encounter) return encounterArmy(encounter);
  const alive = g.players.filter((other) => other.hp > 0);
  if (alive.length < 2) return [];
  return alive[
    (alive.indexOf(p) + 1 + ((g.round - 1) % (alive.length - 1))) % alive.length
  ].pieces;
}
export function tacticalScore(
  pieces: Piece[],
  opponent: Piece[],
  version: CombatVersion = "signature",
): number {
  const battle = simulateOutcome(pieces, opponent, version),
    last = battle.final;
  const health = (side: number) => {
    const team = last.fighters.filter((f) => f.side === side);
    return (
      team.reduce((n, f) => n + Math.max(0, f.hp) / f.maxHp, 0) /
      Math.max(1, team.length)
    );
  };
  return (
    (battle.winner === 0 ? 10000 : battle.winner === null ? 0 : -10000) +
    (health(0) - health(1)) * 1000 +
    (battle.winner === 0 ? -1 : 1) * last.tick * 0.01
  );
}
export function deployTactically(g: Game, p: Player) {
  if (g.phase !== "prepare" || p.hp <= 0 || !p.pieces.length) return;
  const opponent = tacticalOpponent(g, p);
  if (!opponent.some((piece) => piece.position !== null)) return;
  const candidates = candidateLineups(p, "veteran").slice(0, 3);
  let bestScore = -Infinity,
    bestPositions: Map<number, number | null> | undefined;
  for (const candidate of candidates)
    for (const compact of [false, true]) {
      const preview = structuredClone(p);
      const ids = new Set(candidate.map((piece) => piece.uid));
      placeLineup(
        preview,
        preview.pieces.filter((piece) => ids.has(piece.uid)),
        compact,
      );
      equipBot(g, preview);
      const score = tacticalScore(preview.pieces, opponent, g.combatVersion);
      if (score > bestScore) {
        bestScore = score;
        bestPositions = new Map(
          preview.pieces.map((piece) => [piece.uid, piece.position]),
        );
      }
    }
  if (bestPositions)
    for (const piece of p.pieces)
      piece.position = bestPositions.get(piece.uid) ?? null;
}
export function savingsTarget(g: Game, p: Player): number {
  if (p.hp <= 35 || g.round >= 25) return 0;
  if (g.round <= 3) return 0;
  return Math.max(
    0,
    (g.round < 8 ? 10 : g.round < 15 ? 20 : 30) + AI_PROFILES[p.id].reserve,
  );
}
interface BotActions {
  buy(g: Game, p: Player, index: number): boolean;
  sell(g: Game, p: Player, uid: number): boolean;
  roll(g: Game, p: Player): boolean;
  buyXp(g: Game, p: Player): boolean;
}
export function prepareBot(g: Game, p: Player, actions: BotActions) {
  if (g.phase !== "prepare" || p.hp <= 0 || p.id === 0) return;
  const profile = AI_PROFILES[p.id],
    settings = DIFFICULTIES[g.difficulty],
    reserve = savingsTarget(g, p);
  const desire = (id: string) => {
    const u = UNIT[id],
      same = p.pieces.filter((x) => x.defId === id);
    if (same.some((x) => x.star === 3)) return -100;
    const pair = same.filter((x) => x.star === 1).length;
    const fit = u.traits.filter((t) => profile.traits.includes(t)).length;
    const existing = new Set(p.pieces.map((x) => x.defId));
    const link = existing.has(id)
      ? 0
      : u.traits.filter((t) =>
          p.pieces.some((x) => UNIT[x.defId].traits.includes(t)),
        ).length;
    return (
      u.cost +
      pair * 5 +
      same.filter((x) => x.star === 2).length * 3 +
      fit * 3 +
      link * 2
    );
  };
  const buyShop = () => {
    for (const index of p.shop
      .map((_, i) => i)
      .sort(
        (a, b) =>
          desire(p.shop[b] ?? "guard") - desire(p.shop[a] ?? "guard") || a - b,
      )) {
      const id = p.shop[index];
      if (!id) continue;
      const score = desire(id),
        upgrade =
          p.pieces.filter((x) => x.defId === id && x.star === 1).length >= 2,
        needsBodies = p.pieces.length < p.level;
      if ((score < 3 && !needsBodies) || score < 0) continue;
      if (!upgrade && !needsBodies && p.gold - UNIT[id].cost < reserve)
        continue;
      if (
        p.pieces.filter((x) => x.position === null).length >= RULES.bench &&
        !upgrade
      ) {
        const expendable = p.pieces
          .filter(
            (x) =>
              x.position === null &&
              x.star === 1 &&
              p.pieces.filter((y) => y.defId === x.defId).length === 1,
          )
          .sort(
            (a, b) => desire(a.defId) - desire(b.defId) || a.uid - b.uid,
          )[0];
        if (expendable && score > desire(expendable.defId) + 2)
          actions.sell(g, p, expendable.uid);
      }
      actions.buy(g, p, index);
    }
  };
  deployLineup(p, g.difficulty);
  buyShop();
  const target = Math.min(
    10,
    3 + Math.floor(Math.max(0, g.round - settings.levelDelay) / 3),
  );
  for (
    let i = 0;
    i < settings.xpPurchases &&
    p.level < target &&
    p.pieces.length >= p.level &&
    p.gold >= reserve + 5;
    i++
  )
    actions.buyXp(g, p);
  for (let i = 0; i < settings.rolls && p.gold >= reserve + 6; i++) {
    actions.roll(g, p);
    buyShop();
  }
  deployLineup(p, g.difficulty);
  if (g.difficulty === "veteran") deployTactically(g, p);
  while (p.pieces.filter((x) => x.position === null).length > 6) {
    const candidates = p.pieces
      .filter((x) => x.position === null)
      .sort(
        (a, b) =>
          desire(a.defId) - desire(b.defId) ||
          pieceStrength(a) - pieceStrength(b),
      );
    actions.sell(g, p, candidates[0].uid);
  }
  equipBot(g, p);
}
