import {describe,it,expect} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,damage,type CombatContext} from "../src/engine/abilities";
import {advanceEquipmentSkills,equipmentTarget} from "../src/engine/equipment-skills";
import {callRetinue,callWolfPack,fighterName,fighterSprite,summonOwnerName} from "../src/engine/summons";
import {ITEMS,ITEM,EQUIPMENT_SKILLS,equipmentStats} from "../src/data/items";
import {unitDefinition,unitSprite} from "../src/data/unit-stats";
import {skillName,skillDescription,skillRole} from "../src/data/skills";
import {EQUIPMENT_SKILLS_DEMO} from "../src/data/equipment-skills-demo";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {equipmentSkillLabels} from "../src/render/equipment-skills";
import {createGame,buy} from "../src/engine/game";
import {craft,equip,unequip,equipBot,itemScore} from "../src/engine/equipment";
import {equipmentOverview,equipmentOverviewMarkup} from "../src/ui/equipment";
import {decodeSave,validGame,SAVE_SCHEMA} from "../src/engine/persistence";
import {compute} from "../src/compute/job";
import {CURRENT_COMBAT_VERSION,COMBAT_VERSIONS,type Piece,type CombatVersion} from "../src/engine/types";
import frozen from "./fixtures/pre-v080-equipment-skills.json";

const piece=(defId:string,uid:number,star=1,items:string[]=[]):Piece=>({defId,uid,star,position:35,items});
function setup(items=["soul-crystal"],id="infantry",star=2){
 const source=army([piece(id,101,star,items)],0)[0],target=army([piece("guard",201,3)],1)[0];
 Object.assign(source,{x:3,y:4,mana:0,cooldown:7});Object.assign(target,{x:3,y:3});
 const ctx:CombatContext={fighters:[source,target],tick:4,events:[],effects:[]};return {source,target,ctx};
}
const hash=async(x:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(x))))).map(n=>n.toString(16).padStart(2,"0")).join("");
const demoInput=structuredClone(EQUIPMENT_SKILLS_DEMO),demo=simulate(EQUIPMENT_SKILLS_DEMO.left,EQUIPMENT_SKILLS_DEMO.right);
const old=simulate(frozen.replay.left,frozen.replay.right,"dream");

