import {describe,it,expect} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,attackInterval,interruptAirSkill,type CombatContext} from "../src/engine/abilities";
import {advanceMendings,applyMendingHaste,mendingHaste,mendingTarget,mendingActionBusy} from "../src/engine/mending";
import {mendingSupportCredit} from "../src/engine/ai";
import {MENDING,skillName,skillRole,skillDescription} from "../src/data/skills";
import {unitDefinition,unitSprite} from "../src/data/unit-stats";
import {MENDING_DEMO} from "../src/data/mending-demo";
import {createGame,buy} from "../src/engine/game";
import {decodeSave,SAVE_SCHEMA} from "../src/engine/persistence";
import {compute} from "../src/compute/job";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {mendingLabels,mendingPose} from "../src/render/mending";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type Fighter,type Piece,type CombatVersion} from "../src/engine/types";
import frozen from "./fixtures/pre-v076-repair-replays.json";

const piece=(defId:string,uid:number,star=1):Piece=>({defId,uid,star,position:35});
function fighter(id:string,uid:number,side:0|1,star=1,x=3,y=4){
 const f=army([piece(id,uid,star)],side)[0];Object.assign(f,{x,y,mana:0});return f;
}
function setup(){
 const source=fighter("repair",101,0,2),target=fighter("arhat",102,0,2,3,3),enemy=fighter("guard",201,1,1,3,2);
 source.mana=100;target.hp-=500;
 const ctx:CombatContext={fighters:[source,target,enemy],tick:10,events:[],effects:[]};return {source,target,enemy,ctx};
}
function release(s:ReturnType<typeof setup>){expect(castSkill(s.ctx,s.source,s.enemy)).toBe(true);s.ctx.tick=12;advanceMendings(s.ctx);return s;}
const hash=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,"0")).join("");

