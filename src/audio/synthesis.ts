/** Original procedural effects. No recordings or external audio downloads. */
export type SoundKind =
  | "blade"
  | "impact"
  | "claw"
  | "shot"
  | "blast"
  | "beam"
  | "bow"
  | "chime"
  | "heal"
  | "cast"
  | "start"
  | "win"
  | "loss"
  | "draw"
  | "buy"
  | "merge"
  | "place"
  | "reward";
export const ATTACK_SOUND: Record<string, SoundKind> = {
  lingjiu: "chime",
  elephant: "impact",
  venombeast: "claw",
  staffthrall: "impact",
  shieldthrall: "impact",
  bladethrall: "blade",
  swordthrall: "blade",
  axethrall: "blade",
  motorcycle: "blast",
  ironrooster: "shot",
  birdrider: "bow",
  specialist: "shot",
  irondog: "impact",
  ironape: "impact",
  phoenix: "blast",
  medic: "shot",
  flametrooper: "blast",
  grenadier: "blast",
  whale: "chime",
  bat: "chime",
  bloodhawk: "claw",
  skytoad: "impact",
  vajra: "impact",
  arhat: "chime",
  winddragon: "beam",
  acolyte: "chime",
  stormcaller: "cast",
  thunderlord: "beam",
  vine: "claw",
  treant: "impact",
  bonedragon: "beam",
  repair: "beam",
  bomber: "blast",
  ghostjet: "shot",
  ark: "beam",
  skycrab: "chime",
  eel: "beam",
  blastbug: "claw",
  eyebug: "beam",
  spider: "chime",
  wasp: "bow",
  adept: "chime",
  shark: "claw",
  guard: "impact",
  pangolin: "impact",
  panda: "blade",
  lion: "claw",
  monk: "chime",
  wolf: "claw",
  master: "blade",
  titan: "impact",
  cavalry: "blade",
  shadowblade: "blade",
  turtle: "impact",
  bull: "impact",
  infantry: "shot",
  sniper: "shot",
  chariot: "blast",
  cannon: "beam",
  dragonfly: "chime",
  tiger: "bow",
  fish: "chime",
  deer: "chime",
};
// duration, start frequency, end frequency, noise mix
const TIMBRES: Partial<
  Record<SoundKind, readonly [number, number, number, number]>
> = {
  blade: [0.16, 1100, 220, 0.72],
  impact: [0.23, 150, 42, 0.5],
  claw: [0.18, 380, 75, 0.7],
  shot: [0.13, 230, 55, 0.85],
  blast: [0.48, 110, 28, 0.8],
  beam: [0.33, 850, 140, 0.12],
  bow: [0.21, 460, 120, 0.3],
  chime: [0.38, 880, 660, 0.02],
  heal: [0.55, 440, 880, 0.01],
  cast: [0.38, 180, 720, 0.12],
  place: [0.09, 280, 160, 0.1],
};
const NOTES: Partial<Record<SoundKind, readonly number[]>> = {
  start: [196, 294, 392],
  win: [392, 494, 587, 784],
  loss: [294, 247, 196],
  draw: [294, 294],
  buy: [660, 880],
  merge: [392, 494, 587, 784],
  reward: [523, 659, 784],
};
export function synthesize(kind: SoundKind, sampleRate: number): Float32Array {
  const notes = NOTES[kind];
  const spec = TIMBRES[kind] ?? [0.2, 440, 220, 0];
  const duration = notes ? notes.length * 0.13 + 0.22 : spec[0];
  const data = new Float32Array(Math.ceil(duration * sampleRate));
  let random = 8713,
    lowNoise = 0,
    phase = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    if (notes) {
      let value = 0;
      notes.forEach((frequency, index) => {
        const age = t - index * 0.13;
        if (age < 0 || age > 0.3) return;
        const envelope =
          Math.min(1, age / 0.008) *
          Math.exp(-age * 12) *
          Math.min(1, (0.3 - age) / 0.03);
        value += Math.sin(2 * Math.PI * frequency * age) * envelope * 0.3;
      });
      data[i] = value;
    } else {
      const progress = t / duration;
      phase +=
        (2 * Math.PI * (spec[1] * (spec[2] / spec[1]) ** progress)) /
        sampleRate;
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const noise = random / 2147483648 - 1;
      lowNoise += 0.14 * (noise - lowNoise);
      const filtered =
        kind === "blast" || kind === "impact" ? lowNoise * 2 : noise - lowNoise;
      const envelope =
        Math.min(1, t / 0.004) *
        Math.exp(-progress * 5) *
        Math.min(1, (duration - t) / 0.025);
      const tone = Math.sin(phase) * 0.8 + Math.sin(phase * 2.01) * 0.2;
      data[i] = (tone * (1 - spec[3]) + filtered * spec[3]) * envelope * 0.55;
    }
  }
  return data;
}
