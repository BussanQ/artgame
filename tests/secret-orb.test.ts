import {describe,expect,it} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,damage,type CombatContext} from "../src/engine/abilities";
import {advanceSecretOrbAction,advanceSecretOrbPulses,expireSecretOrbs,secretOrbCenter,secretOrbContains} from "../src/engine/secret-orb";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,hasSecretOrbRules,hasShurikenRules,type Piece} from "../src/engine/types";
import {SECRET_ORB,skillDescription,skillName} from "../src/data/skills";
import {RULES} from "../src/data/units";
import {unitDefinition,unitSprite} from "../src/data/unit-stats";
import {unitCost} from "../src/data/catalog";
import {abilityCredit,pieceStrength,lineupScore} from "../src/engine/ai";
import {AI_PROFILES} from "../src/data/ai-profiles";
import {buy,createGame,nextRound,resumeRound,sell,settle,startRound} from "../src/engine/game";
import {claimReward} from "../src/engine/equipment";
import {decodeSave,SAVE_SCHEMA,validGame} from "../src/engine/persistence";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {fighterSprite} from "../src/engine/summons";
import {isMelee,REST_POSE} from "../src/render/melee";
import {isRanged} from "../src/render/ranged";
import {secretOrbLabels,secretOrbPose} from "../src/render/secret-orb";
import {compactBattleLabels} from "../src/render/battle-inspection";
import {pieceDetails} from "../src/ui/bench-tooltip";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {rotationMarkup} from "../src/ui/rotation";
import {SECRET_ORB_DEMO,SECRET_ORB_COUNTER_DEMO} from "../src/data/secret-orb-demo";
import frozen from "./fixtures/pre-v059-replays.json";
import paid from "./fixtures/secret-orb-reserve.json";

// Explicit unit-test scaffolding; never counted as normal economic observations.
const piece=(defId:string,uid:number,star=1,position=35):Piece=>({defId,uid,star,position});
function setup(star=1) {
  const source=army([piece("monk",1,star)],0)[0];source.x=3;source.y=6;source.mana=100;
  const enemies=army([piece("infantry",101),piece("infantry",102),piece("infantry",103)],1);
  enemies.forEach((f,i)=>{f.x=[3,4,6][i];f.y=[2,2,3][i];f.hp=f.maxHp=10000;f.magicResist=0;f.mana=0;});
  const ally=army([piece("guard",2)],0)[0];ally.x=3;ally.y=3;ally.hp-=100;
  const ctx:CombatContext={fighters:[source,ally,...enemies],tick:1,events:[],effects:[]};
  return {source,enemies,ally,ctx};
}
function form(state:ReturnType<typeof setup>) {
  expect(castSkill(state.ctx,state.source,state.enemies[0])).toBe(true);
  state.ctx.tick+=SECRET_ORB.windup;expect(advanceSecretOrbAction(state.ctx,state.source)).toBe(true);
  return state;
}
function finish(state:ReturnType<typeof setup>) {
  const {source,ctx}=state,end=source.secretOrb!.channel!.until;
  while(ctx.tick<end){ctx.tick++;advanceSecretOrbPulses(ctx);}
}

