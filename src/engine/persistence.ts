import { isRecruitable, validBans } from "./rotation";
import { isAiProfileId } from "../data/ai-profiles";
import { CURRENT_COMBAT_VERSION } from "./types";
import { ITEM, COMPONENTS } from "../data/items";
import {
  SWORDTHRALL_ADDITIONS,
  AXETHRALL_ADDITIONS,
  COPIES,
  RULES,
  UNIT,
  UNITS,
  XP,
  ROSTER_ADDITIONS,
  LEGION_ADDITIONS,
  BROOD_ADDITIONS,
  AIRSEA_ADDITIONS,
  IMMORTAL_ADDITIONS,
  PSYCHIC_ADDITIONS,
  WILD_ADDITIONS,
  PHOENIX_ADDITIONS,
  WHALE_ADDITIONS,
  MEDIC_ADDITIONS,
  INFANTRY_ADDITIONS,
  MOTORCYCLE_ADDITIONS,
  IRONDOG_ADDITIONS,
  SPECIALIST_ADDITIONS,
  BIRDRIDER_ADDITIONS,
  IRONAPE_ADDITIONS,
  IRONROOSTER_ADDITIONS,
} from "../data/units";
import { isInsect, pieceCopies } from "./progression";
import type { Game, Piece, RoundReport } from "./types";

