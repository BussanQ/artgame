import {describe,it,expect} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,damage,gainMana,attackInterval,interruptAirSkill,type CombatContext} from "../src/engine/abilities";
import {advanceFormless,formlessActive,formlessHaste,emptyFormless} from "../src/engine/formless";
import {applyMendingHaste,advanceMendings} from "../src/engine/mending";
import {applyAttackSlow} from "../src/engine/inferno";
import {attackTargets,concealed} from "../src/engine/triggers";
import {enterPhoenixEgg} from "../src/engine/phoenix";
import {enterUndying} from "../src/engine/immortality";
import {fighterSprite} from "../src/engine/summons";
import {FORMLESS,skillName,skillRole,skillDescription} from "../src/data/skills";
import {unitDefinition,unitSprite} from "../src/data/unit-stats";
import {FORMLESS_DEMO} from "../src/data/formless-demo";
import {abilityCredit} from "../src/engine/ai";
import {equipmentStats} from "../src/data/items";
import {itemScore} from "../src/engine/equipment";
import {createGame,buy} from "../src/engine/game";
import {decodeSave,SAVE_SCHEMA} from "../src/engine/persistence";
import {compute} from "../src/compute/job";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {formlessLabels} from "../src/render/formless";
import {compactBattleLabels} from "../src/render/battle-inspection";
import {pieceDetails} from "../src/ui/bench-tooltip";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type Fighter,type Piece,type CombatVersion} from "../src/engine/types";
import frozen from "./fixtures/pre-v077-formless-replays.json";

const piece=(defId:string,uid:number,star=1):Piece=>({defId,uid,star,position:35});
function fighter(id:string,uid:number,side:0|1,star=1,x=3,y=4,version:CombatVersion=CURRENT_COMBAT_VERSION){
 const f=army([piece(id,uid,star)],side,version)[0];Object.assign(f,{x,y,mana:100});return f;
}
function setup(star=2){const source=fighter("ghostjet",101,0,star),target=fighter("guard",201,1,1,3,3),ctx:CombatContext={fighters:[source,target],tick:10,events:[],effects:[]};return {source,target,ctx};}
function active(star=2){const s=setup(star);expect(castSkill(s.ctx,s.source,s.target)).toBe(true);return s;}
const hash=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,"0")).join("");

describe("无形原地开启与时限",()=>{
 it("采用S04本体、S35技能和独立形象，旧原型仍保留",()=>{
  expect(unitDefinition("ghostjet")).toMatchObject({cost:3,hp:500,attack:60.5,armor:5,range:1,interval:4.4,initialMana:0,regeneration:5,skill:"无形"});
  const s=setup();expect(s.source.regeneration).toBe(1.25);expect(s.source.innateRegen).toBe(true);
  expect(unitDefinition("ghostjet","mending")).toMatchObject({hp:640,attack:90,armor:3,range:3,interval:3,skill:"幽影迁跃"});
  expect(unitSprite("ghostjet")).toBe("ghostjet-formless-v077");expect(unitSprite("ghostjet","mending")).toBe("ghostjet");expect(pieceDetails(piece("ghostjet",1)).action).toBe("侧倾机炮齐射");
 });
 it("不瞬移或造成即时伤害，6秒隐形与16秒冷却均从开启时算",()=>{
  const s=setup(),position={x:s.source.x,y:s.source.y},hp=s.target.hp;castSkill(s.ctx,s.source,s.target);
  expect({x:s.source.x,y:s.source.y}).toEqual(position);expect(s.target.hp).toBe(hp);expect(s.ctx.events).toHaveLength(0);expect(s.ctx.effects.some(e=>e.kind==="teleport")).toBe(false);
  expect(s.source.formless).toMatchObject({activations:1,active:{start:10,until:34}});expect(s.source.skillReadyAt).toBe(74);expect(s.source.mana).toBe(0);
  expect(formlessActive(s.source,9)).toBe(false);expect(formlessActive(s.source,10)).toBe(true);expect(formlessActive(s.source,33)).toBe(true);expect(formlessActive(s.source,34)).toBe(false);
  s.ctx.tick=34;advanceFormless(s.ctx);expect(s.source.formless!.active).toBeUndefined();s.source.mana=100;expect(castSkill(s.ctx,s.source,s.target)).toBe(false);expect(s.source.mana).toBe(100);
  s.ctx.tick=74;expect(castSkill(s.ctx,s.source,s.target)).toBe(true);expect(s.source.formless!.activations).toBe(2);
 });
 it.each([1,2,3])("%s星加速为公告原始比例，法强不改变时长和速度",star=>{
  const s=setup(star);s.source.skillPower=9;castSkill(s.ctx,s.source,s.target);expect(formlessHaste(s.source,10)).toBe(FORMLESS.haste[star-1]);expect(attackInterval(s.source,10)).toBeCloseTo(4.4/(1+FORMLESS.haste[star-1]));expect(s.source.formless!.active!.until).toBe(34);
 });
 it.each(["眩晕","沉默","魅惑","冷却","阵亡","残魂"])("%s时不消耗能量开启",kind=>{
  const s=setup();if(kind==="眩晕")s.source.stunUntil=20;if(kind==="沉默")s.source.silenceUntil=20;if(kind==="魅惑")s.source.charm={side:0,until:20,attack:s.source.attack};if(kind==="冷却")s.source.skillReadyAt=20;if(kind==="阵亡")s.source.hp=0;if(kind==="残魂")s.source.immortal={duration:8,until:20,spent:true};
  expect(castSkill(s.ctx,s.source,s.target)).toBe(false);expect(s.source.formless!.activations).toBe(0);expect(s.source.mana).toBe(100);
 });
 it("自身增益不要求敌人可见或近身，已开启时不能重开延时",()=>{
  const s=setup();s.target.air!.phaseUntil=30;s.source.x=0;s.source.y=7;expect(attackTargets(s.source,s.ctx.fighters,10)).toHaveLength(0);expect(castSkill(s.ctx,s.source,s.source)).toBe(true);
  s.source.mana=100;s.ctx.tick=11;expect(castSkill(s.ctx,s.source,s.source)).toBe(false);expect(s.source.formless!.active!.until).toBe(34);
 });
});

