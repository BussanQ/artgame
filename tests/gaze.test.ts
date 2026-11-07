import {describe,expect,it} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,damage,gainMana,type CombatContext} from "../src/engine/abilities";
import {gazeTarget,advanceGazes} from "../src/engine/gaze";
import {GAZE,skillDescription,skillRole} from "../src/data/skills";
import {GAZE_DEMO} from "../src/data/gaze-demo";
import {unitCost} from "../src/data/catalog";
import {unitDefinition} from "../src/data/unit-stats";
import {UNITS,RULES,COPIES} from "../src/data/units";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type CombatVersion,type Fighter,type Piece} from "../src/engine/types";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {pieceDetails} from "../src/ui/bench-tooltip";
import {gazeLabels,gazePose} from "../src/render/gaze";
import {compactBattleLabels} from "../src/render/battle-inspection";
import {itemScore} from "../src/engine/equipment";
import {abilityCredit} from "../src/engine/ai";
import {createGame,nextRound} from "../src/engine/game";
import {decodeSave,SAVE_SCHEMA,validGame} from "../src/engine/persistence";
import {pieceCopies,mergeCount} from "../src/engine/progression";
import {compute} from "../src/compute/job";
import frozen from "./fixtures/pre-v068-gaze-replays.json";
import paid from "./fixtures/opening-ai-reserve.json";

const piece=(defId:string,uid:number,star=1,position:number|null=35):Piece=>({defId,uid,star,position});
function fighter(id:string,uid:number,side:0|1,star=1,x=3,y=4){
  const f=army([piece(id,uid,star)],side)[0];Object.assign(f,{x,y,mana:100});return f;
}
const context=(...fighters:Fighter[]):CombatContext=>({fighters,tick:10,events:[],effects:[]});
const demo=simulate(GAZE_DEMO.left,GAZE_DEMO.right,"gaze");
function version(name:string):CombatVersion{const v=COMBAT_VERSIONS.find(v=>v===name);if(!v)throw Error(name);return v;}

