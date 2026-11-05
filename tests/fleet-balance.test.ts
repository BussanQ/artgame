import { CURRENT_COMBAT_VERSION } from "../src/engine/types";
import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import {
  createGame,
  buy,
  settle,
  resumeRound,
  nextRound,
} from "../src/engine/game";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { claimReward } from "../src/engine/equipment";
import { UNITS } from "../src/data/units";
import { skillDescription } from "../src/data/skills";
import { pieceDetails } from "../src/ui/bench-tooltip";
import type { Piece } from "../src/engine/types";
const p = (defId: string, uid: number, position = 35): Piece => ({
  defId,
  uid,
  position,
  star: 2,
});
describe("0.12 空海战斗节奏与版本隔离", () => {
  it("轰炸机50初始能量，旧版仍为0，四空军35%与旧30%分别生效", () => {
    const pieces = ["repair", "bomber", "ghostjet", "ark"].map((id, i) =>
      p(id, i + 1, 32 + i),
    );
    const current = army(pieces, 0),
      old = army(pieces, 0, "airsea");
    expect(current[1].mana).toBe(50);
    expect(old[1].mana).toBe(0);
    expect(current.every((f) => f.air!.evasion === 0.35)).toBe(true);
    expect(old.every((f) => f.air!.evasion === 0.3)).toBe(true);
    expect(army(pieces.slice(0, 2), 0)[0].air!.evasion).toBe(0.15);
    expect(skillDescription("bomber")).toContain("初始能量 50");
    expect(skillDescription("bomber", "airsea")).not.toContain("初始能量 50");
    expect(
      pieceDetails(p("bomber", 1)).traits.find((t) => t.name === "空军")!
        .description,
    ).toContain("35%");
    expect(
      pieceDetails(p("bomber", 1), "airsea").traits.find(
        (t) => t.name === "空军",
      )!.description,
    ).toContain("30%");
  });
  for (const id of ["bomber", "ark", "eel"])
    it(`${id}引导时冷却递减且仍不能普攻，旧版冻结冷却`, () => {
      const left = [{ ...p(id, 1), items: ["staff", "staff"] }],
        right = [{ ...p("turtle", 2, 36), star: 3 }];
      for (const version of ["fleet", "airsea"] as const) {
        const b = simulate(left, right, version),
          start = b.frames.find(
            (frame) => frame.fighters.find((f) => f.uid === 1)?.air?.cast,
          )!;
        const before = start.fighters.find((f) => f.uid === 1)!,
          after = b.frames[start.tick + 1].fighters.find((f) => f.uid === 1)!;
        expect(after.cooldown).toBe(
          before.cooldown - (version === "fleet" ? 1 : 0),
        );
        expect(
          b.frames[start.tick + 1].events.some(
            (e) => e.attacker === 1 && !e.skill,
          ),
        ).toBe(false);
        const fast = simulateOutcome(left, right, version);
        expect(fast.final.fighters).toEqual(b.frames.at(-1)!.fighters);
      }
    });
  it("0.11完整32棋子快照保持原SHA-256", async () => {
    const originalIds = [
      "infantry",
      "guard",
      "pangolin",
      "panda",
      "sniper",
      "lion",
      "chariot",
      "monk",
      "wolf",
      "cannon",
      "master",
      "titan",
      "cavalry",
      "dragonfly",
      "shadowblade",
      "turtle",
      "tiger",
      "bull",
      "fish",
      "deer",
      "adept",
      "shark",
      "eyebug",
      "blastbug",
      "spider",
      "wasp",
      "repair",
      "bomber",
      "ghostjet",
      "ark",
      "skycrab",
      "eel",
    ];
    const fixture = (start: number) =>
      originalIds.slice(start, start + 16).map((id, i) => ({
        ...p(id, start + i + 1, 32 + i),
        items: i % 3 === 0 ? ["staff"] : [],
      }));
    const b = simulate(fixture(0), fixture(16), "airsea");
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(b)),
    );
    expect(
      Array.from(new Uint8Array(hash), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""),
    ).toBe("340ae734b649919bb72aeacd7eeb3d30cdd454ab97a365818162ac0b4b1bc20d");
  });
  for (const phase of ["prepare", "battle", "result"] as const)
    it(`schema10 ${phase}保留资源和旧战斗，准备或下一回合才升级`, () => {
      const g = createGame(137, "classic");
      g.combatVersion = "airsea";
      const player = g.players[0];
      buy(g, player, 0);
      player.pieces[0].position = 35;
      if (phase !== "prepare") {
        g.phase = "battle";
        if (phase === "result") settle(g, resumeRound(g)!);
      }
      const result = decodeSave(
        JSON.stringify({
          schema: 10,
          rules: "singleplayer-0.11",
          savedAt: 1,
          revision: 1,
          game: g,
          playback: { time: 0, speed: 1, paused: false },
        }),
      );
      expect(result.status).toBe("migrated");
      expect(result.data!.schema).toBe(SAVE_SCHEMA);
      const restored = result.data!.game;
      expect(validGame(restored)).toBe(true);
      expect(restored).toEqual({
        ...g,
        combatVersion: phase === "prepare" ? CURRENT_COMBAT_VERSION : "airsea",
      });
      if (phase === "result") {
        if (restored.reward) claimReward(restored, 0);
        nextRound(restored);
        expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
        expect(restored.history[0].combatVersion).toBe("airsea");
      }
    });
});