describe("隐形中的真实普通攻击与反制",()=>{
 it("敌方定向选人忽略自己，友军治疗仍可生效，范围伤害仍命中",()=>{
  const s=active(),repair=fighter("repair",102,0,2,4,4);expect(concealed(s.source,s.ctx.fighters,10)).toBe(true);expect(attackTargets(s.target,s.ctx.fighters,10)).toHaveLength(0);
  s.source.hp-=100;s.ctx.fighters.push(repair);expect(castSkill(s.ctx,repair,s.target)).toBe(true);s.ctx.tick=12;
  const hp=s.source.hp;damage(s.ctx,s.target,s.source,100,"magic",true);expect(s.source.hp).toBeLessThan(hp);expect(formlessActive(s.source,12)).toBe(true);
  advanceMendings(s.ctx);expect(s.source.hp).toBe(s.source.maxHp);expect(repair.mending!.healing).toBeGreaterThan(0);
 });
 it("开启后控制、沉默或直接打断入口不删除增益，魅惑不延长",()=>{
  const s=active();s.source.stunUntil=30;s.source.silenceUntil=30;interruptAirSkill(s.ctx,s.source);expect(formlessActive(s.source,20)).toBe(true);
  s.source.charm={side:0,until:30,attack:s.source.attack};s.source.side=1;s.ctx.tick=20;advanceFormless(s.ctx);expect(s.source.formless!.active!.until).toBe(34);expect(formlessHaste(s.source,20)).toBe(0.4);
 });
 it("定向技能的二次选人不能绕过无形，魅惑、迁跃和突袭选择可见敌人",()=>{
  for(const id of ["spider","ghostjet","shadowblade"]){
   const s=active(),caster=fighter(id,301,1,1,3,4,id==="ghostjet"?"mending":CURRENT_COMBAT_VERSION),visible=fighter("infantry",302,0,1,3,3);
   Object.assign(s.source,{attack:999,hp:1,x:7,y:0});s.ctx.fighters.push(caster,visible);const hp=s.source.hp;
   const full=s.ctx.fighters;s.ctx.fighters=[s.source,caster];expect(castSkill(s.ctx,caster,s.source)).toBe(false);expect(caster.mana).toBe(100);s.ctx.fighters=full;
   expect(castSkill(s.ctx,caster,visible)).toBe(true);expect(s.source.hp).toBe(hp);expect(s.source.charm).toBeUndefined();
   if(id==="spider")expect(visible.charm).toBeDefined();else expect(Math.abs(caster.x-visible.x)+Math.abs(caster.y-visible.y)).toBe(1);
  }
 });
 it.each(["阵亡","火种","残魂"])("%s结束隐形和加速，历史统计仍保留",kind=>{
  const s=active();s.source.hp=0;
  if(kind==="火种"){s.source.phoenix={spent:false,eggUntil:0,bodyMaxHp:s.source.maxHp,hatched:false};expect(enterPhoenixEgg(s.ctx,s.source)).toBe(true);}
  if(kind==="残魂"){s.source.immortal={duration:8,until:0,spent:false};enterUndying(s.ctx,s.source);}
  advanceFormless(s.ctx);expect(formlessActive(s.source,10)).toBe(false);expect(formlessHaste(s.source,10)).toBe(0);expect(s.source.formless!.active).toBeUndefined();expect(s.source.formless!.activations).toBe(1);
 });
 it("与编队、灵蕴加速相加，与炎狱减速同时结算，最快仍有一帧下限",()=>{
  const s=active();s.source.formationHaste=0.25;applyMendingHaste(s.source,102,0.3,40);applyAttackSlow(s.source,201,0.2,40);
  expect(attackInterval(s.source,10)).toBeCloseTo(4.4/(1+0.25+0.3+0.4)/0.8);s.source.formationHaste=100;expect(attackInterval(s.source,10)).toBe(1);
 });
 it("只计隐形期间普通有效命中的实际生命与破盾，技能和过量伤害不冒算",()=>{
  const s=active();s.target.armor=0;s.target.shield=60;damage(s.ctx,s.source,s.target,100,"physical",false);expect(s.source.formless).toMatchObject({hits:1,damage:40,shieldDamage:60});expect(s.ctx.events[0].ranged).toBe(true);
  damage(s.ctx,s.source,s.target,100,"magic",true);expect(s.source.formless!.hits).toBe(1);s.target.hp=5;damage(s.ctx,s.source,s.target,100,"physical",false);expect(s.source.formless).toMatchObject({hits:2,damage:45,shieldDamage:60});
 });
 it("吸血与反伤照常生效，反伤致死不抹掉已命中统计",()=>{
  const s=active();s.source.hp=100;s.source.lifesteal=0.1;s.target.armor=0;damage(s.ctx,s.source,s.target,100,"physical",false);expect(s.source.hp).toBe(110);
  s.source.hp=1;s.source.lifesteal=0;s.target.reflection=10;damage(s.ctx,s.source,s.target,100,"physical",false);expect(s.source.hp).toBe(0);expect(s.source.formless!.hits).toBe(2);expect(s.source.formless!.damage).toBe(200);
 });
 it("无形期间可回能，友军驱散不删除正面增益，到期后的普攻不冒算",()=>{
  const s=active(),fish=fighter("fish",301,0,1,4,4);gainMana(s.source,30,11);expect(s.source.mana).toBe(30);s.ctx.fighters.push(fish);expect(castSkill(s.ctx,fish,s.target)).toBe(true);expect(formlessActive(s.source,12)).toBe(true);
  s.ctx.tick=34;damage(s.ctx,s.source,s.target,100,"physical",false);expect(s.source.formless!.hits).toBe(0);
 });
 it("刑傀清空无形时段和原战斗贡献，保留新形象且不能施法",()=>{
  const s=active(),reaper=fighter("reaper",301,1,2,3,5);s.source.hp=1;s.ctx.fighters.push(reaper);damage(s.ctx,reaper,s.source,999,"magic",true,true,0,false,false,false,false,0,false,true);
  const puppet=s.ctx.fighters.find(f=>f.executionPuppet)!;expect(puppet.formless).toEqual(emptyFormless());expect(fighterSprite(puppet)).toBe("ghostjet-formless-v077");expect(formlessActive(puppet,10)).toBe(false);puppet.mana=100;expect(castSkill(s.ctx,puppet,s.target)).toBe(false);
 });
 it("旧幽影迁跃仍按原规则瞬移、伤害与2秒相位隐身",()=>{
  const source=fighter("ghostjet",1,0,1,0,7,"mending"),target=fighter("guard",2,1,1,4,2,"mending"),ctx:CombatContext={fighters:[source,target],tick:10,events:[],effects:[]};const hp=target.hp;
  expect(castSkill(ctx,source,target)).toBe(true);expect(source.formless).toBeUndefined();expect(source.air!.phaseUntil).toBe(18);expect(target.hp).toBeLessThan(hp);expect(ctx.effects.some(e=>e.kind==="teleport")).toBe(true);
 });
});

