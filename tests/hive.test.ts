import {describe,expect,it} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {attackInterval,castSkill,gainMana,type CombatContext} from "../src/engine/abilities";
import {advanceHiveAction,advanceHiveSkills,expireHiveStates,hiveBand,startHiveBurst} from "../src/engine/hive";
import {HIVE,skillDescription,skillRole} from "../src/data/skills";
import {HIVE_DEMO} from "../src/data/hive-demo";
import {unitCost} from "../src/data/catalog";
import {unitDefinition,unitSprite,unitMinimumAttackInterval} from "../src/data/unit-stats";
import {UNITS,RULES,COPIES} from "../src/data/units";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type CombatVersion,type Fighter,type Piece} from "../src/engine/types";
import {skillReady} from "../src/engine/triggers";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {pieceDetails,pieceDetailMarkup} from "../src/ui/bench-tooltip";
import {codexCards,codexFilters} from "../src/ui/unit-codex";
import {equipmentOverviewMarkup} from "../src/ui/equipment";
import {scoutingMarkup} from "../src/ui/scouting";
import {recruitmentMarkup} from "../src/ui/recruitment";
import {hiveLabels,hivePose} from "../src/render/hive";
import {compactBattleLabels} from "../src/render/battle-inspection";
import {fighterSprite} from "../src/engine/summons";
import {itemScore} from "../src/engine/equipment";
import {abilityCredit,pieceStrength} from "../src/engine/ai";
import {createGame,nextRound} from "../src/engine/game";
import {decodeSave,SAVE_SCHEMA,validGame} from "../src/engine/persistence";
import {pieceCopies,mergeCount} from "../src/engine/progression";
import {compute} from "../src/compute/job";
import frozen from "./fixtures/pre-v069-hive-replays.json";
import paid from "./fixtures/opening-ai-reserve.json";

const piece=(defId:string,uid:number,star=1,position:number|null=35):Piece=>({defId,uid,star,position});
function fighter(id:string,uid:number,side:0|1,star=1,x=3,y=4){
  const f=army([piece(id,uid,star)],side)[0];Object.assign(f,{x,y,mana:100});return f;
}
const context=(...fighters:Fighter[]):CombatContext=>({fighters,tick:10,events:[],effects:[]});
const demo=simulate(HIVE_DEMO.left,HIVE_DEMO.right,"hive");
function version(name:string):CombatVersion{const v=COMBAT_VERSIONS.find(v=>v===name);if(!v)throw Error(name);return v;}

