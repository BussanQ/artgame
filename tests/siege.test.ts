import {describe,it,expect} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,combatAttack,attackInterval,gainMana,damage,interruptAirSkill,type CombatContext} from "../src/engine/abilities";
import {advanceSiegeForms,advanceSiegeShells,launchSiegeShell,siegeActionBusy} from "../src/engine/siege";
import {usesEnergy,skillReady} from "../src/engine/triggers";
import {SIEGE,skillDescription,skillName} from "../src/data/skills";
import {SIEGE_DEMO} from "../src/data/siege-demo";
import {unitDefinition} from "../src/data/unit-stats";
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
import {siegeLabels,siegePose} from "../src/render/siege";
import {compactBattleLabels,fighterBattleMarkup} from "../src/render/battle-inspection";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type Fighter,type Piece,type Game,type CombatVersion} from "../src/engine/types";
import frozen from "./fixtures/pre-v074-siege-replays.json";

const piece=(defId:string,uid:number,star=1,position:number|null=35):Piece=>({defId,uid,star,position});
function fighter(id:string,uid:number,side:0|1,star=1,x=3,y=5){const f=army([piece(id,uid,star)],side)[0];Object.assign(f,{x,y,mana:100});return f;}
const context=(...fighters:Fighter[]):CombatContext=>({fighters,tick:10,events:[],effects:[]});
function setup(star=2){const source=fighter("chariot",101,0,star),target=fighter("guard",201,1,1,3,2);target.armor=0;return {source,target,ctx:context(source,target)};}
function deployed(){const s=setup();expect(castSkill(s.ctx,s.source,s.target)).toBe(true);s.ctx.tick=13;advanceSiegeForms(s.ctx);s.ctx.tick=14;s.ctx.events=[];return s;}
const hash=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,"0")).join("");
function oldGame(phase:Game["phase"]="prepare"){
 const game=createGame(74,"classic");game.combatVersion="execution";game.catalogVersion="execution";
 for(const p of game.players){p.pieces=[];p.shop=Array(RULES.shop).fill(null);p.gold=50;}
 game.pool=Object.fromEntries(UNITS.map(u=>[u.id,COPIES[catalogCost(game,u.id)]]));game.nextUid=1000;game.phase=phase;game.encountersFromRound=31;
 if(phase!=="prepare"){game.players[0].pieces=[piece("chariot",101)];game.pool.chariot--;}
 if(phase==="result")game.history=[{combatVersion:"execution",round:1,opponentId:1,opponentName:game.players[1].name,kind:"pvp",winner:0,damage:1,income:5,hp:100,gold:50,left:[piece("chariot",101)],right:[piece("guard",202)]}];
 return game;
}
const save=(game:Game)=>JSON.stringify({schema:72,rules:"singleplayer-0.73",savedAt:1,revision:1,game,playback:{time:2,speed:2,paused:true}});
const computed=compute({kind:"replay",...SIEGE_DEMO,version:CURRENT_COMBAT_VERSION});
if(computed.kind!=="replay")throw Error("Unexpected demo computation");
const demo=computed.battle;