describe("眼虫随机单控与削能",()=>{
  for(const star of [1,2,3])it(`${star}星用实际长控替代原型伤害，身板与备战详情一致`,()=>{
    const source=fighter("eyebug",101,0,star),target=fighter("guard",201,1,1,3,3),ctx=context(source,target);
    expect(source).toMatchObject({hp:500*2**(star-1),attack:51*2**(star-1),armor:0,range:4,interval:6,gaze:{selections:0,controls:0,manaDrained:0}});
    expect(pieceDetails(piece("eyebug",1,star))).toMatchObject({hp:source.hp,attack:source.attack,armor:0,range:4,interval:1.5});
    const hp=target.hp;target.shield=999;expect(castSkill(ctx,source,target)).toBe(true);
    expect(target.hp).toBe(hp);expect(target.shield).toBe(999);expect(ctx.events).toEqual([]);
    expect(target.stunUntil).toBe(10+GAZE.duration[star-1]);expect(target.gazed?.until).toBe(target.stunUntil);
    expect(source.skillReadyAt).toBe(70);expect(source.signature!.casts).toBe(1);expect(source.mana).toBe(0);
  });

  it("局部随机选择不总取最近目标，排列变化不改变结果，非法目标不入候选",()=>{
    const source=fighter("eyebug",101,0),a=fighter("guard",201,1,1,3,3),b=fighter("guard",202,1,1,3,2),
      c=fighter("guard",203,1,1,4,2),far=fighter("guard",204,1,1,7,0),ally=fighter("guard",205,0,1,3,5),
      dead=fighter("guard",206,1,1,4,4),hidden=fighter("ghostjet",207,1,1,2,4),immune=fighter("swordthrall",208,1,1,2,3);
    dead.hp=0;hidden.air!.phaseUntil=99;immune.bladeStorm={until:99,next:11,remaining:6,damage:50};
    const ctx=context(source,a,b,c,far,ally,dead,hidden,immune),chosen=new Set<number>();
    for(let i=0;i<12;i++){
      source.gaze!.selections=i;const target=gazeTarget(ctx,source)!;chosen.add(target.uid);
      expect([201,202,203]).toContain(target.uid);expect(gazeTarget({...ctx,fighters:[...ctx.fighters].reverse()},source)?.uid).toBe(target.uid);
    }
    expect(chosen.size).toBeGreaterThan(1);
  });

  for(const block of ["stun","silence","charm","cooldown","dead","no-target"] as const)
    it(`${block}时不扣能量、不增加抽取或施法次数`,()=>{
      const source=fighter("eyebug",101,0),target=fighter("guard",201,1,1,3,3),ctx=context(source,target);
      if(block==="stun")source.stunUntil=11;if(block==="silence")source.silenceUntil=11;
      if(block==="charm")source.charm={until:11,attack:source.attack,side:1};if(block==="cooldown")source.skillReadyAt=11;
      if(block==="dead")source.hp=0;if(block==="no-target")target.side=source.side;
      const before=structuredClone(ctx);expect(castSkill(ctx,source,target)).toBe(false);expect(ctx).toEqual(before);
    });

  it("15秒个人冷却不能靠晶体或满能量跳过，到期才再次施放",()=>{
    const source=fighter("eyebug",101,0),target=fighter("guard",201,1,1,3,3),ctx=context(source,target);
    expect(castSkill(ctx,source,target)).toBe(true);source.mana=100;ctx.tick=69;expect(castSkill(ctx,source,target)).toBe(false);
    ctx.tick=70;expect(castSkill(ctx,source,target)).toBe(true);expect(source.gaze!.selections).toBe(2);
  });

  it("按实际可扣能量计数，不扣成负数，不偷给来源，不阻止普通回能；最后一秒只扣一次",()=>{
    const source=fighter("eyebug",101,0),target=fighter("guard",201,1,1,3,3),ctx=context(source,target);
    castSkill(ctx,source,target);target.mana=7;ctx.tick=14;advanceGazes(ctx);expect(target.mana).toBe(0);expect(source.gaze!.manaDrained).toBe(7);expect(source.mana).toBe(0);
    gainMana(target,25,14);expect(target.mana).toBe(25);ctx.tick=18;advanceGazes(ctx);expect(target.mana).toBe(15);
    ctx.tick=22;advanceGazes(ctx);expect(target.mana).toBe(5);ctx.tick=26;advanceGazes(ctx);advanceGazes(ctx);
    expect(target.mana).toBe(0);expect(source.gaze!.manaDrained).toBe(32);expect(target.gazed).toBeUndefined();expect(target.stunUntil).toBe(26);
    expect(ctx.effects.filter(e=>e.name==="凝视削能").map(e=>e.amount)).toEqual([7,10,10,5]);
  });

  it("无能量单位也能被控制；不凭空削减被动能量，不触发破甲、吸血或反伤",()=>{
    const source=fighter("eyebug",101,0),target=fighter("infantry",201,1,1,3,3),ctx=context(source,target);
    source.hp=50;source.lifesteal=0.5;source.attackShred=10;target.mana=0;target.reflection=99;
    expect(castSkill(ctx,source,target)).toBe(true);ctx.tick=14;advanceGazes(ctx);
    expect(target.stunUntil).toBe(26);expect(target.mana).toBe(0);expect(source.gaze!.manaDrained).toBe(0);
    expect(source.hp).toBe(50);expect(source.healing).toBe(0);expect(target.armorBreak).toBe(0);expect(ctx.events).toEqual([]);
  });

  it("驱散立即终止控制标记和后续削能，眼虫被沉默或阵亡不撤回已施加的效果",()=>{
    const source=fighter("eyebug",101,0),target=fighter("guard",201,1,1,3,3),fish=fighter("fish",202,1,1,4,3),ctx=context(source,target,fish);
    fish.hp-=20;castSkill(ctx,source,target);source.silenceUntil=99;source.hp=0;ctx.tick=14;advanceGazes(ctx);
    expect(source.gaze!.manaDrained).toBe(10);expect(target.stunUntil).toBe(26);
    ctx.tick=15;expect(castSkill(ctx,fish,source)).toBe(false);const dummy=fighter("guard",301,0,1,3,5);ctx.fighters.push(dummy);
    expect(castSkill(ctx,fish,dummy)).toBe(true);expect(target.stunUntil).toBe(0);expect(target.gazed).toBeUndefined();
    const mana=target.mana;ctx.tick=18;advanceGazes(ctx);expect(target.mana).toBe(mana);expect(source.gaze!.manaDrained).toBe(10);
  });

  it("同类控制不重复削能，较短的新凝视不延长或替换较强来源",()=>{
    const long=fighter("eyebug",101,0,3),short=fighter("eyebug",102,0),target=fighter("guard",201,1,1,3,3),ctx=context(long,short,target);
    castSkill(ctx,long,target);ctx.tick=11;castSkill(ctx,short,target);expect(target.gazed).toMatchObject({source:101,until:34});
    ctx.tick=14;advanceGazes(ctx);expect(target.mana).toBe(90);expect(long.gaze!.manaDrained).toBe(10);expect(short.gaze!.manaDrained).toBe(0);
  });

  it("不选择残魂、火种或狂舞；命中正在蓄力的天师时确实取消未发出的光球",()=>{
    const source=fighter("eyebug",101,0),target=fighter("stormcaller",201,1,1,3,3),ctx=context(source,target);
    expect(castSkill(ctx,target,source)).toBe(true);expect(target.air!.cast).toBeDefined();castSkill(ctx,source,target);expect(target.air!.cast).toBeUndefined();
    const soul=fighter("vine",202,1,1,3,3);soul.immortal={duration:20,until:40,spent:true};
    const egg=fighter("phoenix",203,1,2,3,3);egg.phoenix!.eggUntil=40;
    const spin=fighter("swordthrall",204,1,1,3,3);spin.bladeStorm={until:40,next:14,remaining:6,damage:50};
    expect(gazeTarget(context(source,soul,egg,spin),source)).toBeUndefined();
  });

  it("技能强度不提高控制或削能，AI保留先手能量装备的价值",()=>{
    const a=fighter("eyebug",101,0),target=fighter("guard",201,1,1,3,3),ctx=context(a,target);a.skillPower=100;
    castSkill(ctx,a,target);expect(target.gazed).toMatchObject({until:26,drain:10});
    expect(itemScore(piece("eyebug",1),"staff")).toBe(80); // 40 opening energy; no spell-power credit.
    expect(itemScore(piece("eyebug",1),"staff","rifle")).toBeGreaterThan(80);
    expect(abilityCredit(piece("eyebug",1))).toBe(abilityCredit(piece("eyebug",1),{attack:0,hp:0,armor:0,haste:0,mana:0,skillPower:100,lifesteal:0,magicResist:0,damageMana:0}));
  });
});