describe("杀人蜂分圈震荡",()=>{
  for(const star of [1,2,3])it(`${star}星身板、近圈和外圈伤害独立，单个目标不重复吃两圈`,()=>{
    const source=fighter("wasp",101,0,star),inner=fighter("guard",201,1,1,4,4),outer=fighter("guard",202,1,1,5,4),far=fighter("guard",203,1,1,6,4);
    for(const target of [inner,outer,far])Object.assign(target,{hp:10000,maxHp:10000,armor:0});
    const ctx=context(source,inner,outer,far);
    expect(source).toMatchObject({hp:450*2**(star-1),attack:31*2**(star-1),armor:5,range:3,interval:5.2});
    expect(pieceDetails(piece("wasp",1,star))).toMatchObject({hp:source.hp,attack:source.attack,armor:5,interval:1.3});
    expect(castSkill(ctx,source,inner)).toBe(true);expect(ctx.events).toEqual([]);expect(source.skillReadyAt).toBe(90);
    ctx.tick=13;advanceHiveSkills(ctx);
    expect(ctx.events.filter(e=>e.skill).map(e=>[e.target,e.amount])).toEqual([[201,HIVE.innerDamage[star-1]*0.8],[202,HIVE.outerDamage[star-1]*0.8]]);
    expect(far.hp).toBe(10000);expect(source.hive).toMatchObject({explosions:1,innerHits:1,outerHits:1});
  });

  it("内外圆边界按欧氏距离判定，边缘含在圈内，范围随星级扩大",()=>{
    const c={x:3,y:3};expect(hiveBand(c,{x:4,y:3},1,2)).toBe("inner");expect(hiveBand(c,{x:5,y:3},1,2)).toBe("outer");
    expect(hiveBand(c,{x:5.001,y:3},1,2)).toBeUndefined();expect(hiveBand(c,{x:4,y:4},1,2)).toBe("outer");
    expect(hiveBand(c,{x:4,y:4},HIVE.inner[2],HIVE.outer[2])).toBe("inner");
    expect(hiveBand(c,{x:5,y:4},HIVE.inner[0],HIVE.outer[0])).toBeUndefined();
    expect(hiveBand(c,{x:5,y:4},HIVE.inner[1],HIVE.outer[1])).toBe("outer");
  });

  it("技能冻结起手法强，不使用攻击力；落地重新判定目标位置与防御",()=>{
    const source=fighter("wasp",101,0),a=fighter("guard",201,1,1,4,4),b=fighter("guard",202,1,1,6,4),ctx=context(source,a,b);
    source.skillPower=2;castSkill(ctx,source,a);source.skillPower=100;source.attack=99999;
    a.x=5;a.magicResist=0.5;b.x=4;b.magicResist=0;
    ctx.tick=13;advanceHiveSkills(ctx);expect(ctx.events.map(e=>[e.target,e.amount])).toEqual([[201,100],[202,400]]);
  });

  it("原目标走出范围可完全空放，仍消耗已开始的冷却与能量",()=>{
    const source=fighter("wasp",101,0),target=fighter("guard",201,1,1,4,4),ctx=context(source,target);
    castSkill(ctx,source,target);Object.assign(target,{x:7,y:0});ctx.tick=13;advanceHiveSkills(ctx);
    expect(ctx.events).toEqual([]);expect(source.mana).toBe(0);expect(source.skillReadyAt).toBe(90);expect(source.hive).toMatchObject({explosions:1,innerHits:0,outerHits:0});
    expect(advanceHiveAction(ctx,source)).toBe(true); // No extra attack in the release frame.
  });

  for(const block of ["stun","silence","charm","dead"] as const)it(`${block}打断蓄力且只记录一次，不返还能量和冷却`,()=>{
    const source=fighter("wasp",101,0),target=fighter("guard",201,1,1,4,4),ctx=context(source,target);castSkill(ctx,source,target);
    ctx.tick=11;if(block==="stun")source.stunUntil=30;if(block==="silence")source.silenceUntil=30;
    if(block==="charm")source.charm={until:30,attack:source.attack,side:1};if(block==="dead")source.hp=0;
    expireHiveStates(ctx);advanceHiveSkills(ctx);expect(source.hive!.casting).toBeUndefined();expect(source.hive!.interrupted).toBe(1);
    expect(source.mana).toBe(0);expect(source.skillReadyAt).toBe(90);expect(ctx.events).toEqual([]);
  });

  it("无范围内可见敌人或冷却未好时保留能量；已释放的震荡可波及隐蔽和飞行敌军",()=>{
    const source=fighter("wasp",101,0),target=fighter("ghostjet",201,1,1,4,4),ctx=context(source,target);
    target.air!.phaseUntil=99;const before=structuredClone(ctx);expect(castSkill(ctx,source,target)).toBe(false);expect(ctx).toEqual(before);
    const visible=fighter("guard",202,1,1,5,4);ctx.fighters.push(visible);source.skillReadyAt=11;expect(castSkill(ctx,source,visible)).toBe(false);
    ctx.tick=11;expect(castSkill(ctx,source,visible)).toBe(true);ctx.tick=14;advanceHiveSkills(ctx);
    expect(ctx.events.some(e=>e.target===201&&e.amount>0)).toBe(true);expect(ctx.events.some(e=>e.target===202&&e.amount>0)).toBe(true);
  });

  it("先破盾再扣生命；一次震荡的致死反伤不取消剩余目标，也不伤友军",()=>{
    const source=fighter("wasp",101,0),a=fighter("guard",201,1,1,4,4),b=fighter("guard",202,1,1,5,4),ally=fighter("guard",203,0,1,3,3),ctx=context(source,a,b,ally);
    source.hp=5;a.shield=100;a.reflection=10;const hpA=a.hp,hpB=b.hp,hpAlly=ally.hp;
    castSkill(ctx,source,a);ctx.tick=13;advanceHiveSkills(ctx);
    expect(source.hp).toBe(0);expect(a.hp).toBe(hpA-60);expect(b.hp).toBe(hpB-80);expect(ally.hp).toBe(hpAlly);
    expect(ctx.events.filter(e=>e.attacker===101&&e.skill)).toHaveLength(2);expect(source.hive).toMatchObject({innerHits:1,outerHits:1});
  });
});

