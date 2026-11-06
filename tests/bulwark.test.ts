import {describe,expect,it} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,damage,type CombatContext} from "../src/engine/abilities";
import {bulwarkActive,expireBulwarks} from "../src/engine/bulwark";
import {tauntTarget,expireTaunts} from "../src/engine/taunt";
import {effectiveArmor} from "../src/engine/triggers";
import {BULWARK,skillDescription,skillName,skillRole} from "../src/data/skills";
import {BULWARK_DEMO} from "../src/data/bulwark-demo";
import {HIVE_DEMO} from "../src/data/hive-demo";
import {unitDefinition} from "../src/data/unit-stats";
import {catalogCost,unitCost} from "../src/data/catalog";
import {equipmentStats} from "../src/data/items";
import {UNITS,RULES,COPIES} from "../src/data/units";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type CombatVersion,type Fighter,type Piece} from "../src/engine/types";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {pieceDetails} from "../src/ui/bench-tooltip";
import {bulwarkLabels,bulwarkPose} from "../src/render/bulwark";
import {compactBattleLabels} from "../src/render/battle-inspection";
import {itemScore} from "../src/engine/equipment";
import {abilityCredit} from "../src/engine/ai";
import {createGame,nextRound} from "../src/engine/game";
import {decodeSave,SAVE_SCHEMA,validGame} from "../src/engine/persistence";
import {pieceCopies} from "../src/engine/progression";
import {compute} from "../src/compute/job";
import frozen from "./fixtures/pre-v070-bulwark-replays.json";
import paid from "./fixtures/opening-ai-reserve.json";

const piece=(defId:string,uid:number,star=1,position:number|null=35):Piece=>({defId,uid,star,position});
function fighter(id:string,uid:number,side:0|1,star=1,x=3,y=4){
  const f=army([piece(id,uid,star)],side)[0];Object.assign(f,{x,y,mana:100});return f;
}
const context=(...fighters:Fighter[]):CombatContext=>({fighters,tick:10,events:[],effects:[]});
const demo=simulate(BULWARK_DEMO.left,BULWARK_DEMO.right);
function version(name:string):CombatVersion{const v=COMBAT_VERSIONS.find(v=>v===name);if(!v)throw Error(name);return v;}

describe("盾兵护甲盾阵",()=>{
  for(const star of [1,2,3])it(`${star}星采用两费身板和个人护甲，不再凭施法生成生命或护盾`,()=>{
    const source=fighter("guard",101,0,star),target=fighter("infantry",201,1,1,4,4),ctx=context(source,target);
    const hp=source.hp-100;source.hp=hp;source.skillPower=9;source.shield=77;source.shieldUntil=99;
    const targetHp=target.hp;expect(unitCost("guard")).toBe(2);
    expect(source).toMatchObject({maxHp:750*2**(star-1),attack:57*2**(star-1),armor:5,range:1,interval:4});
    expect(pieceDetails(piece("guard",1,star))).toMatchObject({hp:source.maxHp,attack:source.attack,armor:5,interval:1});
    expect(castSkill(ctx,source,target)).toBe(true);expect(source.hp).toBe(hp);expect(source.shield).toBe(77);expect(source.shieldUntil).toBe(99);
    expect(target.hp).toBe(targetHp);expect(target.stunUntil).toBe(0);expect(ctx.events).toEqual([]);
    expect(source.bulwark).toMatchObject({formations:1,taunts:1,armor:BULWARK.armor[star-1],until:10+BULWARK.duration[star-1]});
    expect(source.mana).toBe(0);expect(source.skillReadyAt).toBe(70);expect(source.signature!.casts).toBe(1);
  });

  it("护甲独立叠加装备、连携和减甲，降低真实物理伤害但不抵挡法伤",()=>{
    const source=fighter("guard",101,0),target=fighter("infantry",201,1,1,4,4),ctx=context(source,target);
    source.armorBuff=6;source.armorBuffUntil=99;source.infantryArmorBreak=3;castSkill(ctx,source,target);
    expect(effectiveArmor(source,10)).toBe(16);
    damage(ctx,target,source,100,"physical",false);const protectedHit=ctx.events.at(-1)!.amount;
    damage(ctx,target,source,100,"magic",true);const magic=ctx.events.at(-1)!.amount;
    ctx.tick=26;expireBulwarks(ctx);expect(effectiveArmor(source,26)).toBe(8);
    damage(ctx,target,source,100,"physical",false);expect(ctx.events.at(-1)!.amount).toBeGreaterThan(protectedHit);
    damage(ctx,target,source,100,"magic",true);expect(ctx.events.at(-1)!.amount).toBe(magic);
    expect(source.bulwark!.armor).toBe(0);expect(source.shield).toBe(0);
  });

  it("满能量不能绕过15秒冷却，到期才能再次举盾",()=>{
    const source=fighter("guard",101,0),target=fighter("infantry",201,1,1,4,4),ctx=context(source,target);
    castSkill(ctx,source,target);source.mana=100;ctx.tick=69;expireBulwarks(ctx);expireTaunts(ctx);
    const before=structuredClone(ctx);expect(castSkill(ctx,source,target)).toBe(false);expect(ctx).toEqual(before);
    ctx.tick=70;expect(castSkill(ctx,source,target)).toBe(true);expect(source.bulwark!.formations).toBe(2);expect(source.skillReadyAt).toBe(130);
  });

  for(const block of ["stun","silence","charm","cooldown","friendly","hidden","dead"] as const)
    it(`${block}时不消耗能量或增加盾阵统计`,()=>{
      const source=fighter("guard",101,0),target=fighter("ghostjet",201,1,1,4,4),ctx=context(source,target);
      if(block==="stun")source.stunUntil=11;if(block==="silence")source.silenceUntil=11;
      if(block==="charm")source.charm={until:11,attack:source.attack,side:1};if(block==="cooldown")source.skillReadyAt=11;
      if(block==="friendly")target.side=0;if(block==="hidden")target.air!.phaseUntil=11;if(block==="dead")source.hp=0;
      const before=structuredClone(ctx);expect(castSkill(ctx,source,target)).toBe(false);expect(ctx).toEqual(before);
    });

  it("受远程攻击时可以提前举盾，但不会隔空嘲讽；后来入场不补发嘲讽",()=>{
    const source=fighter("guard",101,0),target=fighter("infantry",201,1,1,3,1),ctx=context(source,target);
    expect(castSkill(ctx,source,target)).toBe(true);expect(bulwarkActive(source,10)).toBe(true);expect(target.taunt).toBeUndefined();
    target.y=3;ctx.tick=11;expireBulwarks(ctx);expireTaunts(ctx);expect(target.taunt).toBeUndefined();expect(source.bulwark!.taunts).toBe(0);
  });
});

