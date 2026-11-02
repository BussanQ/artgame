export type Trait =
  | "步兵"
  | "装甲"
  | "野兽"
  | "熊猫"
  | "护卫"
  | "狙击"
  | "先锋"
  | "刺杀";
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
}
export interface Piece {
  uid: number;
  defId: string;
  star: number;
  position: number | null;
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
  eliminatedRound?: number;
}
export interface Game {
  seed: number;
  nextUid: number;
  round: number;
  phase: "prepare" | "battle" | "result" | "finished";
  players: Player[];
  pool: Record<string, number>;
  message: string;
}
export interface Fighter {
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
}
export interface CombatEvent {
  attacker: number;
  target: number;
  amount: number;
  skill: boolean;
  ranged: boolean;
  from: { x: number; y: number };
  to: { x: number; y: number };
}
export interface Frame {
  tick: number;
  fighters: Fighter[];
  events: CombatEvent[];
}
export interface Battle {
  frames: Frame[];
  winner: 0 | 1 | null;
  damage: number;
}