describe("投石车架设与持续炮台",()=>{
 it("恢复三费装甲攻城本体，旧二费与职业定义独立保存",()=>{
  expect(UNITS).toHaveLength(64);expect(unitDefinition("chariot")).toMatchObject({cost:3,traits:["装甲","攻城"],hp:800,attack:45.5,armor:10,range:5,interval:4,initialMana:0});
  expect(unitDefinition("chariot","execution")).toMatchObject({cost:2,hp:620,attack:100,range:4,interval:5,skill:"集束轰击"});
  expect(unitDefinition("chariot","legacy").traits).toEqual(["装甲","狙击","攻城"]);expect(SIEGE.cooldown).toBe(240);expect(SIEGE.haste).toBe(0.4);
  expect(skillName("chariot")).toBe(SIEGE.name);expect(skillDescription("chariot")).toContain("固定");expect(skillName("chariot","execution")).toBe("集束轰击");
 });
 it("起手扣能量，完成前不变形，成功后全场射程且收束帧不普攻",()=>{
  const s=setup();expect(castSkill(s.ctx,s.source,s.target)).toBe(true);expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(250);
  expect(fighterSprite(s.source)).toBe("chariot");s.ctx.tick=12;advanceSiegeForms(s.ctx);expect(s.source.siege!.mode).toBeUndefined();
  s.ctx.tick=13;advanceSiegeForms(s.ctx);expect(s.source.siege).toMatchObject({mode:true,formed:1});expect(s.source.range).toBe(14);expect(siegeActionBusy(s.ctx,s.source)).toBe(true);expect(fighterSprite(s.source)).toBe("chariot-siege-v074");
 });
 it.each(["眩晕","沉默","魅惑","阵亡","残魂"])("架设被%s打断，不退能量或60秒冷却且不重复记中断",kind=>{
  const s=setup();castSkill(s.ctx,s.source,s.target);s.ctx.tick=11;
  if(kind==="眩晕")s.source.stunUntil=20;if(kind==="沉默")s.source.silenceUntil=20;
  if(kind==="魅惑")s.source.charm={side:0,until:20,attack:s.source.attack};if(kind==="阵亡")s.source.hp=0;
  if(kind==="残魂")s.source.immortal={duration:8,until:20,spent:true};
  advanceSiegeForms(s.ctx);advanceSiegeForms(s.ctx);expect(s.source.siege).toMatchObject({formed:0,interrupted:1});expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(250);expect(siegeActionBusy(s.ctx,s.source)).toBe(true);
 });
 it("直接控制入口立即中断，目标消失却不撤销自身架设",()=>{
  const a=setup();castSkill(a.ctx,a.source,a.target);interruptAirSkill(a.ctx,a.source);expect(a.source.siege!.interrupted).toBe(1);
  const b=setup();castSkill(b.ctx,b.source,b.target);b.target.hp=0;b.ctx.tick=13;advanceSiegeForms(b.ctx);expect(b.source.siege!.mode).toBe(true);
 });
 it("施放前的沉默、眩晕、冷却或魅惑不会吞能量",()=>{
  for(const kind of ["stun","silence","cooldown","charm"]){const s=setup();
   if(kind==="stun")s.source.stunUntil=11;if(kind==="silence")s.source.silenceUntil=11;if(kind==="cooldown")s.source.skillReadyAt=11;if(kind==="charm")s.source.charm={side:0,until:20,attack:s.source.attack};
   expect(castSkill(s.ctx,s.source,s.target)).toBe(false);expect(s.source.mana).toBe(100);
  }
 });
 it("形态永久保留，不再回能施法；增攻不受法强，攻速与装备/野兽分别联动",()=>{
  const s=deployed();expect(combatAttack(s.source,14)).toBe(201);expect(attackInterval(s.source,14)).toBeCloseTo(4/1.4);
  s.source.skillPower=20;s.source.silenceUntil=50;s.source.charm={side:0,until:50,attack:s.source.attack};
  expect(combatAttack(s.source,14)).toBe(201);expect(usesEnergy(s.source)).toBe(false);expect(skillReady(s.source)).toBe(false);gainMana(s.source,100,14);expect(s.source.mana).toBe(0);
  s.source.formationHaste=0.25;expect(attackInterval(s.source,14)).toBeCloseTo(4/1.65);expect(s.source.siege!.mode).toBe(true);
 });
});