describe("盾阵与共用嘲讽",()=>{
  it("只嘲讽横纵相邻可见敌人，飞行可受影响，友军、斜角、远处及免控目标不受影响",()=>{
    const source=fighter("guard",101,0),near=fighter("infantry",201,1,1,4,4),fly=fighter("ghostjet",202,1,1,3,3),
      diagonal=fighter("infantry",203,1,1,4,5),far=fighter("infantry",204,1,1,5,4),ally=fighter("guard",205,0,1,2,4),
      immune=fighter("swordthrall",206,1,1,3,5),soul=fighter("guard",207,1,1,2,4),egg=fighter("phoenix",208,1,2,3,5);
    immune.bladeStorm={until:99,next:11,remaining:6,damage:50};soul.immortal={spent:true,until:99,duration:20};egg.phoenix!.eggUntil=99;
    const ctx=context(source,near,fly,diagonal,far,ally,immune,soul,egg);castSkill(ctx,source,near);
    expect([near,fly].map(f=>f.taunt)).toEqual([{source:101,until:16,kind:"bulwark"},{source:101,until:16,kind:"bulwark"}]);
    expect([diagonal,far,ally,immune,soul,egg].every(f=>!f.taunt)).toBe(true);expect(source.bulwark!.taunts).toBe(2);
  });

  it("有效嘲讽阻止新技能且保留能量，结束时恢复施放",()=>{
    const source=fighter("guard",101,0),victim=fighter("guard",201,1,1,4,4),ctx=context(source,victim);
    castSkill(ctx,source,victim);expect(tauntTarget(ctx,victim)).toBe(source);
    expect(castSkill(ctx,victim,source)).toBe(false);expect(victim.mana).toBe(100);expect(victim.bulwark!.formations).toBe(0);
    ctx.tick=16;expireTaunts(ctx);expect(victim.taunt).toBeUndefined();expect(castSkill(ctx,victim,source)).toBe(true);
  });

  for(const invalid of ["death","stance-expiry","source-side","victim-side","conceal","immunity"] as const)
    it(`${invalid}释放嘲讽，保存帧不遗留失效目标`,()=>{
      const source=fighter("guard",101,0),victim=fighter("infantry",201,1,1,4,4),ctx=context(source,victim);castSkill(ctx,source,victim);
      if(invalid==="death")source.hp=0;if(invalid==="stance-expiry")source.bulwark!.until=10;
      if(invalid==="source-side")source.side=1;if(invalid==="victim-side")victim.side=0;
      if(invalid==="conceal")source.air={...fighter("ghostjet",301,0).air!,phaseUntil:99};
      if(invalid==="immunity")victim.bladeStorm={until:99,next:11,remaining:6,damage:50};
      expireBulwarks(ctx);expireTaunts(ctx);expect(victim.taunt).toBeUndefined();expect(tauntTarget(ctx,victim)).toBeUndefined();
    });

  it("已获得的护甲和嘲讽不会被来源眩晕或沉默撤回，灵鱼只驱散负面标记",()=>{
    const source=fighter("guard",101,0),victim=fighter("guard",201,1,1,4,4),fish=fighter("fish",202,1,1,4,6),ctx=context(source,victim,fish);
    castSkill(ctx,source,victim);source.stunUntil=99;source.silenceUntil=99;ctx.tick=11;
    expireBulwarks(ctx);expireTaunts(ctx);expect(tauntTarget(ctx,victim)).toBe(source);expect(effectiveArmor(source,11)).toBe(13);
    victim.hp-=10;expect(castSkill(ctx,fish,source)).toBe(true);expect(victim.taunt).toBeUndefined();expect(bulwarkActive(source,11)).toBe(true);
    expect(source.bulwark!.armor).toBe(8);expect(source.skillReadyAt).toBe(70);
  });

  it("真实局面把后续普攻从射手转向盾兵，已承诺的喷火仍能结算",()=>{
    const initial=demo.frames[1].events.find(e=>e.attacker===202&&!e.skill)!;expect(initial.target).toBe(101);
    const form=demo.frames.find(f=>f.fighters.some(f=>f.uid===102&&f.bulwark?.formations===1))!;
    expect(form.tick).toBe(9);expect(form.fighters.find(f=>f.uid===102)!.bulwark!.taunts).toBe(2);
    const after=demo.frames.find(f=>f.tick===13)!;
    expect(after.events.some(e=>e.attacker===202&&!e.skill&&e.target===102)).toBe(true);
    expect(after.events.some(e=>e.attacker===202&&e.skill&&e.target===101)).toBe(true);
    expect(after.effects.some(e=>e.source===202&&e.kind==="cast")).toBe(false);
  });
});

