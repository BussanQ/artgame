import type { Fighter } from "./types";

/** Recompute only sea-era resistance; historical flying changes retain their exact snapshots. */
export function setFlight(f: Fighter, flying: boolean) {
  if (!f.air) return;
  f.air.flying = flying;
  if (f.air.seaBaseResist !== undefined)
    f.magicResist = Math.max(
      -0.25,
      Math.min(
        0.75,
        f.air.seaBaseResist + (flying ? (f.air.seaWard ?? 0) : 0),
      ) - f.air.magicBreak,
    );
}
