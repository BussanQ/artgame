import { rankings } from "./game";
import type { Game, RoundReport } from "./types";

/** Derived from settled history; never awards currency or mutates a finished run. */
export function matchSummary(game: Game) {
  if (game.phase !== "finished" || !game.history.length) return null;
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
    lineup: game.history.at(-1)!.left,
    standings,
  };
}
