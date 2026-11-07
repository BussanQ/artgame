import {describe,expect,it} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {damage,gainMana,type CombatContext} from "../src/engine/abilities";
import {detonate} from "../src/engine/detonation";
import {usesEnergy,skillReady} from "../src/engine/triggers";
import {beginDream} from "../src/engine/dream";
import {claimExecutionPuppet} from "../src/engine/execution";
import {fighterSprite} from "../src/engine/summons";
import {DETONATION,skillName,skillRole,skillDescription} from "../src/data/skills";
import {unitDefinition,unitSprite} from "../src/data/unit-stats";
import {ITEMS,equipmentStats} from "../src/data/items";
import {RULES} from "../src/data/units";
import {DETONATION_DEMO} from "../src/data/detonation-demo";
import {abilityCredit} from "../src/engine/ai";
import {createGame,buy,sell} from "../src/engine/game";
import {SAVE_SCHEMA,decodeSave,validGame} from "../src/engine/persistence";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type Piece,type Fighter,type CombatVersion} from "../src/engine/types";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {compute} from "../src/compute/job";
import {isMelee,MELEE_ACTIONS,REST_POSE} from "../src/render/melee";
import {isRanged,rangedActionName,rangedPose,drawRangedAttack} from "../src/render/ranged";
import {detonationLabels,drawDetonationEffect,blastbugAnimationVersion} from "../src/render/detonation";
import {fighterBattleMarkup} from "../src/render/battle-inspection";
import frozen from "./fixtures/pre-v082-detonation.json";

const piece=(defId:string,uid:number,star=1,items:string[]=[],position:number|null=35):Piece=>({defId,uid,star,items,position});
const fighter=(id:string,uid:number,side:0|1=0,star=1,items:string[]=[])=>army([piece(id,uid,star,items)],side)[0];
const hash=async(v:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(v))))).map(n=>n.toString(16).padStart(2,"0")).join("");
function setup(star=1,items:string[]=[]){
 const source=fighter("blastbug",101,0,star,items),enemy=fighter("guard",201,1,3);
 Object.assign(source,{x:3,y:4});Object.assign(enemy,{x:3,y:3,magicResist:0});
 const ctx:CombatContext={fighters:[source,enemy],tick:4,events:[],effects:[]};
 return {source,enemy,ctx};
}
const kill=(s:ReturnType<typeof setup>)=>damage(s.ctx,s.enemy,s.source,100000,"true");

