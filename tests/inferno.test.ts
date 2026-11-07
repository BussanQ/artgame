import {describe,it,expect} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,damage,attackInterval,interruptAirSkill,type CombatContext} from "../src/engine/abilities";
import {advanceInfernos,applyAttackSlow,attackSlowRate,infernoActive} from "../src/engine/inferno";
import {startBladeStorm} from "../src/engine/swordthrall";
import {enterPhoenixEgg} from "../src/engine/phoenix";
import {enterUndying} from "../src/engine/immortality";
import {INFERNO,skillDescription,skillName,skillRole} from "../src/data/skills";
import {INFERNO_DEMO} from "../src/data/inferno-demo";
import {unitDefinition,unitSprite} from "../src/data/unit-stats";
import {UNITS,COPIES,RULES} from "../src/data/units";
import {catalogCost} from "../src/data/catalog";
import {createGame,buy,sell} from "../src/engine/game";
import {decodeSave,validGame,SAVE_SCHEMA} from "../src/engine/persistence";
import {equipmentStats} from "../src/data/items";
import {abilityCredit} from "../src/engine/ai";
import {itemScore} from "../src/engine/equipment";
import {compute} from "../src/compute/job";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {fighterSprite} from "../src/engine/summons";
import {infernoLabels,infernoPose} from "../src/render/inferno";
import {pieceDetails} from "../src/ui/bench-tooltip";
import {compactBattleLabels,fighterBattleMarkup} from "../src/render/battle-inspection";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type Fighter,type Piece,type Game,type CombatVersion} from "../src/engine/types";
import frozen from "./fixtures/pre-v075-inferno-replays.json";

const piece=(defId:string,uid:number,star=1,position:number|null=35):Piece=>({defId,uid,star,position});
function fighter(id:string,uid:number,side:0|1,star=1,x=3,y=4){const f=army([piece(id,uid,star)],side)[0];Object.assign(f,{x,y,mana:100});return f;}
const context=(...fighters:Fighter[]):CombatContext=>({fighters,tick:10,events:[],effects:[]});
function setup(star=2){const source=fighter("vajra",101,0,star),target=fighter("guard",201,1,1,3,3);target.magicResist=0;return {source,target,ctx:context(source,target)};}
function released(star=2){const s=setup(star);expect(castSkill(s.ctx,s.source,s.target)).toBe(true);s.ctx.tick=12;advanceInfernos(s.ctx);return s;}
const hash=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,"0")).join("");
function savedGame(phase:Game["phase"]="prepare",version:CombatVersion="siege"){
 const game=createGame(75,"classic");game.combatVersion=version;game.catalogVersion=version;
 for(const p of game.players){p.pieces=[];p.shop=Array(RULES.shop).fill(null);p.gold=50;}
 game.pool=Object.fromEntries(UNITS.map(u=>[u.id,COPIES[catalogCost(game,u.id)]]));game.nextUid=1000;game.phase=phase;game.encountersFromRound=31;
 game.players[0].pieces=[piece("vajra",101,2)];game.players[0].shop[0]="vajra";game.pool.vajra-=4;
 if(phase==="result")game.history=[{combatVersion:version,round:1,opponentId:1,opponentName:game.players[1].name,kind:"pvp",winner:0,damage:1,income:5,hp:100,gold:50,left:[piece("vajra",101,2)],right:[piece("guard",202)]}];
 return game;
}
const save=(game:Game)=>JSON.stringify({schema:73,rules:"singleplayer-0.74",savedAt:1,revision:1,game,playback:{time:2,speed:2,paused:true}});
const demoInput=structuredClone(INFERNO_DEMO);
const computed=compute({kind:"replay",...INFERNO_DEMO,version:CURRENT_COMBAT_VERSION});
if(computed.kind!=="replay")throw Error("Unexpected demo computation");
const demo=computed.battle;

