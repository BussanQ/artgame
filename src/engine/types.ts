export type Trait =
  | "步兵"
  | "装甲"
  | "野兽"
  | "熊猫"
  | "护卫"
  | "狙击"
  | "先锋"
  | "刺杀"
  | "骑兵"
  | "支援"
  | "召唤"
  | "傀儡"
  | "异虫"
  | "异能"
  | "空军"
  | "海神"
  | "攻城"
  | "爆破"
  | "不朽"
  | "灵能"
  | "猛禽"
  | "陆行者";
export type CombatVersion =
  | "legacy"
  | "tactics"
  | "balanced"
  | "signature"
  | "summons"
  | "legions"
  | "brood"
  | "airsea"
  | "fleet"
  | "metamorph"
  | "infantry"
  | "armored"
  | "puppets"
  | "wildfront"
  | "ambush"
  | "formations"
  | "counterplay"
  | "lineages"
  | "coalitions"
  | "aurora"
  | "qi"
  | "taotie";
export const CURRENT_COMBAT_VERSION: CombatVersion = "taotie";
export function hasQiRules(version: CombatVersion) {
  return version === "qi" || version === "taotie";
}
/** Sky-crab's recovered spell and versioned portrait. */
export function hasAuroraRules(version: CombatVersion) {
  return version === "aurora" || hasQiRules(version);
}
/** Early air/support/summon/siege rules, retained by subsequent unit updates. */
export function hasCoalitionRules(version: CombatVersion) {
  return version === "coalitions" || hasAuroraRules(version);
}
/** Corrected April/May professions and abnormal lifesteal. */
export function hasLineageRules(version: CombatVersion) {
  return version === "lineages" || hasCoalitionRules(version);
}
/** The cavalry recovery penalty and cumulative sniper/sea/psychic rules. */
export function hasCounterplayRules(version: CombatVersion) {
  return version === "counterplay" || hasLineageRules(version);
}
/** Pangolin's corrected definition, burrow skill and independent assassin opening jump. */
export function hasAmbushRules(version: CombatVersion) {
  return (
    version === "ambush" ||
    version === "formations" ||
    hasCounterplayRules(version)
  );
}
export type Difficulty = "relaxed" | "standard" | "veteran";
export interface UnitDef {
  flying?: boolean;
  id: string;
  name: string;
  cost: number;
  traits: Trait[];
  hp: number;
  attack: number;
  armor: number;
  armorPerStar?: number;
  range: number;
  interval: number;
  skill: string;
  color: string;
  glyph: string;
  initialMana?: number;
  /** Innate resistance and HP per second; absent on historical definitions. */
  magicResist?: number;
  regeneration?: number;
}
export interface Piece {
  /** Actual copies withdrawn from the pool, independent of discounted insect evolution. */
  copies?: number;
  uid: number;
  defId: string;
  star: number;
  position: number | null;
  items?: string[];
  encounterPower?: number;
}
export type AiProfileId =
  | "infantry"
  | "assassins"
  | "beasts"
  | "fleet"
  | "pandas"
  | "insects"
  | "psychic"
  | "armor"
  | "puppets";