describe("爆裂虫的分星死亡爆破",()=>{
 it("按历史表使用2费、500生命、40攻击、零甲、2格和1.2秒，旧体型不改",()=>{
  expect(unitDefinition("blastbug")).toMatchObject({cost:2,hp:500,attack:40,armor:0,range:2,interval:4.8,skill:"自爆"});
  expect(unitDefinition("blastbug","sea-fog")).toMatchObject({hp:700,armor:4,range:1,interval:4,skill:"裂变殉爆"});
  expect(DETONATION.damage).toEqual([200,350,500]);
  expect(skillName("blastbug")).toBe("自爆");expect(skillRole("blastbug")).toBe("前排阵亡爆破");
  expect(skillDescription("blastbug")).toContain("生命不增加");
 });
 it.each([1,2,3])("%s星死亡当帧按分星基础伤害爆炸，每场只一次",star=>{
  const s=setup(star);kill(s);
  expect(s.enemy.maxHp-s.enemy.hp).toBe(DETONATION.damage[star-1]);
  expect(s.source.detonation).toEqual({explosions:1,hits:1,damage:DETONATION.damage[star-1],shieldDamage:0});
  expect(s.source.deathBurst).toBe("spent");expect(s.source.signature!.casts).toBe(1);
  const before=structuredClone(s.ctx);expect(detonate(s.ctx,s.source)).toBe(false);
  damage(s.ctx,s.enemy,s.source,1000,"true");expect(s.ctx).toEqual(before);
 });
 it("存活时不提前爆炸，能量装备与供能不会制造主动技能",()=>{
  const s=setup(1,["staff","whale-eye"]);s.source.mana=0;
  expect(detonate(s.ctx,s.source)).toBe(false);gainMana(s.source,100,4);
  expect(s.source.mana).toBe(0);expect(usesEnergy(s.source)).toBe(false);expect(skillReady(s.source)).toBe(false);
  damage(s.ctx,s.enemy,s.source,20);expect(s.source.detonation!.explosions).toBe(0);expect(s.source.mana).toBe(0);
 });
 it("额外最大生命不提高爆炸伤害，法强提高固定基础值",()=>{
  const plain=setup(2),tank=setup(2,["heart"]),mage=setup(2,["crystal"]);
  expect(tank.source.maxHp).toBeGreaterThan(plain.source.maxHp);
  tank.source.maxHp+=9000;tank.source.hp=tank.source.maxHp;
  kill(plain);kill(tank);kill(mage);
  expect(tank.source.detonation!.damage).toBe(plain.source.detonation!.damage);
  expect(mage.source.detonation!.damage).toBe(Math.round(350*mage.source.skillPower));
 });
 it("只结算实际生命伤害与破盾，不把溢出伤害计入贡献",()=>{
  const s=setup(3);s.enemy.magicResist=0.4;s.enemy.shield=70;s.enemy.hp=50;kill(s);
  expect(s.source.detonation).toEqual({explosions:1,hits:1,damage:50,shieldDamage:70});
  expect(s.source.damage).toBe(50);expect(s.ctx.events.find(e=>e.attacker===101)).toMatchObject({skill:true,primary:false,damageType:"magic",amount:50,absorbed:70});
 });
 it("护盾完全吸收仍计有效波及，免疫目标不增加命中",()=>{
  const s=setup();s.enemy.shield=1000;kill(s);
  expect(s.source.detonation).toMatchObject({hits:1,damage:0,shieldDamage:200});
  const immune=setup();immune.enemy.immortal={duration:12,until:100,spent:true};kill(immune);
  expect(immune.source.detonation).toMatchObject({hits:0,damage:0,shieldDamage:0});expect(immune.ctx.events.find(e=>e.attacker===101)?.immune).toBe(true);
 });
 it("严格按死亡位置横纵两格结算，不伤友军、不追到远处敌人",()=>{
  const s=setup(),edge=fighter("guard",202,1,3),out=fighter("guard",203,1,3),ally=fighter("guard",301,0,3);
  Object.assign(edge,{x:4,y:3,magicResist:0});Object.assign(out,{x:5,y:3,magicResist:0});Object.assign(ally,{x:3,y:4});
  s.ctx.fighters.push(edge,out,ally);kill(s);
  expect(edge.maxHp-edge.hp).toBe(200);expect(out.hp).toBe(out.maxHp);expect(ally.hp).toBe(ally.maxHp);
  expect(s.source.detonation!.hits).toBe(2);
 });
 it("远处阵亡允许空爆；被眩晕、沉默或能量封锁不延迟自爆",()=>{
  const s=setup();Object.assign(s.source,{x:0,y:7,stunUntil:100,silenceUntil:100,manaLockUntil:100});kill(s);
  expect(s.source.detonation).toMatchObject({explosions:1,hits:0});expect(s.ctx.effects.filter(e=>e.name==="爆裂虫·自爆")).toHaveLength(1);
  const t=setup();Object.assign(t.source,{stunUntil:100,silenceUntil:100,manaLockUntil:100});kill(t);
  expect(t.source.detonation!.damage).toBe(200);
 });
 it("范围伤害覆盖隐形、飞行与现有召唤物",()=>{
  const s=setup(),hidden=fighter("ghostjet",202,1,3),pet=fighter("guard",203,1,3);
  Object.assign(hidden,{x:3,y:2,magicResist:0});hidden.air!.phaseUntil=100;
  Object.assign(pet,{x:4,y:3,magicResist:0,summon:{kind:"puppet",owner:201}});s.ctx.fighters.push(hidden,pet);kill(s);
  expect(hidden.maxHp-hidden.hp).toBe(200);expect(pet.maxHp-pet.hp).toBe(200);expect(s.source.detonation!.hits).toBe(3);
 });
 it("敌方爆裂虫连锁时先消耗各自次数，死亡包不会递归重爆",()=>{
  const s=setup(3),other=fighter("blastbug",202,1,2),ally=fighter("guard",301,0,3);
  Object.assign(other,{x:4,y:4,hp:100,magicResist:0});Object.assign(ally,{x:4,y:5,magicResist:0});s.ctx.fighters.push(other,ally);kill(s);
  expect(other.deathBurst).toBe("spent");expect(other.detonation).toMatchObject({explosions:1,hits:1,damage:350});
  expect(ally.maxHp-ally.hp).toBe(350);expect(s.ctx.effects.filter(e=>e.name==="爆裂虫·自爆")).toHaveLength(2);
  expect(s.source.detonation!.explosions).toBe(1);
 });
 it("策反中的爆裂虫按死亡时阵营攻击原队友，爆炸不重复归因给蜘蛛",()=>{
  const s=setup(),spider=fighter("spider",202,1),oldAlly=fighter("guard",301,0,3);
  Object.assign(spider,{x:4,y:3});Object.assign(oldAlly,{x:4,y:4,magicResist:0});s.ctx.fighters.push(spider,oldAlly);
  beginDream(s.ctx,spider,s.source);const enemyHP=s.enemy.hp;
  damage(s.ctx,oldAlly,s.source,100000,"true");
  expect(oldAlly.maxHp-oldAlly.hp).toBe(200);expect(s.enemy.hp).toBe(enemyHP);expect(spider.dream!.damage).toBe(0);
  expect(s.source.side).toBe(0);expect(s.source.detonation!.damage).toBe(200);
 });
 it("连锁炸死控制者、释放者回归原阵营后，余下爆炸仍按死亡阵营结算",()=>{
  const source=fighter("blastbug",101,0,2),other=fighter("blastbug",201,0),remaining=fighter("guard",202,0,3),spider=fighter("spider",302,1),killer=fighter("guard",401,0);
  Object.assign(source,{x:3,y:4});Object.assign(other,{x:4,y:4,hp:50,magicResist:0});Object.assign(remaining,{x:3,y:3,magicResist:0});Object.assign(spider,{x:4,y:3,hp:50,magicResist:0});Object.assign(killer,{x:7,y:0});
  const ctx:CombatContext={fighters:[source,other,remaining,spider,killer],tick:4,events:[],effects:[]};beginDream(ctx,spider,source);
  damage(ctx,killer,source,100000,"true");
  expect(spider.hp).toBe(0);expect(source.side).toBe(0);expect(remaining.maxHp-remaining.hp).toBe(350);
  expect(source.detonation).toMatchObject({explosions:1,hits:2,damage:400});
 });
 it("已死亡爆裂虫不再承担反伤，不会中止后续范围伤害或复制成刑傀",()=>{
  const s=setup(),extra=fighter("guard",202,1,3),reaper=fighter("reaper",301,0,2);
  s.enemy.reflection=1000;Object.assign(extra,{x:4,y:4,magicResist:0});s.ctx.fighters.push(extra,reaper);kill(s);
  expect(s.source.detonation!.hits).toBe(2);expect(s.ctx.events.some(e=>e.reflected)).toBe(false);
  expect(claimExecutionPuppet(s.ctx,reaper,s.source,false,false)).toBe(false);
 });
 it("AI按分星伤害估值，生命和能量装备不额外提高自爆收益",()=>{
  const p=piece("blastbug",1,2),plain=abilityCredit(p),hp=abilityCredit(p,equipmentStats(["heart"]));
  const mana=equipmentStats();mana.mana=100;
  expect(hp).toBe(plain);expect(abilityCredit(p,mana)).toBe(plain);
  expect(abilityCredit(p,equipmentStats(["crystal"]))).toBeGreaterThan(plain);
  expect(plain).toBeCloseTo(350*1.8*0.75/(40*2)*0.04);
 });
 it("异虫二合一、购买与出售返还实际卡池份数保持",()=>{
  const g=createGame(82,"classic"),p=g.players[0];p.gold=100;
  function give(id:string){if(p.shop[0])g.pool[p.shop[0]!]++;p.shop[0]=id;g.pool[id]--;expect(buy(g,p,0)).toBe(true);}
  give("eyebug");give("blastbug");give("blastbug");
  const bug=p.pieces.find(x=>x.defId==="blastbug")!;expect(bug).toMatchObject({star:2,copies:2});expect(validGame(g)).toBe(true);
  const count=g.pool.blastbug;sell(g,p,bug.uid);expect(g.pool.blastbug).toBe(count+2);expect(validGame(g)).toBe(true);
 });
});