describe("禅师秘法球",()=>{
  it("版本继承、四费远程本体与旧三费治疗定义独立",()=>{
    expect(CURRENT_COMBAT_VERSION).toBe("secret-orb");expect(RULES.version).toBe("singleplayer-0.59");expect(SAVE_SCHEMA).toBe(58);
    for(const version of COMBAT_VERSIONS){expect(hasSecretOrbRules(version)).toBe(COMBAT_VERSIONS.indexOf(version)>=COMBAT_VERSIONS.indexOf("secret-orb"));if(hasSecretOrbRules(version))expect(hasShurikenRules(version)).toBe(true);}
    expect(unitDefinition("monk")).toMatchObject({cost:4,hp:850,attack:59.5,armor:5,range:5,interval:8,initialMana:0,regeneration:5});
    expect(unitDefinition("monk","shuriken")).toMatchObject({cost:3,hp:1100,attack:60,armor:6,range:1,interval:3});
    expect(unitDefinition("monk","shuriken").regeneration).toBeUndefined();
    expect(unitDefinition("monk","legacy").traits).toEqual(["熊猫","护卫"]);
    expect(unitDefinition("monk","shuriken").traits).toEqual(["熊猫","异能"]);
    expect(skillName("monk")).toBe("秘法球");expect(skillName("monk","shuriken")).toBe("气劲");
    expect(army([piece("monk",1)],0)[0]).toMatchObject({mana:0,regeneration:1.25,innateRegen:true});
    expect(army([piece("monk",1)],0,"shuriken")[0].secretOrb).toBeUndefined();
  });
  it("蓄力锁定前方地面，不立即伤害，不治疗友军，不要求受伤友军",()=>{
    const {source,enemies,ally,ctx}=setup();ally.hp=ally.maxHp;const position={x:source.x,y:source.y};
    expect(castSkill(ctx,source,enemies[0])).toBe(true);expect(source.mana).toBe(0);expect(source.skillReadyAt).toBe(121);
    expect(source.secretOrb!.casting!.to).toEqual({x:3,y:3});expect(ctx.events).toHaveLength(0);
    expect({x:source.x,y:source.y}).toEqual(position);expect(ctx.effects.filter(e=>e.kind==="heal")).toHaveLength(0);
    ctx.tick+=2;advanceSecretOrbAction(ctx,source);expect(source.secretOrb!.formed).toBe(0);
    enemies[0].x=7;ctx.tick++;advanceSecretOrbAction(ctx,source);
    expect(source.secretOrb!.channel).toMatchObject({x:3,y:3,start:4,until:28,nextIndex:0});expect(ctx.events).toHaveLength(0);
  });
  for(const star of [1,2,3])it(`${star}星在准确持续时间内七跳，累计基础伤害与实际削能正确`,()=>{
    const state=form(setup(star)),{source,enemies,ally,ctx}=state,orb=source.secretOrb!.channel!;
    const start=ctx.tick,end=orb.until,times:number[]=[];let last=0;
    while(ctx.tick<end){ctx.tick++;advanceSecretOrbPulses(ctx);if(source.secretOrb!.pulses!==last){times.push(ctx.tick-start);last=source.secretOrb!.pulses;}}
    expect(times).toEqual(star===1?[4,7,11,14,18,21,24]:star===2?[4,8,12,15,19,23,26]:[4,8,12,16,20,24,28]);
    expect(source.secretOrb!.pulses).toBe(7);expect(source.secretOrb!.formed).toBe(1);
    expect(10000-enemies[0].hp).toBe(SECRET_ORB.damage[star-1]);expect(enemies[0].mana).toBe(49);
    expect(ally.hp).toBe(ally.maxHp-100);expect(source.healing).toBe(0);
    expect(source.secretOrb!.hits).toBe(star===3?21:14);
    expect(source.secretOrb!.energyRemoved).toBe(star===3?63:42);
    expect(source.secretOrb!.channel).toBeUndefined();expect(source.secretOrb!.interrupted).toBe(0);
    ctx.tick++;advanceSecretOrbPulses(ctx);expect(source.secretOrb!.pulses).toBe(7);
  });
  for(const invalid of ["range","concealed","friend","cooldown","stun","silence","taunt"] as const)
    it(`${invalid}阻止起手且不扣能量`,()=>{
      const {source,enemies,ctx}=setup();
      if(invalid==="range")enemies[0].x=7;
      if(invalid==="concealed")enemies[0].air!.phaseUntil=100;
      if(invalid==="friend")enemies[0].side=0;
      if(invalid==="cooldown")source.skillReadyAt=100;
      if(invalid==="stun")source.stunUntil=100;
      if(invalid==="silence")source.silenceUntil=100;
      if(invalid==="taunt"){const master=army([piece("master",201)],1)[0];master.x=3;master.y=5;master.wushi!.until=100;source.taunt={source:201,until:50};ctx.fighters.push(master);}
      expect(castSkill(ctx,source,enemies[0])).toBe(false);expect(source.mana).toBe(100);
      expect(source.secretOrb!.casting).toBeUndefined();
    });
  for(const phase of ["windup","channel"] as const)for(const cause of ["death","stun","silence","charm"] as const)
    it(`${phase}期间${cause}立即终止，只保留已发生跳数且不退款`,()=>{
      const state=setup(),{source,enemies,ctx}=state;
      if(phase==="channel")form(state);else castSkill(ctx,source,enemies[0]);
      if(phase==="channel"){for(let i=0;i<4;i++){ctx.tick++;advanceSecretOrbPulses(ctx);}}
      const pulses=source.secretOrb!.pulses,hp=enemies[0].hp;
      if(cause==="death")source.hp=0;
      if(cause==="stun")source.stunUntil=100;
      if(cause==="silence")source.silenceUntil=100;
      if(cause==="charm"){source.charm={until:100,side:0,attack:source.attack};source.side=1;}
      expireSecretOrbs(ctx);expect(source.secretOrb!.casting).toBeUndefined();expect(source.secretOrb!.channel).toBeUndefined();
      expect(source.secretOrb!.interrupted).toBe(1);expect(source.mana).toBe(0);expect(source.skillReadyAt).toBe(121);
      ctx.tick+=40;advanceSecretOrbPulses(ctx);expireSecretOrbs(ctx);
      expect(source.secretOrb!.pulses).toBe(pulses);expect(source.secretOrb!.interrupted).toBe(1);expect(enemies[0].hp).toBe(hp);
    });
  it("完成七跳后阵亡不再虚报中断",()=>{
    const state=form(setup());finish(state);state.source.hp=0;expireSecretOrbs(state.ctx);
    expect(state.source.secretOrb!.interrupted).toBe(0);
  });
  it("圆形范围与格心边界一致，移动出圈不被追踪，隐蔽仍可被范围波及",()=>{
    expect(secretOrbCenter({x:3,y:6},{x:3,y:5})).toEqual({x:3,y:5});
    expect(secretOrbCenter({x:3,y:6},{x:3,y:1})).toEqual({x:3,y:3});
    expect(secretOrbContains({x:3,y:3,radius:2},{x:5,y:3})).toBe(true);
    expect(secretOrbContains({x:3,y:3,radius:2},{x:5,y:4})).toBe(false);
    const state=form(setup()),{enemies,source,ctx}=state;enemies[0].x=7;enemies[1].air!.phaseUntil=100;
    for(let i=0;i<4;i++){ctx.tick++;advanceSecretOrbPulses(ctx);}
    expect(enemies[0].hp).toBe(10000);expect(enemies[1].hp).toBe(9891);expect(source.secretOrb!.hits).toBe(1);
  });
  it("法强在起手冻结，逐跳护盾/法防结算；不会触发普攻吸血或暴击",()=>{
    const state=setup(),{source,enemies,ctx}=state;source.skillPower=1.3;source.hp=100;source.lifesteal=1;
    source.assassinCrit={chance:1,multiplier:9,attempts:0,crits:0};enemies[0].magicResist=0.4;enemies[0].shield=80;enemies[0].armor=999;
    form(state);source.skillPower=10;source.attack=99999;
    for(let i=0;i<4;i++){ctx.tick++;advanceSecretOrbPulses(ctx);}
    expect(enemies[0].hp).toBe(9995);expect(enemies[0].shield).toBe(0);expect(source.hp).toBe(100);expect(source.mana).toBe(0);
    expect(source.assassinCrit.crits).toBe(0);expect(ctx.events.filter(e=>e.attacker===source.uid).every(e=>e.skill&&e.periodic&&e.damageType==="magic"&&!e.empowered)).toBe(true);
  });
  it("能量锁定时只扣实际已有能量；被动、残魂和技能免伤不产生虚假削能",()=>{
    const state=form(setup()),{source,enemies,ctx}=state;
    enemies[0].mana=2;enemies[0].manaLockUntil=100;
    enemies[1].immortal={spent:true,until:100,duration:20};enemies[2].x=3;enemies[2].y=3;
    enemies[2].bladeStorm={until:100,next:100,remaining:1,damage:1};
    for(let i=0;i<4;i++){ctx.tick++;advanceSecretOrbPulses(ctx);}
    expect(enemies[0].mana).toBe(0);expect(source.secretOrb!.energyRemoved).toBe(2);
    expect(enemies[1].hp).toBe(10000);expect(enemies[2].hp).toBe(10000);
    expect(source.secretOrb!.hits).toBe(1);expect(ctx.effects.filter(e=>e.kind==="drain").map(e=>e.amount)).toEqual([2]);
    finish(state);expect(source.secretOrb!.energyRemoved).toBe(2);
  });
  it("嘲讽不撤销已经开始的维持；满能量等待冷却结束",()=>{
    const state=form(setup()),{source,enemies,ctx}=state;
    source.taunt={source:999,until:50};finish(state);expect(source.secretOrb!.pulses).toBe(7);
    delete source.taunt;source.mana=100;expect(castSkill(ctx,source,enemies[0])).toBe(false);expect(source.mana).toBe(100);
    ctx.tick=source.skillReadyAt!;expect(castSkill(ctx,source,enemies[0])).toBe(true);
  });
  it("反伤在一次脉冲中击杀维持者，后续目标及未来脉冲停止",()=>{
    const state=form(setup()),{source,enemies,ctx}=state;source.hp=1;enemies[0].reflection=10;
    for(let i=0;i<4;i++){ctx.tick++;advanceSecretOrbPulses(ctx);}
    expect(source.hp).toBe(0);expect(source.secretOrb!.hits).toBe(1);expect(enemies[1].hp).toBe(10000);
    expect(source.secretOrb!.channel).toBeUndefined();expect(source.secretOrb!.interrupted).toBe(1);
  });
  it("两个来源的秘法球独立重叠，不互相覆盖，也不共用冷却",()=>{
    const state=setup(),other=army([piece("monk",3)],0)[0];other.x=3;other.y=6;other.mana=100;state.ctx.fighters.push(other);
    castSkill(state.ctx,state.source,state.enemies[0]);castSkill(state.ctx,other,state.enemies[0]);
    state.ctx.tick+=3;advanceSecretOrbAction(state.ctx,state.source);advanceSecretOrbAction(state.ctx,other);finish(state);
    expect(10000-state.enemies[0].hp).toBe(1520);expect(other.secretOrb!.pulses).toBe(7);
    expect(state.source.secretOrb!.pulses).toBe(7);
  });
  it("现有发动窗口中普通攻击被阻止，完整和快速结算相同，分析不读取未来",()=>{
    const input=structuredClone(SECRET_ORB_DEMO),full=simulate(input.left,input.right),quick=simulateOutcome(input.left,input.right);
    expect(input).toEqual(SECRET_ORB_DEMO);expect(quick.winner).toBe(full.winner);expect(quick.final.fighters).toEqual(full.frames.at(-1)!.fighters);
    const early=analyzeBattle(full,0),late=analyzeBattle(full);expect(early.sides[0].fighters.find(f=>f.defId==="monk")!.secretOrb).toMatchObject({formed:0,pulses:0,hits:0,energyRemoved:0});
    const monk=late.sides[0].fighters.find(f=>f.defId==="monk")!;
    expect(monk.secretOrb).toMatchObject({formed:1,pulses:7,hits:18,energyRemoved:51,interrupted:0});
    expect(monk.skillDamage).toBeGreaterThan(0);expect(full.winner).toBe(0);
    expect(battleAnalysisMarkup(late,"damage","秘法",full.frames.length-1,late.seconds*4)).toContain("实际削能");
    for(const frame of full.frames)for(const f of frame.fighters.filter(f=>f.secretOrb?.casting||f.secretOrb?.channel))
      expect(frame.events.filter(e=>e.attacker===f.uid&&!e.skill&&!e.reflected)).toHaveLength(0);
    expect(full.frames.at(-1)!.fighters.every(f=>!f.secretOrb?.channel||f.hp>0)).toBe(true);
  });
  it("反制演示只替换一枚敌军，沉默确实截断维持而不改写战斗规则",()=>{
    const main=structuredClone(SECRET_ORB_DEMO),counter=structuredClone(SECRET_ORB_COUNTER_DEMO);
    expect(counter.left).toEqual(main.left);
    expect(counter.right.map(p=>p.uid===202?{...p,defId:"guard"}:p)).toEqual(main.right);
    const full=simulate(counter.left,counter.right),quick=simulateOutcome(counter.left,counter.right);
    expect(quick.final.fighters).toEqual(full.frames.at(-1)!.fighters);
    const interrupted=full.frames.find(frame=>frame.effects.some(e=>e.name==="秘法球中断"))!;
    const source=interrupted.fighters.find(f=>f.uid===104)!;
    expect(source.silenceUntil).toBeGreaterThan(interrupted.tick);
    expect(source.secretOrb).toMatchObject({formed:1,pulses:3,hits:12,energyRemoved:33,interrupted:1});
    expect(full.frames.at(-1)!.fighters.find(f=>f.uid===104)!.secretOrb).toEqual(source.secretOrb);
    expect(full.winner).toBe(1);expect(counter).toEqual(SECRET_ORB_COUNTER_DEMO);
    const markup=battleAnalysisMarkup(analyzeBattle(full),"damage","反制",full.frames.length-1,full.frames.at(-1)!.tick);
    expect(markup).toContain("秘法球中断 1 次");expect(markup).not.toContain("秘法球中断 1 次 · 中断");
  });
  it("当前远程动作/头像与历史近战动作分开，读状态不修改战斗",()=>{
    expect(isMelee("monk")).toBe(false);expect(isRanged("monk")).toBe(true);
    expect(isMelee("monk","shuriken")).toBe(true);expect(isRanged("monk","shuriken")).toBe(false);
    expect(pieceDetails(piece("monk",1)).action).toBe("转杖凝珠推出");expect(pieceDetails(piece("monk",1),"shuriken").action).toBe("沉身推掌");
    const state=form(setup()),before=structuredClone(state.source);expect(fighterSprite(state.source)).toBe("monk-orb");expect(unitSprite("monk","shuriken")).toBe("monk");
    expect(secretOrbLabels(state.source,state.ctx.tick).join()).toContain("余7跳");expect(compactBattleLabels(state.source,state.ctx.tick)).toContain("维持秘法球");
    expect(secretOrbPose(state.source,state.ctx.tick)).not.toEqual(REST_POSE);expect(state.source).toEqual(before);
    expect(skillDescription("monk")).toContain("760/1200/1300");
  });
  it("新目录四费15份、禁用面板四费，真实事务按四费扣款和返还",()=>{
    const game=createGame(173,"classic"),p=game.players[0];expect(game.pool.monk).toBe(15);expect(game.players.flatMap(p=>p.shop)).not.toContain("monk");
    expect(unitCost("monk")).toBe(4);expect(unitCost("monk","shuriken")).toBe(3);
    expect(rotationMarkup({combatVersion:CURRENT_COMBAT_VERSION,bannedSeries:["熊猫","骑兵","异虫"]})).toContain("禅师熊猫<small>4 金");
    // Legal pool/accounting state representing a level-six offer, explicitly a test fixture.
    p.level=6;game.pool[p.shop[0]!]++;p.shop[0]="monk";game.pool.monk--;
    expect(validGame(game)).toBe(true);expect(buy(game,p,0)).toBe(true);expect(p.gold).toBe(6);expect(validGame(game)).toBe(true);
    expect(sell(game,p,p.pieces[0].uid)).toBe(true);expect(p.gold).toBe(10);expect(game.pool.monk).toBe(15);expect(validGame(game)).toBe(true);
  });
  it("AI按范围施法而非团队治疗估值，法强有边界且星级仍重要",()=>{
    const profile=AI_PROFILES.find(p=>p.id==="pandas")!;
    for(const star of [1,2,3]){
      const base=piece("monk",1,star),staff={...base,items:["staff"]};
      expect(abilityCredit(base)).toBeGreaterThan(0);expect(abilityCredit(staff)).toBeGreaterThan(abilityCredit(base));
      expect(abilityCredit(staff)).toBeLessThanOrEqual(0.6);expect(pieceStrength(staff)).toBeGreaterThan(pieceStrength(base));
    }
    expect(pieceStrength(piece("monk",1,2))).toBeGreaterThan(pieceStrength({...piece("monk",1),items:["staff"]}));
    expect(lineupScore([piece("monk",1),piece("panda",2),piece("master",3)],profile)).toBeGreaterThan(0);
  });
  for(const phase of ["prepare","battle","result","finished"] as const)
    it(`0.58 ${phase}付费捕获迁移保留三费目录和全部资源，准备期才升级`,()=>{
      const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("invalid paid capture");const game=input;
      if(phase==="finished")game.players[0].hp=1;
      let result=phase==="prepare"?null:startRound(game)!;
      if(phase==="result"||phase==="finished")settle(game,result!);
      while(phase==="finished"&&game.phase!=="finished"){
        if(game.reward)claimReward(game,0);nextRound(game);game.combatVersion="shuriken";result=startRound(game)!;settle(game,result);
      }
      expect(game.phase).toBe(phase);const before=structuredClone(game),decoded=decodeSave(JSON.stringify({schema:57,rules:"singleplayer-0.58",savedAt:1,revision:1,game,playback:{time:1.5,speed:4,paused:true}}));
      expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(58);
      expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});expect(decoded.data!.game.catalogVersion).toBe("shuriken");
      expect(decoded.data!.playback).toEqual({time:1.5,speed:4,paused:true});
      if(phase==="battle")expect(resumeRound(decoded.data!.game)!.battle).toEqual(result!.battle);
      if(phase==="result"){const g=decoded.data!.game;if(g.reward)claimReward(g,0);nextRound(g);expect(g.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(g.catalogVersion).toBe("shuriken");}
    });
  for(const entry of frozen.fixtures)it(`旧完整回放${entry.version}：${entry.name}`,async()=>{
    const version=COMBAT_VERSIONS.find(version=>version===entry.version);
    if(!version)throw Error(`未知历史版本：${entry.version}`);
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(entry.left,entry.right,version))));
    const hash=Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("");expect(hash).toBe(entry.hash);
  });
});