describe("金刚一费本体与可打断的炎狱震地",()=>{
 it("恢复七月身板和双臂形象，保留旧二费原型",()=>{
  expect(UNITS).toHaveLength(64);expect(unitDefinition("vajra")).toMatchObject({cost:1,hp:650,attack:44,armor:5,range:1,interval:6,initialMana:0,skill:"炎狱之怒"});
  expect(unitDefinition("vajra","siege")).toMatchObject({cost:2,hp:900,attack:42,interval:4,initialMana:25,skill:"镇岳重击"});
  expect(unitSprite("vajra")).toBe("vajra-inferno-v075");expect(unitSprite("vajra","siege")).toBe("vajra");
  expect(pieceDetails(piece("vajra",1)).action).toBe("双拳交替重击");expect(pieceDetails(piece("vajra",1),"siege").action).toBe("四臂交替重拳");
 });
 it("蓄势不提前伤害，半秒释放，周围横纵命中且不补盾/眩晕",()=>{
  const s=setup(),near=fighter("infantry",202,1,1,4,4),diagonal=fighter("infantry",203,1,1,4,3),ally=fighter("infantry",301,0,1,2,4);near.magicResist=0;s.ctx.fighters.push(near,diagonal,ally);
  expect(castSkill(s.ctx,s.source,s.target)).toBe(true);expect(s.ctx.events).toHaveLength(0);expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(250);
  s.ctx.tick=11;advanceInfernos(s.ctx);expect(s.ctx.events).toHaveLength(0);s.ctx.tick=12;advanceInfernos(s.ctx);
  expect(s.ctx.events.map(e=>e.target)).toEqual([201,202]);expect(s.ctx.events.every(e=>e.skill&&e.damageType==="magic")).toBe(true);
  expect(s.source.inferno).toMatchObject({formed:1,hits:2,slows:2,healing:0});expect(s.source.shield).toBe(0);expect(s.target.stunUntil).toBe(0);expect(attackSlowRate(diagonal,12)).toBe(0);expect(attackSlowRate(ally,12)).toBe(0);
 });
 it.each(["眩晕","沉默","魅惑","阵亡","残魂"])("蓄势被%s打断，只记一次且不退还资源",kind=>{
  const s=setup();castSkill(s.ctx,s.source,s.target);s.ctx.tick=11;
  if(kind==="眩晕")s.source.stunUntil=20;if(kind==="沉默")s.source.silenceUntil=20;if(kind==="魅惑")s.source.charm={side:0,until:20,attack:s.source.attack};if(kind==="阵亡")s.source.hp=0;if(kind==="残魂")s.source.immortal={duration:8,until:20,spent:true};
  advanceInfernos(s.ctx);s.ctx.tick=12;advanceInfernos(s.ctx);expect(s.source.inferno).toMatchObject({formed:0,interrupted:1});expect(s.ctx.events).toHaveLength(0);expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(250);
 });
 it("直接打断入口停止蓄势，旧原型仍使用原护盾和倍率",()=>{
  const s=setup();castSkill(s.ctx,s.source,s.target);interruptAirSkill(s.ctx,s.source);expect(s.source.inferno!.interrupted).toBe(1);
  const old=army([piece("vajra",1)],0,"siege")[0],target=army([piece("guard",2)],1,"siege")[0];Object.assign(old,{x:3,y:4,mana:100});Object.assign(target,{x:3,y:3});castSkill(context(old,target),old,target);expect(old.inferno).toBeUndefined();expect(old.shield).toBe(180);expect(target.slow?.multiplier).toBe(1.4);
 });
 it("没有附近敌人、控制中或冷却未结束不会吞能量",()=>{
  for(const kind of ["far","stun","silence","cooldown","charm"]){const s=setup();if(kind==="far")s.target.y=0;if(kind==="stun")s.source.stunUntil=20;if(kind==="silence")s.source.silenceUntil=20;if(kind==="cooldown")s.source.skillReadyAt=20;if(kind==="charm")s.source.charm={side:0,until:20,attack:s.source.attack};expect(castSkill(s.ctx,s.source,s.target)).toBe(false);expect(s.source.mana).toBe(100);}
 });
 it("释放按当前自身位置判范围，目标撤离不取消自身狂怒",()=>{
  const s=setup();castSkill(s.ctx,s.source,s.target);s.target.y=0;s.ctx.tick=12;advanceInfernos(s.ctx);expect(s.ctx.events).toHaveLength(0);expect(infernoActive(s.source,12)).toBe(true);expect(s.source.inferno!.slows).toBe(0);
 });
 it("释放后眩晕/沉默不抹除狂怒，死亡或残魂立即失效，精确到期",()=>{
  const s=released();s.source.stunUntil=30;s.source.silenceUntil=30;expect(infernoActive(s.source,13)).toBe(true);expect(infernoActive(s.source,43)).toBe(true);expect(infernoActive(s.source,44)).toBe(false);
  s.source.immortal={duration:8,until:30,spent:true};expect(infernoActive(s.source,13)).toBe(false);delete s.source.immortal;s.source.hp=0;expect(infernoActive(s.source,13)).toBe(false);
 });
});