export const SAVE_KEY = "red-tides.singleplayer.save";
export const BACKUP_KEY = `${SAVE_KEY}.backup`;
export const RECOVERY_KEY = `${SAVE_KEY}.recovery`;
export const SAVE_SCHEMA = 32;
export interface PlaybackSave {
  time: number;
  speed: 1 | 2 | 4;
  paused: boolean;
}
export interface SaveData {
  schema: number;
  rules: string;
  savedAt: number;
  revision: number;
  game: Game;
  playback: PlaybackSave;
}
export type SaveStatus =
  | "saved"
  | "migrated"
  | "empty"
  | "recovered"
  | "damaged"
  | "incompatible"
  | "unavailable"
  | "conflict";
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max && !/[<>&]/.test(v);
function validItems(v: unknown, limit: number): v is string[] {
  return (
    Array.isArray(v) &&
    v.length <= limit &&
    v.every((id) => typeof id === "string" && Object.hasOwn(ITEM, id))
  );
}
function validPiece(v: unknown): v is Piece {
  return (
    record(v) &&
    integer(v.uid, 1, 1e9) &&
    typeof v.defId === "string" &&
    Object.hasOwn(UNIT, v.defId) &&
    integer(v.star, 1, 3) &&
    (v.copies === undefined ||
      (isInsect(v.defId) &&
        integer(v.copies, 2 ** (v.star - 1), 3 ** (v.star - 1)))) &&
    (v.items === undefined || validItems(v.items, 3)) &&
    (v.encounterPower === undefined ||
      (typeof v.encounterPower === "number" &&
        Number.isFinite(v.encounterPower) &&
        v.encounterPower >= 0.1 &&
        v.encounterPower <= 3)) &&
    (v.position === null || integer(v.position, 32, 63))
  );
}
function validLineup(v: unknown): v is Piece[] {
  return (
    Array.isArray(v) &&
    v.length <= 10 &&
    v.every((p) => validPiece(p) && p.position !== null) &&
    new Set(v.map((p) => p.position)).size === v.length &&
    new Set(v.map((p) => p.uid)).size === v.length
  );
}
function validReport(v: unknown): v is RoundReport {
  return (
    record(v) &&
    integer(v.round, 1, RULES.maxRounds) &&
    (v.combatVersion === "legacy" ||
      v.combatVersion === "tactics" ||
      v.combatVersion === "balanced" ||
      v.combatVersion === "signature" ||
      v.combatVersion === "summons" ||
      v.combatVersion === "legions" ||
      v.combatVersion === "brood" ||
      v.combatVersion === "airsea" ||
      v.combatVersion === "fleet" ||
      v.combatVersion === "metamorph" ||
      v.combatVersion === "infantry" ||
      v.combatVersion === "armored") &&
    ((v.kind === "pve" && v.opponentId === -1) ||
      (v.kind === "pvp" && integer(v.opponentId, 1, 7))) &&
    text(v.opponentName, 60) &&
    (v.reward === undefined ||
      (typeof v.reward === "string" && COMPONENTS.includes(v.reward))) &&
    (v.winner === 0 || v.winner === 1 || v.winner === null) &&
    integer(v.damage, 0, 100) &&
    integer(v.income, 0, 100) &&
    integer(v.hp, 0, 100) &&
    integer(v.gold, 0, 1e6) &&
    validLineup(v.left) &&
    v.left.length > 0 &&
    validLineup(v.right) &&
    new Set([...v.left, ...v.right].map((p) => p.uid)).size ===
      v.left.length + v.right.length
  );
}
/** Reject broken money/population/card-pool state before it reaches the engine or UI. */
export function validGame(value: unknown): value is Game {
  if (!record(value)) return false;
  const g = value as unknown as Game;
  if (
    !integer(g.seed, 0, 0xffffffff) ||
    !validBans(g.bannedSeries) ||
    ![
      "legacy",
      "tactics",
      "balanced",
      "signature",
      "summons",
      "legions",
      "brood",
      "airsea",
      "fleet",
      "metamorph",
      "infantry",
      "armored",
    ].includes(g.combatVersion) ||
    !["relaxed", "standard", "veteran"].includes(g.difficulty) ||
    !integer(g.nextUid, 1, 1e9) ||
    !integer(g.round, 1, RULES.maxRounds) ||
    !integer(g.encountersFromRound, 1, RULES.maxRounds + 1) ||
    !["prepare", "battle", "result", "finished"].includes(g.phase) ||
    !text(g.message, 500) ||
    !Array.isArray(g.players) ||
    g.players.length !== 8 ||
    !record(g.pool) ||
    !Array.isArray(g.history) ||
    g.history.length > RULES.maxRounds
  )
    return false;
  const uids = new Set<number>(),
    counts = Object.fromEntries(UNITS.map((u) => [u.id, 0]));
  for (const [index, p] of g.players.entries()) {
    if (
      !record(p) ||
      p.id !== index ||
      (p.aiProfile !== undefined &&
        (index === 0 || !isAiProfileId(p.aiProfile))) ||
      !text(p.name, 60) ||
      !integer(p.hp, 0, 100) ||
      !integer(p.gold, 0, 1e6) ||
      !integer(p.level, 1, 10) ||
      !integer(p.xp, 0, p.level === 10 ? 0 : XP[p.level] - 1) ||
      !integer(p.streak, -g.round, g.round) ||
      typeof p.locked !== "boolean" ||
      !Array.isArray(p.pieces) ||
      p.pieces.length > p.level + RULES.bench ||
      !validItems(p.inventory, 200) ||
      !Array.isArray(p.shop)
    )
      return false;
    if (p.hp === 0) {
      if (
        !integer(p.eliminatedRound, 1, g.round) ||
        p.pieces.length ||
        p.shop.length
      )
        return false;
    } else if (p.eliminatedRound !== undefined || p.shop.length !== RULES.shop)
      return false;
    const occupied = new Set<number>();
    let bench = 0;
    for (const piece of p.pieces) {
      if (
        !validPiece(piece) ||
        piece.encounterPower !== undefined ||
        uids.has(piece.uid) ||
        piece.uid >= g.nextUid
      )
        return false;
      uids.add(piece.uid);
      counts[piece.defId] += pieceCopies(piece);
      if (piece.position === null) bench++;
      else {
        if (occupied.has(piece.position)) return false;
        occupied.add(piece.position);
      }
    }
    if (occupied.size > p.level || bench > RULES.bench) return false;
    for (const id of p.shop) {
      if (id !== null && (typeof id !== "string" || !Object.hasOwn(UNIT, id)))
        return false;
      if (id) counts[id]++;
    }
  }
  if (Object.keys(g.pool).length !== UNITS.length) return false;
  for (const u of UNITS)
    if (
      !integer(g.pool[u.id], 0, COPIES[u.cost]) ||
      g.pool[u.id] + counts[u.id] !==
        (isRecruitable(g, u.id) ? COPIES[u.cost] : 0)
    )
      return false;
  const settled = g.phase === "result" || g.phase === "finished";
  if (
    g.history.length !== g.round - (settled ? 0 : 1) ||
    !g.history.every(
      (r, i) =>
        validReport(r) &&
        r.round === i + 1 &&
        r.left.every((p) => isRecruitable(g, p.defId)) &&
        (r.kind === "pve" || r.right.every((p) => isRecruitable(g, p.defId))),
    )
  )
    return false;
  if (g.history.length && g.history.at(-1)!.hp !== g.players[0].hp)
    return false;
  if (g.reward !== null) {
    if (
      !record(g.reward) ||
      g.phase !== "result" ||
      g.reward.round !== g.round ||
      !validItems(g.reward.choices, 3) ||
      g.reward.choices.length < 2 ||
      !g.reward.choices.every((id) => COMPONENTS.includes(id)) ||
      new Set(g.reward.choices).size !== g.reward.choices.length ||
      g.history.at(-1)?.kind !== "pve" ||
      g.history.at(-1)?.reward
    )
      return false;
  }
  const terminal =
    g.players[0].hp === 0 ||
    g.players.filter((p) => p.hp > 0).length <= 1 ||
    (settled && g.round === RULES.maxRounds);
  if ((g.phase === "finished") !== terminal) return false;
  if (
    g.phase === "battle" &&
    !g.players[0].pieces.some((p) => p.position !== null)
  )
    return false;
  return true;
}
export function decodeSave(raw: string | null): {
  data: SaveData | null;
  status: SaveStatus;
} {
  if (raw === null) return { data: null, status: "empty" };
  if (raw.length > 750000) return { data: null, status: "damaged" };
  try {
    const v: unknown = JSON.parse(raw);
    if (!record(v)) return { data: null, status: "damaged" };
    let migrated = false;
    if (
      v.schema === 1 &&
      v.rules === "singleplayer-0.2" &&
      record(v.game) &&
      Array.isArray(v.game.players) &&
      Array.isArray(v.game.history)
    ) {
      const g = v.game;
      for (const p of g.players as unknown[]) if (record(p)) p.inventory = [];
      for (const r of g.history as unknown[])
        if (record(r)) {
          r.kind = "pvp";
          const p = (g.players as Record<string, unknown>[])[
            r.opponentId as number
          ];
          r.opponentName = p?.name ?? "";
        }
      g.encountersFromRound = Number(g.round) + (g.phase === "prepare" ? 0 : 1);
      g.reward = null;
      v.schema = 2;
      v.rules = "singleplayer-0.3";
      migrated = true;
    }
    if (
      v.schema === 2 &&
      v.rules === "singleplayer-0.3" &&
      record(v.game) &&
      Array.isArray(v.game.history)
    ) {
      v.game.combatVersion = v.game.phase === "prepare" ? "tactics" : "legacy";
      v.game.difficulty = "standard";
      for (const report of v.game.history)
        if (record(report)) report.combatVersion = "legacy";
      v.schema = 3;
      v.rules = "singleplayer-0.4";
      migrated = true;
    }
    if (
      v.schema === 3 &&
      v.rules === "singleplayer-0.4" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of ROSTER_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 4;
      v.rules = "singleplayer-0.5";
      migrated = true;
    }
    if (v.schema === 4 && v.rules === "singleplayer-0.5" && record(v.game)) {
      // Never reinterpret an in-flight battle or existing round reports.
      if (v.game.phase === "prepare") v.game.combatVersion = "balanced";
      v.schema = 5;
      v.rules = "singleplayer-0.6";
      migrated = true;
    }
    if (v.schema === 5 && v.rules === "singleplayer-0.6" && record(v.game)) {
      if (v.game.phase === "prepare") v.game.combatVersion = "signature";
      v.schema = 6;
      v.rules = "singleplayer-0.7";
      migrated = true;
    }
    if (v.schema === 6 && v.rules === "singleplayer-0.7" && record(v.game)) {
      if (v.game.phase === "prepare") v.game.combatVersion = "summons";
      v.schema = 7;
      v.rules = "singleplayer-0.8";
      migrated = true;
    }
    if (
      v.schema === 7 &&
      v.rules === "singleplayer-0.8" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of LEGION_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      if (v.game.phase === "prepare") v.game.combatVersion = "legions";
      v.schema = 8;
      v.rules = "singleplayer-0.9";
      migrated = true;
    }
    if (
      v.schema === 8 &&
      v.rules === "singleplayer-0.9" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of BROOD_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      if (v.game.phase === "prepare") v.game.combatVersion = "brood";
      v.schema = 9;
      v.rules = "singleplayer-0.10";
      migrated = true;
    }
    if (
      v.schema === 9 &&
      v.rules === "singleplayer-0.10" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of AIRSEA_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      if (v.game.phase === "prepare") v.game.combatVersion = "airsea";
      v.schema = 10;
      v.rules = "singleplayer-0.11";
      migrated = true;
    }
    if (v.schema === 10 && v.rules === "singleplayer-0.11" && record(v.game)) {
      if (v.game.phase === "prepare") v.game.combatVersion = "fleet";
      v.schema = 11;
      v.rules = "singleplayer-0.12";
      migrated = true;
    }
    if (
      v.schema === 11 &&
      v.rules === "singleplayer-0.12" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of IMMORTAL_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 12;
      v.rules = "singleplayer-0.13";
      migrated = true;
    }
    if (
      v.schema === 12 &&
      v.rules === "singleplayer-0.13" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of PSYCHIC_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 13;
      v.rules = "singleplayer-0.14";
      migrated = true;
    }
    if (
      v.schema === 13 &&
      v.rules === "singleplayer-0.14" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of WILD_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 14;
      v.rules = "singleplayer-0.15";
      migrated = true;
    }
    if (v.schema === 14 && v.rules === "singleplayer-0.15" && record(v.game)) {
      if (v.game.phase === "prepare") v.game.combatVersion = "metamorph";
      v.schema = 15;
      v.rules = "singleplayer-0.16";
      migrated = true;
    }
    if (
      v.schema === 15 &&
      v.rules === "singleplayer-0.16" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of PHOENIX_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 16;
      v.rules = "singleplayer-0.17";
      migrated = true;
    }
    if (
      v.schema === 16 &&
      v.rules === "singleplayer-0.17" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of WHALE_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 17;
      v.rules = "singleplayer-0.18";
      migrated = true;
    }
    if (
      v.schema === 17 &&
      v.rules === "singleplayer-0.18" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of MEDIC_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 18;
      v.rules = "singleplayer-0.19";
      migrated = true;
    }
    if (
      v.schema === 18 &&
      v.rules === "singleplayer-0.19" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of INFANTRY_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 19;
      v.rules = "singleplayer-0.20";
      migrated = true;
    }
    if (
      v.schema === 19 &&
      v.rules === "singleplayer-0.20" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of MOTORCYCLE_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 20;
      v.rules = "singleplayer-0.21";
      migrated = true;
    }
    if (v.schema === 20 && v.rules === "singleplayer-0.21" && record(v.game)) {
      // Existing balances and history are settled facts; apply the new income
      // curve only when a not-yet-settled round actually finishes.
      v.schema = 21;
      v.rules = "singleplayer-0.22";
      migrated = true;
    }
    if (v.schema === 21 && v.rules === "singleplayer-0.22" && record(v.game)) {
      // Finish any already-started battle and its settlement with its original rules.
      if (v.game.phase === "prepare") v.game.combatVersion = "infantry";
      v.schema = 22;
      v.rules = "singleplayer-0.23";
      migrated = true;
    }
    if (
      v.schema === 22 &&
      v.rules === "singleplayer-0.23" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of IRONDOG_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 23;
      v.rules = "singleplayer-0.24";
      migrated = true;
    }
    if (
      v.schema === 23 &&
      v.rules === "singleplayer-0.24" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of SPECIALIST_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 24;
      v.rules = "singleplayer-0.25";
      migrated = true;
    }
    if (
      v.schema === 24 &&
      v.rules === "singleplayer-0.25" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of BIRDRIDER_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 25;
      v.rules = "singleplayer-0.26";
      migrated = true;
    }
    if (
      v.schema === 25 &&
      v.rules === "singleplayer-0.26" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of IRONAPE_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 26;
      v.rules = "singleplayer-0.27";
      migrated = true;
    }
    if (v.schema === 26 && v.rules === "singleplayer-0.27") {
      // No doctrine assignment here: legacy opponents retain their original preferences.
      v.schema = 27;
      v.rules = "singleplayer-0.28";
      migrated = true;
    }
    if (v.schema === 27 && v.rules === "singleplayer-0.28" && record(v.game)) {
      if (v.game.phase === "prepare")
        v.game.combatVersion = CURRENT_COMBAT_VERSION;
      v.schema = 28;
      v.rules = "singleplayer-0.29";
      migrated = true;
    }
    if (
      v.schema === 28 &&
      v.rules === "singleplayer-0.29" &&
      record(v.game) &&
      record(v.game.pool)
    ) {
      for (const id of IRONROOSTER_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = COPIES[UNIT[id].cost];
      v.schema = 29;
      v.rules = "singleplayer-0.30";
      migrated = true;
    }
    if (v.schema === 29 && v.rules === "singleplayer-0.30" && record(v.game)) {
      // Existing matches keep their original pool, shops and history. Only new games draw bans.
      v.schema = 30;
      v.rules = "singleplayer-0.31";
      migrated = true;
    }
    if (
      v.schema === 30 &&
      v.rules === "singleplayer-0.31" &&
      record(v.game) &&
      record(v.game.pool) &&
      validBans(v.game.bannedSeries)
    ) {
      for (const id of AXETHRALL_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = isRecruitable(
            { bannedSeries: v.game.bannedSeries },
            id,
          )
            ? COPIES[UNIT[id].cost]
            : 0;
      v.schema = 31;
      v.rules = "singleplayer-0.32";
      migrated = true;
    }
    if (
      v.schema === 31 &&
      v.rules === "singleplayer-0.32" &&
      record(v.game) &&
      record(v.game.pool) &&
      validBans(v.game.bannedSeries)
    ) {
      for (const id of SWORDTHRALL_ADDITIONS)
        if (!Object.hasOwn(v.game.pool, id))
          v.game.pool[id] = isRecruitable(
            { bannedSeries: v.game.bannedSeries },
            id,
          )
            ? COPIES[UNIT[id].cost]
            : 0;
      v.schema = 32;
      v.rules = RULES.version;
      migrated = true;
    }
    if (v.schema !== SAVE_SCHEMA || v.rules !== RULES.version)
      return { data: null, status: "incompatible" };
    if (
      !integer(v.savedAt, 0, Number.MAX_SAFE_INTEGER) ||
      !integer(v.revision, 1, Number.MAX_SAFE_INTEGER) ||
      !validGame(v.game) ||
      !record(v.playback) ||
      typeof v.playback.time !== "number" ||
      !Number.isFinite(v.playback.time) ||
      v.playback.time < 0 ||
      v.playback.time > RULES.maxTicks + 5 ||
      ![1, 2, 4].includes(v.playback.speed as number) ||
      typeof v.playback.paused !== "boolean"
    )
      return { data: null, status: "damaged" };
    return {
      data: v as unknown as SaveData,
      status: migrated ? "migrated" : "saved",
    };
  } catch {
    return { data: null, status: "damaged" };
  }
}

export class SaveStore {
  private expected: string | null = null;
  private previousPayload = "";
  private readOnly = false;
  private revision = 0;
  status: SaveStatus = "empty";
  savedAt = 0;
  constructor(private storage: StoragePort | null) {}
  load(): { data: SaveData | null; status: SaveStatus } {
    if (!this.storage) {
      this.status = "unavailable";
      return { data: null, status: this.status };
    }
    try {
      this.expected = this.storage.getItem(SAVE_KEY);
      const primary = decodeSave(this.expected);
      this.readOnly = primary.status === "incompatible";
      let restored = primary;
      if (!primary.data && primary.status !== "incompatible") {
        const backup = decodeSave(this.storage.getItem(BACKUP_KEY));
        if (backup.data) restored = { data: backup.data, status: "recovered" };
      }
      this.status = restored.status;
      this.revision = restored.data?.revision ?? 0;
      this.savedAt = restored.data?.savedAt ?? 0;
      this.previousPayload =
        restored.data && restored.status === "saved"
          ? JSON.stringify({
              game: restored.data.game,
              playback: restored.data.playback,
            })
          : "";
      return restored;
    } catch {
      this.status = "unavailable";
      return { data: null, status: this.status };
    }
  }
  save(game: Game, playback: PlaybackSave): SaveStatus {
    if (this.readOnly) return (this.status = "incompatible");
    if (!this.storage) return (this.status = "unavailable");
    try {
      if (this.storage.getItem(SAVE_KEY) !== this.expected)
        return (this.status = "conflict");
      const payload = JSON.stringify({ game, playback });
      if (payload === this.previousPayload) return this.status;
      const data: SaveData = {
        schema: SAVE_SCHEMA,
        rules: RULES.version,
        savedAt: Date.now(),
        revision: this.revision + 1,
        game,
        playback,
      };
      const raw = JSON.stringify(data);
      if (!decodeSave(raw).data) return (this.status = "damaged");
      if (this.expected !== null) {
        if (decodeSave(this.expected).data)
          this.storage.setItem(BACKUP_KEY, this.expected);
        else this.storage.setItem(RECOVERY_KEY, this.expected);
      }
      // A single replacement contains both the phase and its rewards/history.
      this.storage.setItem(SAVE_KEY, raw);
      this.expected = raw;
      this.previousPayload = payload;
      this.revision = data.revision;
      this.savedAt = data.savedAt;
      return (this.status = "saved");
    } catch {
      return (this.status = "unavailable");
    }
  }
  /** Only called after the user confirms starting a new run. Keep the previous run as backup. */
  allowReplacement() {
    this.readOnly = false;
    this.previousPayload = "";
    try {
      this.expected = this.storage?.getItem(SAVE_KEY) ?? null;
    } catch {
      this.status = "unavailable";
    }
  }
}
