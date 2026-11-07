import {describe,it,expect} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,damage,combatAttack,gainMana,type CombatContext} from "../src/engine/abilities";
import {dreamTarget,advanceDreams,releaseDream} from "../src/engine/dream";
import {tauntTarget} from "../src/engine/taunt";
import {skillReady,usesEnergy} from "../src/engine/triggers";
import {enterPhoenixEgg} from "../src/engine/phoenix";
import {enterUndying} from "../src/engine/immortality";
import {unitDefinition,unitSprite} from "../src/data/unit-stats";
import {DREAM,skillName,skillDescription,skillRole} from "../src/data/skills";
import {DREAM_DEMO} from "../src/data/dream-demo";
import {itemScore} from "../src/engine/equipment";
import {abilityCredit} from "../src/engine/ai";
import {equipmentStats} from "../src/data/items";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {dreamLabels} from "../src/render/dream";
import {compactBattleLabels} from "../src/render/battle-inspection";
import {createGame,buy} from "../src/engine/game";
import {decodeSave,validGame,SAVE_SCHEMA} from "../src/engine/persistence";
import {compute} from "../src/compute/job";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type Piece,type CombatVersion} from "../src/engine/types";
import frozen from "./fixtures/pre-v079-dream.json";

const piece=(defId:string,uid:number,star=1):Piece=>({defId,uid,star,position:35});
function fighter(id:string,uid:number,side:0|1,star=2,x=3,y=4,version:CombatVersion=CURRENT_COMBAT_VERSION){
 const f=army([piece(id,uid,star)],side,version)[0];Object.assign(f,{x,y,mana:100,cooldown:0});return f;
}
function setup(star=2){
 const source=fighter("spider",101,0,star),target=fighter("infantry",201,1,2,3,3);
 const ctx:CombatContext={fighters:[source,target],tick:10,events:[],effects:[]};return {source,target,ctx};
}
function active(star=2){const s=setup(star);expect(castSkill(s.ctx,s.source,s.target)).toBe(true);return s;}
const hash=async(x:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(x))))).map(n=>n.toString(16).padStart(2,"0")).join("");
// One fixed formation, reused for behavior, worker and analysis checks; no campaign sampling.
const demoInput=structuredClone(DREAM_DEMO);
const demo=simulate(DREAM_DEMO.left,DREAM_DEMO.right);
const old=simulate(frozen.replay.left,frozen.replay.right,"support-actions");

