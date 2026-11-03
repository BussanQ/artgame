import { concealed } from "./triggers";
import {
  combatAttack,
  damage,
  distance,
  type CombatContext,
} from "./abilities";
import type { Fighter } from "./types";

/** One ordinary attack cycle becomes three real, independently mitigated contact hits. */
export function startHawkCombo(
  ctx: CombatContext,
  source: Fighter,
  target: Fighter,
) {
  if (!source.hawkForm?.active) return false;
  source.combo = { target: target.uid, next: ctx.tick + 1, remaining: 2 };
  damage(ctx, source, target, combatAttack(source, ctx.tick) * 0.6);
  if (source.hp <= 0 || target.hp <= 0) delete source.combo;
  return true;
}

export function advanceHawkCombo(ctx: CombatContext, source: Fighter): boolean {
  const combo = source.combo;
  if (!combo) return false;
  const target = ctx.fighters.find((f) => f.uid === combo.target);
  if (
    source.hp <= 0 ||
    source.charm ||
    source.stunUntil > ctx.tick ||
    !target ||
    target.hp <= 0 ||
    target.side === source.side ||
    distance(source, target) > source.range ||
    concealed(target, ctx.fighters, ctx.tick)
  ) {
    delete source.combo;
    return true;
  }
  if (combo.next > ctx.tick) return true;
  combo.remaining--;
  combo.next++;
  damage(ctx, source, target, combatAttack(source, ctx.tick) * 0.6);
  if (!combo.remaining || source.hp <= 0 || target.hp <= 0) delete source.combo;
  return true;
}
