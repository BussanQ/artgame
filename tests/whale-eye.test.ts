import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { ATTACK_MANA, damage, gainMana, recoveredMana, type CombatContext } from "../src/engine/abilities";
import { advanceEquipmentSkills } from "../src/engine/equipment-skills";
import { callRetinue } from "../src/engine/summons";
import { claimExecutionPuppet } from "../src/engine/execution";
import { ITEM, ITEMS, COMPONENTS, equipmentStats, WHALE_EYE } from "../src/data/items";
import { WHALE_EYE_DEMO } from "../src/data/whale-eye-demo";
import { RULES } from "../src/data/units";
import { unitDefinition, unitSprite } from "../src/data/unit-stats";
import { skillName, skillDescription, skillRole } from "../src/data/skills";
import { COMBAT_VERSIONS, CURRENT_COMBAT_VERSION, type Fighter, type Piece } from "../src/engine/types";
import { createGame, buy } from "../src/engine/game";
import { craft, equip, unequip, equipBot, itemScore } from "../src/engine/equipment";
import { equipmentOverview, equipmentOverviewMarkup } from "../src/ui/equipment";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import { equipmentSkillLabels } from "../src/render/equipment-skills";
import { drawSeaFogForecast, drawSeaFogBurst } from "../src/render/whale-eye";
import { compute } from "../src/compute/job";
import frozen from "./fixtures/pre-v081-whale-eye.json";

const piece = (defId:string, uid:number, items:string[]=[], star=2, position:number|null=35):Piece => ({defId,uid,star,items,position});
const hash = async (value:unknown) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,"0")).join("");
function setup(items=["whale-eye"], id="medic") {
  const source=army([piece(id,101,items)],0)[0], target=army([piece("guard",201,[],3)],1)[0];
  Object.assign(source,{x:3,y:4,mana:0,cooldown:9}); Object.assign(target,{x:3,y:3});
  const ctx:CombatContext={fighters:[source,target],tick:4,events:[],effects:[]};
  return {source,target,ctx};
}
const fog = (f:Fighter) => f.equipmentSkills!.fog!;

