import { describe,expect,it } from "vitest";
import { army,simulate,simulateOutcome } from "../src/engine/battle";
import { advanceAirSkills,castSkill,type CombatContext } from "../src/engine/abilities";
import { advanceTornadoes,tornadoContact } from "../src/engine/tornado";
import { advanceJungleLandings } from "../src/engine/jungle";
import { TORNADO,skillDescription,skillName } from "../src/data/skills";
import { TORNADO_DEMO } from "../src/data/tornado-demo";
import { unitDefinition,unitSprite } from "../src/data/unit-stats";
import { catalogCost } from "../src/data/catalog";
import { UNITS,COPIES,RULES } from "../src/data/units";
import { traitTiers } from "../src/data/traits";
import { COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type Fighter,type Piece } from "../src/engine/types";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { decodeSave,SAVE_SCHEMA,validGame } from "../src/engine/persistence";
import { createGame,nextRound } from "../src/engine/game";
import { mergeCount,pieceCopies } from "../src/engine/progression";
import { abilityCredit,pieceStrength } from "../src/engine/ai";
import { fighterSprite } from "../src/engine/summons";
import { tornadoLabels,tornadoPose } from "../src/render/tornado";
import { compactBattleLabels } from "../src/render/battle-inspection";
import { REST_POSE } from "../src/render/melee";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import frozen from "./fixtures/pre-v063-winddragon-replays.json";
import paid from "./fixtures/opening-ai-reserve.json";

const piece=(defId:string,uid:number,star=1):Piece=>({defId,uid,star,position:51});
function setup(star=1){
  const source=army([piece("winddragon",1,star)],0)[0],target=army([piece("guard",2)],1)[0];
  Object.assign(source,{x:3,y:6,mana:100});Object.assign(target,{x:3,y:3,hp:10000,maxHp:10000,magicResist:0});
  const ctx:CombatContext={fighters:[source,target],tick:0,events:[],effects:[]};return {source,target,ctx};
}
function begin(s:ReturnType<typeof setup>){expect(castSkill(s.ctx,s.source,s.target)).toBe(true);return s;}
function run(s:ReturnType<typeof setup>,ticks:number){
  for(let i=0;i<ticks;i++){
    s.ctx.tick++;
    for(const f of s.ctx.fighters)if(f.knockup && f.knockup.until<=s.ctx.tick)delete f.knockup;
    advanceJungleLandings(s.ctx);advanceTornadoes(s.ctx);
    for(const f of s.ctx.fighters)advanceAirSkills(s.ctx,f);
  }
}
function control(f:Fighter,kind:string){
  if(kind==="stun")f.stunUntil=100;if(kind==="silence")f.silenceUntil=100;
  if(kind==="charm"){f.charm={side:0,until:100,attack:f.attack};f.side=1;}if(kind==="death")f.hp=0;
}
function oldVersion(name:string){const v=COMBAT_VERSIONS.find(v=>v===name);if(!v)throw Error(name);return v;}

