import {describe,it,expect} from "vitest";
import {army,simulate} from "../src/engine/battle";
import {castSkill,damage,gainMana,interruptAirSkill,type CombatContext} from "../src/engine/abilities";
import {advanceTortoises,advanceTortoiseAction,refreshTortoiseTaunts,tortoiseStrike} from "../src/engine/tortoise";
import {advanceSpiritWards} from "../src/engine/spirit-ward";
import {tauntTarget,expireTaunts} from "../src/engine/taunt";
import {usesEnergy,skillReady,effectiveArmor,effectiveMagicResist} from "../src/engine/triggers";
import {unitDefinition} from "../src/data/unit-stats";
import {catalogCost,catalogUnit,catalogDefinitionVersion,pinCatalogDefinitions} from "../src/data/catalog";
import {TORTOISE,skillDescription} from "../src/data/skills";
import {TORTOISE_SHELL_DEMO,TORTOISE_BREACH_DEMO} from "../src/data/tortoise-demo";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type CombatVersion,type Fighter,type Game,type Piece} from "../src/engine/types";
import {COPIES,UNITS,RULES} from "../src/data/units";
import {createGame,nextRound,buy,sell} from "../src/engine/game";
import {isRecruitable,availableUnits,SERIES,playableRotation} from "../src/engine/rotation";
import {synergies} from "../src/engine/synergies";
import {decodeSave,validGame,SAVE_SCHEMA} from "../src/engine/persistence";
import {pieceDetails} from "../src/ui/bench-tooltip";
import {equipmentStats} from "../src/data/items";
import {itemScore} from "../src/engine/equipment";
import {abilityCredit,pieceStrength} from "../src/engine/ai";
import {fighterSprite} from "../src/engine/summons";
import {tortoiseLabels,tortoisePose} from "../src/render/tortoise";
import {compactBattleLabels,fighterBattleMarkup} from "../src/render/battle-inspection";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import frozen from "./fixtures/pre-v072-tortoise-replays.json";

const piece=(defId:string,uid:number,star=1,position:number|null=35):Piece=>({defId,uid,star,position});
function fighter(id:string,uid:number,side:0|1,star=1,x=3,y=4){const f=army([piece(id,uid,star)],side)[0];Object.assign(f,{x,y,mana:100});return f;}
const context=(...fighters:Fighter[]):CombatContext=>({fighters,tick:10,events:[],effects:[]});
function setup(star=1){const source=fighter("turtle",101,0,star),enemy=fighter("guard",201,1,1,3,3);return {source,enemy,ctx:context(source,enemy)};}
function form(state=setup()){
 expect(castSkill(state.ctx,state.source,state.enemy)).toBe(true);state.ctx.tick+=TORTOISE.windup;advanceTortoises(state.ctx);return state;
}
function match(catalog:CombatVersion="spirit-ward",bans?:Game["bannedSeries"]){
 const game=createGame(71,"classic");game.catalogVersion=catalog;game.combatVersion=catalog;game.bannedSeries=bans;game.nextUid=1000;
 for(const p of game.players){p.pieces=[];p.shop=Array(RULES.shop).fill(null);p.gold=50;}
 game.pool=Object.fromEntries(UNITS.map(u=>[u.id,isRecruitable(game,u.id)?COPIES[catalogCost(game,u.id)]:0]));return game;
}
const save=(game:Game,schema=70,rules="singleplayer-0.71")=>JSON.stringify({schema,rules,savedAt:1,revision:1,game,playback:{time:0,speed:1,paused:false}});
function held(game:Game){const p=piece("turtle",101);game.players[0].pieces.push(p);game.pool.turtle--;return p;}

