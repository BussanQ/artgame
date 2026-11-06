import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { advanceShurikenCast, advanceShurikenFields, expireShurikenCasts, shurikenContains } from "../src/engine/shuriken";
import { castSkill, damage, type CombatContext } from "../src/engine/abilities";
import { COMBAT_VERSIONS, CURRENT_COMBAT_VERSION, hasShurikenRules, hasWushiControlRules, type Piece } from "../src/engine/types";
import { SHURIKEN, skillDescription, skillName } from "../src/data/skills";
import { RULES } from "../src/data/units";
import { unitDefinition, unitSprite } from "../src/data/unit-stats";
import { unitCost } from "../src/data/catalog";
import { buy, buyXp, createGame, nextRound, resumeRound, roll, sell, settle, startRound } from "../src/engine/game";
import { claimReward, itemScore } from "../src/engine/equipment";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { abilityCredit, pieceStrength } from "../src/engine/ai";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { fighterSprite } from "../src/engine/summons";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import { isMelee } from "../src/render/melee";
import { isRanged } from "../src/render/ranged";
import { shurikenLabels, shurikenPosition } from "../src/render/shuriken";
import { SHURIKEN_DEMO } from "../src/data/shuriken-demo";
import { rotationMarkup } from "../src/ui/rotation";
import frozen from "./fixtures/pre-v058-replays.json";
import paid from "./fixtures/wushi-control-reserve.json";

// Explicit combat scaffolding, never campaign/economic observations.
const piece=(defId:string,uid:number,star=1,position=35):Piece=>({defId,uid,star,position});
function setup(star=1) {
  const source=army([piece("panda",1,star)],0)[0];source.x=3;source.y=5;source.mana=100;
  const enemies=army([piece("infantry",101),piece("infantry",102),piece("infantry",103)],1);
  enemies.forEach((f,i)=>{f.x=[3,4,5][i];f.y=3;f.maxHp=f.hp=10000;});
  const ally=army([piece("guard",2)],0)[0];ally.x=3;ally.y=3;
  const ctx:CombatContext={fighters:[source,ally,...enemies],tick:1,events:[],effects:[]};
  return {source,enemies,ally,ctx};
}
function launch(state:ReturnType<typeof setup>) {
  expect(castSkill(state.ctx,state.source,state.enemies[0])).toBe(true);
  state.ctx.tick+=SHURIKEN.windup;expect(advanceShurikenCast(state.ctx,state.source)).toBe(true);
  return state;
}
function land(state:ReturnType<typeof setup>) {
  const {ctx,source}=state;ctx.tick=source.shuriken!.blades[0].until;advanceShurikenFields(ctx);
  return state;
}
function pulse(state:ReturnType<typeof setup>) {
  state.ctx.tick=state.source.shuriken!.fields[0].next;advanceShurikenFields(state.ctx);
}