describe("独立装备触发、唯一冷却与实际伤害",()=>{
 it("旧16件属性与配方保持，新增两件有原卡技能的成装",async()=>{
  expect(ITEMS).toHaveLength(18);expect(await hash(ITEMS.filter(i=>frozen.items.ids.includes(i.id)))).toBe(frozen.items.sha256);
  expect(ITEM["wolf-fang"].stats).toEqual({lifesteal:0.1});expect(ITEM["soul-crystal"].stats).toEqual({skillPower:0.3});
  expect(EQUIPMENT_SKILLS.call.cooldown).toBe(120);expect(EQUIPMENT_SKILLS.resonance.cooldown).toBe(40);
 });
 it("同名装备叠基础属性，只创建一套触发器，不重复同帧施放",()=>{
  const s=setup(["soul-crystal","soul-crystal","wolf-fang"]);expect(equipmentStats(["soul-crystal","soul-crystal"]).skillPower).toBeCloseTo(0.6);
  advanceEquipmentSkills(s.ctx);advanceEquipmentSkills(s.ctx);
  expect(s.source.equipmentSkills!.resonance!.activations).toBe(1);expect(s.source.equipmentSkills!.call!.summoned).toBe(1);expect(s.ctx.events.filter(e=>e.item)).toHaveLength(1);
 });
 it("鞭笞固定500基础法伤，护盾和实际扣血分开记，不触发普攻吸血",()=>{
  const s=setup();s.source.skillPower=9;s.source.lifesteal=0.5;s.source.hp-=200;s.target.shield=100;
  const hp=s.source.hp;advanceEquipmentSkills(s.ctx);
  const packet=s.ctx.events.find(e=>e.item)!;expect(packet).toMatchObject({amount:300,absorbed:100,damageType:"magic",skill:true,primary:true,item:"soul-crystal"});
  expect(s.source.equipmentSkills!.resonance).toMatchObject({activations:1,damage:300,shieldDamage:100,readyAt:44});expect(s.source.damage).toBe(300);expect(s.source.hp).toBe(hp);
 });
 it("不消耗本体能量、攻击时钟或施法次数；本体引导可继续",()=>{
  const s=setup(["soul-crystal"],"medic");s.source.hp-=100;s.source.mana=100;s.ctx.tick=1;
  expect(castSkill(s.ctx,s.source,s.target)).toBe(true);const pending=s.source.air!.cast,casts=s.source.signature!.casts,mana=s.source.mana;
  s.ctx.tick=4;advanceEquipmentSkills(s.ctx);expect(s.source.air!.cast).toBe(pending);expect(s.source.cooldown).toBe(7);expect(s.source.mana).toBe(mana);expect(s.source.signature!.casts).toBe(casts);
 });
 it("开战1秒后首次触发，10秒冷却从实际施放时计算，晚恢复不补发多次",()=>{
  const s=setup();s.target.hp=s.target.maxHp=100000;s.ctx.tick=3;advanceEquipmentSkills(s.ctx);expect(s.source.equipmentSkills!.resonance!.activations).toBe(0);
  for(const tick of [4,44,84,124]){s.ctx.tick=tick;advanceEquipmentSkills(s.ctx);}
  expect(s.source.equipmentSkills!.resonance!.activations).toBe(4);expect(s.source.equipmentSkills!.resonance!.readyAt).toBe(164);
  s.ctx.tick=150;advanceEquipmentSkills(s.ctx);expect(s.source.equipmentSkills!.resonance!.activations).toBe(4);
 });
 it("无可见目标时保留就绪，独立随机选人不受数组顺序或攻击高低影响",()=>{
  const s=setup();s.target.air!.phaseUntil=100;advanceEquipmentSkills(s.ctx);expect(s.source.equipmentSkills!.resonance!.activations).toBe(0);expect(s.source.equipmentSkills!.resonance!.readyAt).toBe(4);
  s.target.air!.phaseUntil=0;const another=army([piece("guard",202,3)],1)[0];another.attack=99999;s.ctx.fighters.push(another);const seen=new Set<number>();
  for(s.ctx.tick=4;s.ctx.tick<30;s.ctx.tick++){const a=equipmentTarget(s.ctx,s.source);s.ctx.fighters.reverse();expect(equipmentTarget(s.ctx,s.source)?.uid).toBe(a?.uid);seen.add(a!.uid);}
  expect([...seen].sort()).toEqual([201,202]);
 });
 it.each(["眩晕","沉默","魅惑","死亡","残魂","火种","召唤物","刑傀"])("持有人%s时暂停装备技能，冷却不被重置",kind=>{
  const s=setup(["soul-crystal","wolf-fang"]);
  if(kind==="眩晕")s.source.stunUntil=20;if(kind==="沉默")s.source.silenceUntil=20;if(kind==="魅惑")s.source.charm={side:0,attack:s.source.attack,until:20};if(kind==="死亡")s.source.hp=0;
  if(kind==="残魂")s.source.immortal={spent:true,until:20,duration:8};if(kind==="火种")s.source.phoenix={spent:true,eggUntil:20,bodyMaxHp:s.source.maxHp,hatched:false};
  if(kind==="召唤物")s.source.summon={owner:102,born:0};if(kind==="刑傀")s.source.executionPuppet={owner:102,victim:101,born:0,until:20};
  const before=structuredClone(s.source.equipmentSkills);advanceEquipmentSkills(s.ctx);expect(s.source.equipmentSkills).toEqual(before);expect(s.ctx.events).toHaveLength(0);expect(s.ctx.fighters).toHaveLength(2);
 });
 it("控制解除后可以触发已就绪技能，装备伤害不会给残魂制造虚假伤害",()=>{
  const s=setup();s.source.silenceUntil=8;s.ctx.tick=7;advanceEquipmentSkills(s.ctx);s.ctx.tick=8;s.target.immortal={spent:true,until:30,duration:8};
  advanceEquipmentSkills(s.ctx);expect(s.source.equipmentSkills!.resonance).toMatchObject({activations:1,damage:0,shieldDamage:0,readyAt:48});expect(s.ctx.events.find(e=>e.item)?.immune).toBe(true);
 });
});

