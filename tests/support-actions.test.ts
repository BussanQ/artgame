import {describe,it,expect} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,advanceAirSkills,type CombatContext} from "../src/engine/abilities";
import {advanceWithoutTarget} from "../src/engine/support-actions";
import {advanceSpiritWards,spiritWardBuff,stopSpiritWard} from "../src/engine/spirit-ward";
import {advanceMendings} from "../src/engine/mending";
import {formlessActive} from "../src/engine/formless";
import {attackTargets} from "../src/engine/triggers";
import {SUPPORT_ACTIONS_DEMO} from "../src/data/support-actions-demo";
import {unitDefinition,unitSprite} from "../src/data/unit-stats";
import {skillName,skillRole,skillDescription} from "../src/data/skills";
import {createGame,buy} from "../src/engine/game";
import {decodeSave,SAVE_SCHEMA} from "../src/engine/persistence";
import {compute} from "../src/compute/job";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type Fighter,type Piece,type CombatVersion} from "../src/engine/types";
import frozen from "./fixtures/pre-v078-support-actions.json";

const piece=(defId:string,uid:number,star=1):Piece=>({defId,uid,star,position:35});
function fighter(id:string,uid:number,side:0|1,star=2,x=3,y=4){
 const f=army([piece(id,uid,star)],side)[0];Object.assign(f,{x,y,mana:100,cooldown:0});return f;
}
function setup(id="medic"){
 const source=fighter(id,101,0),ally=fighter("guard",102,0,2,3,5),enemy=fighter("ghostjet",201,1,2,3,3);
 ally.hp-=300;const ctx:CombatContext={fighters:[source,ally,enemy],tick:10,events:[],effects:[]};
 expect(castSkill(ctx,enemy,source)).toBe(true);ctx.effects=[];return {source,ally,enemy,ctx};
}
const hash=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,"0")).join("");
const old=simulate(frozen.replay.left,frozen.replay.right,"formless");
const demoInput=structuredClone(SUPPORT_ACTIONS_DEMO),computed=compute({kind:"replay",...SUPPORT_ACTIONS_DEMO,version:CURRENT_COMBAT_VERSION});
if(computed.kind!=="replay")throw Error("Unexpected support computation");
const demo=computed.battle;

