import { setFlight } from "./sea-ward";
import type { Fighter } from "./types";
import type { CombatContext } from "./abilities";
import {releaseDream,releaseDreamsFrom} from "./dream";

export const isPhoenixEgg = (fighter: Pick<Fighter, "phoenix">) =>
  !!fighter.phoenix && fighter.phoenix.eggUntil > 0;

/** Same identity and occupied cell; a breakable body, never an invulnerable soul. */
export function enterPhoenixEgg(ctx: CombatContext, fighter: Fighter) {
  const state = fighter.phoenix;
  if (!state || state.spent || fighter.star < 2 || fighter.hp > 0) return false;
  releaseDreamsFrom(ctx,fighter.uid);
  releaseDream(ctx,fighter,"target-lost");
  if (fighter.wildfire) fighter.wildfire.eggs++;
  state.spent = true;
  state.eggUntil = ctx.tick + 12;
  state.bodyMaxHp = fighter.maxHp;
  fighter.maxHp = fighter.hp = 800 * 2 ** (fighter.star - 2);
  fighter.shield = 0;
  fighter.mana = 0;
  fighter.stunUntil = 0;
  delete fighter.thornRoot;
  delete fighter.gazed;
  fighter.manaLockUntil = 0;
  delete fighter.silenceUntil;
  delete fighter.burn;
  delete fighter.corrosion;
  delete fighter.knockup;
  delete fighter.jungleLandings;
  delete fighter.taunt;
  fighter.armorBreak = 0;
  fighter.armorBreakUntil = 0;
  delete fighter.slow;
  delete fighter.attackSlows;
  delete fighter.mendHaste;
  if(fighter.formless)delete fighter.formless.active;
  delete fighter.sonic;
  delete fighter.windup;
  delete fighter.combo;
  delete fighter.command;
  delete fighter.bladeStorm;
  if (fighter.charm) {
    fighter.side = fighter.charm.side;
    fighter.attack = fighter.charm.attack;
    delete fighter.charm;
  }
  if (fighter.air) {
    setFlight(fighter, false);
    fighter.air.phaseUntil = 0;
    delete fighter.air.cast;
  }
  ctx.effects.push({
    source: fighter.uid,
    target: fighter.uid,
    kind: "rebirth",
    amount: 3,
    name: "涅槃火种",
    from: { x: fighter.x, y: fighter.y },
    to: { x: fighter.x, y: fighter.y },
  });
  return true;
}

/** Eggs keep their side alive, but a broken egg can never hatch on a later tick. */
export function hatchPhoenix(ctx: CombatContext) {
  for (const fighter of ctx.fighters) {
    const state = fighter.phoenix;
    if (
      !state ||
      !isPhoenixEgg(fighter) ||
      fighter.hp <= 0 ||
      state.eggUntil > ctx.tick
    )
      continue;
    state.eggUntil = 0;
    state.hatched = true;
    if (fighter.wildfire) fighter.wildfire.hatches++;
    fighter.maxHp = fighter.hp = state.bodyMaxHp;
    fighter.mana = 0;
    fighter.cooldown = 1;
    setFlight(fighter, true);
    ctx.effects.push({
      source: fighter.uid,
      target: fighter.uid,
      kind: "rebirth",
      amount: 0,
      name: "浴火重生",
      from: { x: fighter.x, y: fighter.y },
      to: { x: fighter.x, y: fighter.y },
    });
  }
}

/** Grid-aligned 5 × 3 rectangle, frozen at cast. Renderer uses the exact same cells. */
export function phoenixFlameCells(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const forward = horizontal
    ? { x: Math.sign(dx), y: 0 }
    : { x: 0, y: Math.sign(dy) || -1 };
  const cells: { x: number; y: number }[] = [];
  for (let distance = 1; distance <= 5; distance++)
    for (let width = -1; width <= 1; width++) {
      const x = from.x + forward.x * distance - forward.y * width;
      const y = from.y + forward.y * distance + forward.x * width;
      if (x >= 0 && x < 8 && y >= 0 && y < 8) cells.push({ x, y });
    }
  return cells;
}