describe("减速、法伤与实际吸血",()=>{
 it.each([1,2,3])("%s星降低真实攻击速度而非简单延长相同比例的间隔",star=>{
  const s=released(star),rate=INFERNO.slow[star-1];expect(attackSlowRate(s.target,12)).toBe(rate);expect(attackInterval(s.target,12)).toBeCloseTo(s.target.interval/(1-rate));
  expect(s.ctx.events[0].amount).toBe(INFERNO.damage[star-1]);expect(s.target.attackSlows![0].until).toBe(44);
 });
 it("多来源独立到期，弱效果不延长强效果，来源死亡不撤回已释放减速",()=>{
  const s=setup();applyAttackSlow(s.target,101,0.3,20);applyAttackSlow(s.target,102,0.1,40);expect(attackSlowRate(s.target,19)).toBe(0.3);expect(attackSlowRate(s.target,20)).toBe(0.1);
  s.source.hp=0;s.ctx.tick=20;advanceInfernos(s.ctx);expect(s.target.attackSlows).toEqual([{source:102,rate:0.1,until:40}]);s.ctx.tick=40;advanceInfernos(s.ctx);expect(s.target.attackSlows).toBeUndefined();
 });
 it("狂怒与编队攻速相加，减速只取最强而不乘成无限慢速",()=>{
  const s=released();s.source.formationHaste=0.25;applyAttackSlow(s.source,201,0.3,40);s.source.slow={multiplier:1.2,until:40};expect(attackInterval(s.source,13)).toBeCloseTo(6/(1+0.25+0.2)/0.7);
 });
 it("法强只放大震地，不提高固定攻速/吸血或减速",()=>{
  const s=setup();s.source.skillPower=3;castSkill(s.ctx,s.source,s.target);s.ctx.tick=12;advanceInfernos(s.ctx);expect(s.ctx.events[0].amount).toBe(300);expect(attackSlowRate(s.target,12)).toBe(0.2);expect(attackInterval(s.source,12)).toBe(5);
 });
 it("吸血只取普攻实际生命伤害，装备相加，护盾与技能不冒算治疗",()=>{
  const s=released();s.ctx.events=[];s.source.hp=500;s.source.lifesteal=0.2;s.target.armor=0;s.target.shield=60;
  damage(s.ctx,s.source,s.target,100,"physical",false);expect(s.source.hp).toBe(512);expect(s.source.healing).toBe(12);expect(s.source.inferno!.healing).toBe(4);
  damage(s.ctx,s.source,s.target,100,"magic",true);expect(s.source.hp).toBe(512);expect(s.source.inferno!.healing).toBe(4);
 });
 it("装备吸血已能补满时，狂怒不虚报额外治疗",()=>{
  const s=released();s.source.hp=s.source.maxHp-4;s.source.lifesteal=0.2;s.target.armor=0;damage(s.ctx,s.source,s.target,100,"physical",false);expect(s.source.hp).toBe(s.source.maxHp);expect(s.source.inferno!.healing).toBe(0);expect(s.source.healing).toBe(4);
 });
 it.each(["免控","残魂","火种"])("%s不受减速",kind=>{
  const s=setup();if(kind==="免控")s.target.bladeStorm={until:30,next:20,remaining:4,damage:50};if(kind==="残魂")s.target.immortal={duration:8,until:30,spent:true};if(kind==="火种")s.target.phoenix={spent:true,eggUntil:30,bodyMaxHp:750,hatched:false};castSkill(s.ctx,s.source,s.target);s.ctx.tick=12;advanceInfernos(s.ctx);expect(s.target.attackSlows).toBeUndefined();
 });
 it("灵鱼驱散、剑奴开大、化蛋和进入残魂均清除减速，不驱散友军狂怒",()=>{
  const s=released(),fish=fighter("fish",301,1,1,4,3);s.ctx.fighters.push(fish);castSkill(s.ctx,fish,s.source);expect(s.target.attackSlows).toBeUndefined();expect(infernoActive(s.source,12)).toBe(true);
  applyAttackSlow(s.target,101,0.3,40);startBladeStorm(s.ctx,s.target);expect(s.target.attackSlows).toBeUndefined();
  const phoenix=fighter("phoenix",401,1,2);applyAttackSlow(phoenix,101,0.3,40);phoenix.hp=0;expect(enterPhoenixEgg(s.ctx,phoenix)).toBe(true);expect(phoenix.attackSlows).toBeUndefined();
  const soul=fighter("vine",402,1);soul.immortal={duration:8,until:0,spent:false};applyAttackSlow(soul,101,0.3,40);soul.hp=0;enterUndying(s.ctx,soul);expect(soul.attackSlows).toBeUndefined();
 });
 it("同次震地反伤杀死金刚也不取消已释放的其他接触",()=>{
  const s=setup(),near=fighter("infantry",202,1,1,4,4);near.magicResist=0;s.target.reflection=10;s.source.hp=1;s.ctx.fighters.push(near);castSkill(s.ctx,s.source,s.target);s.ctx.tick=12;advanceInfernos(s.ctx);expect(s.source.hp).toBe(0);expect(s.ctx.events.find(e=>e.target===202)).toMatchObject({amount:100,skill:true});expect(attackSlowRate(near,13)).toBe(0.2);
 });
 it("刑傀保留新形象却不继承狂怒、减速或原战斗贡献",()=>{
  const s=released(),reaper=fighter("reaper",301,1,2,3,5);s.source.hp=1;s.ctx.fighters.push(reaper);damage(s.ctx,reaper,s.source,999,"magic",true,true,0,false,false,false,false,0,false,true);
  const puppet=s.ctx.fighters.find(f=>f.executionPuppet)!;expect(puppet.inferno).toEqual({formed:0,hits:0,slows:0,healing:0,interrupted:0});expect(puppet.attackSlows).toBeUndefined();expect(fighterSprite(puppet)).toBe("vajra-inferno-v075");expect(infernoActive(puppet,12)).toBe(false);
 });
});

