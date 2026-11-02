import { describe, expect, it, vi, afterEach } from "vitest";
import {
  defaultPreferences,
  loadPreferences,
  savePreferences,
  PREFERENCES_KEY,
} from "../src/ui/preferences";
import { FrameGate } from "../src/render/frame-policy";
import { PausableDelay } from "../src/ui/pausable-delay";
import type { StoragePort } from "../src/engine/persistence";
const memory = (): StoragePort => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};
afterEach(() => vi.useRealTimers());
describe("显示偏好与后台暂停", () => {
  it("独立保存显示设置，刷新可恢复", () => {
    const storage = memory(),
      prefs = {
        ...defaultPreferences(),
        quality: "low" as const,
        reducedMotion: true,
        damageNumbers: false,
        soundEnabled: false,
        soundVolume: 60,
      };
    storage.setItem("red-tides.singleplayer.save", "untouched");
    expect(savePreferences(storage, prefs)).toBe(true);
    expect(loadPreferences(storage)).toEqual(prefs);
    expect(storage.getItem("red-tides.singleplayer.save")).toBe("untouched");
  });
  it("无存储、损坏 JSON 与非法字段逐项降级，首次遵循系统减少动态效果", () => {
    expect(loadPreferences(null, true)).toEqual(defaultPreferences(true));
    const storage = memory();
    for (const invalid of ["{broken", "[]", "null", "false"]) {
      storage.setItem(PREFERENCES_KEY, invalid);
      expect(loadPreferences(storage)).toEqual(defaultPreferences());
    }
    storage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        quality: "__proto__",
        pauseHidden: false,
        reducedMotion: "true",
        damageNumbers: 0,
      }),
    );
    expect(loadPreferences(storage, true)).toEqual({
      ...defaultPreferences(true),
      pauseHidden: false,
    });
    expect(savePreferences(null, defaultPreferences())).toBe(false);
    expect(
      savePreferences(
        {
          ...storage,
          setItem: () => {
            throw new Error("quota");
          },
        },
        defaultPreferences(),
      ),
    ).toBe(false);
  });
  it("旧显示设置补齐声音默认值，非法音量不进入音频节点", () => {
    const storage = memory();
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ quality: "low" }));
    expect(loadPreferences(storage)).toEqual({
      ...defaultPreferences(),
      quality: "low",
    });
    for (const soundVolume of [-1, 101, "60", null]) {
      storage.setItem(
        PREFERENCES_KEY,
        JSON.stringify({ soundVolume, soundEnabled: false }),
      );
      expect(loadPreferences(storage)).toEqual({
        ...defaultPreferences(),
        soundEnabled: false,
      });
    }
  });
  it.each([30, 45, 60])("在 60Hz 回调中稳定限制到 %i fps", (fps) => {
    const gate = new FrameGate();
    let drawn = 0;
    for (let n = 0; n < 600; n++)
      if (gate.ready((n * 1000) / 60, fps, false)) drawn++;
    expect(Math.abs(drawn - fps * 10)).toBeLessThanOrEqual(1);
  });
  it("隐藏不绘制，长时间隐藏后立即允许新帧，不补绘过期帧", () => {
    const gate = new FrameGate();
    expect(gate.ready(0, 30, false)).toBe(true);
    expect(gate.ready(10000, 30, true)).toBe(false);
    expect(gate.ready(20000, 30, false)).toBe(true);
    expect(gate.ready(20001, 30, false)).toBe(false);
  });
  it("结算只计算前台时间，重复隐藏不会扣减两次", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const delay = new PausableDelay(),
      advance = vi.fn();
    delay.schedule(advance, 2600);
    vi.advanceTimersByTime(1000);
    delay.setPaused(true);
    vi.advanceTimersByTime(20000);
    delay.setPaused(true);
    expect(advance).not.toHaveBeenCalled();
    delay.setPaused(false);
    vi.advanceTimersByTime(1599);
    expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(advance).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(advance).toHaveBeenCalledTimes(1);
  });
  it("后台恢复存档的结算等待前台；取消和重新排期不会重复推进", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const delay = new PausableDelay(),
      old = vi.fn(),
      advance = vi.fn();
    delay.setPaused(true);
    delay.schedule(old, 2600);
    vi.advanceTimersByTime(10000);
    expect(old).not.toHaveBeenCalled();
    delay.cancel();
    delay.schedule(advance, 2600);
    delay.setPaused(false);
    vi.advanceTimersByTime(1000);
    delay.schedule(advance, 2600);
    vi.advanceTimersByTime(2599);
    expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(advance).toHaveBeenCalledTimes(1);
    expect(old).not.toHaveBeenCalled();
  });
});