describe("忍者熊猫风魔之刃",()=>{
  it("原卡三费远程本体与历史一费近战各自独立",()=>{
    expect(hasShurikenRules(CURRENT_COMBAT_VERSION)).toBe(true);
    expect(RULES.version).toMatch(/^singleplayer-/);expect(SAVE_SCHEMA).toBeGreaterThanOrEqual(57);
    for(const version of COMBAT_VERSIONS) {
      expect(hasShurikenRules(version)).toBe(COMBAT_VERSIONS.indexOf(version)>=COMBAT_VERSIONS.indexOf("shuriken"));
      if(hasShurikenRules(version))expect(hasWushiControlRules(version)).toBe(true);
    }
    expect(unitDefinition("panda")).toMatchObject({cost:3,hp:550,attack:66,armor:5,range:3,interval:4.8,initialMana:0});
    expect(unitDefinition("panda","wushi-control")).toMatchObject({cost:1,hp:530,attack:66,armor:2,range:1,interval:2});
    expect(skillName("panda")).toBe("风魔之刃");expect(skillName("panda","wushi-control")).toBe("影袭");
    expect(unitSprite("panda")).toBe("panda-shuriken");expect(unitSprite("panda","wushi-control")).toBe("panda");
    expect(army([piece("panda",1)],0)[0].mana).toBe(0);
    expect(army([piece("panda",1)],0,"wushi-control")[0].shuriken).toBeUndefined();
  });
  it("满能量后锁定落点蓄力，没有瞬移或提前造成伤害",()=>{
    const state=setup(),{source,enemies,ctx}=state;const position={x:source.x,y:source.y};
    expect(castSkill(ctx,source,enemies[0])).toBe(true);expect(source.mana).toBe(0);
    expect(ctx.events).toHaveLength(0);expect(ctx.effects.some(e=>e.kind==="teleport")).toBe(false);
    expect({x:source.x,y:source.y}).toEqual(position);expect(source.skillReadyAt).toBe(81);
    expect(source.shuriken!.casting!.to).toEqual({x:3,y:3});
    ctx.tick++;expect(advanceShurikenCast(ctx,source)).toBe(true);expect(source.shuriken!.launched).toBe(0);
    enemies[0].x=6;ctx.tick++;advanceShurikenCast(ctx,source);
    expect(source.shuriken!.blades[0].to).toEqual({x:3,y:3});expect(ctx.events).toHaveLength(0);
  });
  for(const invalid of ["range","concealed","friend","cooldown","stun","silence","taunt"] as const)
    it(`${invalid}阻止开始新飞镖且不扣能量`,()=>{
      const {source,enemies,ctx}=setup();
      if(invalid==="range")enemies[0].x=7;
      if(invalid==="concealed")enemies[0].air!.phaseUntil=50;
      if(invalid==="friend")enemies[0].side=0;
      if(invalid==="cooldown")source.skillReadyAt=50;
      if(invalid==="stun")source.stunUntil=50;
      if(invalid==="silence")source.silenceUntil=50;
      if(invalid==="taunt"){
        const master=army([piece("master",201)],1)[0];master.x=3;master.y=4;master.wushi!.until=50;
        source.taunt={source:201,until:10};ctx.fighters.push(master);
      }
      expect(castSkill(ctx,source,enemies[0])).toBe(false);expect(source.mana).toBe(100);
      expect(source.shuriken!.casting).toBeUndefined();
    });
  for(const interrupted of ["death","stun","silence","charm"] as const)
    it(`${interrupted}中断蓄力，不返还能量和20秒冷却`,()=>{
      const {source,enemies,ctx}=setup();castSkill(ctx,source,enemies[0]);
      if(interrupted==="death")source.hp=0;
      if(interrupted==="stun")source.stunUntil=50;
      if(interrupted==="silence")source.silenceUntil=50;
      if(interrupted==="charm")source.charm={until:50,attack:source.attack,side:0};
      ctx.tick++;expireShurikenCasts(ctx);expect(source.shuriken!.casting).toBeUndefined();
      expect(source.shuriken!.interrupted).toBe(1);expect(source.shuriken!.launched).toBe(0);
      expect(source.mana).toBe(0);expect(source.skillReadyAt).toBe(81);
      expireShurikenCasts(ctx);expect(source.shuriken!.interrupted).toBe(1);
    });
  for(const star of [1,2,3])it(`${star}星落地后严格五跳，范围与伤害按各自星级结算`,()=>{
    const state=land(launch(setup(star))),{source,enemies,ally,ctx}=state;
    const field=source.shuriken!.fields[0],start=ctx.tick;
    expect(source.shuriken!.landings).toBe(1);expect(ctx.events).toHaveLength(0);
    expect(field.radius).toBe(SHURIKEN.radius[star-1]);expect(field.until-start).toBe(20);
    ctx.tick=start+3;advanceShurikenFields(ctx);expect(source.shuriken!.pulses).toBe(0);
    for(let i=0;i<5;i++)pulse(state);
    expect(ctx.tick-start).toBe(20);expect(source.shuriken!.pulses).toBe(5);
    expect(10000-enemies[0].hp).toBe(Math.round(SHURIKEN.damage[star-1]*0.8)*5);
    expect(enemies[2].hp<10000).toBe(star===3);expect(ally.hp).toBe(ally.maxHp);
    ctx.tick++;advanceShurikenFields(ctx);expect(source.shuriken!.fields).toHaveLength(0);
    expect(source.shuriken!.pulses).toBe(5);
  });
  it("圆形范围的对角线、边界与走出刃阵按当时坐标计算",()=>{
    expect(shurikenContains({x:3,y:3,radius:1.2},{x:4,y:4})).toBe(false);
    expect(shurikenContains({x:3,y:3,radius:1.6},{x:4,y:4})).toBe(true);
    expect(shurikenContains({x:3,y:3,radius:2},{x:5,y:3})).toBe(true);
    const state=land(launch(setup())),{source,enemies}=state;
    enemies[0].x=7;enemies[1].x=3;enemies[1].air!.phaseUntil=100;
    pulse(state);expect(enemies[0].hp).toBe(10000);expect(enemies[1].hp).toBe(9880);
    expect(source.shuriken!.hits).toBe(1);
  });
  it("法术减伤与护盾逐跳结算，不触发普通暴击、普攻吸血或回能",()=>{
    const state=setup(),{source,enemies}=state;source.skillPower=1.3;source.lifesteal=1;source.hp=100;
    source.assassinCrit={chance:1,multiplier:9,attempts:0,crits:0};
    enemies[0].armor=999;enemies[0].magicResist=0.4;enemies[0].shield=100;
    land(launch(state));source.skillPower=10;source.attack=99999;pulse(state);
    expect(enemies[0].hp).toBe(9983);expect(enemies[0].shield).toBe(0);
    expect(source.hp).toBe(100);expect(source.mana).toBe(0);expect(source.assassinCrit.crits).toBe(0);
    expect(state.ctx.events.filter(e=>e.attacker===source.uid).every(e=>e.skill&&e.periodic&&e.damageType==="magic"&&!e.empowered)).toBe(true);
  });
  for(const afterRelease of ["death","stun","silence","charm"] as const)
    it(`发出后${afterRelease}不撤销落地伤害，阵营与威力不重写`,()=>{
      const state=launch(setup()),{source,enemies,ctx}=state;
      if(afterRelease==="death")source.hp=0;
      if(afterRelease==="stun")source.stunUntil=100;
      if(afterRelease==="silence")source.silenceUntil=100;
      if(afterRelease==="charm"){source.side=1;source.charm={until:100,side:0,attack:source.attack};}
      land(state);for(let i=0;i<5;i++)pulse(state);
      expect(10000-enemies[0].hp).toBe(600);expect(source.shuriken!.pulses).toBe(5);
      expect(ctx.events.some(e=>e.attacker===source.uid)).toBe(true);
    });
  it("残魂和技能免伤仍免疫，火种按正常法术防御处理",()=>{
    const state=land(launch(setup())),{enemies,source}=state;
    enemies[0].immortal={spent:true,until:100,duration:20};
    enemies[1].bladeStorm={until:100,next:100,damage:1,remaining:1};pulse(state);
    expect(enemies[0].hp).toBe(10000);expect(enemies[1].hp).toBe(10000);expect(source.shuriken!.hits).toBe(0);
  });
  it("满能量仍等待冷却；不同来源的刃阵可重叠，各自独立计数",()=>{
    const state=land(launch(setup())),{source,enemies,ctx}=state;
    source.mana=100;expect(castSkill(ctx,source,enemies[0])).toBe(false);expect(source.mana).toBe(100);
    const other=army([piece("panda",3)],0)[0];other.x=3;other.y=5;other.mana=100;ctx.fighters.push(other);
    castSkill(ctx,other,enemies[0]);ctx.tick+=2;advanceShurikenCast(ctx,other);ctx.tick=other.shuriken!.blades[0].until;
    advanceShurikenFields(ctx);const hp=enemies[0].hp;
    ctx.tick=other.shuriken!.fields[0].next;advanceShurikenFields(ctx);
    expect(enemies[0].hp).toBeLessThan(hp-120);expect(other.shuriken!.pulses).toBe(1);
    source.shuriken!.fields=[];ctx.tick=source.skillReadyAt!;expect(castSkill(ctx,source,enemies[0])).toBe(true);
  });
  it("新旧动作、头像与详情按战斗版本显示",()=>{
    expect(isMelee("panda")).toBe(false);expect(isRanged("panda")).toBe(true);
    expect(isMelee("panda","wushi-control")).toBe(true);expect(isRanged("panda","wushi-control")).toBe(false);
    expect(pieceDetails(piece("panda",1)).action).toBe("拧腰扬臂掷镖");
    expect(pieceDetails(piece("panda",1),"wushi-control").action).toBe("双刃交错斩");
    const state=launch(setup()),blade=state.source.shuriken!.blades[0],before=structuredClone(blade);
    expect(shurikenPosition(blade,blade.start)).toMatchObject(blade.from);
    expect(shurikenPosition(blade,blade.until)).toMatchObject(blade.to);expect(blade).toEqual(before);
    expect(fighterSprite(state.source)).toBe("panda-shuriken");
    expect(skillDescription("panda")).toContain("150/250/350");
    expect(shurikenLabels(state.source,state.ctx.tick).join()).toContain("风魔冷却");
  });
  it("招募目录与随机禁用面板使用新三费，旧局价格保留",()=>{
    const game=createGame(173,"classic");expect(validGame(game)).toBe(true);expect(game.catalogVersion).toBe(CURRENT_COMBAT_VERSION);
    expect(game.pool.panda).toBe(25);expect(game.players.flatMap(p=>p.shop)).not.toContain("panda");
    expect(unitCost("panda")).toBe(3);expect(unitCost("panda","wushi-control")).toBe(1);
    const context={combatVersion:CURRENT_COMBAT_VERSION,bannedSeries:["熊猫","骑兵","异虫"] as const};
    expect(rotationMarkup({...context,bannedSeries:[...context.bannedSeries]})).toContain("忍者熊猫<small>3 金");
    expect(rotationMarkup({...context,bannedSeries:[...context.bannedSeries],catalogVersion:"wushi-control"})).toContain("忍者熊猫<small>1 金");
  });
  it("AI给法强与初始能量有限收益，仍尊重本体星级",()=>{
    for(const star of [1,2,3]){
      const base=piece("panda",1,star),staff={...base,items:["staff"]};
      expect(abilityCredit(staff)).toBeGreaterThan(abilityCredit(base));expect(abilityCredit(staff)).toBeLessThanOrEqual(0.6);
      expect(pieceStrength(staff)).toBeGreaterThan(pieceStrength(base));
      expect(itemScore(base,"staff")).toBeGreaterThan(itemScore(base,"staff","wushi-control"));
    }
    expect(pieceStrength(piece("panda",1,2))).toBeGreaterThan(pieceStrength({...piece("panda",1),items:["staff"]}));
  });
  it("付费升级、刷新后三费报价的购买与出售保留总份数",()=>{
    // Explicit legal offer fixture: test transactions, not random draw probability.
    const game=createGame(3,"classic"),player=game.players[0];
    expect(buyXp(game,player)).toBe(true);expect(player.gold).toBe(5);expect(player.level).toBe(4);
    expect(roll(game,player)).toBe(true);expect(player.gold).toBe(3);
    if(player.shop[0])game.pool[player.shop[0]]++;
    player.shop[0]="panda";game.pool.panda--;
    const index=player.shop.indexOf("panda");expect(index).toBeGreaterThanOrEqual(0);
    expect(buy(game,player,index)).toBe(true);expect(player.gold).toBe(0);
    expect(player.pieces[0].defId).toBe("panda");expect(validGame(game)).toBe(true);
    const remaining=game.pool.panda;expect(sell(game,player,player.pieces[0].uid)).toBe(true);
    expect(player.gold).toBe(3);expect(game.pool.panda).toBe(remaining+1);expect(validGame(game)).toBe(true);
  });
  it("演示通过真实战斗推进，离线快速结算一致且分析不读取未来",()=>{
    const before=structuredClone(SHURIKEN_DEMO),battle=simulate(before.left,before.right),quick=simulateOutcome(before.left,before.right);
    expect(before).toEqual(SHURIKEN_DEMO);expect(quick.winner).toBe(battle.winner);
    expect(quick.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    const initial=analyzeBattle(battle,0).sides[0].fighters.find(f=>f.defId==="panda")!;
    expect(initial.shuriken).toMatchObject({launched:0,pulses:0,hits:0});expect(initial.damage).toBe(0);
    const report=analyzeBattle(battle),ninja=report.sides[0].fighters.find(f=>f.defId==="panda")!;
    expect(ninja.shuriken!.launched).toBeGreaterThan(0);expect(ninja.shuriken!.pulses).toBeGreaterThan(0);
    expect(ninja.skillDamage).toBeGreaterThan(0);expect(battleAnalysisMarkup(report,"damage","风魔",battle.frames.length-1,report.seconds*4)).toContain("刃阵脉冲");
    for(const frame of battle.frames)for(const f of frame.fighters.filter(f=>f.shuriken?.casting))
      expect(frame.events.filter(e=>e.attacker===f.uid&&!e.skill&&!e.reflected)).toHaveLength(0);
    expect(battle.frames.at(-1)!.fighters.every(f=>!f.shuriken?.casting||f.hp>0)).toBe(true);
  });
  for(const phase of ["prepare","battle","result","finished"] as const)
    it(`0.57 ${phase}存档保留经营资源与旧目录，仅准备期升级战斗`,()=>{
      const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("invalid paid capture");
      const game=input;game.combatVersion="wushi-control";if(phase==="finished")game.players[0].hp=1;
      let result=phase==="prepare"?null:startRound(game)!;
      if(phase==="result"||phase==="finished")settle(game,result!);
      while(phase==="finished"&&game.phase!=="finished"){
        if(game.reward)claimReward(game,0);nextRound(game);game.combatVersion="wushi-control";
        result=startRound(game)!;settle(game,result);
      }
      expect(game.phase).toBe(phase);const before=structuredClone(game);
      const decoded=decodeSave(JSON.stringify({schema:56,rules:"singleplayer-0.57",savedAt:1,revision:1,game,
        playback:{time:1.25,speed:4,paused:true}}));
      expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
      expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});
      expect(decoded.data!.game.catalogVersion).toBe("wushi");expect(decoded.data!.playback).toEqual({time:1.25,speed:4,paused:true});
      if(phase==="battle")expect(resumeRound(decoded.data!.game)!.battle).toEqual(result!.battle);
      if(phase==="result"){
        const loaded=decoded.data!.game;if(loaded.reward)claimReward(loaded,0);nextRound(loaded);
        expect(loaded.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(loaded.catalogVersion).toBe("wushi");
      }
    });
  for(const entry of frozen.fixtures)it(`0.57完整旧回放：${entry.name}`,async()=>{
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(entry.left,entry.right,"wushi-control"))));
    const hash=Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("");expect(hash).toBe(entry.hash);
  });
});