describe("玄龟双形态与人数判定",()=>{
 it("新五费灵能本体与能量可受装备影响；44版旧定义完全冻结",()=>{
  expect(unitDefinition("turtle")).toMatchObject({cost:5,traits:["灵能","护卫"],hp:1500,attack:40,armor:10,range:1,interval:6.4,initialMana:0});
  expect(frozen.definitions).toHaveLength(44);for(const row of frozen.definitions)expect(unitDefinition("turtle",row.version as CombatVersion)).toEqual(row.unit);
  expect(COMBAT_VERSIONS[44]).toBe("tortoise");expect(CURRENT_COMBAT_VERSION).toBe(COMBAT_VERSIONS.at(-1));
  expect(army([piece("turtle",1)],0)[0].mana).toBe(0);
  expect(army([{...piece("turtle",1),items:["staff","staff","staff"]}],0)[0].mana).toBe(100);
 });
 it("能量不足、沉默或眩晕不能开始变形，也不扣能量",()=>{
  for(const status of ["mana","stunUntil","silenceUntil"] as const){
   const s=setup();s.source[status]=status==="mana"?99:20;expect(castSkill(s.ctx,s.source,s.enemy)).toBe(false);expect(s.source.tortoise!.casting).toBeUndefined();expect(s.source.mana).toBe(status==="mana"?99:100);
  }
 });
 it("人数相等归守御，半秒后成形，每场成功一次且此后不再蓄能",()=>{
  const s=setup();expect(castSkill(s.ctx,s.source,s.enemy)).toBe(true);expect(s.source.mana).toBe(0);expect(s.source.tortoise!.mode).toBeUndefined();expect(advanceTortoiseAction(s.ctx,s.source)).toBe(true);
  s.ctx.tick=11;advanceTortoises(s.ctx);expect(s.source.tortoise!.formed).toBe(0);
  s.ctx.tick=12;advanceTortoises(s.ctx);expect(s.source.tortoise).toMatchObject({mode:"shell",formed:1,allies:1,enemies:1});
  expect(usesEnergy(s.source)).toBe(false);gainMana(s.source,100,13);expect(s.source.mana).toBe(0);expect(skillReady(s.source)).toBe(false);
 });
 it("人数在完成时判定，已确定形态不会随后续死亡反复切换",()=>{
  const s=setup(),ally=fighter("infantry",102,0);s.ctx.fighters.push(ally);expect(castSkill(s.ctx,s.source,s.enemy)).toBe(true);ally.hp=0;
  s.ctx.tick=12;advanceTortoises(s.ctx);expect(s.source.tortoise!.mode).toBe("shell");
  s.ctx.fighters.push(fighter("guard",103,0));s.ctx.tick++;advanceTortoises(s.ctx);expect(s.source.tortoise!.mode).toBe("shell");expect(s.source.tortoise!.formed).toBe(1);
 });
 it("我方多时破壳；召唤物计数而死亡、残魂及涅槃火种不计",()=>{
  const s=setup(),summon=fighter("wolf",102,0),dead=fighter("guard",203,1),soul=fighter("guard",204,1),egg=fighter("phoenix",205,1);
  summon.summon={owner:101,born:0};dead.hp=0;soul.immortal={duration:8,until:99,spent:true};egg.phoenix!.eggUntil=99;
  s.ctx.fighters.push(summon,dead,soul,egg);form(s);expect(s.source.tortoise).toMatchObject({mode:"breach",allies:2,enemies:1});
 });
 it.each(["stun","silence","charm","death"])("蓄势被%s打断保留60秒冷却，成功形态不被控制解除",status=>{
  const s=setup();castSkill(s.ctx,s.source,s.enemy);
  if(status==="stun")s.source.stunUntil=30;if(status==="silence")s.source.silenceUntil=30;
  if(status==="charm"){s.source.side=1;s.source.charm={side:0,attack:s.source.attack,until:30};}if(status==="death")s.source.hp=0;
  s.ctx.tick=12;advanceTortoises(s.ctx);expect(s.source.tortoise!.mode).toBeUndefined();expect(s.source.tortoise!.interrupted).toBe(1);expect(s.source.mana).toBe(0);
  Object.assign(s.source,{side:0,charm:undefined,hp:s.source.maxHp,stunUntil:0,silenceUntil:0,mana:100});s.ctx.tick=31;expect(castSkill(s.ctx,s.source,s.enemy)).toBe(false);expect(s.source.skillReadyAt).toBe(250);
  const completed=form();completed.source.stunUntil=99;completed.source.silenceUntil=99;completed.ctx.tick++;advanceTortoises(completed.ctx);expect(completed.source.tortoise!.mode).toBe("shell");expect(completed.source.tortoise!.formed).toBe(1);
 });
 it("通用伤害控制中断只记一次，不允许同一战斗步偷出普攻",()=>{
  const s=setup();castSkill(s.ctx,s.source,s.enemy);interruptAirSkill(s.ctx,s.source);interruptAirSkill(s.ctx,s.source);
  expect(s.source.tortoise!.interrupted).toBe(1);expect(advanceTortoiseAction(s.ctx,s.source)).toBe(true);
 });
 it("未变形时被魅惑也暂停回能，不能绕过全局的魅惑能量规则",()=>{
  const s=setup();s.source.mana=0;s.source.side=1;s.source.charm={side:0,attack:s.source.attack,until:30};
  expect(usesEnergy(s.source)).toBe(false);gainMana(s.source,100,10);expect(s.source.mana).toBe(0);
  delete s.source.charm;s.source.side=0;gainMana(s.source,20,31);expect(s.source.mana).toBe(20);
 });
});

