import {describe,expect,it} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,combatAttack,damage,gainMana,type CombatContext} from "../src/engine/abilities";
import {usesEnergy,skillReady} from "../src/engine/triggers";
import {RIFLE,skillDescription,skillName,skillRole} from "../src/data/skills";
import {RIFLE_DEMO} from "../src/data/rifle-demo";
import {unitDefinition,unitAttackInterval,unitSprite} from "../src/data/unit-stats";
import {RULES,UNITS} from "../src/data/units";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type CombatVersion,type Piece} from "../src/engine/types";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {compute} from "../src/compute/job";
import {createGame,nextRound} from "../src/engine/game";
import {pieceCopies,mergeCount} from "../src/engine/progression";
import {decodeSave,SAVE_SCHEMA,validGame} from "../src/engine/persistence";
import {itemScore,equipBot} from "../src/engine/equipment";
import {abilityCredit,pieceStrength} from "../src/engine/ai";
import {fighterSprite} from "../src/engine/summons";
import {pieceDetails,pieceDetailMarkup} from "../src/ui/bench-tooltip";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {codexCards,codexFilters} from "../src/ui/unit-codex";
import {equipmentOverviewMarkup} from "../src/ui/equipment";
import {scoutingMarkup} from "../src/ui/scouting";
import {recruitmentMarkup} from "../src/ui/recruitment";
import frozen from "./fixtures/pre-v067-rifle-replays.json";
import paid from "./fixtures/opening-ai-reserve.json";

const piece=(defId:string,uid:number,star=1,position:number|null=35):Piece=>({defId,uid,star,position});
const demo=simulate(RIFLE_DEMO.left,RIFLE_DEMO.right);
const shots=(uid:number)=>demo.frames.flatMap(frame=>frame.events.filter(e=>e.attacker===uid&&!e.skill&&e.primary&&!e.reflected&&!e.periodic).map(e=>({tick:frame.tick,event:e})));
function version(name:string):CombatVersion{const v=COMBAT_VERSIONS.find(v=>v===name);if(!v)throw Error(name);return v;}