describe("翔龙龙卷风",()=>{
  for(const [star,hurt,stun] of [[1,150,6],[2,200,8],[3,250,12]])
    it(`${star}星${hurt}法伤，0.5秒击飞后${stun/4}秒落地眩晕，同一龙卷只接触一次`,()=>{
      const s=begin(setup(star));run(s,3);
      expect(s.source.tornado!.launched).toBe(1);expect(s.target.hp).toBe(10000);expect(s.source.air!.cast).toBeUndefined();
      run(s,3);expect(s.target.hp).toBe(10000-hurt);expect(s.target.knockup).toEqual({start:6,until:8});
      expect(s.target.stunUntil).toBe(8);expect(s.source.tornado!.landings).toBe(0);expect(compactBattleLabels(s.target,6)).toContain("击飞");
      run(s,2);expect(s.target.knockup).toBeUndefined();expect(s.target.stunUntil).toBe(8+stun);
      expect(s.source.tornado).toMatchObject({launched:1,contacts:1,knockups:1,landings:1});expect(compactBattleLabels(s.target,8)).toContain("眩晕");
      run(s,12);expect(s.target.hp).toBe(10000-hurt);expect(s.source.tornado!.contacts).toBe(1);expect(s.source.tornado!.vortices).toEqual([]);
      expect(s.source.skillReadyAt).toBe(80);expect(s.source.mana).toBe(0);
      expect(s.ctx.events.filter(e=>e.skill).map(e=>[e.amount,e.damageType])).toEqual([[hurt,"magic"]]);
    });

  it("圆形移动头的扫掠包含侧边和端点，不将对角外角当成命中，也不穿透采样间隙",()=>{
    const ray={from:{x:3,y:6},dx:0,dy:-1};
    expect(tornadoContact(ray,{x:3.75,y:4},0,3)).toBe(true);expect(tornadoContact(ray,{x:3.751,y:4},0,3)).toBe(false);
    expect(tornadoContact(ray,{x:3,y:2.25},0,3)).toBe(true);expect(tornadoContact(ray,{x:3,y:2.249},0,3)).toBe(false);
    expect(tornadoContact(ray,{x:3.6,y:2.4},0,3)).toBe(false);expect(tornadoContact(ray,{x:3,y:4.875},0.75,1.5)).toBe(true);
    expect(tornadoContact(ray,{x:3,y:7},0,3)).toBe(false);
  });

  it("0.75秒起手没有提前命中；以固定方向移动，目标可走开，其他敌人可进入路径",()=>{
    const s=begin(setup());run(s,2);expect(s.source.tornado!.launched).toBe(0);
    s.target.x=7;run(s,4);expect(s.target.hp).toBe(10000);expect(s.source.tornado!.contacts).toBe(0);
    s.target.x=3;s.target.y=2;run(s,2);expect(s.target.hp).toBe(9850);expect(s.source.tornado!.contacts).toBe(1);
    expect(s.source.tornado!.vortices[0]).toMatchObject({dx:0,dy:-1,damage:150});
  });

  for(const kind of ["stun","silence","charm","death"])
    it(`${kind}打断起手，无龙卷、击飞或退款`,()=>{
      const s=begin(setup());control(s.source,kind);run(s,14);
      expect(s.source.tornado).toMatchObject({launched:0,contacts:0,knockups:0,landings:0,vortices:[]});
      expect(s.source.air!.cast).toBeUndefined();expect(s.target.hp).toBe(10000);expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(80);
      expect(s.ctx.effects.some(e=>e.name==="施法中断")).toBe(true);
    });

  for(const kind of ["stun","silence","charm","death"])
    it(`发出后${kind}不取消龙卷及落地控制，按原阵营继续移动`,()=>{
      const s=begin(setup());run(s,3);control(s.source,kind);run(s,11);
      expect(s.target.hp).toBe(9850);expect(s.source.tornado).toMatchObject({launched:1,contacts:kind==="charm"?2:1,landings:kind==="charm"?2:1,vortices:[]});
      if(kind==="charm")expect(s.source.hp).toBe(s.source.maxHp-135); // A former caster is an enemy of its own frozen launch side.
    });

  it("冻结起手法强，不取攻击力；陆行者真实普攻不把当前法术龙卷变为真实伤害",()=>{
    const s=setup(2);s.source.skillPower=1.5;expect(s.source.trueAttack).toBe(true);begin(s);
    s.source.skillPower=10;s.source.attack=100000;s.target.magicResist=0.5;run(s,8);
    expect(s.target.hp).toBe(9850);expect(s.ctx.events.filter(e=>e.skill).map(e=>e.damageType)).toEqual(["magic"]);
  });

  it("范围能接触隐蔽飞行敌军，友军不受伤；同一UID不会重复触发控制",()=>{
    const s=setup(),hidden=army([piece("ghostjet",3)],1)[0],ally=army([piece("guard",4)],0)[0];
    Object.assign(hidden,{x:3,y:4,hp:10000,maxHp:10000,magicResist:0});hidden.air!.phaseUntil=100;
    Object.assign(ally,{x:3,y:5});s.ctx.fighters.push(hidden,ally);begin(s);run(s,15);
    expect(hidden.hp).toBe(9850);expect(ally.hp).toBe(ally.maxHp);expect(ally.knockup).toBeUndefined();
    expect(s.source.tornado).toMatchObject({contacts:2,knockups:2,landings:2});
  });

  it("首次接触被狂舞免伤时不施加控制；解除免伤后不会被同一道龙卷重复接触",()=>{
    const s=setup();s.target.bladeStorm={until:100,next:100,remaining:6,damage:1};begin(s);run(s,6);
    expect(s.target.hp).toBe(10000);expect(s.target.knockup).toBeUndefined();delete s.target.bladeStorm;run(s,8);
    expect(s.target.hp).toBe(10000);expect(s.source.tornado).toMatchObject({contacts:1,knockups:0,landings:0});
  });

  it("残魂与火种不被击飞，火种仍可受伤；接触统计不等同于有效伤害",()=>{
    const s=setup(),soul=s.target,egg=army([piece("phoenix",3,2)],1)[0];
    Object.assign(soul,{hp:1,immortal:{spent:true,until:100,duration:20}});
    Object.assign(egg,{x:3,y:2,hp:1000,maxHp:1000,magicResist:0});egg.phoenix!.spent=true;egg.phoenix!.eggUntil=100;
    s.ctx.fighters.push(egg);begin(s);run(s,14);
    expect(soul.hp).toBe(1);expect(egg.hp).toBe(850);expect(s.source.tornado).toMatchObject({contacts:2,knockups:0,landings:0});
  });

  it("位面观测的实际驱散在空中清除两段控制，不留下延迟眩晕",()=>{
    const s=setup(),fish=army([piece("fish",3)],1)[0];Object.assign(fish,{x:4,y:5,mana:100});s.ctx.fighters.push(fish);
    begin(s);run(s,6);expect(s.target.jungleLandings).toHaveLength(1);
    expect(castSkill(s.ctx,fish,s.source)).toBe(true);expect(s.target.jungleLandings).toBeUndefined();expect(s.target.knockup).toBeUndefined();
    run(s,2);expect(s.target.stunUntil).toBe(0);expect(s.source.tornado!.landings).toBe(0);
  });

  it("真实树妖击飞会推迟龙卷落地，两种能力分别统计，后续眩晕取较长结束时刻",()=>{
    const s=begin(setup()),tree=army([piece("treant",3)],0)[0];Object.assign(tree,{x:4,y:5,mana:100});s.ctx.fighters.push(tree);
    run(s,2);expect(castSkill(s.ctx,tree,s.target)).toBe(true);run(s,4);
    expect(s.target.knockup!.until).toBe(10);expect(s.target.jungleLandings).toHaveLength(2);
    run(s,2);expect(s.source.tornado!.landings).toBe(0);expect(tree.jungle!.landings).toBe(0);
    run(s,2);expect(s.source.tornado!.landings).toBe(1);expect(tree.jungle!.landings).toBe(1);expect(s.target.stunUntil).toBe(16);
    expect(s.target.jungleLandings).toBeUndefined();
  });

  it("落地前的技能免控阻止第二段，短时击飞自然结束",()=>{
    const s=begin(setup());run(s,6);s.target.bladeStorm={until:100,next:100,remaining:6,damage:1};run(s,2);
    expect(s.target.knockup).toBeUndefined();expect(s.target.jungleLandings).toBeUndefined();expect(s.target.stunUntil).toBe(8);
    expect(s.source.tornado!.landings).toBe(0);
  });

  it("击飞打断已有引导，法伤被护盾吸收仍可控制，魔抗按当前值独立结算",()=>{
    const s=setup();s.target.magicResist=0.4;s.target.shield=100;
    s.target.air!.cast={kind:"medic",next:100,remaining:1,damage:1,from:{x:3,y:3},to:{x:3,y:3}};
    begin(s);run(s,6);expect(s.target.hp).toBe(10000);expect(s.target.shield).toBe(10);expect(s.target.air!.cast).toBeUndefined();
    expect(s.source.tornado!.knockups).toBe(1);expect(s.ctx.effects.some(e=>e.source===2&&e.name==="施法中断")).toBe(true);
  });

  it("第一名敌人的反伤击杀翔龙后，龙卷继续接触后排；死后的已施加击飞仍能落地",()=>{
    const s=setup(),back=structuredClone(s.target);back.uid=3;back.y=1;s.ctx.fighters.push(back);
    s.source.hp=1;s.target.reflection=20;begin(s);run(s,14);
    expect(s.source.hp).toBe(0);expect(s.target.hp).toBe(9850);expect(back.hp).toBe(9850);
    expect(s.source.tornado).toMatchObject({contacts:2,knockups:2,landings:2});
  });

  it("非法目标或冷却未结束不扣能量，20秒从蓄风起手计算",()=>{
    for(const reason of ["range","friendly","hidden","dead","coincident","cooldown"]){
      const s=setup();if(reason==="range")s.target.y=0;if(reason==="friendly")s.target.side=0;if(reason==="hidden")s.target.air!.phaseUntil=100;
      if(reason==="dead")s.target.hp=0;if(reason==="coincident")s.target.y=6;if(reason==="cooldown")s.source.skillReadyAt=1;
      expect(castSkill(s.ctx,s.source,s.target)).toBe(false);expect(s.source.mana).toBe(100);
    }
    const s=begin(setup());run(s,14);s.source.mana=100;s.ctx.tick=79;
    expect(castSkill(s.ctx,s.source,s.target)).toBe(false);s.ctx.tick=80;begin(s);run(s,14);
    expect(s.source.tornado!.launched).toBe(2);expect(s.target.hp).toBe(9700);
  });

  it("新旧身板、初始能量和10%法术减伤按版本区分，四费15份不变",()=>{
    expect(unitDefinition("winddragon")).toMatchObject({cost:4,hp:750,attack:93.5,range:4,interval:6.8,initialMana:0,magicResist:0.1,skill:"龙卷风"});
    expect(pieceDetails(piece("winddragon",1))).toMatchObject({hp:750,attack:93.5,range:4,interval:1.7,skill:"龙卷风",action:"盘颈吐风刃"});
    expect(pieceDetails(piece("winddragon",1),"warcry")).toMatchObject({hp:1100,attack:75,range:3,interval:1,skill:"游龙卷风"});
    expect(setup().source.magicResist).toBe(0.1);expect(army([piece("winddragon",1)],0,"warcry")[0].magicResist).toBe(0.2);
    expect(unitSprite("winddragon")).toBe("winddragon-tornado");expect(unitSprite("winddragon","warcry")).toBe("winddragon");
    expect(fighterSprite(setup().source)).toBe("winddragon-tornado");expect(createGame(1,"classic").pool.winddragon).toBe(COPIES[4]);expect(COPIES[4]).toBe(15);
    expect(skillName("winddragon")).toBe("龙卷风");expect(skillDescription("winddragon")).toContain("落地后再眩晕");
    expect(skillDescription("winddragon","warcry")).toContain("140%");
  });

  it("蓄风姿态、紧急标签和详细统计只读取当前帧，AI采用有限路径收益",()=>{
    const s=begin(setup()),before=structuredClone(s.source);
    expect(tornadoPose(s.source,1)).not.toEqual(REST_POSE);expect(compactBattleLabels(s.source,1)).toContain("龙卷蓄风");
    expect(tornadoLabels(s.source,1).join()).toContain("龙卷风冷却");expect(s.source).toEqual(before);
    run(s,3);expect(tornadoPose(s.source,3)).toEqual(REST_POSE);expect(tornadoLabels(s.source,3).join()).toContain("移动龙卷 1道");
    const base=piece("winddragon",1),staff={...base,items:["staff"]};expect(abilityCredit(staff)).toBeGreaterThan(abilityCredit(base));
    expect(abilityCredit(staff)).toBeLessThanOrEqual(0.6);expect(pieceStrength(piece("winddragon",1,2))).toBeGreaterThan(pieceStrength(staff));
  });

  it("同一六对六完整/快速结算一致，蓄风阻止行动，发出后可以在龙卷移动时继续普攻",()=>{
    const input=structuredClone(TORNADO_DEMO),full=simulate(input.left,input.right),quick=simulateOutcome(input.left,input.right);
    expect(input).toEqual(TORNADO_DEMO);expect(quick.final.fighters).toEqual(full.frames.at(-1)!.fighters);expect(quick.winner).toBe(full.winner);
    const report=analyzeBattle(full),dragon=report.sides[0].fighters.find(f=>f.defId==="winddragon")!;
    expect(dragon.tornado!.launched).toBeGreaterThan(0);expect(dragon.tornado!.knockups).toBeGreaterThan(0);expect(dragon.tornado!.landings).toBeGreaterThan(0);
    expect(analyzeBattle(full,0).sides[0].fighters.find(f=>f.defId==="winddragon")!.tornado).toEqual({launched:0,contacts:0,knockups:0,landings:0});
    expect(battleAnalysisMarkup(report,"damage","龙卷",full.frames.length-1,full.frames.at(-1)!.tick)).toContain("龙卷发出");
    let previous:Fighter|undefined;
    for(const frame of full.frames){const f=frame.fighters.find(f=>f.defId==="winddragon")!;
      if(f.air?.cast?.kind==="tornado"){
        expect(frame.events.filter(e=>e.attacker===f.uid&&!e.skill&&!e.reflected)).toHaveLength(0);
        if(previous?.air?.cast?.kind==="tornado")expect([f.x,f.y]).toEqual([previous.x,previous.y]);
      }previous=f;
    }
    expect(full.frames.some(frame=>frame.fighters.some(f=>f.tornado?.vortices.length&&!f.air?.cast&&frame.events.some(e=>e.attacker===f.uid&&!e.skill&&!e.reflected)))).toBe(true);
  });
});