describe("维修机锁定与实际回复",()=>{
 it("新一费身板、技能与图像独立于旧原型",()=>{
  expect(unitDefinition("repair")).toMatchObject({cost:1,hp:550,attack:56,armor:5,range:4,interval:8,initialMana:0,skill:MENDING.name});
  expect(unitDefinition("repair","inferno")).toMatchObject({hp:500,attack:24,armor:2,range:3,interval:4,initialMana:50,skill:"战地维修"});
  expect(unitSprite("repair")).toBe("repair-mending-v076");expect(unitSprite("repair","inferno")).toBe("repair");
 });
 it("按当前攻击而非血量或攻速选友军，同攻击按编号，可选择自身",()=>{
  const s=setup(),other=fighter("infantry",103,0,1,4,4);other.attack=s.target.attack;other.interval=1;other.hp=1;s.ctx.fighters.push(other);
  expect(mendingTarget(s.ctx,s.source)?.uid).toBe(102);other.attack++;expect(mendingTarget(s.ctx,s.source)?.uid).toBe(103);
  s.source.attack=999;expect(mendingTarget(s.ctx,s.source)).toBe(s.source);
 });
 it("半秒前不回复，释放锁定对象、实记治疗与能量，不直接伤害或加攻击",()=>{
  const s=setup(),hp=s.target.hp,attack=s.target.attack;expect(castSkill(s.ctx,s.source,s.enemy)).toBe(true);
  expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(58);expect(mendingActionBusy(s.source,10)).toBe(true);
  s.ctx.tick=11;advanceMendings(s.ctx);expect(s.target.hp).toBe(hp);expect(s.target.mana).toBe(0);
  s.ctx.tick=12;advanceMendings(s.ctx);expect(s.target.hp).toBe(hp+300);expect(s.target.mana).toBe(30);expect(s.target.attack).toBe(attack);
  expect(s.source.mending).toMatchObject({completed:1,healing:300,energy:30,hastes:1});expect(s.ctx.events).toHaveLength(0);
  expect(mendingActionBusy(s.source,12)).toBe(true);expect(mendingActionBusy(s.source,13)).toBe(false);
  expect(mendingHaste(s.target,12)).toBe(0.3);expect(attackInterval(s.target,12)).toBeCloseTo(s.target.interval/1.3);
 });
 it.each(["眩晕","沉默","魅惑","阵亡","残魂"])("蓄势被%s打断，仅计一次且不返还资源",kind=>{
  const s=setup();castSkill(s.ctx,s.source,s.enemy);s.ctx.tick=11;
  if(kind==="眩晕")s.source.stunUntil=20;if(kind==="沉默")s.source.silenceUntil=20;
  if(kind==="魅惑")s.source.charm={side:0,until:20,attack:s.source.attack};if(kind==="阵亡")s.source.hp=0;
  if(kind==="残魂")s.source.immortal={duration:8,until:20,spent:true};
  advanceMendings(s.ctx);s.ctx.tick=12;advanceMendings(s.ctx);
  expect(s.source.mending).toMatchObject({completed:0,interrupted:1});expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(58);expect(s.target.mendHaste).toBeUndefined();
 });
 it.each(["阵亡","敌军","离开范围","残魂","火种"])("目标%s时落空，不改选其他友军",kind=>{
  const s=setup();castSkill(s.ctx,s.source,s.enemy);
  if(kind==="阵亡")s.target.hp=0;if(kind==="敌军")s.target.side=1;if(kind==="离开范围"){s.target.x=7;s.target.y=0;}
  if(kind==="残魂")s.target.immortal={duration:8,until:20,spent:true};if(kind==="火种")s.target.phoenix={spent:true,eggUntil:30,bodyMaxHp:1100,hatched:false};
  s.ctx.tick=12;advanceMendings(s.ctx);expect(s.source.mending).toMatchObject({completed:0,missed:1});expect(s.source.mendHaste).toBeUndefined();
 });
 it("新主力出现不改变已锁目标，直接打断入口能停止缝合",()=>{
  const s=setup();castSkill(s.ctx,s.source,s.enemy);s.source.attack=999;s.ctx.tick=12;advanceMendings(s.ctx);expect(s.target.mendHaste).toHaveLength(1);expect(s.source.mendHaste).toBeUndefined();
  const t=setup();castSkill(t.ctx,t.source,t.enemy);interruptAirSkill(t.ctx,t.source);expect(t.source.mending!.interrupted).toBe(1);
 });
 it("法强仅放大治疗，生命和能量只计实际回复",()=>{
  const s=setup();s.source.skillPower=2;s.target.hp=s.target.maxHp-50;s.target.mana=96;release(s);
  expect(s.source.mending).toMatchObject({healing:50,energy:4});expect(s.target.hp).toBe(s.target.maxHp);expect(s.target.mana).toBe(100);expect(mendingHaste(s.target,12)).toBe(0.3);
 });
 it.each(["封锁","骑兵","被动"])("充能遵守%s规则，满血仍可施加加速",kind=>{
  const s=setup();s.target.hp=s.target.maxHp;
  if(kind==="封锁")s.target.manaLockUntil=20;if(kind==="骑兵")s.target.energyPenalty=8;if(kind==="被动")s.target.rifle={shots:0};
  release(s);expect(s.source.mending!.energy).toBe(kind==="骑兵"?22:0);expect(s.source.mending!.healing).toBe(0);expect(mendingHaste(s.target,12)).toBe(0.3);
 });
 it("独立来源只取最强，弱效果不延长强效果，来源死亡不撤回",()=>{
  const s=setup();applyMendingHaste(s.target,101,0.4,20);applyMendingHaste(s.target,103,0.2,40);
  expect(mendingHaste(s.target,19)).toBe(0.4);s.source.hp=0;s.ctx.tick=20;advanceMendings(s.ctx);expect(mendingHaste(s.target,20)).toBe(0.2);
  s.ctx.tick=40;advanceMendings(s.ctx);expect(s.target.mendHaste).toBeUndefined();
 });
 it("死亡清除受益者增益，友军驱散保留正面加速",()=>{
  const s=release(setup()),fish=fighter("fish",301,0,1,4,4);fish.mana=100;s.ctx.fighters.push(fish);castSkill(s.ctx,fish,s.enemy);expect(mendingHaste(s.target,12)).toBe(0.3);
  s.target.hp=0;s.ctx.tick=13;advanceMendings(s.ctx);expect(s.target.mendHaste).toBeUndefined();
 });
});

