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
  | "支援";
export type CombatVersion = "legacy" | "tactics" | "balanced" | "signature";
export type Difficulty = "relaxed" | "standard" | "veteran";
export interface UnitDef {
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
  supportHeal: number;
  supportMana: number;
}
export type DamageType = "physical" | "magic" | "true";
export interface CombatEffect {
  source: number;
  target: number;
  kind:
    | "cast"
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