describe("龟缩防御与持续引火",()=>{
 it.each([1,2,3])("%i星双防独立加算，龟缩不出手或移动，沉默不关闭",star=>{
  const s=form(setup(star));expect(effectiveArmor(s.source,12)).toBe(10+TORTOISE.armor[star-1]);expect(effectiveMagicResist(s.source,12)).toBeCloseTo(0.2+TORTOISE.resist[star-1]);
  expect(advanceTortoiseAction(s.ctx,s.source)).toBe(true);s.source.silenceUntil=100;advanceTortoises(s.ctx);expect(tauntTarget(s.ctx,s.enemy)?.uid).toBe(101);
 });
 it("全场后加入的可攻击敌人也被引火，标记刷新不膨胀人次",()=>{
  const s=form(),far=fighter("infantry",202,1,1,7,0);s.ctx.fighters.push(far);refreshTortoiseTaunts(s.ctx);
  expect(tauntTarget(s.ctx,far)?.uid).toBe(101);const count=s.source.tortoise!.taunts;refreshTortoiseTaunts(s.ctx);expect(s.source.tortoise!.taunts).toBe(count);
  expect(castSkill(s.ctx,s.enemy,s.source)).toBe(true); // Guard keeps its own spell despite being taunted.
 });
 it("武僧/盾阵短嘲讽暂时优先，结束后守御重新接管；狂舞免疫引火",()=>{
  const s=form(),guard=fighter("guard",102,0);guard.bulwark={formations:1,taunts:1,start:10,until:20,armor:8};s.ctx.fighters.push(guard);
  s.enemy.taunt={kind:"bulwark",source:102,until:14};refreshTortoiseTaunts(s.ctx);expect(tauntTarget(s.ctx,s.enemy)?.uid).toBe(102);
  s.ctx.tick=14;refreshTortoiseTaunts(s.ctx);expect(tauntTarget(s.ctx,s.enemy)?.uid).toBe(101);
  s.enemy.bladeStorm={until:20,remaining:3,next:16,damage:50};refreshTortoiseTaunts(s.ctx);expect(s.enemy.taunt).toBeUndefined();
 });
 it("阵亡或残魂立即失去嘲讽；魅惑后按当前阵营引火",()=>{
  const s=form(),ally=fighter("infantry",102,0);s.ctx.fighters.push(ally);s.source.side=1;refreshTortoiseTaunts(s.ctx);expireTaunts(s.ctx);
  expect(s.enemy.taunt).toBeUndefined();expect(tauntTarget(s.ctx,ally)?.uid).toBe(101);
  s.source.immortal={duration:8,until:99,spent:true};refreshTortoiseTaunts(s.ctx);expect(ally.taunt).toBeUndefined();
  delete s.source.immortal;s.source.hp=0;expireTaunts(s.ctx);expect(tauntTarget(s.ctx,ally)).toBeUndefined();
 });
 it("多个守御按星级、距离、编号稳定选择，主源死亡后接替",()=>{
  const s=form(),other=fighter("turtle",102,0,2,7,7);other.tortoise!.mode="shell";s.ctx.fighters.push(other);refreshTortoiseTaunts(s.ctx);
  expect(tauntTarget(s.ctx,s.enemy)?.uid).toBe(102);other.hp=0;refreshTortoiseTaunts(s.ctx);expect(tauntTarget(s.ctx,s.enemy)?.uid).toBe(101);
 });
 it("与鹿庇护叠加达到魔抗上限时，不把龟缩的防御错误归功于鹿",()=>{
  const s=form(),deer=fighter("deer",102,0,1,3,5);s.ctx.fighters.push(deer);s.source.magicResist=0.6;
  expect(castSkill(s.ctx,deer,s.enemy)).toBe(true);s.ctx.tick+=2;advanceSpiritWards(s.ctx);
  expect(effectiveMagicResist(s.source,s.ctx.tick,s.ctx.fighters)).toBe(0.75);
  expect(damage(s.ctx,s.enemy,s.source,1000,"magic",true)).toBe(250);expect(deer.spiritWard!.mitigated).toBe(0);
 });
});