describe("盾阵画面、经营与旧局",()=>{
  it("同一小局面快算和Worker一致，不修改输入；历史时间点没有未来举盾次数",()=>{
    const input=structuredClone(BULWARK_DEMO),last=demo.frames.at(-1)!;
    expect(simulateOutcome(input.left,input.right).final.fighters).toEqual(last.fighters);
    const result=compute({kind:"replay",...input,version:CURRENT_COMBAT_VERSION});expect(result.kind).toBe("replay");
    if(result.kind!=="replay")throw Error("Unexpected result");expect(result.battle).toEqual(demo);expect(input).toEqual(BULWARK_DEMO);
    expect(analyzeBattle(demo,0).sides[0].fighters.find(f=>f.uid===102)!.bulwark).toEqual({formations:0,taunts:0});
    expect(battleAnalysisMarkup(analyzeBattle(demo),"damage","盾阵",last.tick,last.tick)).toContain("盾阵举盾 1 次 · 嘲讽施加 2 人次");
    const active=demo.frames[10].fighters.find(f=>f.uid===102)!;
    expect(compactBattleLabels(active,10)).toContain("举盾增甲");expect(bulwarkLabels(active,10).join()).toContain("盾阵护甲 +16");
    expect(bulwarkPose(active,10).scaleY).toBeLessThan(1);expect(bulwarkLabels(active,29).join()).not.toContain("盾阵护甲");
  });

  it("原先打满40秒的蜂群局面正常结束，没有盾兵技能补盾或技能伤害",()=>{
    const battle=simulate(HIVE_DEMO.left,HIVE_DEMO.right),last=battle.frames.at(-1)!;
    expect(frozen.fixtures.find(f=>f.version==="hive")!.tick).toBe(160);
    expect(last.tick).toBeLessThan(160);expect(battle.winner).not.toBeNull();
    expect(battle.frames.flatMap(f=>f.effects).filter(e=>[102,201].includes(e.source)&&e.kind==="shield")).toEqual([]);
    expect(battle.frames.flatMap(f=>f.events).filter(e=>[102,201].includes(e.attacker)&&e.skill)).toEqual([]);
    expect(last.fighters.filter(f=>f.defId==="guard").every(f=>f.bulwark!.formations===1)).toBe(true);
  });

  it("新局两费、旧目录一费；AI重视护甲和先手，不虚构法强收益",()=>{
    const game=createGame(5,"classic"),p=piece("guard",101,2),gear=equipmentStats([]);
    expect(game.catalogVersion).toBe(CURRENT_COMBAT_VERSION);expect(catalogCost(game,"guard")).toBe(2);expect(unitCost("guard","hive")).toBe(1);
    expect(catalogCost({catalogVersion:"hive",combatVersion:"bulwark"},"guard")).toBe(1);
    expect(abilityCredit(p,{...gear,skillPower:10})).toBe(abilityCredit(p,gear));
    expect(abilityCredit(p,{...gear,mana:100})).toBeGreaterThan(abilityCredit(p,gear));
    expect(itemScore(p,"staff")).toBeLessThan(itemScore(p,"staff","hive"));
    expect(skillName("guard")).toBe("刺盾之阵");expect(skillRole("guard")).toContain("护甲");expect(skillDescription("guard")).toContain("不会生成护盾");
    expect(skillName("guard","hive")).toBe("震荡重击");
  });

  it("42版旧身板与费用冻结，其余兵种定义保持，旧盾兵仍保留原型能力",()=>{
    expect(frozen.definitions).toHaveLength(42);for(const row of frozen.definitions)expect(unitDefinition("guard",version(row.version))).toEqual(row.unit);
    for(const u of UNITS.filter(u=>u.id!=="guard"))expect(unitDefinition(u.id,"bulwark")).toEqual(unitDefinition(u.id,"hive"));
    const a=army([piece("guard",101)],0,"hive")[0],b=army([piece("infantry",201)],1,"hive")[0];Object.assign(a,{mana:100,x:3,y:4});Object.assign(b,{x:3,y:3});
    const ctx=context(a,b);expect(castSkill(ctx,a,b)).toBe(true);expect(a.bulwark).toBeUndefined();expect(a.shield).toBeGreaterThan(0);
    expect(ctx.events.some(e=>e.skill)).toBe(true);expect(b.stunUntil).toBeGreaterThan(10);
  });

  for(const row of frozen.fixtures)it(`${row.version}修改前盾兵小回放SHA保持`,async()=>{
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(row.left,row.right,version(row.version)))));
    expect(Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")).toBe(row.hash);
  });

  for(const phase of ["prepare","battle","result","finished"] as const)it(`0.69 ${phase}迁移保留目录、资源、旧战报和播放进度`,()=>{
    const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("Invalid reserve capture");const game=input;game.combatVersion="hive";game.phase=phase;
    if(phase==="result"||phase==="finished"){
      game.round--;game.players[0].hp=game.history.at(-1)!.hp;
      if(phase==="finished"){const p=game.players[0];for(const held of p.pieces)game.pool[held.defId]+=pieceCopies(held);for(const id of p.shop)if(id)game.pool[id]++;
        p.hp=0;p.eliminatedRound=game.round;p.pieces=[];p.shop=[];p.inventory=[];game.history.at(-1)!.hp=0;}
    }
    const before=structuredClone(game),playback={time:3,speed:2,paused:true};
    const decoded=decodeSave(JSON.stringify({schema:68,rules:"singleplayer-0.69",savedAt:1,revision:1,game,playback}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(decoded.data!.rules).toBe(RULES.version);
    expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});expect(decoded.data!.playback).toEqual(playback);
    if(phase==="result"){nextRound(decoded.data!.game);expect(decoded.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(decoded.data!.game.catalogVersion).toBe("secret-orb");}
  });

  it("缺目录的0.69存档补为hive，盾兵保持一费，不改变卡池",()=>{
    const game=createGame(5,"classic");game.combatVersion="hive";game.catalogVersion="hive";for(const u of UNITS)game.pool[u.id]+=COPIES[unitCost(u.id,"hive")]-COPIES[unitCost(u.id)];delete game.catalogVersion;
    const decoded=decodeSave(JSON.stringify({schema:68,rules:"singleplayer-0.69",savedAt:1,revision:1,game,playback:{time:0,speed:1,paused:false}}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.game.catalogVersion).toBe("hive");expect(catalogCost(decoded.data!.game,"guard")).toBe(1);
    expect(decoded.data!.game.pool).toEqual(game.pool);expect(validGame(decoded.data!.game)).toBe(true);
  });
});