describe("独立动作、呈现、迁移与旧回放",()=>{
 it("新版本使用蓝囊形象和独立喷吐，旧版本保留近战动作",()=>{
  expect(unitSprite("blastbug")).toBe("blastbug-detonation-v082");expect(unitSprite("blastbug","sea-fog")).toBe("blastbug");
  expect(fighterSprite(setup().source)).toBe("blastbug-detonation-v082");expect(fighterSprite(army([piece("blastbug",101)],0,"sea-fog")[0])).toBe("blastbug");
  expect(isMelee("blastbug")).toBe(false);expect(isRanged("blastbug")).toBe(true);
  expect(isMelee("blastbug","sea-fog")).toBe(true);expect(isRanged("blastbug","sea-fog")).toBe(false);
  expect(rangedActionName("blastbug")).toBe("鼓囊收颚喷吐");expect(rangedPose("blastbug",0.25)).not.toEqual(REST_POSE);
 });
 it("爆炸与范围轮廓可在普通及低动态模式绘制，画布状态平衡",()=>{
  const s=setup();kill(s);const labels:string[]=[];let depth=0;
  const c=new Proxy({save:()=>depth++,restore:()=>depth--,fillText:(t:string)=>labels.push(t)} as unknown as CanvasRenderingContext2D,{get:(t,p)=>p in t?Reflect.get(t,p):()=>{}});
  const e=s.ctx.effects.find(e=>e.name==="爆裂虫·自爆")!;
  for(const reduced of [false,true]){expect(drawDetonationEffect(c,e,1,reduced)).toBe(true);expect(drawDetonationEffect(c,e,4,reduced)).toBe(true);}
  drawRangedAttack(c,"blastbug",0.55,{x:0,y:0},{x:100,y:50},false);
  expect(depth).toBe(0);expect(labels).toContain("自爆");expect(detonationLabels(s.source).join()).toContain("生命伤害 200");
  expect(fighterBattleMarkup(s.source,4,detonationLabels(s.source))).toContain("被动自爆");
 });
 it.each(["prepare","battle","result","finished"] as const)("0.81的%s迁移只在准备阶段升级战斗规则，保留目录与资源",phase=>{
  const g=createGame(82,"classic");g.combatVersion=g.catalogVersion="sea-fog";
  expect(buy(g,g.players[0],g.players[0].shop.findIndex(Boolean))).toBe(true);g.players[0].pieces[0].position=35;g.phase=phase;
  if(phase==="finished")g.round=RULES.maxRounds;
  if(phase==="result"||phase==="finished")g.history=Array.from({length:g.round},(_,i)=>({round:i+1,combatVersion:"sea-fog",opponentId:1,opponentName:g.players[1].name,kind:"pvp",winner:0,damage:1,income:5,hp:100,gold:g.players[0].gold,left:structuredClone(g.players[0].pieces),right:[]}));
  expect(validGame(g)).toBe(true);const before=structuredClone(g),playback={time:phase==="battle"?2:0,speed:2,paused:true};
  const d=decodeSave(JSON.stringify({schema:80,rules:"singleplayer-0.81",savedAt:1,revision:1,game:g,playback}));
  expect(d.status).toBe("migrated");expect(d.data!.schema).toBe(SAVE_SCHEMA);
  expect(d.data!.game.combatVersion).toBe(phase==="prepare"?CURRENT_COMBAT_VERSION:"sea-fog");
  expect(d.data!.game.catalogVersion).toBe("sea-fog");expect(d.data!.game.players).toEqual(before.players);expect(d.data!.game.pool).toEqual(before.pool);expect(d.data!.game.history).toEqual(before.history);expect(d.data!.playback).toEqual(playback);expect(g).toEqual(before);
 });
 it("每枚棋子的旧定义保留，历史战斗不插入新状态",()=>{
  const p={...piece("blastbug",101),definitionVersion:"sea-fog" as const};
  expect(army([p],0)[0].detonation).toBeUndefined();expect(army([p],0)[0].maxHp).toBe(700);
  const old=army([p],0)[0],current=army([piece("blastbug",101)],0)[0];
  expect(isMelee("blastbug",blastbugAnimationVersion(old))).toBe(true);expect(isRanged("blastbug",blastbugAnimationVersion(current))).toBe(true);
  expect(army([piece("blastbug",101)],0,"sea-fog")[0].detonation).toBeUndefined();expect(army([piece("blastbug",101)],0)[0].detonation!.explosions).toBe(0);
 });
 it("54代定义与三种星级呈现、19件装备和一个0.81异虫小回放完整保持",async()=>{
  expect(COMBAT_VERSIONS.slice(0,frozen.versions.length)).toEqual(frozen.versions);expect(await hash(ITEMS)).toBe(frozen.items.sha256);
  for(const v of frozen.versions as (keyof typeof frozen.definitions)[]){
   expect(await hash(frozen.unitIds.map(id=>unitDefinition(id,v))),v).toBe(frozen.definitions[v]);
   expect(await hash(frozen.unitIds.map(id=>[...Array.from({length:3},(_,i)=>unitSprite(id,v,i+1)),skillName(id,v),skillRole(id,v),skillDescription(id,v),isMelee(id,v),isRanged(id,v),isMelee(id,v)?MELEE_ACTIONS[id].name:isRanged(id,v)?rangedActionName(id,v):null])),v).toBe(frozen.presentation[v]);
  }
  expect(await hash(simulate(frozen.replay.left,frozen.replay.right,"sea-fog"))).toBe(frozen.replay.sha256);
 });
 it("同一1对1连锁局面的录制、快算与Worker一致，贡献不提前泄漏，资源不变",async()=>{
  const input=structuredClone(DETONATION_DEMO),battle=simulate(input.left,input.right),fast=simulateOutcome(input.left,input.right);
  expect(fast).toMatchObject({winner:battle.winner,damage:battle.damage});expect(fast.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
  const worker=compute({kind:"replay",...input,version:CURRENT_COMBAT_VERSION});if(worker.kind!=="replay")throw Error("detonation replay");expect(await hash(worker.battle)).toBe(await hash(battle));expect(DETONATION_DEMO).toEqual(input);
  const report=analyzeBattle(battle),bug=report.sides[0].fighters.find(f=>f.uid===101)!;
  expect(bug.detonation!.explosions).toBe(1);expect(bug.detonation!.damage+bug.detonation!.shieldDamage).toBeGreaterThan(0);
  expect(bug.skillDamage).toBe(bug.detonation!.damage);expect(bug.casts).toBe(1);
  expect(battle.frames.some(f=>f.effects.filter(e=>e.name==="爆裂虫·自爆").length===2)).toBe(true);
  expect(analyzeBattle(battle,0).sides[0].fighters.find(f=>f.uid===101)!.detonation!.explosions).toBe(0);
  expect(battleAnalysisMarkup(report,"damage","囊爆",battle.frames.length-1,battle.frames.at(-1)!.tick)).toContain("死亡自爆 1次");
 });
});