describe("蜘蛛迷梦的选人、时长与攻击",()=>{
 it("恢复三费本体和历史冷却，旧定义不被当前属性覆盖",()=>{
  expect(unitDefinition("spider")).toMatchObject({cost:3,hp:550,attack:71.5,armor:5,range:3,interval:8.8,initialMana:50,skill:"迷梦"});
  expect(unitDefinition("spider","support-actions")).toMatchObject({hp:650,attack:45,armor:3,interval:4,skill:"迷梦蛛丝"});
  expect(DREAM.cooldown).toBe(160);expect(skillName("spider")).toBe("迷梦");expect(skillRole("spider")).toContain("随机");expect(skillDescription("spider")).toContain("5/6.5/8秒");expect(unitSprite("spider")).toBe("spider");
 });
 it.each([1,2,3])("%s星只改变当前战斗阵营，攻击增益和时限不受法强影响",star=>{
  const s=setup(star),attack=s.target.attack; s.source.skillPower=9;
  expect(castSkill(s.ctx,s.source,s.target)).toBe(true);expect(s.target.side).toBe(0);expect(s.target.homeSide).toBe(1);
  expect(s.target.charm).toMatchObject({source:101,until:10+DREAM.duration[star-1],side:1,bonus:DREAM.attack[star-1]});
  expect(s.target.attack).toBe(attack);expect(combatAttack(s.target,10)).toBeCloseTo(attack*(1+DREAM.attack[star-1]));expect(s.ctx.events).toHaveLength(0);
  expect(s.source.dream).toMatchObject({controls:1,selections:1});expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(170);
  s.source.mana=100;expect(castSkill(s.ctx,s.source,s.target)).toBe(false);expect(s.source.mana).toBe(100);
 });
 it("随机选择与数组顺序、攻击高低无关，固定输入可复现且不会总选同一个人",()=>{
  const s=setup(),other=fighter("guard",202,1,2,4,4);other.attack=99999;s.ctx.fighters.push(other);const seen=new Set<number>();
  for(s.ctx.tick=10;s.ctx.tick<40;s.ctx.tick++){
   const a=dreamTarget(s.ctx,s.source);s.ctx.fighters.reverse();expect(dreamTarget(s.ctx,s.source)?.uid).toBe(a?.uid);seen.add(a!.uid);
  }
  expect([...seen].sort()).toEqual([201,202]);expect(s.source.dream!.selections).toBe(0);
 });
 it.each(["隐形","残魂","火种","召唤","刑傀","旋转免控","已被魅惑","范围外"])("%s不是合法目标，不消耗能量或选择次数",kind=>{
  const s=setup();
  if(kind==="隐形")s.target.air!.phaseUntil=30;
  if(kind==="残魂")s.target.immortal={spent:true,until:30,duration:8};
  if(kind==="火种")s.target.phoenix={spent:true,eggUntil:30,bodyMaxHp:s.target.maxHp,hatched:false};
  if(kind==="召唤")s.target.summon={owner:202,born:0};
  if(kind==="刑傀")s.target.executionPuppet={owner:202,victim:203,born:0,until:30};
  if(kind==="旋转免控")s.target.bladeStorm={until:30,next:11,remaining:5,damage:100};
  if(kind==="已被魅惑")s.target.charm={until:30,side:1,attack:s.target.attack};
  if(kind==="范围外")s.target.x=7;
  expect(castSkill(s.ctx,s.source,s.target)).toBe(false);expect(s.source.mana).toBe(100);expect(s.source.dream!.selections).toBe(0);expect(s.ctx.events).toHaveLength(0);
 });
 it.each(["眩晕","沉默","魅惑","冷却","残魂"])("来源%s时不能施放",kind=>{
  const s=setup();if(kind==="眩晕")s.source.stunUntil=30;if(kind==="沉默")s.source.silenceUntil=30;
  if(kind==="魅惑")s.source.charm={until:30,side:0,attack:s.source.attack};if(kind==="冷却")s.source.skillReadyAt=30;if(kind==="残魂")s.source.immortal={duration:8,spent:true,until:30};
  expect(castSkill(s.ctx,s.source,s.target)).toBe(false);expect(s.source.mana).toBe(100);
 });
 it("控制期间禁止能量技能和回能，普攻按真实生命与护盾分别记账",()=>{
  const s=active(),enemy=fighter("guard",202,1,2,4,3);s.ctx.fighters.push(enemy);s.target.mana=0;
  expect(usesEnergy(s.target)).toBe(false);expect(skillReady(s.target)).toBe(false);gainMana(s.target,100,10);expect(s.target.mana).toBe(0);
  enemy.shield=100;const amount=damage(s.ctx,s.target,enemy,150,"true",false);
  expect(amount).toBe(50);expect(s.target.damage).toBe(50);expect(s.source.damage).toBe(0);
  expect(s.source.dream).toMatchObject({hits:1,damage:50,shieldDamage:100});
  damage(s.ctx,s.target,enemy,20,"true",true);expect(s.source.dream!.hits).toBe(1);
  expect(dreamLabels(s.target,10).join()).toContain("攻击 +20%");expect(compactBattleLabels(s.target,10)).toContain("迷梦策反");
 });
});

