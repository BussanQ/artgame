import type { Fighter } from "./types";

/** Battle-local streams; campaign/shop RNG and blade-thrall's passive remain independent. */
export function seedAssassinStrikes(fighters: Fighter[]) {
  if (!fighters.some((f) => f.assassinCrit)) return;
  const opening = JSON.stringify(
    fighters.map((f) => [
      f.uid,
      f.defId,
      f.star,
      f.side,
      f.x,
      f.y,
      f.maxHp,
      f.attack,
      f.armor,
      f.interval,
      f.formationHaste ?? 0,
    ]),
  );
  let seed = 2166136261;
  for (let i = 0; i < opening.length; i++)
    seed = Math.imul(seed ^ opening.charCodeAt(i), 16777619) >>> 0;
  for (const f of fighters) if (f.assassinCrit) f.assassinCrit.seed = seed;
}

export function rollAssassinCritical(source: Fighter) {
  const state = source.assassinCrit;
  if (!state || source.summon) return false;
  let n =
    (Math.imul(source.uid, 374761393) ^
      Math.imul(++state.attempts, 668265263) ^
      (state.seed ?? 0) ^
      0xa55117) >>>
    0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  const critical = n / 4294967296 < state.chance;
  if (critical) state.crits++;
  return critical;
}
