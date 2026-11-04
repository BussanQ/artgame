import { isPhoenixEgg } from "./phoenix";
import { commandBonuses } from "./ironrooster";
import type { Fighter } from "./types";
const distance = (a: Fighter, b: Fighter) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function usesEnergy(f: Fighter) {
  if (f.defId === "birdrider" || f.bladeStorm) return false;
  if (
    isPhoenixEgg(f) ||
    f.hawkForm?.active ||
    f.devourSpent ||
    f.deathBurst ||
    f.charm ||
    f.charmCast === "spent"
  )
    return false;
  if (f.summon || f.packCall === "spent" || f.summoning?.spent) return false;
  return !f.signature || !["cavalry", "turtle", "tiger"].includes(f.defId);
}
export function skillReady(f: Fighter) {
  if (f.defId === "birdrider" || f.bladeStorm) return false;
  if (f.air?.cast || f.windup || f.combo) return false;
  if (
    isPhoenixEgg(f) ||
    f.hawkForm?.active ||
    f.devourSpent ||
    f.deathBurst ||
    f.charm ||
    f.charmCast === "spent"
  )
    return false;
  if (f.summon || f.packCall === "spent" || f.summoning?.spent) return false;
  if (!f.signature || usesEnergy(f)) return f.mana >= 100;
  if (f.defId === "tiger") return f.signature.attacks % 4 === 0;
  return f.signature.casts === 0;
}
export function carapaceArmor(f: Fighter, tick: number) {
  const shell = f.signature?.carapace;
  if (!shell) return 0;
  return (
    12 *
    Math.max(0, Math.min(1, (shell.until - tick) / (shell.until - shell.start)))
  );
}
export function effectiveArmor(f: Fighter, tick: number) {
  return (
    f.armor -
    (f.infantryArmorBreak ?? 0) +
    Math.max(
      f.armorBuffUntil > tick ? f.armorBuff : 0,
      commandBonuses(f, tick).armor,
    ) +
    carapaceArmor(f, tick)
  );
}
/** Bodyguards conceal fish; enemy fish reveal nearby targets. AoE still hits. */
export function concealed(f: Fighter, fighters: Fighter[], tick = 0) {
  if (f.hp > 0 && f.air && f.air.phaseUntil > tick) return true;
  if (!f.signature || f.defId !== "fish" || f.hp <= 0) return false;
  const protectedBy = fighters.some(
    (a) =>
      a.side === f.side &&
      a.hp > 0 &&
      a.defId !== "fish" &&
      distance(a, f) <= 1,
  );
  if (!protectedBy) return false;
  return !fighters.some(
    (e) =>
      e.side !== f.side &&
      e.hp > 0 &&
      e.defId === "fish" &&
      distance(e, f) <= 3,
  );
}
export function attackTargets(source: Fighter, fighters: Fighter[], tick = 0) {
  return fighters.filter(
    (e) =>
      e.side !== source.side &&
      e.hp > 0 &&
      (!source.signature || !concealed(e, fighters, tick)),
  );
}
export function skillGauge(f: Fighter) {
  if (f.bladeStorm)
    return { progress: f.bladeStorm.remaining / 6, color: "#a9eadc" };
  if (f.bird)
    return {
      progress: f.bird.draw ? 1 : f.bird.shots / (7 - f.star),
      color: "#dceea0",
    };
  if (
    isPhoenixEgg(f) ||
    f.hawkForm?.active ||
    f.devourSpent ||
    f.deathBurst ||
    f.charm ||
    f.charmCast === "spent"
  )
    return { progress: 0, color: "#b8d597" };
  if (f.summon || f.packCall === "spent" || f.summoning?.spent)
    return { progress: 0, color: "#74bce7" };
  if (!f.signature || usesEnergy(f))
    return { progress: f.mana / 100, color: "#74bce7" };
  if (f.defId === "tiger")
    return {
      progress:
        f.signature.attacks % 4 === 0 ? 1 : (f.signature.attacks % 4) / 4,
      color: "#edc777",
    };
  return { progress: f.signature.casts === 0 ? 1 : 0, color: "#b8d597" };
}
