import type { Fighter } from "./types";
const distance = (a: Fighter, b: Fighter) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function usesEnergy(f: Fighter) {
  return !f.signature || !["cavalry", "turtle", "tiger"].includes(f.defId);
}
export function skillReady(f: Fighter) {
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
    f.armor +
    (f.armorBuffUntil > tick ? f.armorBuff : 0) +
    carapaceArmor(f, tick)
  );
}
/** Bodyguards conceal fish; enemy fish reveal nearby targets. AoE still hits. */
export function concealed(f: Fighter, fighters: Fighter[]) {
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
export function attackTargets(source: Fighter, fighters: Fighter[]) {
  return fighters.filter(
    (e) =>
      e.side !== source.side &&
      e.hp > 0 &&
      (!source.signature || !concealed(e, fighters)),
  );
}
export function skillGauge(f: Fighter) {
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
