import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { castSkill, damage, gainMana, type CombatContext } from "../src/engine/abilities";
import { advanceWushi, expireWushi, wushiActive, wushiStrike } from "../src/engine/wushi";
import { effectiveArmor, usesEnergy } from "../src/engine/triggers";
import { WUSHI, skillName, skillDescription } from "../src/data/skills";
import { unitDefinition } from "../src/data/unit-stats";
import { unitCost } from "../src/data/catalog";
import { COMBAT_VERSIONS, CURRENT_COMBAT_VERSION, hasWushiRules, type Piece } from "../src/engine/types";
import { createGame, buy, sell, startRound, settle, resumeRound, nextRound } from "../src/engine/game";
import { claimReward } from "../src/engine/equipment";
import { validGame, decodeSave, SAVE_SCHEMA } from "../src/engine/persistence";
import { mergeCount } from "../src/engine/progression";
import { traitTiers } from "../src/data/traits";
import { RULES } from "../src/data/units";
import frozen from "./fixtures/pre-v056-replays.json";
import reserve from "./fixtures/scouted-control-reserve.json";
import { fighterSprite } from "../src/engine/summons";
import { wushiScale, wushiPose, wushiLabels } from "../src/render/wushi";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { WUSHI_DEMO } from "../src/data/wushi-demo";

const piece = (defId: string, uid: number, star = 1, position = 35): Piece => ({ defId, uid, star, position });
function setup(star = 1) {
  const master = army([piece("master", 1, star)], 0)[0];
  const enemies = army([piece("guard", 101), piece("infantry", 102, 1, 36), piece("medic", 103, 1, 27)], 1);
  const ctx: CombatContext = { fighters: [master, ...enemies], tick: 1, events: [], effects: [] };
  master.mana = 100;
  return { master, enemies, ctx };
}
function transform(star = 1) {
  const state = setup(star);
  expect(castSkill(state.ctx, state.master, state.enemies[0])).toBe(true);
  state.ctx.tick += WUSHI.windup;
  expect(advanceWushi(state.ctx, state.master)).toBe(true);
  return state;
}