describe("版本兼容与必要呈现",()=>{
 it("48代64种历史定义和呈现保持，旧小回放SHA不变",async()=>{
  expect(COMBAT_VERSIONS.slice(0,frozen.versions.length)).toEqual(frozen.versions);
  for(const v of frozen.versions as (keyof typeof frozen.definitions)[]){expect(await hash(frozen.unitIds.map(id=>unitDefinition(id,v))),v).toBe(frozen.definitions[v]);expect(await hash(frozen.unitIds.map(id=>[unitSprite(id,v),skillName(id,v),skillRole(id,v),skillDescription(id,v)])),v).toBe(frozen.presentation[v]);}
  expect(await hash(simulate(frozen.replay.left,frozen.replay.right,frozen.replay.version as CombatVersion))).toBe(frozen.replay.sha256);
 });
 it.each(["prepare","battle","result"] as const)("0.75的%s迁移保留目录、卡池与播放资料",phase=>{
  const game=createGame(76,"classic");game.combatVersion="inferno";game.catalogVersion="inferno";
  expect(buy(game,game.players[0],0)).toBe(true);game.players[0].pieces[0].position=35;game.phase=phase;
  if(phase==="result")game.history=[{combatVersion:"inferno",round:1,opponentId:1,opponentName:game.players[1].name,kind:"pvp",winner:0,damage:1,income:5,hp:100,gold:game.players[0].gold,left:structuredClone(game.players[0].pieces),right:[]}];
  const before=structuredClone(game),playback={time:2,speed:2,paused:true};
  const result=decodeSave(JSON.stringify({schema:74,rules:"singleplayer-0.75",savedAt:1,revision:1,game,playback}));
  expect(result.status).toBe("migrated");expect(result.data?.schema).toBe(SAVE_SCHEMA);expect(result.data?.game.combatVersion).toBe(phase==="prepare"?CURRENT_COMBAT_VERSION:"inferno");
  expect(result.data?.game.catalogVersion).toBe("inferno");expect(result.data?.game.pool).toEqual(before.pool);expect(result.data?.game.players).toEqual(before.players);expect(result.data?.game.history).toEqual(before.history);expect(result.data?.playback).toEqual(playback);
 });
 it("AI支持收益有界，重复维修机不重复叠加估值",()=>{
  const source=piece("repair",1,2),carry=piece("arhat",2,2),credit=mendingSupportCredit([source,carry]);expect(credit).toBeGreaterThan(0);
  expect(mendingSupportCredit([source,{...source,uid:3},carry])).toBe(credit);expect(mendingSupportCredit([{...source,definitionVersion:"inferno"},carry])).toBe(0);
 });
 it("同一小场景实际缝合，回放与快算一致且输入不变，回看不含未来统计",()=>{
  const before=structuredClone(MENDING_DEMO),computed=compute({kind:"replay",...MENDING_DEMO,version:CURRENT_COMBAT_VERSION});if(computed.kind!=="replay")throw Error("Unexpected computation");
  const battle=computed.battle,last=battle.frames.at(-1)!,source=last.fighters.find(f=>f.uid===101)!;
  expect(source.mending!.completed).toBeGreaterThan(0);expect(source.mending!.healing).toBeGreaterThan(0);expect(source.mending!.hastes).toBeGreaterThan(0);
  expect(simulateOutcome(MENDING_DEMO.left,MENDING_DEMO.right).final.fighters).toEqual(last.fighters);expect(MENDING_DEMO).toEqual(before);
  expect(analyzeBattle(battle,0).sides[0].fighters.find(f=>f.uid===101)!.mending).toMatchObject({completed:0,healing:0,energy:0});
  const s=setup();castSkill(s.ctx,s.source,s.enemy);expect(mendingPose(s.source,11).lift).toBeGreaterThan(0);expect(mendingLabels(s.source,11).some(x=>x.includes("蓄势"))).toBe(true);
 });
});
