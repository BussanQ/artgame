import {describe,expect,it} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,damage,interruptAirSkill,type CombatContext} from "../src/engine/abilities";
import {advanceSpiritWards,advanceSpiritWardAction,expireSpiritWards,spiritWardBuff,spiritWardTargets} from "../src/engine/spirit-ward";
import {effectiveArmor,effectiveMagicResist,skillReady} from "../src/engine/triggers";
import {setFlight} from "../src/engine/sea-ward";
import {SPIRIT_WARD,skillDescription,skillRole} from "../src/data/skills";
import {SPIRIT_WARD_DEMO} from "../src/data/spirit-ward-demo";
import {unitDefinition} from "../src/data/unit-stats";
import {catalogCost,unitCost} from "../src/data/catalog";
import {equipmentStats} from "../src/data/items";
import {UNITS,RULES,COPIES} from "../src/data/units";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type CombatVersion,type Fighter,type Piece} from "../src/engine/types";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {pieceDetails} from "../src/ui/bench-tooltip";
import {spiritWardLabels,spiritWardPose} from "../src/render/spirit-ward";
import {compactBattleLabels,fighterBattleMarkup} from "../src/render/battle-inspection";
import {itemScore} from "../src/engine/equipment";
import {abilityCredit,wardSupportCredit} from "../src/engine/ai";
import {createGame,nextRound} from "../src/engine/game";
import {decodeSave,SAVE_SCHEMA,validGame} from "../src/engine/persistence";
import {pieceCopies} from "../src/engine/progression";
import {compute} from "../src/compute/job";
import frozen from "./fixtures/pre-v071-spirit-ward-replays.json";
import paid from "./fixtures/opening-ai-reserve.json";

const piece=(defId:string,uid:number,star=1,position:number|null=35):Piece=>({defId,uid,star,position});
function fighter(id:string,uid:number,side:0|1,star=1,x=3,y=4){const f=army([piece(id,uid,star)],side)[0];Object.assign(f,{x,y,mana:100});return f;}
const context=(...fighters:Fighter[]):CombatContext=>({fighters,tick:10,events:[],effects:[]});
function setup(star=1){
 const source=fighter("deer",101,0,star),ally=fighter("guard",102,0,1,3,3),enemy=fighter("infantry",201,1,1,3,2),ctx=context(source,ally,enemy);
 return {source,ally,enemy,ctx};
}
function release(state=setup()){
 expect(castSkill(state.ctx,state.source,state.enemy)).toBe(true);state.ctx.tick+=SPIRIT_WARD.windup;advanceSpiritWards(state.ctx);return state;
}
const demo=simulate(SPIRIT_WARD_DEMO.left,SPIRIT_WARD_DEMO.right);
function version(name:string):CombatVersion{const v=COMBAT_VERSIONS.find(v=>v===name);if(!v)throw Error(name);return v;}

