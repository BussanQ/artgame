import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { advanceAirSkills, castSkill, damage, type CombatContext } from "../src/engine/abilities";
import { advanceWushi, expireWushiTaunts, wushiStrike, wushiTauntTarget } from "../src/engine/wushi";
import { CURRENT_COMBAT_VERSION, COMBAT_VERSIONS, hasWushiControlRules, hasWushiRules, type CombatVersion, type Piece } from "../src/engine/types";
import { WUSHI, WUSHI_CONTROL, skillDescription } from "../src/data/skills";
import { RULES } from "../src/data/units";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { nextRound, resumeRound, settle, startRound } from "../src/engine/game";
import { claimReward } from "../src/engine/equipment";
import { unitCost } from "../src/data/catalog";
import { WUSHI_DEMO } from "../src/data/wushi-demo";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { compactBattleLabels } from "../src/render/battle-inspection";
import { wushiLabels } from "../src/render/wushi";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import frozen from "./fixtures/pre-v057-replays.json";
import capture from "./fixtures/wushi-control-reserve.json";

const piece = (defId:string,uid:number,star=1,position=35):Piece => ({defId,uid,star,position});
// Keep the 0.57 control fixture independent of later passive-infantry/body corrections.
function setup(star=1,version:CombatVersion="wushi-control") {
  const master=army([piece("master",1,star)],0,version)[0];master.x=3;master.y=3;master.mana=100;
  const enemies=army([piece("infantry",101),piece("infantry",102),piece("infantry",103)],1,version);
  enemies.forEach((f,i)=>{f.x=[3,4,6][i];f.y=4;});
  const ally=army([piece("infantry",2)],0,version)[0];ally.x=3;ally.y=2;
  const ctx:CombatContext={fighters:[master,ally,...enemies],tick:1,events:[],effects:[]};
  return {master,enemies,ally,ctx};
}
function release(state:ReturnType<typeof setup>) {
  expect(castSkill(state.ctx,state.master,state.enemies[0])).toBe(true);
  state.ctx.tick+=WUSHI.windup;expect(advanceWushi(state.ctx,state.master)).toBe(true);
  return state;
}