describe("策反的解除与引火反制",()=>{
 it("蜘蛛在致死伤害当帧立即断开，后续原队友攻击不会沿用错误阵营",()=>{
  const s=active(),killer=fighter("guard",202,1);s.ctx.fighters.push(killer);s.ctx.tick=11;
  damage(s.ctx,killer,s.source,99999,"true");expect(s.source.hp).toBe(0);expect(s.target.side).toBe(1);expect(s.target.charm).toBeUndefined();expect(s.source.dream!.released).toBe(1);
 });
 it("到期只撤回策反增益，不覆盖期间其他合法攻击成长",()=>{
  const s=active();s.target.attack+=25;const grown=s.target.attack;s.ctx.tick=36;advanceDreams(s.ctx);
  expect(s.target.side).toBe(1);expect(s.target.charm).toBeUndefined();expect(s.target.attack).toBe(grown);expect(combatAttack(s.target,36)).toBe(grown);
  advanceDreams(s.ctx);expect(s.source.dream!.released).toBe(1);
 });
 it("来源被眩晕或沉默不撤回已施放的蛛丝，来源离场会撤回",()=>{
  const s=active();s.source.stunUntil=40;s.source.silenceUntil=40;s.ctx.tick=11;advanceDreams(s.ctx);expect(s.target.charm).toBeDefined();
  s.ctx.fighters=s.ctx.fighters.filter(f=>f.uid!==101);advanceDreams(s.ctx);expect(s.target.charm).toBeUndefined();expect(s.target.side).toBe(1);
 });
 it("原阵营灵鱼可以驱散已经变为敌军的友军，断开其附带嘲讽",()=>{
  const s=setup(),near=fighter("guard",202,1,2,4,3);s.ctx.fighters.push(near);
  const selected=dreamTarget(s.ctx,s.source)!;castSkill(s.ctx,s.source,s.target);const victim=s.ctx.fighters.find(f=>f.charm)!;
  expect(victim.uid).toBe(selected.uid);const fish=fighter("fish",203,1,1,3,4);s.ctx.fighters.push(fish);
  delete fish.taunt;expect(castSkill(s.ctx,fish,s.source)).toBe(true);expect(victim.charm).toBeUndefined();expect(victim.side).toBe(1);expect(s.source.dream!.cleansed).toBe(1);
  expect(s.ctx.fighters.some(f=>f.taunt?.kind==="dream")).toBe(false);
 });
 it("被控单位短暂吸引附近原队友，目标恢复后立即停止强制行动",()=>{
  const s=setup(),near=fighter("guard",202,1,2,4,3),far=fighter("guard",203,1,2,7,7);s.ctx.fighters.push(near,far);
  castSkill(s.ctx,s.source,s.target);const victim=s.ctx.fighters.find(f=>f.charm)!,forced=s.ctx.fighters.find(f=>f.taunt?.kind==="dream")!;
  expect(forced).toBeDefined();expect(tauntTarget(s.ctx,forced)?.uid).toBe(victim.uid);expect(far.taunt).toBeUndefined();
  expect(castSkill(s.ctx,forced,victim)).toBe(false);releaseDream(s.ctx,victim,"source-lost");expect(tauntTarget(s.ctx,forced)).toBeUndefined();
 });
 it("蜘蛛同队的灵鱼不会误解除己方刚获得的策反",()=>{
  const s=active(),fish=fighter("fish",102,0);s.ctx.fighters.push(fish);
  expect(castSkill(s.ctx,fish,s.target)).toBe(true);expect(s.target.side).toBe(0);expect(s.target.charm?.source).toBe(101);expect(s.source.dream!.cleansed).toBe(0);
 });
 it("被策反的蜘蛛会解除自己此前的控制，来回策反也不会永久改队",()=>{
  const s=active(),other=fighter("spider",301,1,2,3,5);s.ctx.fighters.push(other);s.ctx.tick=11;
  expect(castSkill(s.ctx,other,s.source)).toBe(true);expect(s.source.charm?.source).toBe(301);expect(s.target.side).toBe(1);expect(s.target.charm).toBeUndefined();
  other.hp=0;advanceDreams(s.ctx);expect(s.source.side).toBe(0);expect(s.source.charm).toBeUndefined();expect(s.target.side).toBe(1);expect(s.source.charmCast).toBe("spent");
 });
 it("混合定义中旧蜘蛛策反新蜘蛛，也在同次施法立即断开新蛛丝",()=>{
  const s=active(),oldSpider=fighter("spider",301,1,2,3,5,"support-actions");s.ctx.fighters.push(oldSpider);s.ctx.tick=11;
  expect(castSkill(s.ctx,oldSpider,s.source)).toBe(true);expect(s.source.charm?.source).toBeUndefined();expect(s.source.side).toBe(1);expect(s.target.charm).toBeUndefined();expect(s.target.side).toBe(1);expect(s.source.dream!.released).toBe(1);
 });
 it.each(["目标死亡","目标残魂","目标化蛋","来源残魂"])("%s清理控制，不把控制带入另一条生命",kind=>{
  const s=active();
  if(kind==="目标死亡")damage(s.ctx,s.source,s.target,99999,"true");
  if(kind==="目标残魂"){s.target.hp=0;s.target.immortal={duration:8,until:0,spent:false};enterUndying(s.ctx,s.target);}
  if(kind==="目标化蛋"){s.target.hp=0;s.target.phoenix={spent:false,eggUntil:0,bodyMaxHp:s.target.maxHp,hatched:false};enterPhoenixEgg(s.ctx,s.target);}
  if(kind==="来源残魂"){s.source.hp=0;s.source.immortal={duration:8,until:0,spent:false};enterUndying(s.ctx,s.source);}
  expect(s.target.charm).toBeUndefined();expect(s.target.side).toBe(1);expect(s.source.dream!.released).toBe(1);
 });
});