describe("长生鹿多目标防护",()=>{
 for(const star of [1,2,3])it(`${star}星四费身板与3/5/7个其他友军，0.5秒起手后成形`,()=>{
  const {source,enemy,ctx}=setup(star),coords=[[1,3],[2,3],[3,3],[4,3],[5,3],[1,4],[2,4],[4,4],[5,4]];
  ctx.fighters=[source,enemy,...coords.map(([x,y],i)=>fighter("guard",301+i,0,1,x,y))];source.skillPower=8;
  expect(source).toMatchObject({hp:850*2**(star-1),attack:87*2**(star-1),armor:5,range:4,interval:7.2});
  expect(pieceDetails(piece("deer",1,star))).toMatchObject({hp:source.hp,attack:source.attack,armor:5,range:4,interval:1.8});
  expect(castSkill(ctx,source,enemy)).toBe(true);expect(source.spiritWard!.channel!.targets).toHaveLength(SPIRIT_WARD.targets[star-1]);
  expect(ctx.fighters.every(f=>!f.spiritWards)).toBe(true);expect(skillReady(source)).toBe(false);
  ctx.tick=12;advanceSpiritWards(ctx);
  expect(source.spiritWard).toMatchObject({formed:1,protected:SPIRIT_WARD.targets[star-1]});expect(source.spiritWards).toBeUndefined();expect(enemy.spiritWards).toBeUndefined();
  const target=ctx.fighters.find(f=>f.spiritWards)!;expect(effectiveArmor(target,12)).toBe(5+SPIRIT_WARD.armor[star-1]);
  expect(effectiveMagicResist(target,12)).toBeCloseTo(Math.min(0.75,0.2+SPIRIT_WARD.resist[star-1]));
  expect(source.spiritWard!.channel!.until).toBe(12+SPIRIT_WARD.duration[star-1]);expect(source.skillReadyAt).toBe(110);expect(source.mana).toBe(0);
  expect(ctx.events).toEqual([]);expect(source.healing).toBe(0);expect(target.shield).toBe(0);
 });

 it("生命比例优先，距离及UID稳定打破平局；自身、残魂、火种和范围外不入选",()=>{
  const {source,enemy,ctx}=setup(),low=fighter("guard",302,0,1,3,1),near=fighter("guard",303,0,1,4,4),tie=fighter("guard",304,0,1,2,4),
   soul=fighter("guard",305,0,1,3,3),egg=fighter("phoenix",306,0,2,3,3),far=fighter("guard",307,0,1,7,0);
  low.hp=10;soul.hp=1;soul.immortal={spent:true,until:99,duration:20};egg.phoenix!.eggUntil=99;
  ctx.fighters=[source,enemy,tie,near,low,soul,egg,far];
  expect(spiritWardTargets(ctx,source).map(f=>f.uid)).toEqual([302,303,304]);
  expect(spiritWardTargets({...ctx,fighters:[...ctx.fighters].reverse()},source).map(f=>f.uid)).toEqual([302,303,304]);
 });

 for(const block of ["stun","silence","charm","dead","cooldown","no-ally"] as const)it(`${block}时不扣能量或开始冷却`,()=>{
  const {source,ally,enemy,ctx}=setup();
  if(block==="stun")source.stunUntil=11;if(block==="silence")source.silenceUntil=11;if(block==="charm")source.charm={until:11,attack:source.attack,side:1};
  if(block==="dead")source.hp=0;if(block==="cooldown")source.skillReadyAt=11;if(block==="no-ally")ally.hp=0;
  const before=structuredClone(ctx);expect(castSkill(ctx,source,enemy)).toBe(false);expect(ctx).toEqual(before);
 });

 for(const block of ["stun","silence","charm","dead","side","soul"] as const)it(`${block}中断维持并立即撤回双防，重复清理不重复计数`,()=>{
  const {source,ally,ctx}=release();
  if(block==="stun")source.stunUntil=99;if(block==="silence")source.silenceUntil=99;if(block==="charm")source.charm={until:99,attack:source.attack,side:1};
  if(block==="dead")source.hp=0;if(block==="side")source.side=1;if(block==="soul"){source.hp=1;source.immortal={spent:true,until:99,duration:20};}
  expect(effectiveArmor(ally,12,ctx.fighters)).toBe(5);expireSpiritWards(ctx);expireSpiritWards(ctx);
  expect(source.spiritWard!.channel).toBeUndefined();expect(source.spiritWard!.interrupted).toBe(1);expect(ally.spiritWards).toBeUndefined();expect(effectiveMagicResist(ally,12)).toBe(0.2);
  expect(advanceSpiritWardAction(ctx,source)).toBe(true);ctx.tick++;expect(advanceSpiritWardAction(ctx,source)).toBe(false);
 });

 it("蓄灵也能中断，不形成未来增益；自然到期撤回且不能靠满能量绕过25秒CD",()=>{
  const state=setup();castSkill(state.ctx,state.source,state.enemy);state.source.stunUntil=99;state.ctx.tick=11;
  advanceSpiritWards(state.ctx);expect(state.source.spiritWard).toMatchObject({formed:0,protected:0,interrupted:1});expect(state.ally.spiritWards).toBeUndefined();
  const {source,ally,enemy,ctx}=release();source.mana=100;ctx.tick=32;advanceSpiritWards(ctx);
  expect(source.spiritWard!.channel).toBeUndefined();expect(ally.spiritWards).toBeUndefined();expect(source.spiritWard!.interrupted).toBe(0);
  ctx.tick=109;expect(castSkill(ctx,source,enemy)).toBe(false);expect(source.mana).toBe(100);
  ctx.tick=110;expect(castSkill(ctx,source,enemy)).toBe(true);
 });

 it("一个目标离开只断开一条，回来及新友军不重新挂线，全部失效才收束",()=>{
  const state=setup(),other=fighter("infantry",103,0,1,4,4);state.ctx.fighters.push(other);const {source,ally,ctx}=release(state);
  other.x=7;other.y=0;ctx.tick=13;expireSpiritWards(ctx);
  expect(source.spiritWard).toMatchObject({severed:1,channel:{targets:[102]}});expect(other.spiritWards).toBeUndefined();expect(ally.spiritWards).toHaveLength(1);
  other.x=4;other.y=4;ctx.tick=14;advanceSpiritWards(ctx);expect(other.spiritWards).toBeUndefined();
  ally.side=1;expireSpiritWards(ctx);expect(source.spiritWard!.channel).toBeUndefined();expect(source.spiritWard!.severed).toBe(2);
 });

 it("多来源不叠加，最强来源被中断后仍在维持的弱连线继续生效",()=>{
  const {source,ally,enemy,ctx}=setup(),strong=fighter("deer",104,0,3,4,4);ctx.fighters.push(strong);
  castSkill(ctx,source,enemy);castSkill(ctx,strong,enemy);ctx.tick=12;advanceSpiritWards(ctx);
  expect(ally.spiritWards).toHaveLength(2);expect(spiritWardBuff(ally,12,ctx.fighters)?.source).toBe(104);expect(effectiveArmor(ally,12,ctx.fighters)).toBe(30);
  strong.stunUntil=99;expect(effectiveArmor(ally,12,ctx.fighters)).toBe(20);expireSpiritWards(ctx);expect(ally.spiritWards).toHaveLength(1);
  expect(strong.spiritWard!.interrupted).toBe(1);expect(source.spiritWard!.channel).toBeDefined();
 });

 it("灵鱼驱散负面状态保留庇护，不把友方双防当作负面清掉",()=>{
  const state=setup(),fish=fighter("fish",103,0,1,4,4);state.ctx.fighters.push(fish);const {source,ally,enemy,ctx}=release(state);
  ally.stunUntil=20;expect(castSkill(ctx,fish,enemy)).toBe(true);expect(ally.stunUntil).toBe(0);expect(ally.spiritWards).toHaveLength(1);
  expect(source.spiritWard!.channel).toBeDefined();expect(effectiveArmor(ally,12)).toBe(20);
 });
});