describe("炮弹实际飞行、固定落点与普通物理结算",()=>{
 it("发射时不扣敌人生命，飞到落点后才结算主目标和40%溅射",()=>{
  const s=deployed(),near=fighter("guard",202,1,1,4,2);near.armor=0;s.ctx.fighters.push(near);
  expect(launchSiegeShell(s.ctx,s.source,s.target)).toBe(true);expect(s.ctx.events).toHaveLength(0);expect(s.target.hp).toBe(750);
  const land=s.source.siege!.shells[0].landAt;s.ctx.tick=land-1;advanceSiegeShells(s.ctx);expect(s.ctx.events).toHaveLength(0);
  s.ctx.tick=land;advanceSiegeShells(s.ctx);expect(s.ctx.events.map(e=>[e.target,e.amount,e.skill,e.primary])).toEqual([[201,201,false,true],[202,80,false,false]]);
  expect(s.source.siege).toMatchObject({fired:1,impacts:1,splashHits:1,splashDamage:80});expect(s.source.damage).toBe(281);
 });
 it("伤害在发射时确定，落地时读取当前护甲",()=>{
  const s=deployed();launchSiegeShell(s.ctx,s.source,s.target);s.source.attack=2000;s.source.skillPower=20;s.target.armor=100;
  s.ctx.tick=20;advanceSiegeShells(s.ctx);expect(s.ctx.events[0].amount).toBe(29);
 });
 it("走出落点可以躲开，新进入者承受主炮；不伤友军且可波及隐蔽目标",()=>{
  const s=deployed();launchSiegeShell(s.ctx,s.source,s.target);s.target.x=7;s.target.y=7;
  const newcomer=fighter("guard",202,1,1,3,2),ally=fighter("guard",301,0,1,4,2),hidden=fighter("fish",203,1,1,2,2);newcomer.armor=0;hidden.armor=0;hidden.signature!.concealed=true;
  s.ctx.fighters.push(newcomer,ally,hidden);s.ctx.tick=20;advanceSiegeShells(s.ctx);
  expect(s.ctx.events.map(e=>e.target)).toEqual([202,203]);expect(s.ctx.events.map(e=>e.amount)).toEqual([201,80]);
 });
 it.each(["阵亡","眩晕","魅惑"])("炮弹发出后来源%s仍落地，并保留发射阵营和起点",kind=>{
  const s=deployed();launchSiegeShell(s.ctx,s.source,s.target);
  if(kind==="阵亡")s.source.hp=0;if(kind==="眩晕")s.source.stunUntil=30;if(kind==="魅惑")s.source.side=1;
  s.source.x=1;s.source.y=7;s.ctx.tick=20;advanceSiegeShells(s.ctx);
  expect(s.ctx.events[0]).toMatchObject({attacker:101,target:201,amount:201,from:{x:3,y:5}});expect(s.source.damage).toBe(201);
 });
 it("主炮被闪避不连带阻止其他目标，护盾伤害不算生命溅射贡献",()=>{
  const s=deployed(),near=fighter("guard",202,1,1,4,2);near.armor=0;near.shield=150;s.target.air!.flying=true;s.target.air!.evasion=1;s.ctx.fighters.push(near);
  launchSiegeShell(s.ctx,s.source,s.target);s.ctx.tick=20;advanceSiegeShells(s.ctx);expect(s.ctx.events[0].evaded).toBe(true);expect(s.ctx.events[1]).toMatchObject({amount:0,absorbed:80});expect(s.source.siege).toMatchObject({splashHits:1,splashDamage:0});
 });
 it("各目标独立吸血，普通物理炮击仍能伤害技能免伤中的剑奴",()=>{
  const s=deployed(),near=fighter("swordthrall",202,1,1,4,2);near.armor=0;near.bladeStorm={until:40,next:20,remaining:4,damage:50};s.ctx.fighters.push(near);s.source.hp=500;s.source.lifesteal=0.5;
  launchSiegeShell(s.ctx,s.source,s.target);s.ctx.tick=20;advanceSiegeShells(s.ctx);expect(s.ctx.events.filter(e=>e.attacker===101).every(e=>!e.immune)).toBe(true);expect(s.source.hp).toBe(641);
 });
 it("反伤击杀来源不取消同一枚已落地炮弹的余下接触",()=>{
  const s=deployed(),near=fighter("guard",202,1,1,4,2);near.armor=0;s.ctx.fighters.push(near);s.source.hp=1;s.target.reflection=100;
  launchSiegeShell(s.ctx,s.source,s.target);s.ctx.tick=20;advanceSiegeShells(s.ctx);expect(s.source.hp).toBe(0);expect(s.ctx.events.find(e=>e.target===202)).toMatchObject({amount:80});
 });
 it("来源阵营变化后灵能及战吼仍可反击已发出的敌方炮弹",()=>{
  const s=deployed();s.target.reflection=10;s.target.warcry={roars:1,petrified:0,retaliations:0,retaliationDamage:0,retaliationShield:0,until:50,reflection:10};
  launchSiegeShell(s.ctx,s.source,s.target);s.source.side=1;s.ctx.tick=20;advanceSiegeShells(s.ctx);expect(s.target.warcry.retaliations).toBe(1);expect(s.ctx.events.filter(e=>e.reflected)).toHaveLength(2);
 });
 it("刑傀继承已架起的普通炮击形态，不复制旧炮弹和旧贡献",()=>{
  const s=deployed();launchSiegeShell(s.ctx,s.source,s.target);s.source.hp=1;s.source.side=1;
  const reaper=fighter("reaper",301,0,2,3,4);s.ctx.fighters.push(reaper);
  damage(s.ctx,reaper,s.source,999,"magic",true,true,0,false,false,false,false,0,false,true);
  const puppet=s.ctx.fighters.find(f=>f.executionPuppet)!;expect(puppet.siege).toMatchObject({mode:true,fired:0,impacts:0,splashDamage:0,shells:[]});expect(puppet.siege!.shot).toBeUndefined();expect(puppet.range).toBe(14);expect(skillReady(puppet)).toBe(false);
 });
});