describe("破壳群体普通攻击",()=>{
 function breach(){const s=setup(2),ally=fighter("infantry",102,0),splash=fighter("guard",202,1,1,4,3);s.ctx.fighters.push(ally);form(s);s.ctx.fighters.push(splash);return {...s,splash};}
 it("主目标和相邻敌人均走物理普攻，远处及友军不受波及，不受法强加成",()=>{
  const s=breach(),far=fighter("guard",203,1,1,5,3);s.ctx.fighters.push(far);s.source.skillPower=20;
  expect(effectiveArmor(s.source,12)).toBe(0);expect(tortoiseStrike(s.ctx,s.source,s.enemy)).toBe(true);
  const events=s.ctx.events.filter(e=>e.attacker===101);expect(events.map(e=>e.target)).toEqual([201,202]);expect(events.every(e=>!e.skill&&e.damageType==="physical")).toBe(true);
  expect(s.source.tortoise!.splashHits).toBe(1);expect(far.hp).toBe(far.maxHp);expect(s.source.mana).toBe(0);
  expect(events[0].amount).toBe(Math.round(80*2.5/(1+5*0.06)));
 });
 it("护盾、吸血和实际伤害分别记账；次级敌人独立闪避不虚增命中",()=>{
  const s=breach();s.source.lifesteal=0.5;s.source.hp-=500;s.enemy.shield=100;s.splash.air!.flying=true;s.splash.air!.evasion=1;
  tortoiseStrike(s.ctx,s.source,s.enemy);const hit=s.ctx.events.find(e=>e.attacker===101&&e.target===201)!,evade=s.ctx.events.find(e=>e.target===202)!;
  expect(hit.absorbed).toBe(100);expect(hit.amount).toBeGreaterThan(0);expect(evade.evaded).toBe(true);expect(s.source.tortoise!.splashHits).toBe(0);expect(s.source.healing).toBeGreaterThan(0);
 });
 it("反伤致死后不继续伤害后续敌人，也不把范围普攻记成技能",()=>{
  const s=breach();s.source.hp=1;s.enemy.reflection=1;tortoiseStrike(s.ctx,s.source,s.enemy);
  expect(s.source.hp).toBe(0);expect(s.splash.hp).toBe(s.splash.maxHp);expect(s.ctx.events.some(e=>e.reflected)).toBe(true);expect(s.source.tortoise!.splashHits).toBe(0);
 });
 it("法强装备无伪收益、回能只帮助前置变形；旧玄龟仍不吃回能",()=>{
  const p=piece("turtle",101,2),gear=equipmentStats([]),old={...p,definitionVersion:"spirit-ward" as const};
  expect(abilityCredit(p,{...gear,skillPower:20})).toBe(abilityCredit(p,gear));expect(abilityCredit(p,{...gear,mana:100})).toBeGreaterThan(abilityCredit(p,gear));
  expect(abilityCredit(old,{...gear,mana:100})).toBe(0.12);expect(itemScore(p,"crystal")).toBeGreaterThan(itemScore(old,"crystal"));expect(itemScore(p,"staff")).toBe(72);
  expect(pieceStrength(p)).not.toBe(pieceStrength(old));
 });
});