describe("双防真实结算与贡献",()=>{
 it("闪避不领取庇护减伤，也不消耗生命或护盾",()=>{
  const {source,ally,enemy,ctx}=release();ally.air={...fighter("ghostjet",301,0).air!,flying:true,evasion:1};
  const hp=ally.hp;ally.shield=50;damage(ctx,enemy,ally,100,"physical",false);
  expect(ctx.events.at(-1)!.evaded).toBe(true);expect(ctx.events.at(-1)!.ward).toBeUndefined();
  expect(ally.hp).toBe(hp);expect(ally.shield).toBe(50);expect(source.spiritWard!.mitigated).toBe(0);
 });

 it("实际物理与法术防护各自计数，生命／护盾／治疗不凭空增加",()=>{
  const {source,ally,enemy,ctx}=release();ally.armor=0;const hp=ally.hp;
  expect(damage(ctx,enemy,ally,100,"physical",false)).toBe(53);expect(ctx.events.at(-1)!.ward).toEqual({source:101,prevented:47});
  expect(damage(ctx,enemy,ally,100,"magic",true)).toBe(40);expect(ctx.events.at(-1)!.ward).toEqual({source:101,prevented:40});
  expect(source.spiritWard).toMatchObject({mitigated:87,physicalSaved:47,magicSaved:40});expect(ally.hp).toBe(hp-93);
  expect(ally.shield).toBe(0);expect(ally.absorbed).toBe(0);expect(source.healing).toBe(0);
 });

 it("过量伤害不冒领防护贡献，现有护盾的消耗按容量上限比较",()=>{
  const first=release();first.ally.armor=0;first.ally.hp=10;damage(first.ctx,first.enemy,first.ally,100,"physical",false);
  expect(first.source.spiritWard!.mitigated).toBe(0);expect(first.ctx.events.at(-1)!.ward).toBeUndefined();
  const {source,ally,enemy,ctx}=release();ally.armor=0;ally.hp=60;ally.shield=10;ally.shieldUntil=99;
  damage(ctx,enemy,ally,100,"physical",false);expect(ally.hp).toBe(17);expect(ally.shield).toBe(0);expect(ally.absorbed).toBe(10);
  expect(source.spiritWard!.mitigated).toBe(17);expect(ctx.events.at(-1)!.ward!.prevented).toBe(17);
 });

 it("真伤、完全穿甲与技能免疫不伪造防护数值",()=>{
  const {source,ally,enemy,ctx}=release();ally.armor=0;
  damage(ctx,enemy,ally,40,"true",true);damage(ctx,enemy,ally,40,"physical",false,true,1);
  ally.bladeStorm={until:99,next:13,remaining:6,damage:50};damage(ctx,enemy,ally,40,"magic",true);
  expect(source.spiritWard!.mitigated).toBe(0);expect(ctx.events.every(e=>!e.ward)).toBe(true);
 });

 it("最强来源获得一次减伤贡献，弱来源不重复领取",()=>{
  const state=setup(),strong=fighter("deer",104,0,3,4,4);state.ctx.fighters.push(strong);
  castSkill(state.ctx,state.source,state.enemy);castSkill(state.ctx,strong,state.enemy);state.ctx.tick=12;advanceSpiritWards(state.ctx);
  damage(state.ctx,state.enemy,state.ally,100,"magic",true);expect(strong.spiritWard!.magicSaved).toBe(55);expect(state.source.spiritWard!.mitigated).toBe(0);
 });

 it("海神飞行切换不覆盖庇护，法术减伤统一封顶，结束后恢复原状态",()=>{
  const {source,ally,ctx}=release();ally.air={...fighter("ghostjet",301,0).air!,seaWard:0.2,seaBaseResist:0.2};
  setFlight(ally,true);expect(ally.magicResist).toBe(0.4);expect(effectiveMagicResist(ally,12)).toBe(0.75);
  setFlight(ally,false);expect(effectiveMagicResist(ally,12)).toBeCloseTo(0.6);interruptAirSkill(ctx,source);
  expect(effectiveMagicResist(ally,12)).toBe(0.2);expect(source.spiritWard!.interrupted).toBe(1);
 });

 it("同一三对三确实防护两人，快算／Worker一致，回看不显示未来减伤",()=>{
  const input=structuredClone(SPIRIT_WARD_DEMO),last=demo.frames.at(-1)!,source=last.fighters.find(f=>f.uid===101)!;
  expect(source.spiritWard).toMatchObject({formed:1,protected:2,mitigated:666,physicalSaved:541,magicSaved:125});expect(source.healing).toBe(0);
  const events=demo.frames.flatMap(f=>f.events).filter(e=>e.ward?.source===101);
  expect(events.reduce((n,e)=>n+e.ward!.prevented,0)).toBe(666);
  expect(simulateOutcome(input.left,input.right).final.fighters).toEqual(last.fighters);
  const result=compute({kind:"replay",...input,version:CURRENT_COMBAT_VERSION});expect(result.kind).toBe("replay");if(result.kind!=="replay")throw Error("Unexpected result");
  expect(result.battle).toEqual(demo);expect(input).toEqual(SPIRIT_WARD_DEMO);
  expect(analyzeBattle(demo,16).sides[0].fighters.find(f=>f.uid===101)!.spiritWard).toMatchObject({formed:0,mitigated:0});
  expect(battleAnalysisMarkup(analyzeBattle(demo),"damage","庇护",79,79)).toContain("防护减伤 666（物理 541 / 法术 125）");
 });

 it("详情显示当前双防、时长和阶段，AI按防护与实际友军估值，法强无虚构收益",()=>{
  const {source,ally}=release(),gear=equipmentStats([]),p=piece("deer",1,2);
  expect(compactBattleLabels(source,12)).toContain("维持庇护");expect(spiritWardPose(source,12).lift).toBeGreaterThan(0);
  expect(spiritWardLabels(ally,12).join()).toContain("庇护护甲 +15");expect(fighterBattleMarkup(ally,12,spiritWardLabels(ally,12))).toContain("60%");
  expect(skillDescription("deer")).toContain("不治疗、补盾");expect(skillRole("deer")).toContain("双防");
  expect(abilityCredit(p,{...gear,skillPower:10})).toBe(abilityCredit(p,gear));expect(abilityCredit(p,{...gear,mana:100})).toBeGreaterThan(abilityCredit(p,gear));
  expect(wardSupportCredit([p])).toBe(0);expect(wardSupportCredit([p,piece("guard",2)])).toBeGreaterThan(0);
  expect(itemScore(p,"staff")).toBeLessThan(itemScore(p,"staff","bulwark"));
 });
});