describe("看不到敌人时的友军施法",()=>{
 it.each(["medic","repair","deer"])("%s按真实友军需求开始技能，隐形敌人不阻止支援",id=>{
  const s=setup(id),position={x:s.source.x,y:s.source.y},hp=s.enemy.hp;
  expect(attackTargets(s.source,s.ctx.fighters,10)).toHaveLength(0);expect(advanceWithoutTarget(s.ctx,s.source)).toBe(true);expect(s.source.mana).toBe(0);expect(s.source.cooldown).toBeGreaterThan(0);expect(s.ctx.events).toHaveLength(0);expect(s.enemy.hp).toBe(hp);expect({x:s.source.x,y:s.source.y}).toEqual(position);
  if(id==="medic"){s.ctx.tick=14;advanceAirSkills(s.ctx,s.source);expect(s.ally.hp).toBe(s.ally.maxHp-200);expect(s.source.healing).toBe(100);}
  if(id==="repair"){s.ctx.tick=12;advanceMendings(s.ctx);expect(s.source.mending!.completed).toBe(1);expect(s.source.mending!.healing).toBe(300);expect(s.ally.mendHaste?.[0].source).toBe(s.source.uid);}
  if(id==="deer"){s.ctx.tick=12;advanceSpiritWards(s.ctx);expect(s.source.spiritWard!.formed).toBe(1);expect(spiritWardBuff(s.ally,12,s.ctx.fighters)?.armor).toBe(20);}
 });
 it("军医不会因无敌方目标而浪费能量；范围外或无效伤员也不触发",()=>{
  const s=setup();s.ally.hp=s.ally.maxHp;s.enemy.hp=1;expect(advanceWithoutTarget(s.ctx,s.source)).toBe(false);expect(s.source.mana).toBe(100);
  s.ally.hp=1;s.ally.x=7;expect(advanceWithoutTarget(s.ctx,s.source)).toBe(false);s.ally.x=3;s.ally.immortal={duration:8,until:30,spent:true};expect(advanceWithoutTarget(s.ctx,s.source)).toBe(false);expect(s.ctx.effects).toHaveLength(0);
 });
 it("友军自身隐形仍可被治疗和防护，不把隐形当作阵亡",()=>{
  for(const id of ["medic","deer"]){const s=setup(id),ally=fighter("ghostjet",103,0,2,3,5);s.ctx.fighters.push(ally);expect(castSkill(s.ctx,ally,s.enemy)).toBe(true);ally.hp-=200;expect(advanceWithoutTarget(s.ctx,s.source)).toBe(true);
   if(id==="medic"){s.ctx.tick=14;advanceAirSkills(s.ctx,s.source);expect(ally.hp).toBe(ally.maxHp-100);}else{s.ctx.tick=12;advanceSpiritWards(s.ctx);expect(spiritWardBuff(ally,12,s.ctx.fighters)).toBeDefined();}
  }
 });
 it.each(["眩晕","沉默","魅惑","能量不足","冷却未到","刑傀"])("%s时不绕过限制，等待仍会推进攻击冷却",kind=>{
  const s=setup(kind==="冷却未到"?"repair":"medic");s.source.cooldown=0.5;
  if(kind==="眩晕")s.source.stunUntil=20;if(kind==="沉默")s.source.silenceUntil=20;if(kind==="魅惑")s.source.charm={side:0,until:20,attack:s.source.attack};if(kind==="能量不足")s.source.mana=99;if(kind==="冷却未到")s.source.skillReadyAt=20;
  if(kind==="刑傀")s.source.executionPuppet={owner:301,victim:101,born:1,until:30};
  const mana=s.source.mana;expect(advanceWithoutTarget(s.ctx,s.source)).toBe(false);expect(s.source.mana).toBe(mana);expect(s.source.cooldown).toBe(-0.5);expect(s.ctx.effects).toHaveLength(0);
 });
 it("能量封锁只阻止回复，不吞掉已经攒满的施法资格",()=>{
  const s=setup();s.source.manaLockUntil=30;expect(advanceWithoutTarget(s.ctx,s.source)).toBe(true);expect(s.source.mana).toBe(0);
 });
 it("辅助入口仍尊重有效嘲讽，不能越过强制行动目标",()=>{
  const s=setup(),taunter=fighter("guard",301,1);taunter.bulwark={formations:1,taunts:1,start:1,until:30,armor:8};s.ctx.fighters.push(taunter);s.source.taunt={source:301,until:30,kind:"bulwark"};expect(advanceWithoutTarget(s.ctx,s.source)).toBe(false);expect(s.source.mana).toBe(100);
 });
 it("残魂军医保留既有救助友军能力，自己不能被治疗",()=>{
  const s=setup();s.source.immortal={duration:8,until:30,spent:true};s.source.hp=1;expect(advanceWithoutTarget(s.ctx,s.source)).toBe(true);s.ctx.tick=14;advanceAirSkills(s.ctx,s.source);expect(s.source.hp).toBe(1);expect(s.ally.hp).toBe(s.ally.maxHp-200);
 });
});

describe("无目标时钟和行动占用",()=>{
 it("输出兵种只等待，不隔空攻击、施法或追击，分数冷却继续流逝",()=>{
  const s=setup("flametrooper"),position={x:s.source.x,y:s.source.y};s.source.cooldown=2.5;
  for(s.ctx.tick=10;s.ctx.tick<=12;s.ctx.tick++)expect(advanceWithoutTarget(s.ctx,s.source)).toBe(false);
  expect(s.source.cooldown).toBe(-0.5);expect(s.source.mana).toBe(100);expect(s.ctx.events).toHaveLength(0);expect(s.ctx.effects).toHaveLength(0);expect({x:s.source.x,y:s.source.y}).toEqual(position);
 });
 it("攻击节奏尚未就绪时不提前开启辅助，成功施法只消耗一次行动",()=>{
  const s=setup();s.source.cooldown=2.5;expect(advanceWithoutTarget(s.ctx,s.source)).toBe(false);s.ctx.tick++;expect(advanceWithoutTarget(s.ctx,s.source)).toBe(false);s.ctx.tick++;expect(advanceWithoutTarget(s.ctx,s.source)).toBe(true);expect(s.source.cooldown).toBe(3.5);
  expect(advanceWithoutTarget(s.ctx,s.source)).toBe(false);expect(s.source.cooldown).toBe(3.5);expect(s.ctx.effects.filter(e=>e.kind==="cast")).toHaveLength(1);
 });
 it("维持和释放当帧不重复推进冷却或多施放一次",()=>{
  for(const id of ["repair","deer"]){const s=setup(id);expect(advanceWithoutTarget(s.ctx,s.source)).toBe(true);const cd=s.source.cooldown;expect(advanceWithoutTarget(s.ctx,s.source)).toBe(false);expect(s.source.cooldown).toBe(cd);
   s.ctx.tick=12;if(id==="repair")advanceMendings(s.ctx);else{advanceSpiritWards(s.ctx);stopSpiritWard(s.ctx,s.source);}
   expect(advanceWithoutTarget(s.ctx,s.source)).toBe(false);expect(s.source.cooldown).toBe(cd);
  }
 });
 it("无形自身增益仍能在敌方隐形时开启，保留其冷却与时长",()=>{
  const s=setup("ghostjet");expect(advanceWithoutTarget(s.ctx,s.source)).toBe(true);expect(formlessActive(s.source,10)).toBe(true);expect(s.source.formless!.active!.until).toBe(34);expect(s.source.skillReadyAt).toBe(74);
 });
 it.each(["阵亡","火种"])("%s不再是可行动单位，不推进冷却或消耗能量",kind=>{
  const s=setup();s.source.cooldown=4;if(kind==="阵亡")s.source.hp=0;else s.source.phoenix={spent:true,eggUntil:30,bodyMaxHp:s.source.maxHp,hatched:false};
  expect(advanceWithoutTarget(s.ctx,s.source)).toBe(false);expect(s.source.cooldown).toBe(4);expect(s.source.mana).toBe(100);
 });
});