describe("卡池、旧回放和完整呈现",()=>{
 it.each(["prepare","battle","result"] as const)("0.74的%s迁移保留二费目录、份数、商店、持有和播放资料",phase=>{
  const game=savedGame(phase),snapshot=structuredClone(game);expect(validGame(game)).toBe(true);const result=decodeSave(save(game));expect(result.status).toBe("migrated");expect(result.data?.schema).toBe(SAVE_SCHEMA);const next=result.data!.game;
  expect(next.combatVersion).toBe(phase==="prepare"?CURRENT_COMBAT_VERSION:"siege");expect(next.catalogVersion).toBe("siege");expect(next.pool).toEqual(snapshot.pool);expect(next.players).toEqual(snapshot.players);expect(next.history).toEqual(snapshot.history);expect(result.data!.playback).toEqual({time:2,speed:2,paused:true});expect(catalogCost(next,"vajra")).toBe(2);
 });
 it("旧局二费买卖，新局一费且份数按一费计，不改变旧卡池",()=>{
  const old=decodeSave(save(savedGame())).data!.game,p=old.players[0];expect(buy(old,p,0)).toBe(true);expect(p.gold).toBe(48);const bought=p.pieces.find(f=>f.uid!==101)!;expect(sell(old,p,bought.uid)).toBe(true);expect(p.gold).toBe(50);
  const current=savedGame("prepare","inferno"),q=current.players[0];expect(current.pool.vajra).toBe(COPIES[1]-4);expect(buy(current,q,0)).toBe(true);expect(q.gold).toBe(49);expect(catalogCost(current,"vajra")).toBe(1);
 });
 it("47代历史64种定义、名称、说明和图像索引保持，冻结小回放SHA不变",async()=>{
  expect(COMBAT_VERSIONS.slice(0,frozen.versions.length)).toEqual(frozen.versions);
  for(const v of frozen.versions as (keyof typeof frozen.definitions)[]){expect(await hash(frozen.unitIds.map(id=>unitDefinition(id,v))),v).toBe(frozen.definitions[v]);expect(await hash(frozen.unitIds.map(id=>[unitSprite(id,v),skillName(id,v),skillRole(id,v),skillDescription(id,v)])),v).toBe(frozen.presentation[v]);}
  expect(await hash(simulate(frozen.replay.left,frozen.replay.right,"siege"))).toBe(frozen.replay.sha256);
 });
 it("AI区分准备和法伤收益，能力预算有界且法强不会凭空增强控制",()=>{
  const p=piece("vajra",101,2),g=equipmentStats([]),base=abilityCredit(p,g);expect(abilityCredit(p,{...g,mana:50})).toBeGreaterThan(base);expect(abilityCredit(p,{...g,skillPower:1})).toBeGreaterThan(base);expect(abilityCredit(p,{...g,skillPower:99})).toBeLessThanOrEqual(0.6);
 });
 it("装备估值按有限震地收益给法强预算，固定旧定义仍保持原评分",()=>{
  for(const star of [1,2,3]){const p=piece("vajra",101,star);expect(itemScore(p,"crystal","inferno")).toBeLessThan(itemScore(p,"crystal","siege"));expect(itemScore({...p,definitionVersion:"siege"},"crystal","inferno")).toBe(itemScore(p,"crystal","siege"));expect(itemScore(p,"fortress")).toBeGreaterThan(itemScore(p,"crystal"));}
 });
 it("同一小局完成震地与减速，Worker和快算一致，输入和经营资源不参与演示",()=>{
  const last=demo.frames.at(-1)!,source=last.fighters.find(f=>f.uid===101)!;expect(source.inferno!.formed).toBe(1);expect(source.inferno!.slows).toBeGreaterThan(0);expect(source.inferno!.healing).toBeGreaterThan(0);expect(simulateOutcome(INFERNO_DEMO.left,INFERNO_DEMO.right).final.fighters).toEqual(last.fighters);expect(INFERNO_DEMO).toEqual(demoInput);
 });
 it("战报随当前帧统计且新旧详情分开，回看不会带入未来狂怒或吸血",()=>{
  const initial=analyzeBattle(demo,0);expect(initial.sides[0].fighters.find(f=>f.uid===101)!.inferno).toMatchObject({formed:0,healing:0,slows:0});const markup=battleAnalysisMarkup(analyzeBattle(demo),"damage","炎狱",160,160);expect(markup).toContain("狂怒额外吸血");expect(markup).toContain("vajra-inferno-v075");
  const s=setup();castSkill(s.ctx,s.source,s.target);expect(compactBattleLabels(s.source,11)).toContain("炎狱蓄势");expect(infernoPose(s.source,11).lift).toBeGreaterThan(0);s.ctx.tick=12;advanceInfernos(s.ctx);expect(infernoPose(s.source,13).lift).toBeLessThan(0);expect(infernoLabels(s.source,44).some(s=>s.startsWith("炎狱狂怒"))).toBe(false);expect(fighterBattleMarkup(s.target,12,infernoLabels(s.target,12))).toContain("炎狱减攻速 20%");
 });
});