describe("四费目录与旧长生鹿",()=>{
 it("43版旧定义和两费目录冻结，其余兵种不因本次修改，旧庇护仍补盾治疗",()=>{
  expect(frozen.definitions).toHaveLength(43);for(const row of frozen.definitions)expect(unitDefinition("deer",version(row.version))).toEqual(row.unit);
  for(const u of UNITS.filter(u=>u.id!=="deer"))expect(unitDefinition(u.id)).toEqual(unitDefinition(u.id,"bulwark"));
  expect(unitCost("deer")).toBe(4);expect(unitCost("deer","bulwark")).toBe(2);
  const game=createGame(4,"classic");expect(game.catalogVersion).toBe("spirit-ward");expect(catalogCost(game,"deer")).toBe(4);
  const a=army([piece("deer",101)],0,"bulwark")[0],b=army([piece("guard",102)],0,"bulwark")[0],enemy=fighter("infantry",201,1);
  Object.assign(a,{x:3,y:4,mana:100});Object.assign(b,{x:3,y:3,hp:100});const ctx=context(a,b,enemy);
  expect(castSkill(ctx,a,enemy)).toBe(true);expect(a.spiritWard).toBeUndefined();expect(b.hp).toBeGreaterThan(100);expect(b.shield).toBeGreaterThan(0);
 });

 for(const row of frozen.fixtures)it(`${row.version}修改前庇护小回放SHA保持`,async()=>{
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(row.left,row.right,version(row.version)))));
  expect(Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")).toBe(row.hash);expect(row.healing).toBeGreaterThan(0);
 });

 for(const phase of ["prepare","battle","result","finished"] as const)it(`0.70 ${phase}迁移保留旧价格、卡池、资源及回放`,()=>{
  const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("Invalid reserve capture");const game=input;game.combatVersion="bulwark";game.phase=phase;
  if(phase==="result"||phase==="finished"){
   game.round--;game.players[0].hp=game.history.at(-1)!.hp;
   if(phase==="finished"){const p=game.players[0];for(const held of p.pieces)game.pool[held.defId]+=pieceCopies(held);for(const id of p.shop)if(id)game.pool[id]++;
    p.hp=0;p.eliminatedRound=game.round;p.pieces=[];p.shop=[];p.inventory=[];game.history.at(-1)!.hp=0;}
  }
  const before=structuredClone(game),playback={time:3,speed:2,paused:true};
  const decoded=decodeSave(JSON.stringify({schema:69,rules:"singleplayer-0.70",savedAt:1,revision:1,game,playback}));
  expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(decoded.data!.rules).toBe(RULES.version);
  expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});expect(decoded.data!.playback).toEqual(playback);
  if(phase==="result"){nextRound(decoded.data!.game);expect(decoded.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(decoded.data!.game.catalogVersion).toBe("secret-orb");}
 });

 it("缺目录的0.70存档补为bulwark，两费池和持有份数保持",()=>{
  const game=createGame(4,"classic");game.combatVersion="bulwark";
  for(const u of UNITS)game.pool[u.id]+=COPIES[unitCost(u.id,"bulwark")]-COPIES[unitCost(u.id)];delete game.catalogVersion;
  const decoded=decodeSave(JSON.stringify({schema:69,rules:"singleplayer-0.70",savedAt:1,revision:1,game,playback:{time:0,speed:1,paused:false}}));
  expect(decoded.status).toBe("migrated");expect(decoded.data!.game.catalogVersion).toBe("bulwark");expect(catalogCost(decoded.data!.game,"deer")).toBe(2);
  expect(decoded.data!.game.pool).toEqual(game.pool);expect(validGame(decoded.data!.game)).toBe(true);
 });
});