describe("兼容与固定隐形支援场景",()=>{
 it("50代64种旧定义与呈现保持，0.77固定小回放SHA保持",async()=>{
  expect(COMBAT_VERSIONS.slice(0,frozen.versions.length)).toEqual(frozen.versions);
  for(const v of frozen.versions as (keyof typeof frozen.definitions)[]){expect(await hash(frozen.unitIds.map(id=>unitDefinition(id,v))),v).toBe(frozen.definitions[v]);expect(await hash(frozen.unitIds.map(id=>[unitSprite(id,v),skillName(id,v),skillRole(id,v),skillDescription(id,v)])),v).toBe(frozen.presentation[v]);}
  expect(await hash(old)).toBe(frozen.replay.sha256);
 });
 it.each(["prepare","battle","result"] as const)("0.77的%s迁移保持目录、卡池、持有与播放资料",phase=>{
  const game=createGame(78,"classic");game.combatVersion="formless";game.catalogVersion="formless";expect(buy(game,game.players[0],0)).toBe(true);game.players[0].pieces[0].position=35;game.phase=phase;
  if(phase==="result")game.history=[{combatVersion:"formless",round:1,opponentId:1,opponentName:game.players[1].name,kind:"pvp",winner:0,damage:1,income:5,hp:100,gold:game.players[0].gold,left:structuredClone(game.players[0].pieces),right:[]}];
  const before=structuredClone(game),playback={time:2,speed:2,paused:true},result=decodeSave(JSON.stringify({schema:76,rules:"singleplayer-0.77",savedAt:1,revision:1,game,playback}));
  expect(result.status).toBe("migrated");expect(result.data?.schema).toBe(SAVE_SCHEMA);expect(result.data?.game.combatVersion).toBe(phase==="prepare"?CURRENT_COMBAT_VERSION:"formless");expect(result.data?.game.catalogVersion).toBe("formless");expect(result.data?.game.pool).toEqual(before.pool);expect(result.data?.game.players).toEqual(before.players);expect(result.data?.game.history).toEqual(before.history);expect(result.data?.playback).toEqual(playback);
 });
 it("修复前两位辅助等到显形，修复后在1.25秒对友军施法而不攻击隐形敌人",()=>{
  const firstCast=(b:typeof demo,uid:number)=>b.frames.find(frame=>frame.effects.some(e=>e.kind==="cast"&&e.source===uid))?.tick;
  for(const uid of [102,103]){expect(firstCast(old,uid)).toBe(25);expect(firstCast(demo,uid)).toBe(5);}
  const casting=demo.frames.find(f=>f.tick===5)!;expect(formlessActive(casting.fighters.find(f=>f.uid===201)!,5)).toBe(true);
  expect(casting.effects.filter(e=>e.kind==="cast"&&[102,103].includes(e.source)).every(e=>e.target===e.source)).toBe(true);
  expect(demo.frames.filter(f=>f.tick<25).flatMap(f=>f.events).filter(e=>[101,102,103].includes(e.attacker)&&e.target===201)).toHaveLength(0);
  const last=demo.frames.at(-1)!;expect(last.fighters.find(f=>f.uid===102)!.healing).toBeGreaterThan(0);expect(last.fighters.find(f=>f.uid===103)!.spiritWard!.mitigated).toBeGreaterThan(0);
 });
 it("Worker入口与快算一致，阵容不被修改；初始帧不泄露未来支援贡献",()=>{
  expect(simulateOutcome(SUPPORT_ACTIONS_DEMO.left,SUPPORT_ACTIONS_DEMO.right).final.fighters).toEqual(demo.frames.at(-1)!.fighters);expect(SUPPORT_ACTIONS_DEMO).toEqual(demoInput);
  const initial=analyzeBattle(demo,0);expect(initial.sides[0].healing).toBe(0);expect(initial.sides[0].fighters.find(f=>f.uid===103)!.spiritWard!.mitigated).toBe(0);
 });
});
