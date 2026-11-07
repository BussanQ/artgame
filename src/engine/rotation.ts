import { catalogUnit } from "../data/catalog";
import { UNITS, UNIT } from "../data/units";
import { traitTiers } from "../data/traits";
import { CURRENT_COMBAT_VERSION } from "./types";
import { random } from "./random";
import type { Game, Trait } from "./types";

/** Species only: professions such as sniper or assassin remain shared links. */
export const SERIES = [
  "步兵",
  "骑兵",
  "装甲",
  "野兽",
  "熊猫",
  "傀儡",
  "异虫",
  "空军",
  "海神",
  "不朽",
  "灵能",
  "猛禽",
  "陆行者",
] as const;
export type Series = (typeof SERIES)[number];
export type RecruitmentContext = Pick<Game, "bannedSeries"> &
  Partial<Pick<Game, "combatVersion" | "catalogVersion">>;
export function isRecruitable(game: RecruitmentContext, id: string): boolean {
  return (
    !!UNIT[id] && !game.bannedSeries?.some((t) => catalogUnit(game,id).traits.includes(t))
  );
}
export function availableUnits(game: RecruitmentContext) {
  return UNITS.map((u) => catalogUnit(game, u.id)).filter((u) =>
    isRecruitable(game, u.id),
  );
}
export function validBans(value: unknown): value is Series[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length === 3 &&
      new Set(value).size === 3 &&
      value.every((t) => SERIES.includes(t)))
  );
}
/** Keep early shops and several viable builds; an incomplete profession is still a usable unit. */
export function playableRotation(bannedSeries: readonly Series[]): boolean {
  const units = UNITS.filter(
    (u) => !bannedSeries.some((s) => u.traits.includes(s)),
  );
  if (
    units.length < 30 ||
    units.filter((u) => u.range === 1).length < 6 ||
    units.filter((u) => u.range > 1).length < 8
  )
    return false;
  if (
    [1, 2, 3, 4, 5].some(
      (cost) =>
        units.filter((u) => u.cost === cost).length < [4, 3, 3, 3, 2][cost - 1],
    )
  )
    return false;
  if (!units.some((u) => u.cost === 1 && u.range === 1)) return false;
  const professions = Object.entries(traitTiers(CURRENT_COMBAT_VERSION))
    .filter(([trait, tiers]) => {
      if (SERIES.includes(trait as Series)) return false;
      const count = units.filter((u) =>
        u.traits.includes(trait as Trait),
      ).length;
      return count >= tiers[0].count;
    })
    .map(([trait]) => trait);
  return (
    professions.length >= 3 &&
    professions.some((t) => ["护卫", "先锋"].includes(t)) &&
    professions.some((t) => ["狙击", "刺杀", "爆破", "攻城"].includes(t))
  );
}
const combinations: Series[][] = [];
for (let a = 0; a < SERIES.length - 2; a++)
  for (let b = a + 1; b < SERIES.length - 1; b++)
    for (let c = b + 1; c < SERIES.length; c++) {
      const banned = [SERIES[a], SERIES[b], SERIES[c]];
      if (playableRotation(banned)) combinations.push(banned);
    }
/** Independent seed stream: no consumption of the shared shop RNG, no per-round rerolls. */
export function randomBans(seed: number): Series[] {
  if (!combinations.length)
    throw new Error("No playable three-series rotation");
  let mixed = (seed ^ 0x51ed270b) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35);
  const rng = { seed: (mixed ^ (mixed >>> 16)) >>> 0 };
  return [...combinations[Math.floor(random(rng) * combinations.length)]];
}
export function rotationTraits(game: RecruitmentContext) {
  const units = availableUnits(game);
  return Object.entries(
    traitTiers(game.combatVersion ?? CURRENT_COMBAT_VERSION),
  ).map(([trait, tiers]) => ({
    trait,
    total: UNITS.filter((u) =>
      catalogUnit(game,u.id).traits.includes(trait as Trait),
    ).length,
    available: units.filter((u) => u.traits.includes(trait as Trait)).length,
    tiers: tiers.map((t) => t.count),
  }));
}
