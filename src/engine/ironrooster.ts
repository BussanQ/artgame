import type { CombatContext } from "./abilities";
import type { Fighter } from "./types";
import { isPhoenixEgg } from "./phoenix";
import { isUndying } from "./immortality";

/** Source-separated grants keep a weaker refresh from extending a stronger buff. */
export function commandBonuses(f: Fighter, tick: number) {
  let attack = 0,
    armor = 0;
  if (f.hp <= 0 || isPhoenixEgg(f) || isUndying(f)) return { attack, armor };
  for (const grant of f.command ?? []) {
    if (grant.until <= tick || grant.side !== f.side) continue;
    attack = Math.max(attack, grant.attack);
    armor = Math.max(armor, grant.armor);
  }
  return { attack, armor };
}

/** The pulse grants a timed buff, not an aura. Later arrivals do not inherit it. */
export function rallyAllies(ctx: CombatContext, source: Fighter) {
  const attack = (5 + source.star * 10) / 100;
  const armor = 1 + source.star * 2;
  source.skillReadyAt = ctx.tick + 52;
  for (const ally of ctx.fighters) {
    if (
      ally.hp <= 0 ||
      ally.side !== source.side ||
      ally.charm ||
      isPhoenixEgg(ally) ||
      isUndying(ally) ||
      Math.abs(ally.x - source.x) + Math.abs(ally.y - source.y) > 3
    )
      continue;
    ally.command = [
      ...(ally.command ?? []).filter(
        (g) => g.until > ctx.tick && g.source !== source.uid,
      ),
      {
        source: source.uid,
        side: source.side,
        until: ctx.tick + 24,
        attack,
        armor,
      },
    ];
    ctx.effects.push({
      kind: "fortify",
      source: source.uid,
      target: ally.uid,
      amount: armor,
      name: "战术协同",
      from: { x: source.x, y: source.y },
      to: { x: ally.x, y: ally.y },
    });
  }
}