describe("巨鲸之眼的原卡字段与独立海雾",()=>{
  it("原18件完整保留，新增第19件：30攻击、100%伤害回能、6秒延迟与45秒冷却",async()=>{
    expect(ITEMS).toHaveLength(19); expect(COMPONENTS).toHaveLength(6);
    expect(await hash(ITEMS.filter(i=>frozen.items.ids.includes(i.id)))).toBe(frozen.items.sha256);
    expect(ITEM["whale-eye"]).toMatchObject({stats:{attack:30,damageMana:1},recipe:["blade","core"],effect:"fog"});
    expect(WHALE_EYE).toEqual({damage:200,delay:24,cooldown:180});
  });
  it("重复装备叠基础攻击和回能，但只释放一道海雾",()=>{
    const s=setup(["whale-eye","whale-eye"]), plain=setup([],"medic");
    expect(s.source.attack-plain.source.attack).toBe(60); expect(s.source.equipmentDamageMana).toBe(2);
    expect(equipmentStats(["whale-eye","whale-eye"]).damageMana).toBe(2);
    advanceEquipmentSkills(s.ctx); advanceEquipmentSkills(s.ctx);
    expect(fog(s.source)).toMatchObject({activations:1,readyAt:184,pending:{start:4,landAt:28,side:0}});
  });
  it("开战一秒释放，整六秒后引爆，不占本体时钟与能量，不按法强或星级放大",()=>{
    const s=setup();s.source.skillPower=100;s.ctx.tick=3;advanceEquipmentSkills(s.ctx);
    expect(fog(s.source).activations).toBe(0);s.ctx.tick=4;advanceEquipmentSkills(s.ctx);
    expect(s.source.mana).toBe(0);expect(s.source.cooldown).toBe(9);expect(s.source.signature!.casts).toBe(0);
    s.ctx.tick=27;advanceEquipmentSkills(s.ctx);expect(s.ctx.events).toHaveLength(0);
    s.target.shield=50;s.ctx.tick=28;advanceEquipmentSkills(s.ctx);
    expect(s.ctx.events.find(e=>e.item)).toMatchObject({item:"whale-eye",amount:110,absorbed:50,skill:true,damageType:"magic"});
    expect(fog(s.source)).toMatchObject({detonations:1,hits:1,damage:110,shieldDamage:50});
    s.ctx.tick=29;advanceEquipmentSkills(s.ctx);expect(fog(s.source).detonations).toBe(1);expect(fog(s.source).pending).toBeUndefined();
  });
  it("范围是全场，覆盖远处隐形敌人和释放后出现的召唤物，不伤同阵营",()=>{
    const s=setup();Object.assign(s.target,{x:7,y:0});advanceEquipmentSkills(s.ctx);
    const hidden=army([piece("ghostjet",202)],1)[0];hidden.air!.phaseUntil=100;
    const adept=army([piece("adept",203)],1)[0];Object.assign(adept,{x:0,y:0,mana:100});
    const ally=army([piece("guard",301)],0)[0], hp=ally.hp;
    s.ctx.fighters.push(hidden,adept,ally);expect(callRetinue(s.ctx,adept)).toBe(true);
    const pet=s.ctx.fighters.find(f=>f.summon)!;s.ctx.tick=28;advanceEquipmentSkills(s.ctx);
    expect(s.ctx.events.filter(e=>e.item).map(e=>e.target).sort((a,b)=>a-b)).toEqual([pet.uid,201,202,203].sort((a,b)=>a-b));
    expect(fog(s.source).hits).toBe(4);expect(ally.hp).toBe(hp);
  });
  it.each(["死亡","眩晕","沉默","魅惑","残魂","火种"])("已释放海雾不因持有人%s撤回，阵营和原点不随之后状态改变",kind=>{
    const s=setup();advanceEquipmentSkills(s.ctx);const at={...fog(s.source).pending!.from};
    if(kind==="死亡")s.source.hp=0;
    if(kind==="眩晕")s.source.stunUntil=100;
    if(kind==="沉默")s.source.silenceUntil=100;
    if(kind==="魅惑"){s.source.charm={side:0,attack:s.source.attack,until:100};s.source.side=1;}
    if(kind==="残魂")s.source.immortal={duration:12,until:100,spent:true};
    if(kind==="火种")s.source.phoenix={spent:true,eggUntil:100,bodyMaxHp:s.source.maxHp,hatched:false};
    s.source.x=7;s.source.y=7;s.ctx.tick=28;advanceEquipmentSkills(s.ctx);
    const events=s.ctx.events.filter(e=>e.item);expect(events).toHaveLength(1);expect(events[0]).toMatchObject({target:201,amount:160,from:at});
    expect(fog(s.source).detonations).toBe(1);
  });
  it("释放前受控保留就绪，解除后再起完整六秒延迟",()=>{
    const s=setup();s.source.stunUntil=10;advanceEquipmentSkills(s.ctx);expect(fog(s.source).pending).toBeUndefined();
    s.ctx.tick=10;advanceEquipmentSkills(s.ctx);expect(fog(s.source).pending).toMatchObject({start:10,landAt:34});
    expect(fog(s.source).readyAt).toBe(190);
  });
  it("没有敌人时不空放，目标转为友军后不受引爆伤害",()=>{
    const s=setup();s.target.side=0;advanceEquipmentSkills(s.ctx);expect(fog(s.source).activations).toBe(0);
    s.target.side=1;s.ctx.tick=5;advanceEquipmentSkills(s.ctx);s.target.side=0;s.ctx.tick=29;advanceEquipmentSkills(s.ctx);
    expect(fog(s.source)).toMatchObject({activations:1,detonations:1,hits:0,damage:0});expect(s.ctx.events).toHaveLength(0);
  });
  it("反伤击杀持有人后，其余全场目标仍结算；反伤包不冒充装备伤害",()=>{
    const s=setup();advanceEquipmentSkills(s.ctx);s.source.hp=1;s.target.reflection=100;
    const another=army([piece("guard",202,[],3)],1)[0];s.ctx.fighters.push(another);s.ctx.tick=28;advanceEquipmentSkills(s.ctx);
    expect(s.source.hp).toBe(0);expect(s.ctx.events.filter(e=>e.item)).toHaveLength(2);
    expect(s.ctx.events.filter(e=>e.reflected).every(e=>!e.item)).toBe(true);expect(fog(s.source)).toMatchObject({hits:2,damage:320});
  });
  it("免疫目标没有虚假命中、破盾或生命伤害；不同持有人的技能可以分别引爆",()=>{
    const s=setup();s.target.immortal={duration:12,until:100,spent:true};advanceEquipmentSkills(s.ctx);s.ctx.tick=28;advanceEquipmentSkills(s.ctx);
    expect(s.ctx.events.find(e=>e.item)?.immune).toBe(true);expect(fog(s.source)).toMatchObject({hits:0,damage:0,shieldDamage:0});
    const t=setup(),other=army([piece("medic",102,["whale-eye"])],0)[0];t.ctx.fighters.push(other);advanceEquipmentSkills(t.ctx);t.ctx.tick=28;advanceEquipmentSkills(t.ctx);
    expect(t.ctx.events.filter(e=>e.item)).toHaveLength(2);expect(t.target.maxHp-t.target.hp).toBe(320);
  });
});

