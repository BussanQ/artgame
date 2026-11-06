import { rankings } from "./game";
import type { Game, RoundReport } from "./types";

/** Historical view only: never restore eliminated pieces or items to live ownership. */
export function finalPlayerSnapshot(game: Game) {
  const last = game.history.at(-1);
  if (game.phase !== "finished" || !last) return null;
  const player = game.players[0];
  return {
    combatVersion: last.combatVersion,
    lineup: last.left,
    // Surviving old saves still have their final reserves and inventory.
    // An eliminated old save cannot recover missing data reliably.
    bench:
      last.bench ??
      (player.hp > 0
        ? player.pieces.filter((piece) => piece.position === null)
        : undefined),
    inventory: last.inventory ?? (player.hp > 0 ? player.inventory : undefined),
  };
}

/** Derived from settled history; never awards currency or mutates a finished run. */
export function matchSummary(game: Game) {
  const final = finalPlayerSnapshot(game);
  if (!final) return null;
  const standings = rankings(game);
  const rank = standings.findIndex((p) => p.id === 0) + 1;
  const pvp = game.history.filter((r) => r.kind === "pvp");
  const pve = game.history.filter((r) => r.kind === "pve");
  const wins = (reports: RoundReport[]) =>
    reports.filter((r) => r.winner === 0).length;
  let streak = 0,
    bestStreak = 0;
  for (const r of pvp) {
    streak = r.winner === 0 ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }
  const reason =
    game.players[0].hp === 0
      ? "eliminated"
      : standings.filter((p) => p.hp > 0).length === 1
        ? "last-standing"
        : "round-limit";
  return {
    rank,
    reason,
    champion: rank === 1 && game.players[0].hp > 0,
    rounds: game.history.length,
    wins: wins(pvp),
    losses: pvp.filter((r) => r.winner === 1).length,
    draws: pvp.filter((r) => r.winner === null).length,
    pveWins: wins(pve),
    pveRounds: pve.length,
    bestStreak,
    totalIncome: game.history.reduce((n, r) => n + r.income, 0),
    damageTaken: game.history.reduce((n, r) => n + r.damage, 0),
    // Eliminated players have already returned their live pieces to the pool.
    lineup: final.lineup,
    bench: final.bench,
    standings,
  };
}
