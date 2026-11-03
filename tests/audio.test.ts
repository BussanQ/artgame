import { describe, it, expect, vi } from "vitest";
import {
  synthesize,
  ATTACK_SOUND,
  type SoundKind,
} from "../src/audio/synthesis";
import { BattleSoundTrack } from "../src/audio/cues";
import { GameAudio } from "../src/audio/player";
import { simulate } from "../src/engine/battle";
import { UNITS } from "../src/data/units";
import type { Battle } from "../src/engine/types";
const fixture = () =>
  simulate(
    [
      { uid: 1, defId: "cannon", star: 2, position: 35 },
      { uid: 2, defId: "monk", star: 2, position: 36 },
    ],
    [
      { uid: 3, defId: "titan", star: 2, position: 35 },
      { uid: 4, defId: "lion", star: 2, position: 36 },
    ],
  );
function device() {
  const sources: {
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
    buffer: unknown;
  }[] = [];
  const gain = { connect: vi.fn(), gain: { setTargetAtTime: vi.fn() } };
  const ctx = {
    state: "suspended",
    currentTime: 0,
    sampleRate: 24000,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
    createGain: () => gain,
    createDynamicsCompressor: () => ({
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      connect: vi.fn(),
    }),
    createBuffer: vi.fn((_channels: number, length: number) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    }),
    createBufferSource: () => {
      const source = {
        buffer: null as unknown,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      sources.push(source);
      return source;
    },
    createStereoPanner: () => ({
      pan: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
  };
  return { ctx, sources, gain, factory: () => ctx as unknown as AudioContext };
}
describe("战斗音效与播放边界", () => {
  it("血鹰落地三连击的声音跟随每次短动作命中，不沿用飞行俯冲延迟", () => {
    const battle = simulate(
      [{ uid: 1, defId: "bloodhawk", star: 2, position: 35 }],
      [{ uid: 2, defId: "titan", star: 3, position: 35 }],
    );
    const frameIndex = battle.frames.findIndex((f) =>
      f.events.some((e) => e.strike === 1),
    );
    expect(frameIndex).toBeGreaterThan(0);
    const track = new BattleSoundTrack();
    track.reset(battle, frameIndex);
    const cues = track.take(battle, frameIndex + 0.29, true);
    expect(
      cues.some(
        (c) =>
          c.kind === ATTACK_SOUND.bloodhawk && c.time === frameIndex + 0.28,
      ),
    ).toBe(true);
  });
  it("20 棋子都有攻击声，所有信号有限、非静音且有安全峰值", () => {
    expect(UNITS.every((u) => ATTACK_SOUND[u.id])).toBe(true);
    const kinds = new Set<SoundKind>([
      ...Object.values(ATTACK_SOUND),
      "heal",
      "cast",
      "start",
      "win",
      "loss",
      "draw",
      "buy",
      "merge",
      "place",
      "reward",
    ]);
    for (const kind of kinds) {
      const signal = synthesize(kind, 24000);
      expect(signal.length).toBeLessThan(24000);
      expect(signal.every(Number.isFinite)).toBe(true);
      expect(Math.max(...signal.map(Math.abs))).toBeLessThan(0.8);
      expect(
        signal.reduce((n, v) => n + v * v, 0) / signal.length,
      ).toBeGreaterThan(0.0001);
      expect(Math.abs(signal[0])).toBeLessThan(0.001);
      expect(Math.abs(signal.at(-1)!)).toBeLessThan(0.001);
      expect(synthesize(kind, 24000)).toEqual(signal);
    }
    expect(synthesize("shot", 24000)).not.toEqual(synthesize("beam", 24000));
    expect(synthesize("win", 24000)).not.toEqual(synthesize("loss", 24000));
  });
  it("音轨不改战果；同一播放时间只消费一次，静音不会积攒旧音效", () => {
    const battle = fixture(),
      before = structuredClone(battle),
      track = new BattleSoundTrack();
    track.reset(battle, 0);
    let count = 0;
    for (let t = 0; t < battle.frames.length; t += 0.2) {
      count += track.take(battle, t, true).length;
      expect(track.take(battle, t, true)).toEqual([]);
    }
    expect(count).toBeGreaterThan(0);
    expect(battle).toEqual(before);
    track.reset(battle, 0);
    track.take(battle, battle.frames.length, false);
    expect(track.take(battle, battle.frames.length, true)).toEqual([]);
  });
  it("恢复跳过过去的声音，循环能重启，高倍速每批最多四声且不补播积压", () => {
    const battle = fixture(),
      track = new BattleSoundTrack();
    track.reset(battle, 10);
    expect(track.take(battle, 10, true).every((c) => c.time >= 10)).toBe(true);
    for (let t = 12; t < battle.frames.length; t += 4) {
      const cues = track.take(battle, t, true);
      expect(cues.length).toBeLessThanOrEqual(4);
      expect(cues.every((c) => c.time >= t - 2)).toBe(true);
    }
    track.take(battle, 0, true);
    const rerun = [];
    for (let t = 1; t < 10; t++) rerun.push(...track.take(battle, t, true));
    expect(rerun.length).toBeGreaterThan(0);
  });
  it("同次范围施法按施法者去重，而非按受害者叠加声音", () => {
    const battle = fixture(),
      frame = battle.frames.find((f) =>
        f.effects.some((e) => e.kind === "cast"),
      )!;
    const effect = frame.effects.find((e) => e.kind === "cast")!;
    const single: Battle = {
      ...battle,
      frames: [{ ...frame, effects: [effect, effect, effect], events: [] }],
    };
    const track = new BattleSoundTrack();
    track.reset(single, 0);
    expect(track.take(single, 0, true)).toHaveLength(1);
  });
  it("首次交互前不建音频设备；缓存波形，静音停止声音，后台即使允许游戏继续也无声", async () => {
    const d = device(),
      factory = vi.fn(d.factory),
      audio = new GameAudio(factory);
    expect(audio.play("shot")).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(await audio.unlock()).toBe(true);
    expect(audio.play("shot")).toBe(true);
    expect(audio.play("shot")).toBe(true);
    expect(d.ctx.createBuffer).toHaveBeenCalledTimes(1);
    audio.configure({ soundEnabled: false, soundVolume: 35 });
    expect(d.sources.every((s) => s.stop.mock.calls.length === 1)).toBe(true);
    expect(audio.play("win")).toBe(false);
    audio.configure({ soundEnabled: true, soundVolume: 35 });
    audio.setHidden(true);
    expect(audio.play("win")).toBe(false);
    expect(await audio.unlock()).toBe(false);
    audio.setHidden(false);
    expect(audio.play("win")).toBe(true);
  });
  it("限制高倍速声音密度与同时发声数量，结束节点可回收", async () => {
    const d = device(),
      audio = new GameAudio(d.factory);
    await audio.unlock();
    expect(audio.play("cast", 0, true)).toBe(true);
    expect(audio.play("shot", 0, true)).toBe(false);
    d.ctx.currentTime = 0.05;
    expect(audio.play("shot", 0, true)).toBe(true);
    audio.stop();
    for (let i = 0; i < 12; i++) expect(audio.play("chime")).toBe(true);
    expect(audio.play("chime")).toBe(false);
    d.sources.at(-1)!.onended!();
    expect(audio.play("chime")).toBe(true);
  });
  it("设备缺失或自动播放受限时返回失败，不抛出到游戏流程", async () => {
    const audio = new GameAudio(() => {
      throw new Error("unsupported");
    });
    expect(await audio.unlock()).toBe(false);
    expect(audio.play("start")).toBe(false);
    expect(audio.status).toContain("无法播放");
    const d = device(),
      blocked = new GameAudio(d.factory);
    d.ctx.resume.mockRejectedValueOnce(new Error("blocked"));
    expect(await blocked.unlock()).toBe(false);
    expect(await blocked.unlock()).toBe(true);
  });
});