describe("客户端无式的三目标与周围嘲讽",()=>{
  it("版本单独继承，旧无式描述与旧四费目录继续独立",()=>{
    expect(hasWushiControlRules(CURRENT_COMBAT_VERSION)).toBe(true);
    expect(RULES.version).toMatch(/^singleplayer-/);expect(SAVE_SCHEMA).toBeGreaterThanOrEqual(56);
    for(const version of COMBAT_VERSIONS){
      expect(hasWushiControlRules(version)).toBe(COMBAT_VERSIONS.indexOf(version)>=COMBAT_VERSIONS.indexOf("wushi-control"));
      if(hasWushiControlRules(version))expect(hasWushiRules(version)).toBe(true);
    }
    expect(skillDescription("master")).toContain("最多3名");
    expect(skillDescription("master")).toContain("2秒");
    expect(skillDescription("master","wushi")).not.toContain("嘲讽");
    expect(unitCost("master")).toBe(1);expect(unitCost("master","wushi")).toBe(1);
    expect(unitCost("master","continuity")).toBe(4);
  });
  for(const star of [1,2,3])it(`${star}星仅在释放时嘲讽近敌，时长不随星级/技能强度放大`,()=>{
    const state=setup(star);state.master.skillPower=5;
    expect(castSkill(state.ctx,state.master,state.enemies[0])).toBe(true);
    expect(state.enemies.every(f=>!f.taunt)).toBe(true);
    state.ctx.tick+=WUSHI.windup;advanceWushi(state.ctx,state.master);
    const {master,enemies,ally,ctx}=state;
    expect(master.wushi?.taunts).toBe(2);expect(ally.taunt).toBeUndefined();
    expect(enemies[0].taunt).toEqual({source:master.uid,until:ctx.tick+8});
    expect(enemies[1].taunt).toEqual(enemies[0].taunt);expect(enemies[2].taunt).toBeUndefined();
    expect(ctx.effects.filter(e=>e.kind==="taunt")).toHaveLength(2);
    ctx.tick+=8;expireWushiTaunts(ctx);expect(enemies.every(f=>!f.taunt)).toBe(true);
    advanceWushi(ctx,master);expect(enemies.every(f=>!f.taunt)).toBe(true);
    expect(master.wushi?.taunts).toBe(2);
  });
  it("有效嘲讽阻止新技能且不扣能量，结束后恢复施法",()=>{
    const {master,enemies,ctx}=release(setup());const victim=enemies[0];victim.mana=100;
    expect(wushiTauntTarget(ctx,victim)).toBe(master);
    expect(castSkill(ctx,victim,master)).toBe(false);expect(victim.mana).toBe(100);
    ctx.tick=victim.taunt!.until;expireWushiTaunts(ctx);
    expect(wushiTauntTarget(ctx,victim)).toBeUndefined();
    expect(castSkill(ctx,victim,master)).toBe(true);
  });
  it("残魂、火种和技能免控单位不被嘲讽",()=>{
    const state=setup();
    state.enemies[0].immortal={spent:true,until:100,duration:16};
    state.enemies[1].phoenix={spent:true,eggUntil:100,bodyMaxHp:100,hatched:false};
    state.enemies[2].x=3;state.enemies[2].y=2;
    state.enemies[2].bladeStorm={until:100,next:100,remaining:1,damage:1};
    release(state);expect(state.enemies.every(f=>!f.taunt)).toBe(true);
    expect(state.master.wushi?.taunts).toBe(0);
  });
  for(const invalid of ["death","form-expiry","caster-charm","victim-charm","conceal"] as const)
    it(`${invalid}使嘲讽立即失效，保存帧不残留错误标记`,()=>{
      const {master,enemies,ctx}=release(setup());
      if(invalid==="death"){master.hp=1;damage(ctx,enemies[0],master,99999,"physical",false,true);}
      if(invalid==="form-expiry")master.wushi!.until=ctx.tick;
      if(invalid==="caster-charm")master.side=1;
      if(invalid==="victim-charm")enemies.forEach(f=>f.side=0);
      if(invalid==="conceal")master.air!.phaseUntil=ctx.tick+10;
      expect(wushiTauntTarget(ctx,enemies[0])).toBeUndefined();
      expireWushiTaunts(ctx);expect(enemies.every(f=>!f.taunt)).toBe(true);
    });
  it("范围外灵鱼可通过真实驱散技能解除友军嘲讽",()=>{
    const {master,enemies,ctx}=release(setup());
    const fish=army([piece("fish",201)],1)[0];fish.x=3;fish.y=7;fish.mana=100;ctx.fighters.push(fish);
    expect(castSkill(ctx,fish,master)).toBe(true);
    expect(enemies[0].taunt).toBeUndefined();expect(enemies[1].taunt).toBeDefined();
  });
  it("后释放的武僧覆盖先前来源，失效后不复活旧嘲讽",()=>{
    const state=release(setup()),{ctx,enemies}=state;
    const other=army([piece("master",3)],0)[0];other.x=3;other.y=5;other.mana=100;ctx.fighters.push(other);
    ctx.tick++;expect(castSkill(ctx,other,enemies[0])).toBe(true);
    ctx.tick+=WUSHI.windup;advanceWushi(ctx,other);
    expect(enemies[0].taunt?.source).toBe(other.uid);
    other.hp=0;expireWushiTaunts(ctx);expect(enemies[0].taunt).toBeUndefined();
  });
  it("不撤销嘲讽施加前已经开始的雷暴蓄力与发射承诺",()=>{
    const state=setup(),{master,ctx}=state;
    const storm=army([piece("stormcaller",105)],1)[0];storm.x=3;storm.y=4;storm.mana=100;
    ctx.fighters.push(storm);expect(castSkill(ctx,storm,master)).toBe(true);expect(storm.air?.cast).toBeDefined();
    release(state);expect(storm.taunt).toBeDefined();expect(storm.air?.cast).toBeDefined();
    advanceAirSkills(ctx,storm);expect(storm.storm?.bolts).toHaveLength(1);
  });
  for(const version of ["wushi","wushi-control"] as const)it(`${version}普通横斩保留各自命中上限`,()=>{
    const master=army([piece("master",1)],0,version)[0];master.x=3;master.y=4;
    master.wushi!.until=100;master.wushi!.armor=6;
    const enemies=army([101,102,103,104].map(uid=>piece("infantry",uid)),1,version);
    enemies.forEach((f,i)=>{f.x=[3,2,4,3][i];f.y=[3,3,3,2][i];});
    const ctx:CombatContext={fighters:[master,...enemies],tick:10,events:[],effects:[]};
    expect(wushiStrike(ctx,master,enemies[0])).toBe(true);
    const events=ctx.events.filter(e=>e.attacker===master.uid);
    expect(events).toHaveLength(version==="wushi"?4:WUSHI_CONTROL.maxTargets);
    expect(events.every(e=>!e.skill&&e.damageType==="physical")).toBe(true);
    expect(events.filter(e=>e.primary)).toHaveLength(1);
    expect(master.wushi?.splashHits).toBe(version==="wushi"?3:2);
  });
  it("完整战斗确实转火武僧、抑制新技能并遵守三目标；快速结算一致",()=>{
    const input=structuredClone(WUSHI_DEMO),battle=simulate(input.left,input.right),quick=simulateOutcome(input.left,input.right);
    expect(input).toEqual(WUSHI_DEMO);expect(quick.winner).toBe(battle.winner);
    expect(quick.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    let forcedAttacks=0;
    for(let i=1;i<battle.frames.length;i++){
      const frame=battle.frames[i],before=battle.frames[i-1];
      for(const victim of frame.fighters.filter(f=>f.taunt&&f.hp>0)){
        const held=before.fighters.find(f=>f.uid===victim.uid)?.taunt;
        if(!held||held.until!==victim.taunt!.until||held.source!==victim.taunt!.source)continue;
        for(const event of frame.events.filter(e=>e.attacker===victim.uid&&e.primary&&!e.skill&&!e.reflected)){
          expect(event.target).toBe(victim.taunt!.source);forcedAttacks++;
        }
        expect(frame.effects.filter(e=>e.source===victim.uid&&e.kind==="cast")).toHaveLength(0);
      }
      expect(frame.events.filter(e=>e.attacker===101&&!e.skill&&!e.reflected).length).toBeLessThanOrEqual(3);
    }
    expect(forcedAttacks).toBeGreaterThan(0);
    const early=analyzeBattle(battle,0),late=analyzeBattle(battle);
    expect(early.sides[0].fighters.find(f=>f.defId==="master")!.wushi?.taunts).toBe(0);
    expect(late.sides[0].fighters.find(f=>f.defId==="master")!.wushi!.taunts).toBeGreaterThan(0);
    expect(battleAnalysisMarkup(late,"damage","无式",battle.frames.length-1,late.seconds*4)).toContain("嘲讽施加");
  });
  it("战斗短提示和累计统计使用实际帧，不延长已结束的嘲讽",()=>{
    const {master,enemies,ctx}=release(setup());
    expect(compactBattleLabels(enemies[0],ctx.tick)).toContain("嘲讽");
    expect(wushiLabels(master,ctx.tick).join()).toContain("嘲讽施加 2人次");
    ctx.tick+=8;expireWushiTaunts(ctx);expect(compactBattleLabels(enemies[0],ctx.tick)).not.toContain("嘲讽");
  });
  for(const phase of ["prepare","battle","result","finished"] as const)
    it(`0.56 ${phase}迁移保留真实经营资源、旧目录和历史战斗`,()=>{
      const input:unknown=structuredClone(capture.game);if(!validGame(input))throw Error("invalid paid capture");
      const game=input;if(phase==="finished")game.players[0].hp=1;
      let result=phase==="prepare"?null:startRound(game)!;
      if(phase==="result"||phase==="finished")settle(game,result!);
      while(phase==="finished"&&game.phase!=="finished"){
        if(game.reward)claimReward(game,0);nextRound(game);game.combatVersion="wushi";
        result=startRound(game)!;settle(game,result);
      }
      expect(game.phase).toBe(phase);expect(validGame(game)).toBe(true);
      const before=structuredClone(game),decoded=decodeSave(JSON.stringify({schema:55,rules:"singleplayer-0.56",savedAt:1,revision:1,game,
        playback:{time:1.25,speed:4,paused:true}}));
      expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
      expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});
      expect(decoded.data!.game.catalogVersion).toBe("wushi");
      expect(decoded.data!.playback).toEqual({time:1.25,speed:4,paused:true});
      if(phase==="battle")expect(resumeRound(decoded.data!.game)!.battle).toEqual(result!.battle);
      if(phase==="result"){
        const loaded=decoded.data!.game;if(loaded.reward)claimReward(loaded,0);nextRound(loaded);
        expect(loaded.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(loaded.catalogVersion).toBe("wushi");
      }
    });
  for(const entry of frozen.fixtures)it(`0.56完整旧回放：${entry.name}`,async()=>{
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(entry.left,entry.right,"wushi"))));
    const hash=Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("");expect(hash).toBe(entry.hash);
  });
});