describe("命中回能与连携、装备继承",()=>{
  it("没有巨鲸之眼时，旧召唤回能在三代规则中保持原值与固定扣减",()=>{
    for(const version of ["coalitions","equipment-skills","sea-fog"] as const){
      const source=army([piece("medic",101)],0,version)[0],target=army([piece("guard",201,[],3)],1,version)[0];
      Object.assign(source,{mana:0,damageManaBonus:0.4,energyPenalty:3,energyMultiplier:0.75,attackManaReady:true});
      const ctx:CombatContext={fighters:[source,target],tick:4,events:[],effects:[]};
      gainMana(source,25,4);damage(ctx,source,target,100);
      expect(source.mana,version).toBe(23.25);expect(ctx.effects.find(e=>e.name==="召唤回能")?.amount,version).toBe(7.5);
      expect(source.equipmentDamageMana).toBeUndefined();
    }
  });
  it("同次普攻只增加一次，额外回复独立记账，普通技能与装备伤害不触发",()=>{
    const s=setup();s.source.attackManaReady=true;gainMana(s.source,ATTACK_MANA,4);damage(s.ctx,s.source,s.target,100);
    expect(s.source.mana).toBe(50);expect(fog(s.source).energyRecovered).toBe(25);
    damage(s.ctx,s.source,s.target,100,"physical",false,false);damage(s.ctx,s.source,s.target,100,"magic",true);
    advanceEquipmentSkills(s.ctx);s.ctx.tick=28;advanceEquipmentSkills(s.ctx);
    expect(s.source.mana).toBe(50);expect(fog(s.source).energyRecovered).toBe(25);
  });
  it("重复基础回能相加，纯护盾消耗不制造额外命中回能",()=>{
    const s=setup(["whale-eye","whale-eye"]);s.source.attackManaReady=true;gainMana(s.source,25,4);damage(s.ctx,s.source,s.target,100);
    expect(s.source.mana).toBe(75);expect(fog(s.source).energyRecovered).toBe(50);
    const t=setup();t.target.shield=10000;t.source.attackManaReady=true;gainMana(t.source,25,4);damage(t.ctx,t.source,t.target,100);
    expect(t.source.mana).toBe(25);expect(fog(t.source).energyRecovered).toBe(0);
  });
  it("与召唤连携相加，异能倍率与骑兵固定扣减只作用于同一份普攻回能",()=>{
    const s=setup();Object.assign(s.source,{damageManaBonus:0.5,energyMultiplier:0.5,energyPenalty:3,attackManaReady:true});
    gainMana(s.source,25,4);damage(s.ctx,s.source,s.target,100);
    expect(s.source.mana).toBe(recoveredMana(s.source,25*2.5));expect(s.source.mana).toBe(28.25);
    expect(fog(s.source).energyRecovered).toBe(12.5);
  });
  it("满能量截断后只记实际增加量，既有连携优先归因，不重复记账",()=>{
    const s=setup();Object.assign(s.source,{mana:60,damageManaBonus:0.5,attackManaReady:true});gainMana(s.source,25,4);damage(s.ctx,s.source,s.target,100);
    expect(s.source.mana).toBe(100);expect(fog(s.source).energyRecovered).toBe(2.5);
    s.source.attackManaReady=true;damage(s.ctx,s.source,s.target,100);expect(fog(s.source).energyRecovered).toBe(2.5);
  });
  it.each(["封能","魅惑","无能量兵种","死亡"])("%s不能通过装备获得无效能量",kind=>{
    const s=setup(["whale-eye"],kind==="无能量兵种"?"infantry":"medic");
    if(kind==="封能")s.source.manaLockUntil=100;
    if(kind==="魅惑")s.source.charm={side:0,attack:s.source.attack,until:100};
    if(kind==="死亡")s.source.hp=0;
    s.source.attackManaReady=true;gainMana(s.source,25,4);damage(s.ctx,s.source,s.target,100);
    expect(s.source.mana).toBe(0);expect(fog(s.source).energyRecovered).toBe(0);
  });
  it("受击回能和其他供能沿用原值，不被伤害回能装备放大",()=>{
    const s=setup();gainMana(s.source,20,4);expect(s.source.mana).toBe(20);
    damage(s.ctx,s.target,s.source,10);expect(s.source.mana).toBe(30);expect(fog(s.source).energyRecovered).toBe(0);
  });
  it("本体傀儡保留全军增益，召唤物与刑傀均不继承海雾或装备回能",()=>{
    const s=setup(["whale-eye"],"adept");s.source.mana=100;s.source.damageManaBonus=0.5;
    expect(callRetinue(s.ctx,s.source)).toBe(true);const pet=s.ctx.fighters.find(f=>f.summon)!;
    expect(pet.damageManaBonus).toBe(0.5);expect(pet.equipmentDamageMana).toBeUndefined();expect(pet.equipmentSkills).toBeUndefined();
    const reaper=army([piece("reaper",202)],1)[0];s.ctx.fighters.push(reaper);s.source.hp=0;
    expect(claimExecutionPuppet(s.ctx,reaper,s.source,false,false)).toBe(true);
    const puppet=s.ctx.fighters.find(f=>f.executionPuppet)!;expect(puppet.equipmentDamageMana).toBeUndefined();expect(puppet.equipmentSkills).toBeUndefined();
  });
});