describe("装备傀儡与本体召唤分离",()=>{
 it("召唤固定一星傀儡，无装备继承或递归，保留来源与已有形象",()=>{
  const s=setup(["wolf-fang","soul-crystal"],"adept",3);s.source.skillPower=9;advanceEquipmentSkills(s.ctx);const pet=s.ctx.fighters.find(f=>f.summon?.item)!;
  expect(pet).toMatchObject({star:1,maxHp:380,attack:48,armor:3,interval:3,summon:{owner:101,born:4,kind:"puppet",item:"wolf-fang"},mana:0});
  expect(pet.equipmentSkills).toBeUndefined();expect(pet.uid).toBeLessThan(0);expect(fighterName(pet)).toBe("呼号傀儡");expect(fighterSprite(pet)).toBe("puppet-spirit");expect(summonOwnerName(pet)).toBe("狼牙坠");
 });
 it("满相邻格时不浪费冷却，空位出现后只召一只且不覆盖友军",()=>{
  const s=setup(["wolf-fang"]);for(const [i,[x,y]] of [[3,5],[2,4],[4,4]].entries())s.ctx.fighters.push({...structuredClone(s.target),uid:300+i,x,y,side:0});
  advanceEquipmentSkills(s.ctx);expect(s.source.equipmentSkills!.call).toMatchObject({activations:0,readyAt:4});
  s.ctx.fighters.find(f=>f.uid===300)!.hp=0;s.ctx.tick=5;advanceEquipmentSkills(s.ctx);expect(s.source.equipmentSkills!.call).toMatchObject({activations:1,summoned:1,readyAt:125});
  const live=s.ctx.fighters.filter(f=>f.hp>0);expect(new Set(live.map(f=>`${f.x},${f.y}`)).size).toBe(live.length);
 });
 it("多件狼牙坠共享一次召唤；30秒后可以再召，现存傀儡不被删除",()=>{
  const s=setup(["wolf-fang","wolf-fang"]);advanceEquipmentSkills(s.ctx);const first=s.ctx.fighters.find(f=>f.summon?.item)!;
  s.ctx.tick=123;advanceEquipmentSkills(s.ctx);expect(s.source.equipmentSkills!.call!.summoned).toBe(1);
  s.ctx.tick=124;advanceEquipmentSkills(s.ctx);expect(s.source.equipmentSkills!.call!.summoned).toBe(2);expect(s.ctx.fighters.find(f=>f.uid===first.uid)).toBe(first);expect(new Set(s.ctx.fighters.map(f=>f.uid)).size).toBe(s.ctx.fighters.length);
 });
 it("装备傀儡不占真人的两只本体召唤额度，也不消费本体能量",()=>{
  const s=setup(["wolf-fang"],"adept");s.source.mana=100;advanceEquipmentSkills(s.ctx);expect(s.source.mana).toBe(100);expect(s.source.signature!.casts).toBe(0);
  expect(callRetinue(s.ctx,s.source)).toBe(true);s.ctx.tick+=32;s.source.mana=100;expect(callRetinue(s.ctx,s.source)).toBe(true);
  expect(s.ctx.fighters.filter(f=>f.summon?.item)).toHaveLength(1);expect(s.ctx.fighters.filter(f=>f.summon?.owner===101&&!f.summon.item)).toHaveLength(2);expect(s.source.signature!.casts).toBe(2);
 });
 it("鬼狼仍可召两只本体幼狼，装备傀儡另计",()=>{
  const s=setup(["wolf-fang"],"wolf");advanceEquipmentSkills(s.ctx);s.source.mana=100;expect(callWolfPack(s.ctx,s.source)).toBe(true);
  expect(s.ctx.fighters.filter(f=>f.summon?.owner===101)).toHaveLength(3);
 });
 it("傀儡继承全军与召唤增益，持有人阵亡不提前消失",()=>{
  const s=setup(["wolf-fang"]);Object.assign(s.source,{teamAttack:0.25,teamLifesteal:0.1,teamHaste:0.2,summonWard:0.3});advanceEquipmentSkills(s.ctx);const pet=s.ctx.fighters.find(f=>f.summon?.item)!;
  expect(pet).toMatchObject({attack:60,lifesteal:0.1,formationHaste:0.2,magicResist:0.5});damage(s.ctx,s.target,s.source,100000,"true");expect(pet.hp).toBe(380);s.ctx.tick=124;advanceEquipmentSkills(s.ctx);expect(s.source.equipmentSkills!.call!.summoned).toBe(1);
 });
});

