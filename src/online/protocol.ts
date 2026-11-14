import type { Game, Piece, Player } from "../engine/types";

export const FRAME_MS = 125;

export type Order =
  | { kind: "start" | "leave" | "ready" | "roll" | "lock" | "xp" | "deploy" }
  | { kind: "buy"; index: number }
  | { kind: "sell"; uid: number }
  | { kind: "move"; uid: number; position: number | null }
  | { kind: "equip" | "unequip"; uid: number; index: number }
  | { kind: "craft"; item: string };

export interface Duel {
  left: Piece[];
  right: Piece[];
  names: [string, string];
  side: 0 | 1;
  winner: 0 | 1 | null;
  ticks: number;
}

export interface RoomView {
  code: string;
  host: number;
  me: number;
  phase: "lobby" | Game["phase"];
  round: number;
  revision: number;
  sequence: number;
  serverTime: number;
  until: number;
  battleStart: number;
  seats: { id: number; name: string; human: boolean; ready: boolean; hp: number }[];
  player?: Player;
  bans?: Game["bannedSeries"];
  duel?: Duel;
}

export interface Ticket { code: string; secret: string }