describe("凝视画面、分析与版本兼容",()=>{
  it("同一二对二展示两次长控、实际削能和控制后的普通攻击；快算与Worker一致",()=>{
    const input=structuredClone(GAZE_DEMO),last=demo.frames.at(-1)!;
    expect(simulateOutcome(GAZE_DEMO.left,GAZE_DEMO.right,"gaze").final.fighters).toEqual(last.fighters);
    const worker=compute({kind:"replay",...GAZE_DEMO,version:"gaze"});expect(worker.kind).toBe("replay");if(worker.kind!=="replay")return;
    expect(worker.battle).toEqual(demo);expect(GAZE_DEMO).toEqual(input);
    expect(last.fighters.find(f=>f.uid===101)!.gaze).toEqual({selections:2,controls:2,manaDrained:100});
    expect(demo.frames.some(f=>f.fighters.some(t=>t.gazed)&&f.events.some(e=>e.attacker===101&&!e.skill))).toBe(true);
    expect(demo.frames.flatMap(f=>f.events).filter(e=>e.attacker===101&&e.skill)).toEqual([]);
    const start=analyzeBattle(demo,0),end=analyzeBattle(demo);expect(start.sides[0].fighters.find(f=>f.uid===101)!.gaze!.manaDrained).toBe(0);
    expect(battleAnalysisMarkup(end,"damage","凝视",demo.frames.length-1,last.tick)).toContain("凝视控制 2 人次 · 削能 100");
  });

  it("持续标记、详细状态、实际控制时长及图鉴说明使用新定位",()=>{
    const frame=demo.frames.find(f=>f.fighters.some(t=>t.gazed))!,target=frame.fighters.find(f=>f.gazed)!;
    expect(compactBattleLabels(target,frame.tick)).toContain("凝视压制");expect(gazeLabels(target,frame.tick).join()).toContain("每秒削能10");
    expect(gazeLabels(target,target.gazed!.until)).toEqual([]);expect(gazePose().lift).toBeGreaterThan(0);
    expect(skillDescription("eyebug")).toContain("不直接造成伤害");expect(skillRole("eyebug")).toContain("削能");
  });

  it("40版旧身板与原型技能保持，其余单位不受此次变化，异虫对子升星继续有效",()=>{
    expect(frozen.definitions).toHaveLength(40);for(const row of frozen.definitions)expect(unitDefinition("eyebug",version(row.version))).toEqual(row.unit);
    for(const u of UNITS.filter(u=>u.id!=="eyebug"))expect(unitDefinition(u.id,"gaze")).toEqual(unitDefinition(u.id,"rifle"));
    expect(mergeCount([piece("eyebug",1),piece("spider",2)],"eyebug",1)).toBe(2);
    const a=army([piece("eyebug",1)],0,"rifle")[0],b=army([piece("guard",2)],1,"rifle")[0];a.mana=100;
    // The old generic stun adds the source star to six ticks; preserve that replay behavior.
    const ctx=context(a,b);castSkill(ctx,a,b);expect(a.gaze).toBeUndefined();expect(ctx.events.some(e=>e.skill&&e.amount>0)).toBe(true);expect(b.stunUntil).toBe(17);
  });

  for(const row of frozen.fixtures)it(`${row.version}修改前二对二小回放SHA保持`,async()=>{
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(row.left,row.right,version(row.version)))));
    expect(Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")).toBe(row.hash);
  });

  for(const phase of ["prepare","battle","result","finished"] as const)it(`0.67 ${phase}迁移保留旧目录、资源和回看，准备期才升级`,()=>{
    const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("Invalid reserve capture");const game=input;game.combatVersion="rifle";game.phase=phase;
    if(phase==="result"||phase==="finished"){
      game.round--;game.players[0].hp=game.history.at(-1)!.hp;
      if(phase==="finished"){const p=game.players[0];for(const held of p.pieces)game.pool[held.defId]+=pieceCopies(held);for(const id of p.shop)if(id)game.pool[id]++;
        p.hp=0;p.eliminatedRound=game.round;p.pieces=[];p.shop=[];p.inventory=[];game.history.at(-1)!.hp=0;}
    }
    const before=structuredClone(game),playback={time:3,speed:2,paused:true};
    const decoded=decodeSave(JSON.stringify({schema:66,rules:"singleplayer-0.67",savedAt:1,revision:1,game,playback}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(decoded.data!.rules).toBe(RULES.version);
    expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});expect(decoded.data!.playback).toEqual(playback);
    if(phase==="result"){nextRound(decoded.data!.game);expect(decoded.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(decoded.data!.game.catalogVersion).toBe("secret-orb");}
  });

  it("缺目录存档补回rifle旧目录，不凭空改变一费池份数",()=>{
    const game=createGame(1,"classic");game.combatVersion="rifle";for(const u of UNITS)game.pool[u.id]+=COPIES[unitCost(u.id,"rifle")]-COPIES[unitCost(u.id)];delete game.catalogVersion;
    const decoded=decodeSave(JSON.stringify({schema:66,rules:"singleplayer-0.67",savedAt:1,revision:1,game,playback:{time:0,speed:1,paused:false}}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.game.catalogVersion).toBe("rifle");expect(validGame(decoded.data!.game)).toBe(true);
  });
});
