import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { attackInterval } from "../src/engine/abilities";
import { synergies } from "../src/engine/synergies";
import { mergeCount } from "../src/engine/progression";
import { traitTiers } from "../src/data/traits";
import { RULES, UNIT } from "../src/data/units";
import { unitDefinition } from "../src/data/unit-stats";
import { skillName, skillDescription } from "../src/data/skills";
import { WILDFRONT_DEMO } from "../src/data/wildfront-demo";
import { SHIELDTHRALL_DEMO } from "../src/data/shieldthrall-demo";
import { ASSASSIN_DEMO } from "../src/data/assassin-demo";
import { drawStatuses } from "../src/render/skill-effects";
import {
  createGame,
  buy,
  move,
  startRound,
  settle,
  resumeRound,
  nextRound,
} from "../src/engine/game";
import { claimReward } from "../src/engine/equipment";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { isRecruitable } from "../src/engine/rotation";
import { compute } from "../src/compute/job";
import {
  CURRENT_COMBAT_VERSION,
  type Piece,
  type Fighter,
} from "../src/engine/types";
import frozen from "./fixtures/pre-v043-replays.json";

const line = (ids: string[], offset = 0): Piece[] =>
  ids.map((defId, i) => ({
    defId,
    uid: offset + i + 1,
    star: 1,
    position: 32 + i,
  }));
const beasts = [
  "elephant",
  "venombeast",
  "deer",
  "bloodhawk",
  "wolf",
  "pangolin",
];
const puppets = [
  "axethrall",
  "swordthrall",
  "bladethrall",
  "shieldthrall",
  "adept",
  "shark",
];