describe("目录、随机禁用及存档兼容",()=>{
 it("新旧玄龟使用各自的系列禁用、价格和羁绊，旧灵能禁用不误删野兽玄龟",()=>{
  const old=match("spirit-ward",["灵能","海神","傀儡"]);old.combatVersion=CURRENT_COMBAT_VERSION;const p=held(old);pinCatalogDefinitions(old,[p]);
  expect(isRecruitable(old,"turtle")).toBe(true);expect(catalogUnit(old,"turtle").traits).toEqual(["野兽","护卫"]);expect(catalogCost(old,"turtle")).toBe(4);
  expect(army([p],0)[0].tortoise).toBeUndefined();expect(pieceDetails(p).skillDescription).toContain("逐渐减至零");expect(synergies([p]).some(s=>s.trait==="野兽")).toBe(true);
  const current={combatVersion:CURRENT_COMBAT_VERSION,catalogVersion:CURRENT_COMBAT_VERSION,bannedSeries:old.bannedSeries};expect(isRecruitable(current,"turtle")).toBe(false);
  expect(isRecruitable({...current,bannedSeries:["野兽","海神","傀儡"]},"turtle")).toBe(true);expect(catalogCost(current,"turtle")).toBe(5);
  expect(catalogDefinitionVersion(old,"turtle")).toBe("spirit-ward");expect(availableUnits(old).find(u=>u.id==="turtle")!.cost).toBe(4);
 });
 it("所有286组三系列禁用仍有可玩候选，约束只筛选不运行对战",()=>{
  let combinations=0,viable=0;
  for(let a=0;a<SERIES.length;a++)for(let b=a+1;b<SERIES.length;b++)for(let c=b+1;c<SERIES.length;c++){
   combinations++;if(playableRotation([SERIES[a],SERIES[b],SERIES[c]]))viable++;
  }
  expect(combinations).toBe(286);expect(viable).toBeGreaterThan(200);
 });
 it.each(["prepare","battle","result","finished"] as const)("0.71 %s迁移保留旧卡池、系列和历史，在准备时才固定替换版本",phase=>{
  const game=match("spirit-ward",["灵能","海神","傀儡"]);held(game);game.phase=phase;
  if(phase==="result"||phase==="finished")game.history=[{combatVersion:"spirit-ward",round:1,kind:"pvp",opponentId:1,opponentName:"对手",winner:0,damage:1,income:5,hp:100,gold:50,left:structuredClone(game.players[0].pieces),right:[piece("guard",201)]}];
  if(phase==="finished"){game.players[0].hp=0;game.players[0].eliminatedRound=1;game.pool.turtle++;game.players[0].pieces=[];game.players[0].shop=[];game.history[0].hp=0;}
  expect(validGame(game)).toBe(true);const before=structuredClone(game),decoded=decodeSave(save(game));expect(decoded.status).toBe("migrated");const after=decoded.data!.game;
  expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(after.pool).toEqual(before.pool);expect(after.bannedSeries).toEqual(before.bannedSeries);expect(after.history).toEqual(before.history);
  expect(after.combatVersion).toBe(phase==="prepare"?CURRENT_COMBAT_VERSION:"spirit-ward");
  if(phase==="prepare")expect(after.players[0].pieces[0].definitionVersion).toBe("spirit-ward");
  if(phase==="result"){nextRound(after);expect(after.players[0].pieces[0].definitionVersion).toBe("spirit-ward");expect(validGame(after)).toBe(true);}
 });
 it("旧目录后续购买、合星和出售仍用原兵种，资源及池守恒",()=>{
  const game=match();game.combatVersion=CURRENT_COMBAT_VERSION;const p=game.players[0];p.shop[0]="turtle";game.pool.turtle--;
  expect(buy(game,p,0)).toBe(true);expect(p.gold).toBe(46);expect(p.pieces[0].definitionVersion).toBe("spirit-ward");expect(validGame(game)).toBe(true);
  for(let i=0;i<2;i++){p.shop[0]="turtle";game.pool.turtle--;expect(buy(game,p,0)).toBe(true);}
  expect(p.pieces).toHaveLength(1);expect(p.pieces[0].star).toBe(2);expect(p.pieces[0].definitionVersion).toBe("spirit-ward");expect(validGame(game)).toBe(true);
  expect(sell(game,p,p.pieces[0].uid)).toBe(true);expect(game.pool.turtle).toBe(COPIES[4]);expect(validGame(game)).toBe(true);
 });
 it("缺目录旧档补为spirit-ward；新档不能伪装成旧玄龟或给其他单位注入版本",()=>{
  const old=match();held(old);delete old.catalogVersion;expect(decodeSave(save(old)).data!.game.catalogVersion).toBe("spirit-ward");
  const game=match(CURRENT_COMBAT_VERSION),p=held(game);p.definitionVersion="spirit-ward";expect(validGame(game)).toBe(false);
  const original=match();held(original).definitionVersion="legacy";expect(decodeSave(save(original)).status).toBe("damaged");
 });
 for(const row of frozen.replays)it(`${row.version}旧小回放SHA逐字保持`,async()=>{
  const data=JSON.stringify(simulate(row.left,row.right,row.version as CombatVersion));const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(data));
  expect(Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")).toBe(row.sha256);
 });
});

