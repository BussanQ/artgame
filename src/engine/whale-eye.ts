import { EQUIPMENT_SKILLS, WHALE_EYE } from "../data/items";
import { damage, type CombatContext } from "./abilities";
import type { Fighter } from "./types";

export const emptySeaFog = (): NonNullable<NonNullable<Fighter["equipmentSkills"]>["fog"]> => ({
  readyAt: EQUIPMENT_SKILLS.opening,
  activations: 0,
  detonations: 0,
  hits: 0,
  damage: 0,
  shieldDamage: 0,
  energyRecovered: 0,
});

/** The holder's normal control checks run before this independent equipment action. */
export function releaseSeaFog(ctx: CombatContext, source: Fighter) {
  const state = source.equipmentSkills?.fog;
  if (!state || state.pending || state.readyAt > ctx.tick ||
      !ctx.fighters.some(f => f.hp > 0 && f.side !== source.side)) return false;
  state.activations++;
  state.readyAt = ctx.tick + WHALE_EYE.cooldown;
  state.pending = {
    start: ctx.tick,
    landAt: ctx.tick + WHALE_EYE.delay,
    side: source.side,
    from: { x: source.x, y: source.y },
  };
  return true;
}

/** A released fog is committed. Resolve it even if its owner has since died or changed sides;
 * the shared battle loop still ends immediately when a side has no surviving actors. */
export function advanceSeaFogs(ctx: CombatContext) {
  const holders = ctx.fighters.filter(f => f.equipmentSkills?.fog?.pending).sort((a, b) => a.uid - b.uid);
  if (ctx.tick % 2) holders.reverse();
  for (const source of holders) {
    const state = source.equipmentSkills!.fog!, pending = state.pending!;
    if (pending.landAt > ctx.tick) continue;
    delete state.pending;
    state.detonations++;
    ctx.effects.push({ source: source.uid, target: source.uid, kind: "equipment",
      name: "巨鲸之眼·海雾", amount: WHALE_EYE.damage,
      from: { ...pending.from }, to: { x: 3.5, y: 3.5 } });
    const targets = ctx.fighters.filter(f => f.uid !== source.uid && f.hp > 0 && f.side !== pending.side)
      .sort((a, b) => a.uid - b.uid);
    for (const target of targets) {
      if (target.hp <= 0 || target.side === pending.side) continue;
      const start = ctx.events.length;
      const actual = damage(ctx, source, target, WHALE_EYE.damage, "magic", true,
        true, 0, false, false, false, false, 0, true, false,
        { side: pending.side, from: pending.from });
      const packet = ctx.events.slice(start).find(e => e.attacker === source.uid &&
        e.target === target.uid && e.skill && e.primary && !e.reflected);
      if (packet) {
        packet.item = "whale-eye";
        state.shieldDamage += packet.absorbed;
        if (actual > 0 || packet.absorbed > 0) state.hits++;
      }
      state.damage += actual;
    }
  }
}