describe("无式与旧横扫的独立战斗版本", () => {
  it("新局一费，旧目录四费；身板与技能描述按战斗版本分开", () => {
    expect(hasWushiRules(CURRENT_COMBAT_VERSION)).toBe(true);
    expect(RULES.version.startsWith("singleplayer-")).toBe(true);
    expect(SAVE_SCHEMA).toBeGreaterThanOrEqual(55);
    expect(unitDefinition("master")).toMatchObject({ cost: 1, hp: 700, attack: 64, armor: 5, interval: 7.2 });
    expect(unitDefinition("master", "continuity")).toMatchObject({ cost: 4, hp: 1300, attack: 95, armor: 6, interval: 3 });
    expect(skillName("master")).toBe("无式");expect(skillName("master", "continuity")).toBe("横扫");
    expect(skillDescription("master")).toContain("6/12/18");
    expect(army([piece("master", 1)], 0, "continuity")[0]).not.toHaveProperty("wushi");
    for (const version of COMBAT_VERSIONS) expect(hasWushiRules(version)).toBe(COMBAT_VERSIONS.indexOf(version)>=COMBAT_VERSIONS.indexOf("wushi"));
  });
  for (const star of [1, 2, 3]) it(`${star}星变身只有固定护甲，按时结束且不被眩晕延长`, () => {
    const { master, enemies, ctx } = setup(star);
    master.skillPower = 4;const hp = master.hp, attack = master.attack, base = effectiveArmor(master, 1);
    expect(castSkill(ctx, master, enemies[0])).toBe(true);
    expect(master.mana).toBe(0);expect(master.wushi?.forms).toBe(0);
    expect(effectiveArmor(master, ctx.tick)).toBe(base);expect(ctx.events).toHaveLength(0);
    ctx.tick += WUSHI.windup;advanceWushi(ctx, master);
    const until = ctx.tick + WUSHI.duration[star - 1];
    expect(master.wushi).toMatchObject({ forms: 1, until, armor: WUSHI.armor[star - 1] });
    expect(effectiveArmor(master, ctx.tick)).toBe(base + WUSHI.armor[star - 1]);
    expect(master.hp).toBe(hp);expect(master.attack).toBe(attack);
    master.stunUntil = until + 30;ctx.tick = until;expireWushi(ctx);
    expect(effectiveArmor(master, ctx.tick)).toBe(base);expect(master.wushi?.until).toBe(0);
    expect(wushiActive(master, ctx.tick)).toBe(false);
  });
  for (const control of ["stun", "silence", "charm", "death"] as const)
    it(`蓄力被${control}中断，能量和20秒冷却不返还`, () => {
      const { master, enemies, ctx } = setup();
      expect(castSkill(ctx, master, enemies[0])).toBe(true);
      const ready = master.skillReadyAt;ctx.tick++;
      if (control === "stun") master.stunUntil = 10;
      if (control === "silence") master.silenceUntil = 10;
      if (control === "charm") master.charm = { side: master.side, attack: master.attack, until: 10 };
      if (control === "death") master.hp = 0;
      advanceWushi(ctx, master);
      expect(master.wushi).toMatchObject({ forms: 0, interrupted: 1, until: 0 });
      expect(master.wushi?.casting).toBeUndefined();expect(master.mana).toBe(0);
      expect(master.skillReadyAt).toBe(ready);
      master.stunUntil=0;master.silenceUntil=0;delete master.charm;master.hp=master.maxHp;master.mana=100;
      expect(castSkill(ctx, master, enemies[0])).toBe(false);
    });
  it("变身时停能，结束后恢复充能；已完成的变身不被沉默取消", () => {
    const { master, ctx } = transform();
    expect(usesEnergy(master)).toBe(false);gainMana(master, 50, ctx.tick);expect(master.mana).toBe(0);
    master.silenceUntil=100;expect(advanceWushi(ctx,master)).toBe(false);
    expect(wushiActive(master,ctx.tick)).toBe(true);
    ctx.tick=master.wushi!.until;expireWushi(ctx);master.silenceUntil=0;
    expect(usesEnergy(master)).toBe(true);gainMana(master,50,ctx.tick);expect(master.mana).toBeGreaterThan(0);
  });
  it("横斩独立结算主目标、近邻和护盾，超出范围或友军不受影响", () => {
    const { master, enemies, ctx } = transform();
    const [primary,near,far]=enemies;primary.x=3;primary.y=3;near.x=4;near.y=3;far.x=6;far.y=3;
    const ally=army([piece("medic",3)],0)[0];ally.x=2;ally.y=3;ctx.fighters.push(ally);
    near.shield=30;near.shieldUntil=100;const allyHp=ally.hp,farHp=far.hp;
    expect(wushiStrike(ctx,master,primary)).toBe(true);
    expect(ctx.events.filter(e=>e.attacker===master.uid)).toHaveLength(2);
    expect(ctx.events.every(e=>!e.skill&&e.damageType==="physical")).toBe(true);
    expect(ctx.events.find(e=>e.target===near.uid)).toMatchObject({wushiSplash:true,primary:false,absorbed:30});
    expect(master.wushi).toMatchObject({sweeps:1,splashHits:1});
    expect(ally.hp).toBe(allyHp);expect(far.hp).toBe(farHp);
  });
  it("普通横斩保留吸血与反伤，反伤击杀后不会继续伤害其他邻格", () => {
    const {master,enemies,ctx}=transform();const [primary,near]=enemies;
    primary.reflection=100;near.x=4;near.y=3;const nearHp=near.hp;
    master.hp=10;master.lifesteal=0;
    wushiStrike(ctx,master,primary);
    expect(master.hp).toBe(0);expect(near.hp).toBe(nearHp);
    const second=transform();second.master.hp=second.master.maxHp-100;second.master.lifesteal=0.5;
    wushiStrike(second.ctx,second.master,second.enemies[0]);expect(second.master.healing).toBeGreaterThan(0);
  });
  it("战斗不改写棋子，三熊猫开战即可进入蓄力，轻量与完整结果一致", () => {
    const left=[piece("master",1,2),piece("panda",2,2,56),piece("monk",3,2,44)];
    const right=[piece("guard",101,2),piece("infantry",102,2,36),piece("medic",103,2,43)];
    const before=structuredClone([left,right]),full=simulate(left,right),light=simulateOutcome(left,right);
    expect([left,right]).toEqual(before);expect(full.frames[1].fighters.find(f=>f.uid===1)?.wushi?.casting).toBeDefined();
    expect(full.frames.some(frame=>frame.fighters.some(f=>f.wushi?.forms))).toBe(true);
    expect(light.winner).toBe(full.winner);expect(light.final.tick).toBe(full.frames.at(-1)!.tick);expect(light.final.fighters).toEqual(full.frames.at(-1)!.fighters);
  });
  it("变身护甲与已有护甲强化分别计时，到期只移除自身加成",()=>{
    const {master,ctx}=transform(2);master.armorBuff=10;master.armorBuffUntil=200;
    expect(effectiveArmor(master,ctx.tick)).toBe(master.armor+10+12);
    ctx.tick=master.wushi!.until;expireWushi(ctx);
    expect(effectiveArmor(master,ctx.tick)).toBe(master.armor+10);expect(master.armorBuffUntil).toBe(200);
  });
  it("已经完成的横斩是普通攻击，技能强度不放大伤害",()=>{
    const a=transform(),b=transform();a.master.skillPower=10;b.master.skillPower=1;
    wushiStrike(a.ctx,a.master,a.enemies[0]);wushiStrike(b.ctx,b.master,b.enemies[0]);
    expect(a.ctx.events.map(e=>e.amount)).toEqual(b.ctx.events.map(e=>e.amount));
  });
  it("变身到期后可再次施放，但未到20秒冷却时仍被拒绝",()=>{
    const {master,enemies,ctx}=transform();const ready=master.skillReadyAt!;
    ctx.tick=master.wushi!.until;expireWushi(ctx);master.mana=100;
    expect(castSkill(ctx,master,enemies[0])).toBe(false);
    ctx.tick=ready;expect(castSkill(ctx,master,enemies[0])).toBe(true);
    ctx.tick+=WUSHI.windup;advanceWushi(ctx,master);expect(master.wushi!.forms).toBe(2);
  });
  it("新形态图片、点击范围缩放和蓄力动作随真实状态切换",()=>{
    const {master,ctx}=transform();expect(fighterSprite(master)).toBe("master-wushi");
    expect(wushiScale(master,ctx.tick)).toBeGreaterThan(1);
    expect(wushiLabels(master,ctx.tick).join()).toContain("护甲+6");
    expect(wushiPose(0.5)).not.toEqual(wushiPose(0.5,true));
    ctx.tick=master.wushi!.until;expireWushi(ctx);
    expect(fighterSprite(master)).toBe("master");expect(wushiScale(master,ctx.tick)).toBe(1);
  });
  it("演示分析保留实际横斩统计且不读取未来的变身或命中",()=>{
    const input=structuredClone(WUSHI_DEMO),battle=simulate(input.left,input.right);
    expect(input).toEqual(WUSHI_DEMO);
    const early=analyzeBattle(battle,0).sides[0].fighters.find(f=>f.defId==="master")!;
    const late=analyzeBattle(battle).sides[0].fighters.find(f=>f.defId==="master")!;
    expect(early.wushi).toMatchObject({forms:0,sweeps:0,splashHits:0});
    expect(late.wushi!.forms).toBeGreaterThan(0);expect(late.wushi!.sweeps).toBeGreaterThan(0);
    expect(late.wushi!.splashHits).toBeGreaterThan(0);expect(late.skillDamage).toBe(0);
  });
  it("一费共享池与旧局四费目录分别守恒，准备迁移不改资源和价格", () => {
    const game=createGame(311,"classic");expect(validGame(game)).toBe(true);
    const all=game.pool.master+game.players.reduce((n,p)=>n+p.shop.filter(id=>id==="master").length,0);
    expect(all).toBe(45);
    const old:unknown=structuredClone(reserve.game);if(!validGame(old))throw Error("bad normal capture");
    const before=structuredClone(old),raw=JSON.stringify({schema:54,rules:"singleplayer-0.55",savedAt:1,revision:1,
      game:old,playback:{time:0,speed:1,paused:false}});
    const decoded=decodeSave(raw);expect(decoded.status).toBe("migrated");
    const migrated=decoded.data!.game;
    expect(migrated).toEqual({...before,combatVersion:CURRENT_COMBAT_VERSION});
    expect(unitCost("master",migrated.catalogVersion)).toBe(4);expect(unitCost("master")).toBe(1);
    expect(traitTiers(migrated.combatVersion)).toEqual(traitTiers("continuity"));
    const insects=["eyebug","blastbug","spider","wasp"].map((id,i)=>piece(id,i+1));
    expect(mergeCount(insects,"eyebug",2,"wushi")).toBe(2);
    const p=migrated.players[0],owned=p.pieces.find(piece=>piece.defId==="master")!;
    const pool=migrated.pool.master,gold=p.gold;expect(sell(migrated,p,owned.uid)).toBe(true);
    expect(p.gold).toBe(gold+4);expect(migrated.pool.master).toBe(pool+1);
    expect(validGame(migrated)).toBe(true);
  });
  it("现有目录仍可通过真实购买接口取得武僧", () => {
    const g=createGame(311,"classic"),p=g.players[0];
    if(p.shop[0])g.pool[p.shop[0]!]++;
    p.shop[0]="master";g.pool.master--;
    expect(buy(g,p,0)).toBe(true);expect(p.gold).toBe(9);expect(validGame(g)).toBe(true);
  });
  for(const phase of ["battle","result","finished"] as const)
    it(`0.55 ${phase}存档维持旧战斗与四费目录，准备期再切换`,()=>{
      const input:unknown=structuredClone(reserve.game);if(!validGame(input))throw Error("bad capture");
      const g=input;if(phase==="finished")g.players[0].hp=1;
      let result=startRound(g)!;
      if(phase!=="battle")settle(g,result);
      while(phase==="finished"&&g.phase!=="finished"){
        if(g.reward)claimReward(g,0);nextRound(g);g.combatVersion="continuity";
        result=startRound(g)!;settle(g,result);
      }
      expect(g.phase).toBe(phase);expect(validGame(g)).toBe(true);
      const before=structuredClone(g),decoded=decodeSave(JSON.stringify({schema:54,rules:"singleplayer-0.55",
        savedAt:1,revision:1,game:g,playback:{time:1.25,speed:2,paused:true}}));
      expect(decoded.status).toBe("migrated");expect(decoded.data!.game).toEqual(before);
      const loaded=decoded.data!.game;expect(unitCost("master",loaded.catalogVersion)).toBe(4);
      if(phase==="battle"){
        expect(resumeRound(loaded)!.battle).toEqual(result.battle);
      }else if(phase==="result"){
        if(loaded.reward)claimReward(loaded,0);nextRound(loaded);
        expect(loaded.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(loaded.catalogVersion).toBe("continuity");
        expect(validGame(loaded)).toBe(true);
      }
    });
  for(const entry of frozen.fixtures)it(`0.55旧回放冻结：${entry.name}`,async()=>{
    const hash=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,"0")).join("");
    expect(await hash(simulate(entry.left,entry.right,"continuity"))).toBe(entry.hash);
  });
});