export interface Player {
  /** Stable doctrine for new games; absent on legacy saves, which retain seat-based profiles. */
  aiProfile?: AiProfileId;
  id: number;
  name: string;
  hp: number;
  gold: number;
  level: number;
  xp: number;
  streak: number;
  pieces: Piece[];
  shop: (string | null)[];
  locked: boolean;
  inventory: string[];
  eliminatedRound?: number;
}
export interface Game {
  /** Unit price and pool tier at match creation; not changed by battle upgrades. */
  catalogVersion?: CombatVersion;
  /** Fixed for the whole match; absent on pre-rotation saves. */
  bannedSeries?: import("./rotation").Series[];
  combatVersion: CombatVersion;
  difficulty: Difficulty;
  seed: number;
  nextUid: number;
  round: number;
  phase: "prepare" | "battle" | "result" | "finished";
  players: Player[];
  pool: Record<string, number>;
  message: string;
  history: RoundReport[];
  encountersFromRound: number;
  reward: { round: number; choices: string[] } | null;
}
export interface RoundReport {
  combatVersion: CombatVersion;
  round: number;
  opponentId: number;
  opponentName: string;
  kind: "pvp" | "pve";
  reward?: string;
  winner: 0 | 1 | null;
  damage: number;
  income: number;
  hp: number;
  gold: number;
  left: Piece[];
  right: Piece[];
}
export interface Fighter {
  taotie?: { feasts: number; rage?: { until: number; attack: number } };
  innateRegen?: true;
  /** Client-card qi palm; absent on earlier arhat fighters. */
  qiSkill?: true;
  /** S50 sky-crab spell and per-battle additive 25% attack stacks; absent on old replays. */
  aurora?: { stacks: number };
  /** Versioned pangolin spell; absent on historical fighters. */
  burrowSkill?: true;
  /** Opening assassin formation, independent of blade-thrall's personal passive. */
  assassinCrit?: {
    chance: number;
    multiplier: number;
    attempts: number;
    crits: number;
    seed?: number;
  };
  /** Acid is battle-local, strongest active application wins with independent expiry. */
  corrosion?: { source: number; armor: number; until: number }[];
  /** Vertical presentation only; stun controls action timing and board occupancy stays unchanged. */
  knockup?: { start: number; until: number };
  /** Opening six-puppet team attack; carried into later summons, never own-trait attack. */
  teamAttack?: number;
  /** Personal plus team puppet attack, for the current fighter's displayed total only. */
  formationAttack?: number;
  /** Opening attack-speed ratio; personal two-beast speed is not inherited by summons. */
  formationHaste?: number;
  /** Four/six-beast team speed, also applied to later summons. */
  teamHaste?: number;
  /** Battle-local consecutive attack state; never stored on a permanent Piece. */
  gale?: { target: number | null; stacks: number; side: 0 | 1 };
  bladeCrit?: { attempts: number; crits: number; seed?: number };
  bladeStorm?: {
    until: number;
    next: number;
    remaining: number;
    damage: number;
  };
  /** Iron rooster grants; each source retains its own expiration. */
  command?: {
    source: number;
    side: 0 | 1;
    until: number;
    attack: number;
    armor: number;
  }[];
  bird?: {
    shots: number;
    draw?: { target: number; until: number; damage: number };
  };
  /** Enemy opening infantry formation; persists through cleanse and is inherited by summons. */
  infantryArmorBreak?: number;
  /** Per-battle active-skill cooldown, used by multi-pulse active skills. */
  skillReadyAt?: number;
  phoenix?: {
    spent: boolean;
    eggUntil: number;
    bodyMaxHp: number;
    hatched: boolean;
  };
  hawkForm?: { active: boolean };
  combo?: { target: number; next: number; remaining: number };

  groundBonus?: number;
  /** Opening three-summoner bonus; applies once per successful ordinary attack action. */
  damageManaBonus?: number;
  attackManaReady?: boolean;
  trueAttack?: boolean;
  devourSpent?: boolean;
  slow?: { until: number; multiplier: number };
  windup?: {
    until: number;
    target: number;
    damage: number;
    damageType?: DamageType;
  };
  sonic?: { source: number; next: number; remaining: number; damage: number }[];