describe("经营、历史与可读信息",()=>{
 it("46版旧64种定义哈希保持",async()=>{expect(frozen.definitions).toHaveLength(46);for(const row of frozen.definitions)expect(await hash(frozen.ids.map(id=>unitDefinition(id,row.version as CombatVersion)))).toBe(row.sha256);expect(COMBAT_VERSIONS).toContain("siege");});
 for(const row of frozen.replays)it(`${row.version}旧小局面完整SHA保持`,async()=>expect(await hash(simulate(row.left,row.right,row.version as CombatVersion))).toBe(row.sha256));
 it.each(["prepare","battle","result"] as const)("0.73的%s迁移保留旧卡池、费用和播放资料",phase=>{
  const game=oldGame(phase),before=structuredClone(game);expect(validGame(game)).toBe(true);const decoded=decodeSave(save(game));expect(decoded.status).toBe("migrated");const after=decoded.data!.game;
  expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(after.pool).toEqual(before.pool);expect(after.players).toEqual(before.players);expect(after.catalogVersion).toBe("execution");expect(catalogCost(after,"chariot")).toBe(2);expect(after.combatVersion).toBe(phase==="prepare"?CURRENT_COMBAT_VERSION:"execution");expect(decoded.data!.playback).toEqual({time:2,speed:2,paused:true});
 });
 it("旧局仍按2金购买和回池，新局使用三费份数",()=>{
  const game=decodeSave(save(oldGame())).data!.game,p=game.players[0];p.shop[0]="chariot";game.pool.chariot--;const gold=p.gold;
  expect(buy(game,p,0)).toBe(true);expect(p.gold).toBe(gold-2);expect(validGame(game)).toBe(true);sell(game,p,p.pieces[0].uid);expect(game.pool.chariot).toBe(COPIES[2]);expect(validGame(game)).toBe(true);
  const fresh=createGame(74,"classic");expect(catalogCost(fresh,"chariot")).toBe(3);
 });
 it("AI不给法强虚假炮台收益，初始能量仍能加快架设",()=>{
  const p=piece("chariot",101,2),gear=equipmentStats([]),base=abilityCredit(p,gear);expect(abilityCredit(p,{...gear,skillPower:2})).toBe(base);expect(abilityCredit(p,{...gear,mana:50})).toBeGreaterThan(base);expect(itemScore(p,"blade")).toBeGreaterThan(0);
 });
 it("架设/发射/落地详情和形态来自当前帧，不暴露未来炮弹",()=>{
  const s=setup();castSkill(s.ctx,s.source,s.target);expect(compactBattleLabels(s.source,11)).toContain("架设炮台");expect(siegePose(s.source,11).scaleX).toBeGreaterThan(1);
  expect(fighterBattleMarkup(s.source,11,siegeLabels(s.source,11))).toContain("架设中");expect(s.source.siege!.shells).toHaveLength(0);
  const initial=analyzeBattle(demo,0);expect(initial.sides[0].fighters.find(f=>f.defId==="chariot")!.siege).toMatchObject({formed:0,fired:0,impacts:0});expect(battleAnalysisMarkup(analyzeBattle(demo),"damage","攻城",160,160)).toContain("溅射");
 });
 it("同一小演示实际架设、发射与溅射，Worker和快算一致且不修改输入",()=>{
  const last=demo.frames.at(-1)!,source=last.fighters.find(f=>f.uid===101)!;expect(source.siege).toMatchObject({mode:true,formed:1});expect(source.siege!.fired).toBeGreaterThan(0);expect(source.siege!.splashHits).toBeGreaterThan(0);
  const formed=demo.frames.find(f=>f.fighters.find(s=>s.uid===101)!.siege!.mode)!,positions=demo.frames.filter(f=>f.tick>=formed.tick).map(f=>{const s=f.fighters.find(s=>s.uid===101)!;return [s.x,s.y]});expect(new Set(positions.map(p=>p.join())).size).toBe(1);
  expect(simulateOutcome(SIEGE_DEMO.left,SIEGE_DEMO.right).final.fighters).toEqual(last.fighters);expect(SIEGE_DEMO.left[0].items).toEqual(["crystal","coil"]);
 });
});