describe("三针普通连射",()=>{
  it("三针分时独立结算，轮中不另行施法；每轮只恢复首针的普通攻击能量",()=>{
    const source=fighter("wasp",101,0),target=fighter("guard",201,1,1,4,4),ctx=context(source,target);target.armor=0;source.mana=0;
    expect(startHiveBurst(ctx,source,target)).toBe(true);gainMana(source,25,10);expect(skillReady(source)).toBe(false);
    ctx.tick=11;expect(advanceHiveAction(ctx,source)).toBe(true);ctx.tick=12;expect(advanceHiveAction(ctx,source)).toBe(true);
    expect(ctx.events.map(e=>e.amount)).toEqual([31,31,31]);expect(source.mana).toBe(25);expect(source.hive).toMatchObject({volleys:1,needles:3});
    expect(source.hive!.burst).toBeUndefined();ctx.tick=13;expect(advanceHiveAction(ctx,source)).toBe(false);
  });

  for(const reason of ["death","hidden","range","friendly","source-stun","source-side"] as const)it(`${reason}取消未发出的余针`,()=>{
    const source=fighter("wasp",101,0),target=fighter("ghostjet",201,1,1,4,4),ctx=context(source,target);startHiveBurst(ctx,source,target);ctx.tick=11;
    if(reason==="death")target.hp=0;if(reason==="hidden")target.air!.phaseUntil=30;if(reason==="range")target.x=7;
    if(reason==="friendly")target.side=0;if(reason==="source-stun")source.stunUntil=30;if(reason==="source-side")source.side=1;
    advanceHiveAction(ctx,source);expect(ctx.events).toHaveLength(1);expect(source.hive!.needles).toBe(1);expect(source.hive!.burst).toBeUndefined();
  });

  it("沉默和封能不取消普通连射，每针保留独立吸血和反伤",()=>{
    const source=fighter("wasp",101,0),target=fighter("guard",201,1,1,4,4),ctx=context(source,target);source.hp=50;source.lifesteal=0.5;source.attackShred=2;
    target.armor=0;target.reflection=10;startHiveBurst(ctx,source,target);source.silenceUntil=99;source.manaLockUntil=99;
    ctx.tick=11;advanceHiveAction(ctx,source);ctx.tick=12;advanceHiveAction(ctx,source);
    expect(ctx.events.filter(e=>e.attacker===101)).toHaveLength(3);expect(ctx.events.filter(e=>e.reflected)).toHaveLength(3);
    expect(source.healing).toBeGreaterThan(0);expect(target.armorBreak).toBe(2);expect(source.hive!.needles).toBe(3);
  });

  it("首针被致死反伤时不发出余针，普通连射不沿用已释放范围爆发的结算规则",()=>{
    const source=fighter("wasp",101,0),target=fighter("guard",201,1,1,4,4),ctx=context(source,target);source.hp=5;target.reflection=10;
    startHiveBurst(ctx,source,target);expect(source.hp).toBe(0);expect(source.hive!.burst).toBeUndefined();
    ctx.tick=11;advanceHiveAction(ctx,source);expect(source.hive!.needles).toBe(1);expect(ctx.events.filter(e=>e.attacker===101)).toHaveLength(1);
  });

  it("攻速过高时每轮至少0.75秒，详情与真实轮间隔相同，针间距仍为0.25秒",()=>{
    const p={...piece("wasp",101),items:["overdrive","overdrive","coil"]},f=army([p],0)[0];
    expect(f.interval).toBe(3);f.formationHaste=2;f.hasteUntil=99;expect(attackInterval(f,10)).toBe(3);
    expect(pieceDetails(p).interval).toBe(0.75);expect(unitMinimumAttackInterval(unitDefinition("wasp"))).toBe(3);
    expect(unitMinimumAttackInterval(unitDefinition("wasp","gaze"),"gaze")).toBe(1);expect(HIVE.needleInterval/4).toBe(0.25);
  });
});

