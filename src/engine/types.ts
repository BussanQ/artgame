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
  | "metamorph";
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
  range: number;
  interval: number;
  skill: string;
  color: string;
  glyph: string;
  initialMana?: number;
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
export interface Player {
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
  /** Per-battle active-skill cooldown, currently used by motorcycle cavalry. */
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
  trueAttack?: boolean;
  devourSpent?: boolean;
  slow?: { until: number; multiplier: number };
  windup?: { until: number; target: number; damage: number };
  sonic?: { source: number; next: number; remaining: number; damage: number }[];

  reflection?: number;
  immortal?: { duration: number; until: number; spent: boolean };
  air?: {
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
        | "motorcycle";
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
  skillPower: number;
  magicResist: number;
  regeneration: number;
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