describe("版本、估值和固定小场景",()=>{
 it("49代64种旧定义和呈现SHA保持，冻结35帧旧回放保持",async()=>{
  expect(COMBAT_VERSIONS.slice(0,frozen.versions.length)).toEqual(frozen.versions);
  for(const v of frozen.versions as (keyof typeof frozen.definitions)[]){expect(await hash(frozen.unitIds.map(id=>unitDefinition(id,v))),v).toBe(frozen.definitions[v]);expect(await hash(frozen.unitIds.map(id=>[unitSprite(id,v),skillName(id,v),skillRole(id,v),skillDescription(id,v)])),v).toBe(frozen.presentation[v]);}
  expect(await hash(simulate(frozen.replay.left,frozen.replay.right,frozen.replay.version as CombatVersion))).toBe(frozen.replay.sha256);
 });
 it.each(["prepare","battle","result"] as const)("0.76的%s迁移不更换卡池、阵容、目录和播放资料",phase=>{
  const game=createGame(77,"classic");game.combatVersion="mending";game.catalogVersion="mending";expect(buy(game,game.players[0],0)).toBe(true);game.players[0].pieces[0].position=35;game.phase=phase;
  if(phase==="result")game.history=[{combatVersion:"mending",round:1,opponentId:1,opponentName:game.players[1].name,kind:"pvp",winner:0,damage:1,income:5,hp:100,gold:game.players[0].gold,left:structuredClone(game.players[0].pieces),right:[]}];
  const before=structuredClone(game),playback={time:2,speed:2,paused:true},result=decodeSave(JSON.stringify({schema:75,rules:"singleplayer-0.76",savedAt:1,revision:1,game,playback}));
  expect(result.status).toBe("migrated");expect(result.data?.schema).toBe(SAVE_SCHEMA);expect(result.data?.game.combatVersion).toBe(phase==="prepare"?CURRENT_COMBAT_VERSION:"mending");expect(result.data?.game.catalogVersion).toBe("mending");expect(result.data?.game.pool).toEqual(before.pool);expect(result.data?.game.players).toEqual(before.players);expect(result.data?.game.history).toEqual(before.history);expect(result.data?.playback).toEqual(playback);
 });
 it("AI只估计有限隐形加速，法强不增加技能价值或装备评分",()=>{
  const p=piece("ghostjet",1,2),gear=equipmentStats([]),credit=abilityCredit(p,gear);expect(credit).toBeGreaterThan(0);expect(credit).toBeLessThan(0.6);expect(abilityCredit(p,{...gear,skillPower:99})).toBe(credit);expect(abilityCredit(p,{...gear,mana:50})).toBeGreaterThan(credit);
  expect(itemScore(p,"crystal")).toBeLessThan(itemScore(p,"crystal","mending"));expect(itemScore({...p,definitionVersion:"mending"},"crystal")).toBe(itemScore(p,"crystal","mending"));
 });
 it("同一小场景真正开启无形并射击，快算一致、输入不变，回看不带入未来统计",()=>{
  const before=structuredClone(FORMLESS_DEMO),computed=compute({kind:"replay",...FORMLESS_DEMO,version:CURRENT_COMBAT_VERSION});if(computed.kind!=="replay")throw Error("Unexpected computation");
  const battle=computed.battle,last=battle.frames.at(-1)!,source=last.fighters.find(f=>f.uid===101)!;expect(source.formless!.activations).toBeGreaterThan(0);expect(source.formless!.hits).toBeGreaterThan(0);expect(source.formless!.damage).toBeGreaterThan(0);
  expect(simulateOutcome(FORMLESS_DEMO.left,FORMLESS_DEMO.right).final.fighters).toEqual(last.fighters);expect(FORMLESS_DEMO).toEqual(before);expect(analyzeBattle(battle,0).sides[0].fighters.find(f=>f.uid===101)!.formless).toEqual(emptyFormless());
  const markup=battleAnalysisMarkup(analyzeBattle(battle),"damage","无形",160,160);expect(markup).toContain("隐形普攻有效命中");expect(markup).toContain("ghostjet-formless-v077");const s=active();expect(formlessLabels(s.source,11).some(x=>x.includes("攻速 +40%"))).toBe(true);expect(compactBattleLabels(s.source,11)).toContain("无形隐身");expect(compactBattleLabels(s.source,34)).not.toContain("无形隐身");
 });
});