describe("蜂群画面、AI与旧局兼容",()=>{
  it("同一个二对二真实打出内圈408、外圈204；快算和Worker相同且不修改输入",()=>{
    const input=structuredClone(HIVE_DEMO),last=demo.frames.at(-1)!;
    expect(simulateOutcome(HIVE_DEMO.left,HIVE_DEMO.right,"hive").final.fighters).toEqual(last.fighters);
    const worker=compute({kind:"replay",...HIVE_DEMO,version:"hive"});expect(worker.kind).toBe("replay");if(worker.kind!=="replay")return;
    expect(worker.battle).toEqual(demo);expect(HIVE_DEMO).toEqual(input);
    expect(demo.frames.find(f=>f.tick===4)!.events.filter(e=>e.attacker===101&&e.skill).map(e=>[e.target,e.amount])).toEqual([[201,408],[202,204]]);
    expect(last.fighters.find(f=>f.uid===101)!.hive).toMatchObject({volleys:3,needles:8,explosions:1,innerHits:1,outerHits:1});
    expect(analyzeBattle(demo,0).sides[0].fighters.find(f=>f.uid===101)!.hive!.needles).toBe(0);
    expect(battleAnalysisMarkup(analyzeBattle(demo),"damage","双圈",160,160)).toContain("内圈 1 次 / 外圈 1 次");
  });

  it("蓄力、脉冲、余针与冷却的状态有独立画面标签",()=>{
    const charging=demo.frames.find(f=>f.fighters.some(t=>t.hive?.casting))!,source=charging.fighters.find(f=>f.hive)!;
    expect(compactBattleLabels(source,charging.tick)).toContain("蜂群蓄能");expect(hiveLabels(source,charging.tick).join()).toContain("蜂群蓄能");
    expect(hivePose(source,charging.tick).lift).toBeGreaterThan(0);expect(skillDescription("wasp")).toContain("每名敌人只受一个圈");expect(skillRole("wasp")).toContain("双圈");
  });

  it("战场、备战、商店、图鉴、装备持有人和侦察使用新形象，旧版本保留旧图",()=>{
    const game=createGame(1,"classic"),p=game.players[0],a={...piece("wasp",101),items:["blade"]};p.pieces=[a];p.shop[0]="wasp";
    expect(unitSprite("wasp")).toBe("wasp-hive");expect(fighterSprite(army([a],0)[0])).toBe("wasp-hive");
    for(const html of [pieceDetailMarkup(a),codexCards(game),equipmentOverviewMarkup(game),scoutingMarkup(game,0),recruitmentMarkup(game,p,false)])expect(html).toContain("/wasp-hive.png");
    expect(unitSprite("wasp","gaze")).toBe("wasp");expect(fighterSprite(army([a],0,"gaze")[0])).toBe("wasp");
    expect(itemScore(a,"blade")).toBeGreaterThan(itemScore(a,"blade","gaze"));expect(abilityCredit(a)).toBeGreaterThan(0);expect(pieceStrength(a)).toBeGreaterThan(0);
  });

  it("41版旧定义保持，其余单位不因本次变更，异虫双合仍有效",()=>{
    expect(frozen.definitions).toHaveLength(41);for(const row of frozen.definitions)expect(unitDefinition("wasp",version(row.version))).toEqual(row.unit);
    for(const u of UNITS.filter(u=>u.id!=="wasp"))expect(unitDefinition(u.id,"hive")).toEqual(unitDefinition(u.id,"gaze"));
    expect(mergeCount([piece("eyebug",1),piece("spider",2)],"eyebug",1)).toBe(2);
    const a=army([piece("wasp",1)],0,"gaze")[0],b=army([piece("guard",2)],1,"gaze")[0];a.mana=100;
    const ctx=context(a,b);Object.assign(b,{x:a.x+1,y:a.y});castSkill(ctx,a,b);expect(a.hive).toBeUndefined();expect(ctx.events.some(e=>e.skill)).toBe(true);
  });

  for(const row of frozen.fixtures)it(`${row.version}修改前单挑三次旧范围技能SHA保持`,async()=>{
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(row.left,row.right,version(row.version)))));
    expect(Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")).toBe(row.hash);expect(row.casts).toBe(3);
  });

  for(const phase of ["prepare","battle","result","finished"] as const)it(`0.68 ${phase}迁移保留旧目录、资源与播放进度`,()=>{
    const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("Invalid reserve capture");const game=input;game.combatVersion="gaze";game.phase=phase;
    if(phase==="result"||phase==="finished"){
      game.round--;game.players[0].hp=game.history.at(-1)!.hp;
      if(phase==="finished"){const p=game.players[0];for(const held of p.pieces)game.pool[held.defId]+=pieceCopies(held);for(const id of p.shop)if(id)game.pool[id]++;
        p.hp=0;p.eliminatedRound=game.round;p.pieces=[];p.shop=[];p.inventory=[];game.history.at(-1)!.hp=0;}
    }
    const before=structuredClone(game),playback={time:3,speed:2,paused:true};
    const decoded=decodeSave(JSON.stringify({schema:67,rules:"singleplayer-0.68",savedAt:1,revision:1,game,playback}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(decoded.data!.rules).toBe(RULES.version);
    expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});expect(decoded.data!.playback).toEqual(playback);
    if(phase==="result"){nextRound(decoded.data!.game);expect(decoded.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(decoded.data!.game.catalogVersion).toBe("secret-orb");}
  });

  it("缺目录存档补为gaze，不改动经营费用和卡池",()=>{
    const game=createGame(1,"classic");game.combatVersion="gaze";for(const u of UNITS)game.pool[u.id]+=COPIES[unitCost(u.id,"gaze")]-COPIES[unitCost(u.id)];delete game.catalogVersion;
    const decoded=decodeSave(JSON.stringify({schema:67,rules:"singleplayer-0.68",savedAt:1,revision:1,game,playback:{time:0,speed:1,paused:false}}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.game.catalogVersion).toBe("gaze");expect(validGame(decoded.data!.game)).toBe(true);
  });
});