describe("小演示与逐帧呈现",()=>{
 it.each([["shell",TORTOISE_SHELL_DEMO],["breach",TORTOISE_BREACH_DEMO]] as const)("%s演示产生对应形态，详情与分析不泄漏未来统计",(mode,input)=>{
  const original=structuredClone(input),battle=simulate(input.left,input.right),formation=battle.frames.find(f=>f.fighters.find(s=>s.uid===101)?.tortoise?.mode),last=battle.frames.at(-1)!;
  expect(input).toEqual(original);expect(formation).toBeDefined();const source=formation!.fighters.find(f=>f.uid===101)!;expect(source.tortoise!.mode).toBe(mode);expect(fighterSprite(source)).toBe(mode==="shell"?"turtle-shell-v072":"turtle-breach-v072");
  expect(analyzeBattle(battle,0).sides[0].fighters.find(f=>f.uid===101)!.tortoise!.formed).toBe(0);
  const final=last.fighters.find(f=>f.uid===101)!;expect(final.tortoise!.formed).toBe(1);expect(battleAnalysisMarkup(analyzeBattle(battle),"damage","玄龟",last.tick,last.tick)).toContain("玄武变形 1 次");
  const labels=tortoiseLabels(source,formation!.tick);expect(labels.join()).toContain(mode==="shell"?"龟缩":"破壳");expect(fighterBattleMarkup(source,formation!.tick,labels)).toContain(mode==="shell"?"42.0":"0.0");expect(compactBattleLabels(source,formation!.tick)).toContain(mode==="shell"?"龟缩守御":"破壳群攻");
  if(mode==="shell"){expect(final.tortoise!.swings).toBe(0);expect(final.tortoise!.taunts).toBeGreaterThan(0);}else expect(final.tortoise!.splashHits).toBeGreaterThan(0);
 });
 it("独立蓄势、低伏守御与破壳重击姿态可辨，文案交代本次判形和行为",()=>{
  const s=setup();castSkill(s.ctx,s.source,s.enemy);expect(tortoisePose(s.source,11).scaleY).toBeLessThan(1);s.ctx.tick=12;advanceTortoises(s.ctx);
  expect(tortoisePose(s.source,12).scaleX).toBeGreaterThan(1);s.source.tortoise!.mode="breach";expect(tortoisePose(s.source,12,0.5).forward).toBeGreaterThan(10);
  expect(skillDescription("turtle")).toContain("不阻止施法");expect(pieceDetails(piece("turtle",1)).traits[0].name).toBe("灵能");
 });
});