  reflection?: number;
  immortal?: { duration: number; until: number; spent: boolean };
  air?: {
    /** Four-raptor benefit is shared by every flying ally, lost while on the ground. */
    groundBonus?: number;
    /** Early siege benefits direct skill damage and adds immortal targets. */
    siegeDirect?: true;
    /** Early sea formation; unbuffed opening resistance lets landing/rebirth restore the cap correctly. */
    seaWard?: number;
    seaBaseResist?: number;
    flying: boolean;
    evasion: number;
    attempts: number;
    seaMana: number;
    seaTick: number;
    siege: number;
    magicBreak: number;
    antiAir: boolean;
    phaseUntil: number;
    cast?: {
      kind:
        | "bomber"
        | "ark"
        | "eel"
        | "phoenix"
        | "whale"
        | "medic"
        | "motorcycle"
        | "ironape"
        | "irondog"
        | "specialist";
      target?: number; // Unit lock for specialist aiming; area spells keep only coordinates.
      next: number;
      remaining: number;
      damage: number;
      from: { x: number; y: number };
      to: { x: number; y: number };
    };
  };
  attackBoost?: { until: number; ratio: number };
  homeSide?: 0 | 1;
  energyMultiplier?: number;
  /** Opposing cavalry subtracts this from each positive energy recovery, after the multiplier. */
  energyPenalty?: number;
  /** Attacker-only flat physical armor penetration; never changes the target's debuffs. */
  armorPenetration?: number;
  deathBurst?: "ready" | "spent";
  charmCast?: "ready" | "spent";
  charm?: { until: number; attack: number; side: 0 | 1 };
  summoning?: { kind: "puppet" | "sentinel"; readyAt: number; spent: boolean };
  summonWard?: number;
  packCall?: "ready" | "spent";
  summon?: { owner: number; born: number; kind?: "puppet" | "sentinel" };
  signature?: {
    casts: number;
    attacks: number;
    concealed: boolean;
    carapace?: { start: number; until: number };
  };
  uid: number;
  defId: string;
  star: number;
  side: 0 | 1;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  armor: number;
  range: number;
  interval: number;
  cooldown: number;
  mana: number;
  damage: number;
  flash: boolean;
  shield: number;
  shieldUntil: number;
  stunUntil: number;
  hasteUntil: number;
  armorBreak: number;
  armorBreakUntil: number;
  healing: number;
  absorbed: number;
  lifesteal: number;
  /** Opening abnormal formation share; summons inherit this, never the owner's gear. */
  teamLifesteal?: number;
  skillPower: number;
  magicResist: number;
  regeneration: number;
  /** Armor formation regeneration per tick; opening bonus retained for the battle. */
  armorRegen?: number;
  attackShred: number;
  armorBuff: number;
  armorBuffUntil: number;
  manaLockUntil: number;
  silenceUntil?: number;
  burn?: { source: number; next: number; remaining: number; damage: number }[];
  supportHeal: number;
  supportMana: number;
}
export type DamageType = "physical" | "magic" | "true";
export interface CombatEffect {
  source: number;
  target: number;
  kind:
    | "slow"
    | "sonic"
    | "burn"
    | "flame"
    | "grenade"
    | "windup"
    | "devour"
    | "transform"
    | "rebirth"
    | "reflect"
    | "energize"
    | "chain"
    | "immortal"
    | "cast"
    | "pulse"
    | "heal"
    | "shield"
    | "stun"
    | "haste"
    | "break"
    | "teleport"
    | "knockback"
    | "fortify"
    | "cleanse"
    | "silence";
  amount: number;
  name: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}
export interface CombatEvent {
  assassinCritical?: boolean;
  /** Strengthened ordinary attack; still subject to attack defenses and lifesteal. */
  empowered?: boolean;
  /** Staff-thrall attack stack, separate from critical/empowered damage. */
  gale?: number;
  strike?: number;
  periodic?: boolean;
  reflected?: boolean;
  immune?: boolean;
  evaded?: boolean;
  attacker: number;
  target: number;
  amount: number;
  skill: boolean;
  ranged: boolean;
  damageType: DamageType;
  absorbed: number;
  primary: boolean;
  from: { x: number; y: number };
  to: { x: number; y: number };
}
export interface Frame {
  tick: number;
  fighters: Fighter[];
  events: CombatEvent[];
  effects: CombatEffect[];
}
export interface Battle {
  frames: Frame[];
  winner: 0 | 1 | null;
  damage: number;
}