function statusText(f: Fighter) {
  const text: string[] = [];
  const values: Record<PropertyKey, unknown> = { globalAlpha: 1 };
  const canvas = new Proxy(values, {
    get: (target, key) =>
      key === "fillText"
        ? (value: string) => text.push(value)
        : (target[key] ?? (() => {})),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  drawStatuses(canvas, f, 0, 1, true);
  return text.join(" ");
}

describe("连携累计：保留逐档的不同受益范围", () => {
  it.each([2, 4, 6])("%i野兽分别累计本族和全队，后排获得团队部分", (count) => {
    const pieces = [
      ...line(beasts.slice(0, count)),
      ...line(["infantry"], 100),
    ];
    pieces.at(-1)!.position = 56;
    const before = structuredClone(pieces);
    const fighters = army(pieces, 0);
    const own = count === 2 ? 0.15 : count === 4 ? 0.4 : 0.75;
    const team = count === 2 ? 0 : count === 4 ? 0.25 : 0.6;
    for (const f of fighters) {
      const speed = f.defId === "infantry" ? team : own;
      expect(f.formationHaste ?? 0).toBeCloseTo(speed);
      expect(f.teamHaste ?? 0).toBeCloseTo(team);
      expect(attackInterval(f, 0)).toBeCloseTo(
        Math.max(1, f.interval / (1 + speed)),
      );
      expect(f.attack).toBe(UNIT[f.defId].attack);
    }
    expect(pieces).toEqual(before);
  });

  it.each([2, 4, 6])("%i傀儡自身累计，团队加成不覆盖个人部分", (count) => {
    const pieces = [
      ...line(puppets.slice(0, count)),
      ...line(["infantry"], 100),
    ];
    pieces.at(-1)!.position = 56;
    pieces[0].star = 2;
    pieces[0].items = ["blade"];
    const fighters = army(pieces, 0);
    const own = count === 2 ? 0.1 : count === 4 ? 0.25 : 0.45;
    expect(fighters[0].attack).toBeCloseTo(
      (UNIT.axethrall.attack * 2 + 18) * (1 + own),
    );
    expect(fighters[0].formationAttack).toBeCloseTo(own);
    const rear = fighters.at(-1)!;
    expect(rear.attack).toBeCloseTo(
      UNIT.infantry.attack * (count === 6 ? 1.2 : 1),
    );
    expect(rear.teamAttack ?? 0).toBe(count === 6 ? 0.2 : 0);
    expect(army(line(["infantry"], 200), 1)[0].attack).toBe(
      UNIT.infantry.attack,
    );
  });

  it("三个以上档位仍只应用一次累计总量，旧表保持原值", () => {
    const current = traitTiers(CURRENT_COMBAT_VERSION);
    expect(current.步兵.map((t) => t.bonus.enemyArmor)).toEqual([3, 9, 18]);
    expect(current.先锋.map((t) => t.bonus.armor)).toEqual([6, 14]);
    const old = traitTiers("ambush");
    expect(old.步兵.map((t) => t.bonus.enemyArmor)).toEqual([3, 6, 9]);
    expect(old.先锋.map((t) => t.bonus.armor)).toEqual([6, 8]);
    expect(old.傀儡.map((t) => t.bonus)).toEqual([
      { attack: 0.1 },
      { attack: 0.15 },
      { teamAttack: 0.2 },
    ]);
    expect(old.野兽.map((t) => t.bonus)).toEqual([
      { haste: 0.15 },
      { teamHaste: 0.25 },
      { teamHaste: 0.35 },
    ]);
    expect(current.刺杀).toEqual(old.刺杀);
    expect(current.装甲).toEqual(old.装甲);
    expect(current.爆破.map((t) => t.bonus.magicBreak)).toEqual([0.2, 0.5]);
    expect(old.爆破.map((t) => t.bonus.magicBreak)).toEqual([0.2, 0.6]);
  });

  it("战场标签显示当前个体总量，不将野兽75%标为全军75%", () => {
    const wild = army(WILDFRONT_DEMO.left, 0);
    expect(statusText(wild.find((f) => f.defId === "wolf")!)).toContain(
      "野兽攻速 +75%",
    );
    expect(statusText(wild.find((f) => f.defId === "bladethrall")!)).toContain(
      "全军攻速 +60%",
    );
    const puppet = army(
      [...SHIELDTHRALL_DEMO.left, ...line(["infantry"], 300)],
      0,
    );
    expect(statusText(puppet[0])).toContain("傀儡攻击 +45%");
    expect(statusText(puppet.at(-1)!)).toContain("全军攻击 +20%");
    expect(statusText(army(SHIELDTHRALL_DEMO.left, 0, "ambush")[0])).toContain(
      "全军攻击 +20%",
    );
  });

  it("新版本延续穿山甲遁地、独立跳后排、六刺暴击与异虫能力", () => {
    expect(unitDefinition("pangolin").traits).toEqual(["野兽", "刺杀"]);
    expect(skillName("pangolin")).toBe("遁地");
    expect(skillDescription("lingjiu")).toContain("单名刺杀");
    const single = simulate(line(["pangolin"]), line(["infantry"], 100))
      .frames[0];
    expect(single.fighters[0].burrowSkill).toBe(true);
    expect(single.fighters[0].assassinCrit).toBeUndefined();
    expect(
      Math.abs(single.fighters[0].x - single.fighters[1].x) +
        Math.abs(single.fighters[0].y - single.fighters[1].y),
    ).toBe(1);
    const six = army(ASSASSIN_DEMO.left, 0);
    expect(six.filter((f) => f.assassinCrit?.chance === 0.2)).toHaveLength(6);
    expect(mergeCount(line(["eyebug", "blastbug"]), "eyebug", 1)).toBe(2);
  });

  for (const [name, demo] of [
    ["荒原先锋", WILDFRONT_DEMO],
    ["傀儡卫阵", SHIELDTHRALL_DEMO],
    ["六刺突袭", ASSASSIN_DEMO],
  ] as const)
    it(`${name}按当前累计规则完整、快速和Worker一致，不改写输入`, () => {
      const before = structuredClone(demo);
      const full = simulate(before.left, before.right);
      const fast = simulateOutcome(before.left, before.right);
      expect([fast.winner, fast.damage]).toEqual([full.winner, full.damage]);
      expect(fast.final.fighters).toEqual(full.frames.at(-1)!.fighters);
      expect(
        compute({ kind: "replay", ...before, version: CURRENT_COMBAT_VERSION }),
      ).toEqual({ kind: "replay", battle: full });
      expect(demo).toEqual(before);
    });
});

describe("累计连携的存档边界", () => {
  for (const banned of [false, true])
    for (const phase of ["prepare", "battle", "result", "finished"] as const)
      it(`${banned}/${phase}0.42仅准备期切换；保留资源、随机数、历史和播放`, () => {
        const game = createGame(137, "classic");
        game.combatVersion = "ambush";
        for (const p of game.players) {
          for (const id of p.shop) if (id) game.pool[id]++;
          p.shop = [null, null, null, null, null];
        }
        if (banned) {
          game.bannedSeries = ["野兽", "海神", "空军"];
          for (const id of Object.keys(game.pool))
            if (!isRecruitable(game, id)) game.pool[id] = 0;
        }
        const me = game.players[0];
        me.shop[0] = phase === "finished" ? "medic" : "guard";
        game.pool[me.shop[0]]--;
        expect(buy(game, me, 0)).toBe(true);
        expect(move(game, me, me.pieces[0].uid, 35)).toBe(true);
        if (phase === "finished") me.hp = 1;
        const result = phase === "prepare" ? null : startRound(game);
        if (phase === "result" || phase === "finished") settle(game, result!);
        expect(game.phase).toBe(phase);
        const before = structuredClone(game);
        const decoded = decodeSave(
          JSON.stringify({
            schema: 41,
            rules: "singleplayer-0.42",
            savedAt: 1,
            revision: 1,
            game,
            playback: { time: 3, speed: 2, paused: true },
          }),
        );
        expect(decoded.status).toBe("migrated");
        expect(decoded.data).toMatchObject({
          schema: SAVE_SCHEMA,
          rules: RULES.version,
          playback: { time: 3, speed: 2, paused: true },
        });
        const restored = decoded.data!.game;
        expect(restored).toEqual({
          ...before,
          combatVersion:
            phase === "prepare" ? CURRENT_COMBAT_VERSION : "ambush",
        });
        if (phase === "battle") {
          expect(resumeRound(restored)!.battle).toEqual(result!.battle);
          settle(restored, resumeRound(restored)!);
        }
        if (restored.phase === "result") {
          if (restored.reward) claimReward(restored, 0);
          nextRound(restored);
          expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(restored.history[0].combatVersion).toBe("ambush");
        }
        expect(validGame(restored)).toBe(true);
      });

  for (const entry of frozen.fixtures)
    it(`0.42旧回放${entry.name}保持修改前逐帧哈希`, async () => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(simulate(entry.left, entry.right, "ambush")),
        ),
      );
      expect(
        Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join(""),
      ).toBe(entry.hash);
    });
});
