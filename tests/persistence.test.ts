import { claimReward } from "../src/engine/equipment";
import { describe, it, expect } from "vitest";
import {
  createGame,
  buy,
  move,
  startRound,
  resumeRound,
  settle,
  nextRound,
} from "../src/engine/game";
import {
  SaveStore,
  SAVE_KEY,
  BACKUP_KEY,
  RECOVERY_KEY,
  decodeSave,
  validGame,
  type StoragePort,
} from "../src/engine/persistence";

class MemoryStorage implements StoragePort {
  data = new Map<string, string>();
  failWrite = false;
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw Error("quota");
    this.data.set(key, value);
  }
}
const playback = { time: 0, speed: 1 as const, paused: false };
function setup() {
  const storage = new MemoryStorage(),
    store = new SaveStore(storage),
    game = createGame(873);
  store.load();
  buy(game, game.players[0], 0);
  move(game, game.players[0], game.players[0].pieces[0].uid, 35);
  return { storage, store, game };
}
describe("单机存档与回合恢复", () => {
  it("保存准备阶段的商店、金币、卡池、锁定和阵容，重复保存不产生新版本", () => {
    const { storage, store, game } = setup();
    game.players[0].locked = true;
    expect(store.save(game, playback)).toBe("saved");
    const raw = storage.getItem(SAVE_KEY);
    expect(store.save(game, playback)).toBe("saved");
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
    const loaded = new SaveStore(storage).load();
    expect(loaded.data!.game).toEqual(game);
    expect(loaded.data!.playback).toEqual(playback);
  });
  it("中断战斗恢复同一回放与暂停倍速，不再次触发 AI 消费或改变随机状态", () => {
    const { storage, store, game } = setup(),
      result = startRound(game)!;
    const checkpoint = { time: 4.25, speed: 4 as const, paused: true };
    expect(store.save(game, checkpoint)).toBe("saved");
    const loaded = new SaveStore(storage).load().data!,
      before = structuredClone(loaded.game);
    const resumed = resumeRound(loaded.game)!;
    expect(loaded.game).toEqual(before);
    expect(resumed).toEqual(result);
    expect(loaded.playback).toEqual(checkpoint);
    settle(game, result);
    settle(loaded.game, resumed);
    expect(loaded.game).toEqual(game);
  });
  it("结算状态与奖励原子保存，重复结算与下一轮的过期结果均无效", () => {
    const { storage, store, game } = setup(),
      result = startRound(game)!;
    settle(game, result);
    expect(game.history).toHaveLength(1);
    expect(store.save(game, playback)).toBe("saved");
    const loaded = new SaveStore(storage).load().data!.game,
      before = structuredClone(loaded);
    settle(loaded, result);
    expect(loaded).toEqual(before);
    expect(loaded.phase).toBe("result");
    if (loaded.reward) claimReward(loaded, 0);
    nextRound(loaded);
    expect(loaded.round).toBe(2);
    startRound(loaded);
    const next = structuredClone(loaded);
    settle(loaded, result);
    expect(loaded).toEqual(next);
  });
  it("多轮至终局每个检查点可恢复，历史完整且终局不会再发收入", () => {
    const { storage, store, game } = setup();
    for (let round = 0; round < 30 && game.phase !== "finished"; round++) {
      const result = startRound(game)!;
      expect(result).not.toBeNull();
      expect(store.save(game, playback)).toBe("saved");
      settle(game, result);
      expect(validGame(game)).toBe(true);
      expect(store.save(game, playback)).toBe("saved");
      expect(new SaveStore(storage).load().data!.game).toEqual(game);
      if (game.phase === "result") {
        if (game.reward) claimReward(game, 0);
        nextRound(game);
      }
    }
    expect(game.phase).toBe("finished");
    expect(game.history).toHaveLength(game.round);
    const restored = new SaveStore(storage).load().data!.game;
    expect(restored.phase).toBe("finished");
    expect(resumeRound(restored)).toBeNull();
    const before = structuredClone(restored);
    nextRound(restored);
    expect(restored).toEqual(before);
  });
  it("损坏主存档回退到上一个合法版本，并保留损坏原文", () => {
    const { storage, store, game } = setup();
    store.save(game, playback);
    const previous = structuredClone(game);
    game.players[0].locked = true;
    store.save(game, playback);
    expect(storage.getItem(BACKUP_KEY)).not.toBeNull();
    storage.setItem(SAVE_KEY, "broken json");
    const recover = new SaveStore(storage),
      loaded = recover.load();
    expect(loaded.status).toBe("recovered");
    expect(loaded.data!.game).toEqual(previous);
    expect(recover.save(loaded.data!.game, playback)).toBe("saved");
    expect(storage.getItem(RECOVERY_KEY)).toBe("broken json");
    expect(decodeSave(storage.getItem(SAVE_KEY)).data!.game).toEqual(previous);
  });
  it("拒绝不兼容版本并保留原存档，用户明确重开后才允许替换", () => {
    const { storage, store, game } = setup();
    store.save(game, playback);
    const data = JSON.parse(storage.getItem(SAVE_KEY)!);
    data.schema = 99;
    const raw = JSON.stringify(data);
    storage.setItem(SAVE_KEY, raw);
    const older = new SaveStore(storage);
    expect(older.load().status).toBe("incompatible");
    expect(older.save(game, playback)).toBe("incompatible");
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
    older.allowReplacement();
    expect(older.save(game, playback)).toBe("saved");
    expect(storage.getItem(RECOVERY_KEY)).toBe(raw);
  });
  it("卡池不守恒、重复 UID、重叠位置、非法单位、金额、阶段和超大存档不进入游戏", () => {
    const { storage, store, game } = setup();
    store.save(game, playback);
    const data = JSON.parse(storage.getItem(SAVE_KEY)!);
    for (const mutate of [
      (v: any) => v.game.pool.guard++,
      (v: any) =>
        v.game.players[0].pieces.push({ ...v.game.players[0].pieces[0] }),
      (v: any) => (v.game.players[0].pieces[0].defId = "missing"),
      (v: any) => (v.game.players[0].pieces[0].position = 15),
      (v: any) => (v.game.players[0].gold = -1),
      (v: any) => (v.game.players[0].name = "<script>"),
      (v: any) => (v.game.phase = "result"),
      (v: any) => (v.playback.speed = 100),
      (v: any) => (v.playback.time = Infinity),
    ]) {
      const bad = structuredClone(data);
      mutate(bad);
      expect(decodeSave(JSON.stringify(bad)).status).toBe("damaged");
    }
    expect(decodeSave(" ".repeat(750001)).status).toBe("damaged");
  });
  it("写入失败不会破坏原检查点，恢复存储后可以继续保存", () => {
    const { storage, store, game } = setup();
    store.save(game, playback);
    const raw = storage.getItem(SAVE_KEY);
    storage.failWrite = true;
    game.players[0].locked = true;
    expect(store.save(game, playback)).toBe("unavailable");
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
    storage.failWrite = false;
    expect(store.save(game, playback)).toBe("saved");
    expect(new SaveStore(storage).load().data!.game.players[0].locked).toBe(
      true,
    );
    const unavailable = new SaveStore(null);
    expect(unavailable.load().status).toBe("unavailable");
    expect(unavailable.save(game, playback)).toBe("unavailable");
  });
  it("旧标签页不能覆盖新进度，重新载入后才恢复写入", () => {
    const { storage, store, game } = setup();
    store.save(game, playback);
    const other = new SaveStore(storage),
      otherGame = other.load().data!.game;
    game.players[0].locked = true;
    store.save(game, playback);
    const newer = storage.getItem(SAVE_KEY);
    expect(other.save(otherGame, playback)).toBe("conflict");
    expect(storage.getItem(SAVE_KEY)).toBe(newer);
    const latest = other.load().data!.game;
    latest.message = "已载入最新进度";
    expect(other.save(latest, playback)).toBe("saved");
  });
});
