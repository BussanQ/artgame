import type { Player } from "./types";

/** Single-player income progression, shared by the commander and all AI. */
export const INCOME_TIERS = [
  { round: 1, gold: 5 },
  { round: 6, gold: 7 },
  { round: 11, gold: 9 },
  { round: 16, gold: 11 },
  { round: 21, gold: 13 },
  { round: 26, gold: 15 },
] as const;

export function baseIncome(round: number): number {
  return INCOME_TIERS.reduce<number>(
    (gold, tier) => (round >= tier.round ? tier.gold : gold),
    INCOME_TIERS[0].gold,
  );
}

/** Call with the updated streak but the balance BEFORE the current payout. */
export function incomeBreakdown(
  player: Pick<Player, "gold" | "streak">,
  won: boolean,
  round: number,
) {
  const base = baseIncome(round),
    interest = Math.min(5, Math.floor(player.gold / 10)),
    victory = won ? 1 : 0,
    streak = Math.min(3, Math.floor(Math.abs(player.streak) / 3));
  return {
    base,
    interest,
    victory,
    streak,
    total: base + interest + victory + streak,
  };
}

export function income(
  player: Pick<Player, "gold" | "streak">,
  won: boolean,
  round: number,
): number {
  return incomeBreakdown(player, won, round).total;
}