describe("神枪手被动火力",()=>{
  for(const [star,hp,attack,interval,uid,ticks] of [
    [1,400,36,1,101,[1,5,9,13]],[2,800,72,0.75,102,[1,4,7,10]],[3,1600,144,0.5,103,[1,3,5,7]],
  ] as const)it(`${star}星身板、真实射击节奏与详情一致，每次只有一个实际伤害事件`,()=>{
    const p=piece("infantry",1,star),f=army([p],0)[0];
    expect(f).toMatchObject({hp,attack,armor:5,range:4,interval:interval*4,mana:0,rifle:{shots:0}});
    expect(pieceDetails(p)).toMatchObject({hp,attack,armor:5,interval});expect(unitAttackInterval(unitDefinition("infantry"),star)/4).toBe(interval);
    const filters={...codexFilters};
    try{Object.assign(codexFilters,{query:"神枪手",star});expect(codexCards()).toContain(`间隔 ${interval} 秒`);expect(codexCards({combatVersion:"thornbind"})).toContain("间隔 0.75 秒");}
    finally{Object.assign(codexFilters,filters);}
    expect(shots(uid).slice(0,4).map(s=>s.tick)).toEqual(ticks);
    const final=demo.frames.at(-1)!.fighters.find(f=>f.uid===uid)!;expect(final.rifle!.shots).toBe(shots(uid).length);
    expect(demo.frames.flatMap(frame=>frame.events).filter(e=>e.attacker===uid&&e.skill&&!e.reflected)).toHaveLength(0);
    for(const frame of demo.frames)expect(frame.fighters.find(f=>f.uid===uid)!.mana).toBe(0);
  });

  it("晶体/法杖不产生能量或主动施法，纯法强不提高普通攻击伤害",()=>{
    for(const items of [[],["staff","crystal"]]){
      const source=army([{...piece("infantry",1,2),items}],0)[0],target=army([piece("guard",2)],1)[0];
      Object.assign(target,{x:source.x+1,y:source.y,hp:10000,maxHp:10000,armor:0});
      const ctx:CombatContext={fighters:[source,target],tick:1,events:[],effects:[]};
      expect(usesEnergy(source)).toBe(false);gainMana(source,100,1);expect(source.mana).toBe(0);expect(skillReady(source)).toBe(false);
      source.mana=100;expect(castSkill(ctx,source,target)).toBe(false);expect(target.armorBreak).toBe(0);
      damage(ctx,source,target,combatAttack(source,1),"physical",false,true);
      expect(ctx.events[0]).toMatchObject({amount:72,damageType:"physical",skill:false,primary:true});
    }
  });

  it("普通攻击保留护盾、普攻吸血、破甲和反伤，不把破盾重复算生命伤害",()=>{
    const source=army([{...piece("infantry",1,2),items:["fang"]}],0)[0],target=army([piece("guard",2)],1)[0];
    // Exercise an existing combat modifier directly; no piercer item exists in the catalog.
    Object.assign(source,{hp:100,attackShred:2});Object.assign(target,{x:source.x+1,y:source.y,hp:10000,maxHp:10000,shield:20,armor:0,reflection:10});
    const ctx:CombatContext={fighters:[source,target],tick:1,events:[],effects:[]};
    damage(ctx,source,target,combatAttack(source,1),"physical",false,true);
    const normal=ctx.events.find(e=>e.attacker===1&&!e.reflected)!;
    expect(normal.absorbed).toBe(20);expect(normal.amount).toBeGreaterThan(0);expect(source.damage).toBe(normal.amount);
    expect(target.armorBreak).toBeGreaterThan(0);expect(source.healing).toBeGreaterThan(0);
    expect(ctx.events.some(e=>e.attacker===2&&e.reflected&&e.amount===10)).toBe(true);
  });

  it("攻速装备降低真实间隔，法强装备不改变射速，技能说明保留0.25秒下限",()=>{
    const base=army([piece("infantry",1,3)],0)[0],fast=army([{...piece("infantry",2,3),items:["coil"]}],0)[0];
    const staff=army([{...piece("infantry",3,3),items:["staff"]}],0)[0];
    expect(fast.interval).toBeLessThan(base.interval);expect(staff.interval).toBe(base.interval);
    expect(pieceDetails({...piece("infantry",2,3),items:["coil"]}).interval).toBeCloseTo(fast.interval/4);
    expect(skillDescription("infantry")).toContain("最快每0.25秒");expect(RIFLE.intervals).toEqual([4,3,2]);
  });

  it("同一演示中沉默不阻止被动射击，护盾兵硬控仍能打断普通攻击",()=>{
    expect(demo.frames.some(frame=>frame.fighters.some(f=>f.rifle&&(f.silenceUntil??0)>frame.tick))).toBe(true);
    expect(demo.frames.some(frame=>frame.events.some(e=>!e.skill&&e.primary&&frame.fighters.some(f=>f.uid===e.attacker&&f.rifle&&(f.silenceUntil??0)>frame.tick)))).toBe(true);
    const controlled=simulate([piece("infantry",1)],[piece("guard",2)]);let checked=0;
    for(const frame of controlled.frames.slice(1)){
      const prev=controlled.frames[frame.tick-1].fighters.find(f=>f.uid===1)!;
      if(prev.hp>0&&prev.stunUntil>frame.tick){checked++;expect(frame.events.filter(e=>e.attacker===1&&!e.reflected)).toHaveLength(0);}
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("新AI估值使用升星射速，纯能量/法强装备不会交给被动枪手占槽",()=>{
    expect(abilityCredit(piece("infantry",1))).toBe(0);expect(abilityCredit({...piece("infantry",1),items:["staff"]})).toBe(0);
    expect(pieceStrength(piece("infantry",1,3))).toBeGreaterThan(pieceStrength(piece("infantry",1,2))*2);
    expect(itemScore(piece("infantry",1,3),"blade")).toBeGreaterThan(itemScore(piece("infantry",1,1),"blade"));
    expect(itemScore(piece("infantry",1),"crystal")).toBe(0);expect(itemScore(piece("infantry",1),"staff")).toBe(0);
    const game=createGame(1,"classic"),p=game.players[0];p.pieces=[piece("infantry",101)];p.inventory=["crystal"];equipBot(game,p);
    expect(p.inventory).toEqual(["crystal"]);expect(p.pieces[0].items).toEqual([]);
    p.pieces.push(piece("stormcaller",102,1,36));equipBot(game,p);
    expect(p.pieces.find(f=>f.uid===102)!.items).toContain("crystal");expect(p.inventory).toEqual([]);
  });
});

describe("图像、回看与旧局兼容",()=>{
  it("39版旧定义保持，其余单位与异虫双合不变，旧主动破甲仍可重建",()=>{
    expect(frozen.definitions).toHaveLength(39);for(const e of frozen.definitions)expect(unitDefinition("infantry",version(e.version))).toEqual(e.unit);
    for(const u of UNITS.filter(u=>u.id!=="infantry"))expect(unitDefinition(u.id,"rifle")).toEqual(unitDefinition(u.id,"thornbind"));
    expect(unitDefinition("infantry")).toMatchObject({cost:1,hp:400,attack:36,armor:5,range:4,interval:4,skill:"快速射击"});
    expect(skillRole("infantry")).toContain("被动");expect(skillName("infantry","thornbind")).toBe("精准射击");
    expect(mergeCount([piece("eyebug",1),piece("spider",2)],"eyebug",1)).toBe(2);
    const source=army([piece("infantry",1)],0,"thornbind")[0],target=army([piece("guard",2)],1,"thornbind")[0];
    source.mana=100;const ctx:CombatContext={fighters:[source,target],tick:1,events:[],effects:[]};
    expect(source.rifle).toBeUndefined();expect(castSkill(ctx,source,target)).toBe(true);expect(target.armorBreak).toBe(4);
  });

  it("战场、备战、图鉴、装备持有人、侦察和商店使用新ImageGen形象，旧图保留",()=>{
    const game=createGame(1,"classic"),p=game.players[0],a={...piece("infantry",101,3),items:["blade"]};p.pieces=[a];
    expect(unitSprite("infantry")).toBe("infantry-rifle");expect(fighterSprite(army([a],0)[0])).toBe("infantry-rifle");
    expect(pieceDetailMarkup(a)).toContain("/infantry-rifle.png");expect(equipmentOverviewMarkup(game)).toContain("/infantry-rifle.png");
    expect(scoutingMarkup(game,0)).toContain("/infantry-rifle.png");codexFilters.star=3;
    expect(codexCards(game)).toContain("/infantry-rifle.png");codexFilters.star=1;p.shop[0]="infantry";
    expect(recruitmentMarkup(game,p,false)).toContain("/infantry-rifle.png");
    expect(unitSprite("infantry","thornbind")).toBe("infantry");expect(fighterSprite(army([a],0,"thornbind")[0])).toBe("infantry");
  });

  it("一个四对二小局面完整、快速和Worker一致；分析计实际开火次数，不向过去泄露",()=>{
    const before=structuredClone(RIFLE_DEMO),quick=simulateOutcome(RIFLE_DEMO.left,RIFLE_DEMO.right);
    const worker=compute({kind:"replay",...RIFLE_DEMO,version:CURRENT_COMBAT_VERSION});expect(worker.kind).toBe("replay");if(worker.kind!=="replay")return;
    expect(worker.battle).toEqual(demo);expect(quick.final.fighters).toEqual(demo.frames.at(-1)!.fighters);expect(RIFLE_DEMO).toEqual(before);
    const start=analyzeBattle(demo,0),last=analyzeBattle(demo);
    expect(start.sides[0].fighters.filter(f=>f.rifle).every(f=>f.rifle!.shots===0)).toBe(true);
    expect(last.sides[0].fighters.filter(f=>f.rifle).every(f=>f.rifle!.shots>0&&f.casts===0&&f.skillDamage===0)).toBe(true);
    expect(battleAnalysisMarkup(last,"damage","被动",demo.frames.length-1,demo.frames.at(-1)!.tick)).toContain("被动开火");
  });

  for(const e of frozen.fixtures)it(`${e.version}两次旧主动破甲小回放SHA保持`,async()=>{
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(e.left,e.right,version(e.version)))));
    expect(Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")).toBe(e.hash);expect(e.casts).toBe(2);
  });

  for(const phase of ["prepare","battle","result","finished"] as const)it(`0.66 ${phase}迁移保留资源、旧目录和播放进度，准备期才换被动`,()=>{
    const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("Invalid reserve capture");const game=input;game.combatVersion="thornbind";game.phase=phase;
    if(phase==="result"||phase==="finished"){
      game.round--;game.players[0].hp=game.history.at(-1)!.hp;
      if(phase==="finished"){
        const p=game.players[0];for(const held of p.pieces)game.pool[held.defId]+=pieceCopies(held);for(const id of p.shop)if(id)game.pool[id]++;
        p.hp=0;p.eliminatedRound=game.round;p.pieces=[];p.shop=[];p.inventory=[];game.history.at(-1)!.hp=0;
      }
    }
    const before=structuredClone(game),playback={time:3,speed:2,paused:true};
    const decoded=decodeSave(JSON.stringify({schema:65,rules:"singleplayer-0.66",savedAt:1,revision:1,game,playback}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(decoded.data!.rules).toBe(RULES.version);
    expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});expect(decoded.data!.playback).toEqual(playback);
    if(phase==="result"){nextRound(decoded.data!.game);expect(decoded.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(decoded.data!.game.catalogVersion).toBe("secret-orb");}
  });

  it("缺少目录的0.66存档补回thornbind，一费45份卡池保持",()=>{
    const game=createGame(1,"classic");game.combatVersion="thornbind";delete game.catalogVersion;
    const decoded=decodeSave(JSON.stringify({schema:65,rules:"singleplayer-0.66",savedAt:1,revision:1,game,playback:{time:0,speed:1,paused:false}}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.game.catalogVersion).toBe("thornbind");expect(validGame(decoded.data!.game)).toBe(true);
  });
});