describe("真实获取路径、画面、迁移与回放",()=>{
  it("合成、穿戴、持有人与卸下沿用原交易，金币、卡池和经营随机数保持",()=>{
    const game=createGame(81,"classic"),p=game.players[0];expect(buy(game,p,p.shop.findIndex(Boolean))).toBe(true);p.inventory=["blade","core"];
    const before={pool:structuredClone(game.pool),gold:p.gold,seed:game.seed};expect(craft(game,p,"whale-eye")).toBe(true);
    expect(equip(game,p,0,p.pieces[0].uid)).toBe(true);expect(validGame(game)).toBe(true);
    const entry=equipmentOverview(p).find(e=>e.item.id==="whale-eye")!;expect(entry.owners[0].piece.uid).toBe(p.pieces[0].uid);
    expect(equipmentOverviewMarkup(game)).toContain('data-equipment-item="whale-eye"');expect(equipmentOverviewMarkup(game)).toContain("海雾");
    expect(unequip(game,p,p.pieces[0].uid,0)).toBe(true);expect(p.inventory).toEqual(["whale-eye"]);
    expect({pool:game.pool,gold:p.gold,seed:game.seed}).toEqual(before);
  });
  it("AI会合成并优先给有能量的施法者，旧版本不提前合成新装备",()=>{
    const game=createGame(81,"classic"),p=game.players[1];p.pieces=[piece("medic",101),piece("infantry",102)];p.inventory=["blade","core"];
    equipBot(game,p);expect(p.pieces[0].items).toEqual(["whale-eye"]);expect(p.inventory).toEqual([]);
    expect(itemScore(p.pieces[0],"whale-eye")).toBeGreaterThan(itemScore(p.pieces[1],"whale-eye")-120);
    const copy=structuredClone(p);equipBot(game,p);expect(p).toEqual(copy);
    const oldGame=createGame(81,"classic"),q=oldGame.players[1];oldGame.combatVersion="equipment-skills";q.pieces=[piece("medic",101)];q.inventory=["blade","core"];
    equipBot(oldGame,q);expect(q.pieces[0].items!.concat(q.inventory)).not.toContain("whale-eye");
  });
  it.each(["prepare","battle","result","finished"] as const)("0.80的%s迁移保留资源、目录、历史与播放状态",phase=>{
    const game=createGame(81,"classic");game.combatVersion=game.catalogVersion="equipment-skills";
    expect(buy(game,game.players[0],game.players[0].shop.findIndex(Boolean))).toBe(true);game.players[0].pieces[0].position=35;game.phase=phase;
    if(phase==="finished")game.round=RULES.maxRounds;
    if(phase==="result"||phase==="finished")game.history=Array.from({length:game.round},(_,i)=>({round:i+1,combatVersion:"equipment-skills",opponentId:1,opponentName:game.players[1].name,kind:"pvp",winner:0,damage:1,income:5,hp:100,gold:game.players[0].gold,left:structuredClone(game.players[0].pieces),right:[]}));
    expect(validGame(game)).toBe(true);
    const before=structuredClone(game),playback={time:phase==="battle"?2:0,speed:2,paused:true};
    const decoded=decodeSave(JSON.stringify({schema:79,rules:"singleplayer-0.80",savedAt:1,revision:1,game,playback}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(decoded.data!.game.combatVersion).toBe(phase==="prepare"?CURRENT_COMBAT_VERSION:"equipment-skills");
    expect(decoded.data!.game.catalogVersion).toBe("equipment-skills");expect(decoded.data!.game.players).toEqual(before.players);expect(decoded.data!.game.pool).toEqual(before.pool);expect(decoded.data!.game.history).toEqual(before.history);expect(decoded.data!.playback).toEqual(playback);expect(game).toEqual(before);
  });
  it("战斗规则决定装备是否启用，旧目录棋子可在新战斗中使用，旧战斗不生成新状态",()=>{
    const p={...piece("turtle",101,["whale-eye"]),definitionVersion:"spirit-ward" as const};
    expect(army([p],0)[0].equipmentDamageMana).toBe(1);expect(army([p],0)[0].equipmentSkills?.fog).toBeDefined();
    expect(army([p],0,"equipment-skills")[0].equipmentSkills).toBeUndefined();expect(army([p],0,"equipment-skills")[0].equipmentDamageMana).toBeUndefined();
  });
  it("预告和引爆均能在低动态模式绘制，画布状态平衡；详情只显示已发生的贡献",()=>{
    const s=setup();advanceEquipmentSkills(s.ctx);const saved:unknown[]=[];let depth=0;
    const c=new Proxy({save:()=>depth++,restore:()=>depth--,fillText:(text:string)=>saved.push(text)} as unknown as CanvasRenderingContext2D,{get:(t,p)=>p in t?Reflect.get(t,p):()=>{}});
    for(const reduced of [false,true]){drawSeaFogForecast(c,s.ctx.fighters,8,reduced);drawSeaFogBurst(c,1,reduced);}
    expect(depth).toBe(0);expect(saved.some(t=>String(t).includes("海雾"))).toBe(true);
    expect(equipmentSkillLabels(s.source,8).join()).toContain("5.0s后引爆");
  });
  it("53代兵种定义与呈现、原18件装备和0.80装备小回放SHA保持",async()=>{
    const old=simulate(frozen.replay.left,frozen.replay.right,"equipment-skills");
    expect(COMBAT_VERSIONS.slice(0,frozen.versions.length)).toEqual(frozen.versions);
    for(const v of frozen.versions as (keyof typeof frozen.definitions)[]){expect(await hash(frozen.unitIds.map(id=>unitDefinition(id,v))),v).toBe(frozen.definitions[v]);expect(await hash(frozen.unitIds.map(id=>[unitSprite(id,v),skillName(id,v),skillRole(id,v),skillDescription(id,v)])),v).toBe(frozen.presentation[v]);}
    expect(await hash(old)).toBe(frozen.replay.sha256);
  });
  it("一个固定小演示的录制、快算和Worker一致，海雾与实际回能进入独立贡献，原阵容不变",async()=>{
    const input=structuredClone(WHALE_EYE_DEMO),demo=simulate(WHALE_EYE_DEMO.left,WHALE_EYE_DEMO.right);
    const fast=simulateOutcome(WHALE_EYE_DEMO.left,WHALE_EYE_DEMO.right);expect(fast).toMatchObject({winner:demo.winner,damage:demo.damage});expect(fast.final.fighters).toEqual(demo.frames.at(-1)!.fighters);
    const worker=compute({kind:"replay",...WHALE_EYE_DEMO,version:CURRENT_COMBAT_VERSION});if(worker.kind!=="replay")throw Error("whale eye replay");expect(await hash(worker.battle)).toBe(await hash(demo));expect(WHALE_EYE_DEMO).toEqual(input);
    const explosion=demo.frames.find(frame=>frame.effects.some(e=>e.name==="巨鲸之眼·海雾"))!;expect(explosion.tick).toBe(28);
    expect(explosion.events.filter(e=>e.item==="whale-eye")).toHaveLength(3);
    const contribution=analyzeBattle(demo).sides[0].fighters.find(f=>f.uid===101)!;expect(contribution.equipmentSkills!.fog!.damage).toBeGreaterThan(0);expect(contribution.equipmentSkills!.fog!.energyRecovered).toBeGreaterThan(0);expect(contribution.energyGiven).toBe(0);
    const html=battleAnalysisMarkup(analyzeBattle(demo),"damage","海雾",demo.frames.length-1,demo.frames.at(-1)!.tick);expect(html).toContain("装备海雾");expect(html).toContain("巨鲸额外回能");
    expect(analyzeBattle(demo,0).sides[0].fighters.find(f=>f.uid===101)!.equipmentSkills!.fog!.detonations).toBe(0);
  });
});