describe("龙卷风版本与存档",()=>{
  it("35个旧翔龙定义保持，其他单位、既有能力、连携与异虫双合继承",()=>{
    for(const entry of frozen.definitions)expect(unitDefinition("winddragon",oldVersion(entry.version))).toEqual(entry.unit);
    for(const u of UNITS.filter(u=>u.id!=="winddragon"))expect(unitDefinition(u.id,"tornado")).toEqual(unitDefinition(u.id,"warcry"));
    expect(traitTiers(CURRENT_COMBAT_VERSION)).toEqual(traitTiers("warcry"));
    const party=["lion","titan","ark","treant","master","panda","monk","stormcaller"].map((id,i)=>({...piece(id,i+1),position:32+i}));
    expect(army(party,0)).toEqual(army(party,0,"warcry"));expect(mergeCount([piece("eyebug",1),piece("spider",2)],"eyebug",1)).toBe(2);
  });
  for(const phase of ["prepare","battle","result","finished"] as const)
    it(`0.62 ${phase}迁移仅升级准备期能力，资源/目录/历史与播放进度保留`,()=>{
      const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("Invalid reserve capture");const game=input;
      game.combatVersion="warcry";game.phase=phase;
      if(phase==="result"||phase==="finished"){
        game.round--;game.players[0].hp=game.history.at(-1)!.hp;
        if(phase==="finished"){
          const p=game.players[0];for(const held of p.pieces)game.pool[held.defId]+=pieceCopies(held);for(const id of p.shop)if(id)game.pool[id]++;
          p.hp=0;p.eliminatedRound=game.round;p.pieces=[];p.shop=[];p.inventory=[];game.history.at(-1)!.hp=0;
        }
      }
      expect(validGame(game)).toBe(true);const before=structuredClone(game),playback={time:3.5,speed:2,paused:true};
      const decoded=decodeSave(JSON.stringify({schema:61,rules:"singleplayer-0.62",savedAt:1,revision:1,game,playback}));
      expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(decoded.data!.rules).toBe(RULES.version);
      expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});
      expect(decoded.data!.game.catalogVersion).toBe("secret-orb");expect(decoded.data!.playback).toEqual(playback);
      if(phase==="result"){nextRound(decoded.data!.game);expect(decoded.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(decoded.data!.game.catalogVersion).toBe("secret-orb");}
    });
  it("缺失目录的0.62新局回填warcry，狂狮三费与翔龙四费容量不漂移",()=>{
    const game=createGame(1,"classic");game.combatVersion="warcry";delete game.catalogVersion;
    game.pool.phoenix=COPIES[4]; // A real 0.62 catalogue predates the 0.64 Phoenix price change.
    const decoded=decodeSave(JSON.stringify({schema:61,rules:"singleplayer-0.62",savedAt:1,revision:1,game,playback:{time:0,speed:1,paused:false}}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.game.catalogVersion).toBe("warcry");
    expect(catalogCost(decoded.data!.game,"lion")).toBe(3);expect(catalogCost(decoded.data!.game,"winddragon")).toBe(4);expect(validGame(decoded.data!.game)).toBe(true);
  });
  for(const entry of frozen.fixtures)
    it(`冻结旧${entry.version}翔龙完整回放`,async()=>{
      const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(entry.left,entry.right,oldVersion(entry.version)))));
      expect(Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")).toBe(entry.hash);
    });
});
