import { describe, expect, it } from "vitest";
import { Room } from "../server/room";
import { simulate } from "../src/engine/battle";

describe("八人联机房间", () => {
  it("限制同房席位并在房主离开后转移开局权限", () => {
    const r = new Room("123456", 0, 123);
    const tickets = Array.from({ length: 8 }, () => r.join(0));
    expect(() => r.join(0)).toThrow("已满");
    expect(() => r.identify("invalid", 0)).toThrow("席位");
    expect(r.identify(tickets[1].secret, 3)).toBe(1);
    expect(() => r.order(1, {kind:"start"}, 3)).toThrow("房主");
    r.leave(0);
    r.order(1, {kind:"start"}, 3);
    expect(r.view(1, 3).seats.filter(s => !s.human)).toHaveLength(1);
    expect(() => r.join(5)).toThrow("已经开始");
  });

  it("两位真人对阵同一场战斗，结算一次并为存活玩家开启下一轮", () => {
    const r = new Room("123456", 0, 41);
    r.join(0); r.join(0);
    r.order(0,{kind:"start"},0);
    expect(r.view(1,0).seats.filter(s=>!s.human)).toHaveLength(6);
    r.game.round = 4;
    // Target a single PvP pairing, independent of the full campaign.
    for (const p of r.game.players.slice(2)) p.hp = 0;
    for (const id of [0,1]) {
      r.order(id,{kind:"buy",index:0},1);
      const piece = r.game.players[id].pieces[0];
      expect(() => r.order(1-id,{kind:"sell",uid:piece.uid},1)).toThrow();
      r.order(id,{kind:"move",uid:piece.uid,position:35},2);
      r.order(id,{kind:"ready"},3);
    }
    const a = r.view(0,4).duel!, b = r.view(1,4).duel!;
    expect(a.side).not.toBe(b.side);
    expect(a.names).toEqual(b.names);
    expect(a.winner).toEqual(simulate(a.left,a.right).winner);
    expect(a.winner).toBe(b.winner);
    expect(() => r.order(0,{kind:"roll"},4)).toThrow();
    const end = r.until;
    r.tick(end);
    const balances = r.game.players.map(p=>p.gold);
    r.tick(end);
    expect(r.game.players.map(p=>p.gold)).toEqual(balances);
    r.tick(r.until);
    expect(r.game.round).toBe(5);
    expect(r.game.phase).toBe("prepare");
  });
});