describe("兼容、真实资源与同一个小局面",()=>{
 it("51代旧定义／说明和上一版小回放完整SHA保持",async()=>{
  expect(COMBAT_VERSIONS.slice(0,frozen.versions.length)).toEqual(frozen.versions);
  for(const v of frozen.versions as (keyof typeof frozen.definitions)[]){
   expect(await hash(frozen.unitIds.map(id=>unitDefinition(id,v))),v).toBe(frozen.definitions[v]);
   expect(await hash(frozen.unitIds.map(id=>[unitSprite(id,v),skillName(id,v),skillRole(id,v),skillDescription(id,v)])),v).toBe(frozen.presentation[v]);
  }
  expect(await hash(old)).toBe(frozen.replay.sha256);
 });
 it("旧蜘蛛仍按攻击最高选人、固定20%与旧时限，来源死亡不改写历史规则",()=>{
  const s=setup(),legacy=fighter("spider",102,0,2,3,4,"support-actions"),strong=fighter("guard",202,1,2,4,3);strong.attack=999;s.ctx.fighters=[legacy,s.target,strong];
  expect(castSkill(s.ctx,legacy,s.target)).toBe(true);expect(strong.charm).toMatchObject({until:22,attack:999});expect(strong.attack).toBeCloseTo(999*1.2);
  damage(s.ctx,s.target,legacy,99999,"true");advanceDreams(s.ctx);expect(strong.charm).toBeDefined();expect(strong.side).toBe(0);
 });
 it.each(["prepare","battle","result"] as const)("0.78的%s保存迁移保留资源、目录、战报与播放状态",phase=>{
  const game=createGame(79,"classic");game.combatVersion="support-actions";game.catalogVersion="support-actions";expect(buy(game,game.players[0],game.players[0].shop.findIndex(Boolean))).toBe(true);game.players[0].pieces[0].position=35;game.phase=phase;
  if(phase==="result")game.history=[{combatVersion:"support-actions",round:1,opponentId:1,opponentName:game.players[1].name,kind:"pvp",winner:0,damage:1,income:5,hp:100,gold:game.players[0].gold,left:structuredClone(game.players[0].pieces),right:[]}];
  const before=structuredClone(game),playback={time:phase==="battle"?1.25:0,speed:2,paused:true};
  const restored=decodeSave(JSON.stringify({schema:77,rules:"singleplayer-0.78",savedAt:1,revision:1,game,playback}));
  expect(restored.status).toBe("migrated");expect(restored.data!.schema).toBe(SAVE_SCHEMA);expect(validGame(restored.data!.game)).toBe(true);
  expect(restored.data!.game.players).toEqual(before.players);expect(restored.data!.game.pool).toEqual(before.pool);expect(restored.data!.game.history).toEqual(before.history);
  expect(restored.data!.game.catalogVersion).toBe("support-actions");expect(restored.data!.game.combatVersion).toBe(phase==="prepare"?CURRENT_COMBAT_VERSION:"support-actions");expect(restored.data!.playback).toEqual(playback);expect(game).toEqual(before);
 });
 it("实际演示、快速结算与Worker一致，输入资源不变且战报不虚增蜘蛛伤害",async()=>{
  expect(DREAM_DEMO).toEqual(demoInput);const fast=simulateOutcome(DREAM_DEMO.left,DREAM_DEMO.right);
  expect(fast).toMatchObject({winner:demo.winner,damage:demo.damage});expect(fast.final.fighters).toEqual(demo.frames.at(-1)!.fighters);
  const computed=compute({kind:"replay",...DREAM_DEMO,version:CURRENT_COMBAT_VERSION});expect(computed.kind).toBe("replay");if(computed.kind==="replay")expect(await hash(computed.battle)).toBe(await hash(demo));
  const frame=demo.frames.find(f=>f.fighters.some(x=>x.charm?.source!==undefined))!;expect(frame).toBeDefined();
  const controlled=frame.fighters.find(f=>f.charm?.source!==undefined)!;expect(analyzeBattle(demo,frame.tick).sides[1].fighters.some(f=>f.uid===controlled.uid)).toBe(true);
  const analysis=analyzeBattle(demo),spider=analysis.sides[0].fighters.find(f=>f.defId==="spider")!;expect(spider.dream!.controls).toBe(1);expect(battleAnalysisMarkup(analysis,"damage","迷梦",demo.frames.length-1,demo.frames.at(-1)!.tick)).toContain("诱导普攻");
  expect(analysis.sides[0].damage).toBe(analysis.sides[0].fighters.reduce((n,f)=>n+f.damage,0));
 });
 it("AI控制估值有界且不受法强虚增，装备优先保护控制来源",()=>{
  const p=piece("spider",1,2),gear=equipmentStats([]);expect(abilityCredit(p,gear)).toBeGreaterThan(0);expect(abilityCredit(p,gear)).toBeLessThan(0.5);expect(abilityCredit(p,{...gear,skillPower:9})).toBe(abilityCredit(p,gear));
  expect(itemScore(p,"staff")).toBe(itemScore({...p,star:3},"staff"));expect(itemScore(p,"plate")).toBeGreaterThan(itemScore({...p,definitionVersion:"support-actions"},"plate"));
 });
 it("最后一名敌人被策反时仍等待战斗，到期恢复后继续交战",()=>{
  const battle=simulate([{...piece("spider",101,2),items:["staff"]}],[{...piece("guard",201,2),position:27}]);
  const controlled=battle.frames.find(f=>f.fighters.some(x=>x.charm?.source!==undefined))!;expect(controlled).toBeDefined();
  const victim=controlled.fighters.find(f=>f.charm?.source!==undefined)!;expect(victim.homeSide).toBe(1);expect(victim.side).toBe(0);
  const until=victim.charm!.until;expect(battle.frames.at(-1)!.tick).toBeGreaterThan(until);
  const restored=battle.frames.find(f=>f.tick===until)!.fighters.find(f=>f.uid===201)!;expect(restored.side).toBe(1);expect(restored.charm).toBeUndefined();
 });
});
