import type { Battle } from "../engine/types";
import { UNIT } from "../data/units";
import { RANGED_ACTIONS, isRanged } from "../render/ranged";
import { MELEE_ACTIONS, isMelee } from "../render/melee";
import { ATTACK_SOUND, type SoundKind } from "./synthesis";
export interface SoundCue {
  time: number;
  kind: SoundKind;
  pan: number;
  priority: number;
}
/** Playback-owned cursor: settings/rendering changes must not replay old attacks. */
export class BattleSoundTrack {
  private cues: SoundCue[] = [];
  private cursor = 0;
  private previous = 0;
  private battle: Battle | null = null;
  reset(battle: Battle, time: number) {
    this.battle = battle;
    this.cues = [];
    for (let index = 0; index < battle.frames.length; index++) {
      const frame = battle.frames[index];
      const fighters = new Map(frame.fighters.map((f) => [f.uid, f]));
      const casters = new Set<number>();
      for (const effect of frame.effects) {
        if (
          !["cast", "pulse", "tar", "immortal", "rebirth"].includes(
            effect.kind,
          ) ||
          casters.has(effect.source)
        )
          continue;
        casters.add(effect.source);
        const f = fighters.get(effect.source);
        if (!f) continue;
        const support = [
          "fish",
          "deer",
          "monk",
          "repair",
          "acolyte",
          "medic",
        ].includes(f.defId) && !f.secretOrb;
        this.cues.push({
          time: index,
          kind:
            effect.kind === "immortal" || effect.kind === "rebirth"
              ? "chime"
              : effect.kind === "tar"
                ? "blast"
                : f.aurora
                  ? "beam"
                  : f.burrowSkill ||
                      ["shieldthrall", "elephant"].includes(f.defId)
                    ? "impact"
                    : f.defId === "venombeast"
                      ? "cast"
                      : ["axethrall", "swordthrall"].includes(f.defId)
                        ? "blade"
                        : ["ironrooster", "lingjiu"].includes(f.defId)
                          ? "chime"
                          : effect.kind === "pulse"
                            ? [
                                "bomber",
                                "motorcycle",
                                "phoenix",
                                "irondog",
                                "ironape",
                              ].includes(f.defId)
                              ? "blast"
                              : "beam"
                            : support
                              ? "heal"
                              : "cast",
          pan: (effect.from.x / 7) * 1.4 - 0.7,
          priority: 2,
        });
      }
      for (const event of frame.events) {
        // A multi-target skill produces one cast sound, not one sound per victim.
        if (!event.primary || event.skill) continue;
        const fighter = fighters.get(event.attacker);
        if (!fighter || !UNIT[fighter.defId]) continue;
        const id = fighter.defId;
        const version = id === "panda" && !fighter.shuriken ? "wushi-control" :
          id === "monk" && !fighter.secretOrb ? "shuriken" : undefined;
        const offset = event.strike
          ? 0.28
          : isRanged(id,version)
            ? RANGED_ACTIONS[id].duration * RANGED_ACTIONS[id].fireAt
            : isMelee(id,version)
              ? MELEE_ACTIONS[id].duration * 0.28
              : 0;
        this.cues.push({
          time: index + offset,
          kind: ATTACK_SOUND[id],
          pan: (event.from.x / 7) * 1.4 - 0.7,
          priority:
            event.assassinCritical ||
            (id === "bladethrall" && event.empowered) ||
            event.gale === 10
              ? 2
              : 1,
        });
      }
    }
    this.cues.sort((a, b) => a.time - b.time);
    this.previous = time;
    this.cursor = this.cues.findIndex((c) => c.time >= time);
    if (this.cursor < 0) this.cursor = this.cues.length;
  }
  take(battle: Battle, time: number, audible: boolean): SoundCue[] {
    if (this.battle !== battle || time < this.previous)
      this.reset(battle, time);
    this.previous = time;
    const due: SoundCue[] = [];
    while (
      this.cursor < this.cues.length &&
      this.cues[this.cursor].time <= time
    ) {
      const cue = this.cues[this.cursor++];
      if (audible && cue.time >= time - 2) due.push(cue);
    }
    return due
      .sort((a, b) => b.priority - a.priority || b.time - a.time)
      .slice(0, 4);
  }
}
