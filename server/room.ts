import { randomBytes, randomInt } from "node:crypto";
import { encounterArmy, encounterFor } from "../src/data/encounters";
import { RULES } from "../src/data/units";
import { deployLineup, prepareBot } from "../src/engine/ai";
import { simulateOutcome } from "../src/engine/battle";
import { craft, equip, rewardChoices, unequip } from "../src/engine/equipment";
import { buy, buyXp, createGame, move, nextRound, rankings, roll, sell, settlePlayer } from "../src/engine/game";
import type { Player } from "../src/engine/types";
import type { Duel, Order, RoomView } from "../src/online/protocol";

import { FRAME_MS } from "../src/online/protocol";

const PREPARATION = 45_000;
const DISCONNECTED = 60_000;


export class RoomError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

interface Member { secret: string; seen: number; ready: boolean; sequence: number }
const board = (p: Player) => p.pieces.filter(piece => piece.position !== null);

export class Room {
  readonly game;
  readonly members = new Map<number, Member>();
  private duels = new Map<number, Duel>();
  private started = false;
  host = 0;
  revision = 0;
  until = 0;
  battleStart = 0;
  touched: number;

  constructor(readonly code: string, now: number, seed = randomInt(0x100000000)) {
    this.game = createGame(seed);
    this.touched = now;
  }

  join(now: number) {
    if (this.started) throw new RoomError("对局已经开始");
    const p = this.game.players.find(p => !this.members.has(p.id));
    if (!p) throw new RoomError("房间已满");
    const secret = randomBytes(24).toString("hex");
    if (!this.members.size) this.host = p.id;
    this.members.set(p.id, { secret, seen: now, ready: false, sequence: 0 });
    this.touched = now;
    this.revision++;
    return { code: this.code, secret };
  }

  identify(secret: string, now: number) {
    for (const [id, member] of this.members) {
      if (member.secret !== secret) continue;
      member.seen = this.touched = now;
      return id;
    }
    throw new RoomError("席位已失效，请重新加入", 401);
  }

  leave(id: number) {
    this.members.delete(id);
    if (this.started) this.game.players[id].name = `电脑 · ${id + 1} 号位`;
    if (this.host === id) this.host = this.members.keys().next().value ?? -1;
    this.revision++;
  }

  tick(now: number) {
    if (!this.started) {
      for (const [id, member] of this.members)
        if (now - member.seen > DISCONNECTED) this.leave(id);
      return;
    }
    if (now < this.until) return;
    const g = this.game;
    if (g.phase === "prepare") this.fight(now);
    else if (g.phase === "battle") {
      const kind = encounterFor(g) ? "pve" : "pvp";
      for (const [id, duel] of this.duels) {
        const p = g.players[id];
        const won = duel.winner === duel.side;
        settlePlayer(g, p, kind, won, won ? 0 : this.damage.get(id)!);
        if (kind === "pve" && p.hp > 0) p.inventory.push(...rewardChoices(g, 1));
      }
      g.phase = g.round >= RULES.maxRounds || g.players.filter(p => p.hp > 0).length <= 1 ? "finished" : "result";
      this.until = now + 2500;
      this.revision++;
    } else if (g.phase === "result") {
      nextRound(g);
      this.duels.clear();
      for (const member of this.members.values()) member.ready = false;
      this.until = now + PREPARATION;
      this.revision++;
    }
  }

  private damage = new Map<number, number>();