describe("获取、持有人、迁移与兼容",()=>{
 it("两份材料合成、穿戴、卸下均使用原交易路径，金币、卡池和随机数不变",()=>{
  const game=createGame(80,"classic"),p=game.players[0];expect(buy(game,p,p.shop.findIndex(Boolean))).toBe(true);p.pieces[0].position=35;p.inventory=["crystal","coil","crystal","fang"];
  const state={pool:structuredClone(game.pool),gold:p.gold,seed:game.seed};expect(craft(game,p,"soul-crystal")).toBe(true);expect(craft(game,p,"wolf-fang")).toBe(true);expect(p.inventory).toEqual(["soul-crystal","wolf-fang"]);
  expect(equip(game,p,0,p.pieces[0].uid)).toBe(true);expect(equip(game,p,0,p.pieces[0].uid)).toBe(true);expect(validGame(game)).toBe(true);
  const rows=equipmentOverview(p),wolf=rows.find(r=>r.item.id==="wolf-fang")!;expect(wolf.equippedCount).toBe(1);expect(wolf.owners[0].piece.uid).toBe(p.pieces[0].uid);
  const markup=equipmentOverviewMarkup(game);expect(markup).toContain('data-equipment-item="soul-crystal"');expect(markup).toContain("鞭笞");expect(markup).toContain("呼号");
  expect(unequip(game,p,p.pieces[0].uid,1)).toBe(true);expect(equipmentOverview(p).find(r=>r.item.id==="wolf-fang")!.inventoryCount).toBe(1);
  expect({pool:game.pool,gold:p.gold,seed:game.seed}).toEqual(state);
 });
 it("AI可合成并分配新成装，唯一技能重复持有不获得重复估值",()=>{
  const game=createGame(80,"classic"),p=game.players[1];p.pieces=[piece("infantry",201,2)];p.inventory=["crystal","coil","fang","crystal"];
  const resources={pool:structuredClone(game.pool),gold:p.gold,seed:game.seed};
  equipBot(game,p);expect(p.pieces[0].items).toEqual(expect.arrayContaining(["soul-crystal","wolf-fang"]));expect(p.pieces[0].items!.length).toBeLessThanOrEqual(3);
  const loadout=()=>({pieces:p.pieces.map(piece=>({...piece,items:[...(piece.items??[])].sort()})),inventory:[...p.inventory].sort()});
  const held=loadout();equipBot(game,p);expect(loadout()).toEqual(held);
  expect(p.pieces.flatMap(piece=>piece.items??[]).concat(p.inventory).sort()).toEqual(["soul-crystal","wolf-fang"]);
  expect({pool:game.pool,gold:p.gold,seed:game.seed}).toEqual(resources);
  const plain=piece("infantry",1,2),duplicate={...plain,items:["soul-crystal"]};expect(itemScore(plain,"soul-crystal")-itemScore(duplicate,"soul-crystal")).toBe(150);
 });
 it("装备机制使用整场规则，旧目录棋子仍可使用新装备；旧战斗不生成新触发器",()=>{
  const p={...piece("turtle",101,1,["soul-crystal"]),definitionVersion:"spirit-ward" as const};
  expect(army([p],0)[0].equipmentSkills?.resonance).toBeDefined();expect(army([p],0,"dream")[0].equipmentSkills).toBeUndefined();
 });
 it.each(["prepare","battle","result"] as const)("0.79的%s迁移不改资源、目录或播放记录",phase=>{
  const game=createGame(80,"classic");game.combatVersion="dream";game.catalogVersion="dream";expect(buy(game,game.players[0],game.players[0].shop.findIndex(Boolean))).toBe(true);game.players[0].pieces[0].position=35;game.phase=phase;
  if(phase==="result")game.history=[{combatVersion:"dream",round:1,opponentId:1,opponentName:game.players[1].name,kind:"pvp",winner:0,damage:1,income:5,hp:100,gold:game.players[0].gold,left:structuredClone(game.players[0].pieces),right:[]}];
  const before=structuredClone(game),playback={time:phase==="battle"?2:0,speed:2,paused:true};const restored=decodeSave(JSON.stringify({schema:78,rules:"singleplayer-0.79",savedAt:1,revision:1,game,playback}));
  expect(restored.status).toBe("migrated");expect(restored.data!.schema).toBe(SAVE_SCHEMA);expect(restored.data!.game.combatVersion).toBe(phase==="prepare"?CURRENT_COMBAT_VERSION:"dream");expect(restored.data!.game.catalogVersion).toBe("dream");expect(restored.data!.game.players).toEqual(before.players);expect(restored.data!.game.pool).toEqual(before.pool);expect(restored.data!.game.history).toEqual(before.history);expect(restored.data!.playback).toEqual(playback);expect(game).toEqual(before);
 });
 it("52代旧定义、说明与含本体召唤的0.79小回放SHA保持",async()=>{
  expect(COMBAT_VERSIONS.slice(0,frozen.versions.length)).toEqual(frozen.versions);
  for(const v of frozen.versions as (keyof typeof frozen.definitions)[]){expect(await hash(frozen.unitIds.map(id=>unitDefinition(id,v))),v).toBe(frozen.definitions[v]);expect(await hash(frozen.unitIds.map(id=>[unitSprite(id,v),skillName(id,v),skillRole(id,v),skillDescription(id,v)])),v).toBe(frozen.presentation[v]);}
  expect(await hash(old)).toBe(frozen.replay.sha256);
 });
 it("一个固定小局面的录制、快算和Worker一致，物品和原始出战阵容不被修改",async()=>{
  const fast=simulateOutcome(EQUIPMENT_SKILLS_DEMO.left,EQUIPMENT_SKILLS_DEMO.right);expect(fast).toMatchObject({winner:demo.winner,damage:demo.damage});expect(fast.final.fighters).toEqual(demo.frames.at(-1)!.fighters);
  const computed=compute({kind:"replay",...EQUIPMENT_SKILLS_DEMO,version:CURRENT_COMBAT_VERSION});if(computed.kind!=="replay")throw Error("equipment worker result");expect(await hash(computed.battle)).toBe(await hash(demo));expect(EQUIPMENT_SKILLS_DEMO).toEqual(demoInput);
  const born=demo.frames.find(f=>f.fighters.some(x=>x.summon?.item))!,pet=born.fighters.find(f=>f.summon?.item)!;expect(born.events.some(e=>e.attacker===pet.uid)).toBe(false);
  const analysis=analyzeBattle(demo),holder=analysis.sides[0].fighters.find(f=>f.uid===101)!;expect(holder.equipmentSkills!.call!.summoned).toBeGreaterThan(0);expect(holder.equipmentSkills!.resonance!.activations).toBeGreaterThan(0);
  const markup=battleAnalysisMarkup(analysis,"damage","装备",demo.frames.length-1,demo.frames.at(-1)!.tick);expect(markup).toContain("装备鞭笞");expect(markup).toContain("装备呼号");expect(equipmentSkillLabels(born.fighters.find(f=>f.uid===101)!,born.tick).join()).toContain("冷却");
  expect(analyzeBattle(demo,0).sides[0].fighters.find(f=>f.uid===101)!.equipmentSkills!.resonance!.activations).toBe(0);
 });
});