  private fight(now: number) {
    const computingSince = performance.now();
    const g = this.game;
    const alive = g.players.filter(p => p.hp > 0);
    for (const p of alive) {
      const member = this.members.get(p.id);
      if (!member || now - member.seen > DISCONNECTED)
        prepareBot(g, p, { buy, buyXp, roll, sell }, true);
      else if (!board(p).length) deployLineup(p, g.difficulty, "spread", g.combatVersion);
    }
    this.duels.clear();
    this.damage.clear();
    const run = (a: Player, b: Pick<Player, "name" | "pieces">, opponentSeat?: number) => {
      const left = board(a), right = b.pieces.filter(p => p.position !== null);
      const { winner, damage, final } = simulateOutcome(left, right, g.combatVersion);
      const duel: Duel = { left, right, names: [a.name, b.name], winner, side: 0, ticks: final.tick };
      this.duels.set(a.id, duel);
      this.damage.set(a.id, damage);
      if (opponentSeat !== undefined) {
        this.duels.set(opponentSeat, { ...duel, side: 1 });
        this.damage.set(opponentSeat, damage);
      }
    };
    const encounter = encounterFor(g);
    if (encounter) {
      const enemy = { name: encounter.name, pieces: encounterArmy(encounter) };
      for (const p of alive) run(p, enemy);
    } else {
      // Circle pairing. With an odd field the unpaired seat fights a copy.
      const wheel: (Player | null)[] = [...alive];
      if (wheel.length % 2) wheel.push(null);
      for (let i = 0; i < (g.round - 1) % (wheel.length - 1); i++)
        wheel.splice(1, 0, wheel.pop()!);
      for (let i = 0; i < wheel.length / 2; i++) {
        const a = wheel[i], b = wheel[wheel.length - 1 - i];
        if (a && b) run(a, b, b.id);
        else {
          const solo = (a ?? b)!;
          const ghost = alive[(alive.indexOf(solo) + 1) % alive.length];
          run(solo, { name: ghost.name + "（镜像）", pieces: ghost.pieces });
        }
      }
    }
    g.phase = "battle";
    this.battleStart = now + Math.round(performance.now() - computingSince);
    this.until = this.battleStart + Math.max(1500, ...Array.from(this.duels.values(), d => d.ticks * FRAME_MS + 500));
    this.revision++;
  }

  order(id: number, order: Order, now: number) {
    const g = this.game, member = this.members.get(id)!;
    if (order.kind === "leave") { this.leave(id); return; }
    if (order.kind === "start") {
      if (this.started || id !== this.host) throw new RoomError("只有房主可以开局");
      this.started = true;
      for (const p of g.players) p.name = this.members.has(p.id) ? `指挥官 ${p.id + 1}` : `电脑 · ${p.id === 0 ? "哨兵" : p.name}`;
      this.until = now + PREPARATION;
      this.revision++;
      return;
    }
    const p = g.players[id];
    if (!this.started || g.phase !== "prepare" || !p.hp || member.ready) throw new RoomError("当前不能操作");
    const integer = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
    let ok = false;
    switch (order.kind) {
      case "ready":
        if (!board(p).length) throw new RoomError("请先部署至少一枚棋子");
        member.ready = true;
        if (Array.from(this.members).every(([seat, m]) => !g.players[seat].hp || m.ready)) this.fight(now);
        ok = true;
        break;
      case "buy": ok = integer(order.index) && buy(g, p, order.index); break;
      case "move": ok = integer(order.uid) && (order.position === null || integer(order.position)) && move(g, p, order.uid, order.position); break;
      case "sell": ok = integer(order.uid) && sell(g, p, order.uid); break;
      case "roll": ok = roll(g, p); break;
      case "xp": ok = buyXp(g, p); break;
      case "lock": p.locked = !p.locked; ok = true; break;
      case "deploy": deployLineup(p, g.difficulty, "spread", g.combatVersion); ok = true; break;
      case "equip": ok = integer(order.index) && integer(order.uid) && equip(g, p, order.index, order.uid); break;
      case "unequip": ok = integer(order.index) && integer(order.uid) && unequip(g, p, order.uid, order.index); break;
      case "craft": ok = typeof order.item === "string" && craft(g, p, order.item); break;
    }
    if (!ok) throw new RoomError("操作未生效，请检查金币、人口或备战席");
    this.revision++;
  }

  view(id: number, now: number): RoomView {
    const g = this.game;
    return { code: this.code, host: this.host, me: id, phase: this.started ? g.phase : "lobby",
      round: g.round, sequence: this.members.get(id)?.sequence ?? 0, revision: this.revision, serverTime: now, until: this.until, battleStart: this.battleStart,
      bans: g.bannedSeries, player: this.started ? g.players[id] : undefined, duel: this.duels.get(id),
      seats: rankings(g).map(p => ({ id: p.id, name: this.started ? p.name : this.members.has(p.id) ? `指挥官 ${p.id + 1}` : "电脑补位",
        human: this.members.has(p.id), ready: this.members.get(p.id)?.ready ?? false, hp: p.hp })),
    };
  }
}
