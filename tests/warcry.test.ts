import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { advanceAirSkills, castSkill, damage, type CombatContext } from "../src/engine/abilities";
import { expireWarcry, petrified, warcryContains } from "../src/engine/warcry";
import { WARCRY, skillDescription, skillName, skillRole } from "../src/data/skills";
import { WARCRY_DEMO } from "../src/data/warcry-demo";
import { catalogCost, catalogUnit } from "../src/data/catalog";
import { unitDefinition, unitSprite } from "../src/data/unit-stats";
import { UNITS, COPIES, RULES } from "../src/data/units";
import { traitTiers } from "../src/data/traits";
import { COMBAT_VERSIONS, CURRENT_COMBAT_VERSION, type Fighter, type Piece } from "../src/engine/types";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { buy, createGame, nextRound, sell } from "../src/engine/game";
import { mergeCount, pieceCopies } from "../src/engine/progression";
import { abilityCredit, pieceStrength } from "../src/engine/ai";
import { warcryLabels, warcryPose, warcryTarget } from "../src/render/warcry";
import { compactBattleLabels } from "../src/render/battle-inspection";
import { isMelee, REST_POSE } from "../src/render/melee";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import frozen from "./fixtures/pre-v062-lion-replays.json";
import paid from "./fixtures/opening-ai-reserve.json";

const piece=(defId:string,uid:number,star=1):Piece=>({defId,uid,star,position:35});
function setup(star=1) {
  const source=army([piece("lion",1,star)],0)[0], target=army([piece("guard",2)],1)[0];
  Object.assign(source,{x:3,y:6,mana:100});
  Object.assign(target,{x:3,y:5,hp:10000,maxHp:10000,magicResist:0});
  const ctx:CombatContext={fighters:[source,target],tick:0,events:[],effects:[]};
  return {source,target,ctx};
}
function begin(state:ReturnType<typeof setup>){expect(castSkill(state.ctx,state.source,state.target)).toBe(true);return state;}
function run(state:ReturnType<typeof setup>,ticks=2){
  for(let i=0;i<ticks;i++){state.ctx.tick++;expireWarcry(state.ctx);advanceAirSkills(state.ctx,state.source);}
}
function released(star=1){const state=begin(setup(star));run(state);return state;}
function oldVersion(name:string){const v=COMBAT_VERSIONS.find(v=>v===name);if(!v)throw Error(name);return v;}

describe("狂狮战吼",()=>{
  for(const [star,hurt,control,reflect] of [[1,30,12,10],[2,50,14,20],[3,80,16,30]])
    it(`${star}星${hurt}法伤、${control/4}秒石化、20秒个人${reflect}真实反伤`,()=>{
      const {source,target,ctx}=released(star);
      expect(target.hp).toBe(10000-hurt);expect(target.stunUntil).toBe(2+control);expect(target.petrifyUntil).toBe(2+control);
      expect(source.warcry).toMatchObject({roars:1,petrified:1,until:82,reflection:reflect,retaliations:0});
      expect(source.skillReadyAt).toBe(120);expect(source.mana).toBe(0);expect(source.shield).toBe(0);expect(source.hasteUntil).toBe(0);
      damage(ctx,target,source,1,"true");expect(target.hp).toBe(10000-hurt-reflect);
      expect(source.warcry!.retaliations).toBe(1);expect(source.warcry!.retaliationDamage).toBe(reflect);
      ctx.tick=2+control-1;expect(petrified(target,ctx.tick)).toBe(true);
      ctx.tick=2+control;expireWarcry(ctx);expect(petrified(target,ctx.tick)).toBe(false);expect(target.petrifyUntil).toBeUndefined();
      ctx.tick=82;expireWarcry(ctx);damage(ctx,target,source,1,"true");expect(source.warcry!.retaliations).toBe(1);
    });

  it("扇形含3格圆周和120度边界，不覆盖侧后方，也不接受零方向",()=>{
    const from={x:3,y:6},to={x:3,y:5};
    expect(warcryContains(from,to,{x:3,y:3})).toBe(true);
    expect(warcryContains(from,to,{x:3,y:2.999})).toBe(false);
    expect(warcryContains(from,to,{x:3+Math.sqrt(3),y:5})).toBe(true);
    expect(warcryContains(from,to,{x:3+Math.sqrt(3)+0.001,y:5})).toBe(false);
    expect(warcryContains(from,to,{x:5,y:6})).toBe(false);
    expect(warcryContains(from,to,{x:3,y:7})).toBe(false);expect(warcryContains(from,from,to)).toBe(false);
  });

  it("0.5秒起手锁方向，不追踪移动的目标；扇形可波及隐蔽飞行敌军而不打友军",()=>{
    const state=setup(),hidden=army([piece("ghostjet",3)],1)[0],ally=army([piece("guard",4)],0)[0];
    Object.assign(hidden,{x:4,y:4,hp:10000,maxHp:10000,magicResist:0});hidden.air!.phaseUntil=100;
    Object.assign(ally,{x:3,y:4});state.ctx.fighters.push(hidden,ally);begin(state);
    state.target.x=7;state.target.y=6;run(state,1);expect(hidden.hp).toBe(10000);run(state,1);
    expect(state.target.hp).toBe(10000);expect(hidden.hp).toBe(9970);expect(petrified(hidden,2)).toBe(true);
    expect(ally.hp).toBe(ally.maxHp);expect(ally.petrifyUntil).toBeUndefined();expect(state.source.warcry!.petrified).toBe(1);
  });

  for(const kind of ["stun","silence","charm","death"])
    it(`${kind}打断蓄吼，不退款、不赋予石化和反伤`,()=>{
      const state=begin(setup());
      if(kind==="stun")state.source.stunUntil=100;if(kind==="silence")state.source.silenceUntil=100;
      if(kind==="charm"){state.source.charm={side:0,until:100,attack:state.source.attack};state.source.side=1;}
      if(kind==="death")state.source.hp=0;run(state);
      expect(state.source.air!.cast).toBeUndefined();expect(state.source.warcry).toMatchObject({roars:0,until:0,retaliations:0});
      expect(state.source.mana).toBe(0);expect(state.source.skillReadyAt).toBe(120);expect(state.target.hp).toBe(10000);
      expect(state.ctx.effects.some(e=>e.name==="施法中断")).toBe(true);
    });

  it("狂舞免控、残魂、火种不被石化；技能伤害仍按各自免伤结算",()=>{
    const state=setup(),immune=state.target,soul=army([piece("guard",3)],1)[0],egg=army([piece("phoenix",4,2)],1)[0];
    immune.bladeStorm={until:100,next:100,remaining:6,damage:100};
    Object.assign(soul,{x:4,y:4,hp:1,immortal:{spent:true,until:100,duration:20}});
    Object.assign(egg,{x:2,y:4,hp:1000,maxHp:1000,magicResist:0});egg.phoenix!.spent=true;egg.phoenix!.eggUntil=100;
    state.ctx.fighters.push(soul,egg);begin(state);run(state);
    for(const f of [immune,soul,egg])expect(f.petrifyUntil).toBeUndefined();
    expect(immune.hp).toBe(10000);expect(soul.hp).toBe(1);expect(egg.hp).toBe(970);expect(state.source.warcry!.petrified).toBe(0);
  });

  it("石化打断正在施法的单位，保留更长控制；驱散眩晕立即清除石化显示",()=>{
    const state=setup(),cleanser=army([piece("fish",3)],1)[0];state.target.stunUntil=40;
    // The actual cleanse ability, safely behind the locked cone, can free its ally.
    Object.assign(cleanser,{x:3,y:7,mana:100});state.ctx.fighters.push(cleanser);
    state.target.air!.cast={kind:"medic",next:30,remaining:1,damage:1,from:{x:3,y:5},to:{x:3,y:5}};
    begin(state);run(state);expect(state.target.air!.cast).toBeUndefined();expect(state.target.stunUntil).toBe(40);
    expect(compactBattleLabels(state.target,13)).toContain("石化");
    expect(compactBattleLabels(state.target,14)).toContain("眩晕");
    state.ctx.tick=3;expect(castSkill(state.ctx,cleanser,state.source)).toBe(true);
    expect(state.target.stunUntil).toBe(0);expect(compactBattleLabels(state.target,3)).not.toContain("石化");
    expireWarcry(state.ctx);expect(state.target.petrifyUntil).toBeUndefined();
  });

  it("新一次较短石化不缩短已有石化；法伤被护盾吸收仍会施加控制",()=>{
    const state=setup();state.target.petrifyUntil=30;state.target.stunUntil=30;state.target.shield=100;
    begin(state);run(state);expect(state.target.hp).toBe(10000);expect(state.target.shield).toBe(70);
    expect(state.target.petrifyUntil).toBe(30);expect(state.target.stunUntil).toBe(30);
  });

  it("法强只放大起手冻结的咆哮伤害，不放大石化、反伤或持续时间",()=>{
    const state=setup(2);state.source.skillPower=2;begin(state);state.source.skillPower=10;state.source.attack=100000;run(state);
    expect(state.target.hp).toBe(9900);expect(state.target.stunUntil).toBe(16);expect(state.source.warcry!.until).toBe(82);
    damage(state.ctx,state.target,state.source,1,"true");expect(state.source.warcry!.retaliationDamage).toBe(20);
  });

  it("个人反伤无视攻击者护甲和魔抗；破盾也触发并分别记录反伤生命/破盾",()=>{
    const {source,target,ctx}=released(2);source.shield=100;target.shield=15;target.armor=10000;target.magicResist=0.99;
    damage(ctx,target,source,10,"true");expect(source.hp).toBe(source.maxHp);expect(source.shield).toBe(90);
    expect(target.hp).toBe(9945);expect(target.shield).toBe(0);
    expect(source.warcry).toMatchObject({retaliations:1,retaliationDamage:5,retaliationShield:15});
  });

  it("同一击分别触发灵能和个人反伤；灵能先击杀来源时不多记个人触发",()=>{
    const {source,target,ctx}=released(2);source.reflection=20;
    damage(ctx,target,source,1,"true");expect(target.hp).toBe(9910);
    expect(ctx.events.filter(e=>e.reflected).map(e=>e.amount)).toEqual([20,20]);expect(source.warcry!.retaliationDamage).toBe(20);
    target.hp=10;damage(ctx,target,source,1,"true");expect(target.hp).toBe(0);expect(source.warcry!.retaliations).toBe(1);
  });

  it("双方均有个人与灵能反伤时，反伤包不会再次反弹",()=>{
    const {source,target,ctx}=released();target.warcry=structuredClone(source.warcry);source.reflection=20;target.reflection=20;
    damage(ctx,target,source,1,"true");expect(ctx.events.filter(e=>e.reflected)).toHaveLength(2);
    expect(target.warcry!.retaliations).toBe(0);expect(source.warcry!.retaliations).toBe(1);
  });

  it("普攻、技能与存活来源的持续伤害均能触发；眩晕和沉默不会关闭已释放反伤",()=>{
    const {source,target,ctx}=released();source.stunUntil=100;source.silenceUntil=100;
    damage(ctx,target,source,1,"true");damage(ctx,target,source,1,"magic",true);
    damage(ctx,target,source,1,"magic",true,false,0,false,false,true);
    expect(source.warcry!.retaliations).toBe(3);expect(source.warcry!.retaliationDamage).toBe(30);
  });

  it("真实反伤仍受攻击者的技能免伤阻挡，触发次数不冒充有效伤害",()=>{
    const {source,target,ctx}=released();target.bladeStorm={until:100,next:100,remaining:6,damage:1};
    damage(ctx,target,source,1,"true");expect(source.warcry).toMatchObject({retaliations:1,retaliationDamage:0,retaliationShield:0});
    expect(ctx.events.at(-1)).toMatchObject({reflected:true,immune:true,amount:0});
  });

  it("闪避或免伤不触发个人反伤",()=>{
    const {source,target,ctx}=released();source.air!.flying=true;source.air!.evasion=1;
    damage(ctx,target,source,100);expect(ctx.events.at(-1)!.evaded).toBe(true);
    source.air!.flying=false;source.bladeStorm={until:100,next:100,remaining:6,damage:1};
    damage(ctx,target,source,100,"magic",true);expect(source.warcry!.retaliations).toBe(0);
  });

  it("普通致死一击可反伤；残魂或火种状态不会继续个人反伤",()=>{
    const state=released();state.source.hp=1;damage(state.ctx,state.target,state.source,2,"true");
    expect(state.source.hp).toBe(0);expect(state.source.warcry!.retaliations).toBe(1);
    for(const kind of ["soul","egg"]){
      const s=released();s.source.hp=1;
      if(kind==="soul")s.source.immortal={spent:false,until:0,duration:20};
      else s.source.phoenix={spent:false,eggUntil:0,bodyMaxHp:s.source.maxHp,hatched:false};
      s.source.star=2;damage(s.ctx,s.target,s.source,2,"true");expect(s.source.warcry!.retaliations).toBe(0);
    }
  });

  it("无法反伤已阵亡的在途伤害来源，同阵营来源也不触发",()=>{
    const {source,target,ctx}=released();target.hp=0;
    damage(ctx,target,source,1,"magic",true,false,0,false,false,true);
    target.hp=100;target.side=source.side;damage(ctx,target,source,1,"true");expect(source.warcry!.retaliations).toBe(0);
    target.side=1;source.side=1;damage(ctx,target,source,1,"true");expect(source.warcry!.retaliations).toBe(0);
  });

  it("咆哮被第一名敌人的灵能反伤击杀时，剩余扇形仍结算，但狂狮不获得反伤",()=>{
    const state=setup(),other=structuredClone(state.target);other.uid=3;other.x=4;other.y=4;
    state.source.hp=1;state.target.reflection=20;state.ctx.fighters.push(other);begin(state);run(state);
    expect(state.source.hp).toBe(0);expect(state.source.warcry).toMatchObject({roars:1,petrified:2,until:0});
    expect(other.hp).toBe(9970);expect(petrified(other,2)).toBe(true);expect(state.source.air!.cast).toBeUndefined();
  });

  it("射程外、隐藏、友军、死亡、重合、沉默或冷却时不花能量",()=>{
    for(const reason of ["range","hidden","friendly","dead","coincident","silence","cooldown"]){
      const {source,target,ctx}=setup();if(reason==="range")target.y=4;if(reason==="hidden")target.air!.phaseUntil=100;
      if(reason==="friendly")target.side=0;if(reason==="dead")target.hp=0;if(reason==="coincident")target.y=6;
      if(reason==="silence")source.silenceUntil=100;if(reason==="cooldown")source.skillReadyAt=1;
      expect(castSkill(ctx,source,target)).toBe(false);expect(source.mana).toBe(100);expect(source.warcry!.roars).toBe(0);
    }
  });

  it("30秒冷却按起手计算，结束后第二次独立施法",()=>{
    const state=released();state.source.mana=100;state.ctx.tick=119;
    expect(castSkill(state.ctx,state.source,state.target)).toBe(false);expect(state.source.mana).toBe(100);
    state.ctx.tick=120;begin(state);run(state);expect(state.target.hp).toBe(9940);expect(state.source.warcry!.roars).toBe(2);
  });

  it("新本体与说明、现有狮子形象和跃身爪击保持一致，旧能力仍可查询",()=>{
    expect(unitDefinition("lion")).toMatchObject({cost:3,hp:700,attack:49.5,armor:10,range:1,interval:6,skill:"战吼"});
    expect(pieceDetails(piece("lion",1))).toMatchObject({hp:700,attack:49.5,range:1,interval:1.5,skill:"战吼",action:"跃身爪击"});
    expect(pieceDetails(piece("lion",1),"terminator")).toMatchObject({hp:950,attack:52,interval:0.75,skill:"怒吼"});
    expect(skillName("lion")).toBe("战吼");expect(skillRole("lion")).toContain("石化");expect(skillDescription("lion")).toContain("20秒");
    expect(skillDescription("lion","terminator")).toContain("护盾");expect(isMelee("lion")).toBe(true);expect(unitSprite("lion")).toBe("lion");
  });

  it("蓄吼和释放姿态独立于爪击，时间片标签/战报只读，不显示未来反伤",()=>{
    const state=begin(setup()),before=structuredClone(state.source);
    expect(warcryPose(state.source,1)).not.toEqual(REST_POSE);expect(warcryTarget(state.source,1)).toEqual({x:3,y:5});
    expect(compactBattleLabels(state.source,1)).toContain("战吼蓄力");expect(warcryLabels(state.source,1).join()).toContain("战吼冷却");
    expect(state.source).toEqual(before);run(state);expect(warcryPose(state.source,2)).not.toEqual(REST_POSE);
    expect(warcryTarget(state.source,5)).toBeUndefined();expect(warcryPose(state.source,5)).toEqual(REST_POSE);
    const base=piece("lion",1),staff={...base,items:["staff"]};expect(abilityCredit(staff)).toBeGreaterThan(abilityCredit(base));
    expect(abilityCredit(staff)).toBeLessThanOrEqual(0.6);expect(pieceStrength(piece("lion",1,2))).toBeGreaterThan(pieceStrength(staff));
  });

  it("同一六对六完整/快速结算相同，石化实际禁止普攻与移动，起手也不能普攻和移动",()=>{
    const input=structuredClone(WARCRY_DEMO),full=simulate(input.left,input.right),quick=simulateOutcome(input.left,input.right);
    expect(input).toEqual(WARCRY_DEMO);expect(quick.final.fighters).toEqual(full.frames.at(-1)!.fighters);expect(quick.winner).toBe(full.winner);
    const report=analyzeBattle(full),lion=report.sides[0].fighters.find(f=>f.defId==="lion")!;
    expect(lion.warcry!.roars).toBeGreaterThan(0);expect(lion.warcry!.petrified).toBeGreaterThan(0);expect(lion.warcry!.retaliations).toBeGreaterThan(0);
    expect(lion.reflectedDamage).toBe(lion.warcry!.retaliationDamage);
    expect(analyzeBattle(full,0).sides[0].fighters.find(f=>f.defId==="lion")!.warcry).toMatchObject({roars:0,retaliations:0});
    expect(battleAnalysisMarkup(report,"damage","战吼",full.frames.length-1,full.frames.at(-1)!.tick)).toContain("反伤触发");
    let previous:Fighter[]=[];
    for(const frame of full.frames){
      for(const f of frame.fighters){const p=previous.find(p=>p.uid===f.uid);
        if(p && ((petrified(p,frame.tick-1)&&petrified(f,frame.tick)) || (p.air?.cast?.kind==="warcry"&&f.air?.cast?.kind==="warcry"))){
          expect([f.x,f.y]).toEqual([p.x,p.y]);expect(frame.events.filter(e=>e.attacker===f.uid&&!e.skill&&!e.reflected&&!e.periodic)).toHaveLength(0);
        }
      }previous=frame.fighters;
    }
  });
});

describe("战吼版本、经营与存档",()=>{
  it("此前34版本狂狮定义冻结，其他单位、连携、异虫双合及既有能力继承",()=>{
    for(const entry of frozen.definitions)expect(unitDefinition("lion",oldVersion(entry.version))).toEqual(entry.unit);
    // Freeze the 0.62 introduction boundary; subsequent abilities may change other units.
    for(const u of UNITS.filter(u=>u.id!=="lion"))expect(unitDefinition(u.id,"warcry")).toEqual(unitDefinition(u.id,"terminator"));
    expect(traitTiers(CURRENT_COMBAT_VERSION)).toEqual(traitTiers("terminator"));
    const party=["titan","ark","master","panda","monk","stormcaller","acolyte","thunderlord"].map((id,i)=>({...piece(id,i+1),position:32+i}));
    expect(army(party,0)).toEqual(army(party,0,"terminator"));expect(mergeCount([piece("eyebug",1),piece("spider",2)],"eyebug",1)).toBe(2);
  });
  for(const version of ["terminator","warcry"] as const)
    it(`${version}目录的二/三费及30/25份卡池在真实购买和出售中守恒`,()=>{
      const game=createGame(1,"classic"),p=game.players[0],price=version==="warcry"?3:2;
      game.catalogVersion=version;game.pool.lion=COPIES[price];game.pool.phoenix=COPIES[4];p.level=5;
      expect(game.pool.lion).toBe(version==="warcry"?25:30);expect(catalogCost(game,"lion")).toBe(price);
      expect(catalogUnit(game,"lion")).toMatchObject({cost:price,hp:700,skill:"战吼"});
      game.pool[p.shop[0]!]++;p.shop[0]="lion";game.pool.lion--;
      expect(validGame(game)).toBe(true);const gold=p.gold;expect(buy(game,p,0)).toBe(true);expect(p.gold).toBe(gold-price);
      expect(sell(game,p,p.pieces[0].uid)).toBe(true);expect(p.gold).toBe(gold);expect(game.pool.lion).toBe(COPIES[price]);expect(validGame(game)).toBe(true);
    });
  for(const phase of ["prepare","battle","result","finished"] as const)
    it(`0.61 ${phase}迁移只升级准备阶段能力，资源、历史、价格和回放不变`,()=>{
      const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("Invalid reserve capture");const game=input;
      game.combatVersion="terminator";game.phase=phase;
      if(phase==="result"||phase==="finished"){
        game.round--;game.players[0].hp=game.history.at(-1)!.hp;
        if(phase==="finished"){
          const p=game.players[0];for(const held of p.pieces)game.pool[held.defId]+=pieceCopies(held);for(const id of p.shop)if(id)game.pool[id]++;
          p.hp=0;p.eliminatedRound=game.round;p.pieces=[];p.shop=[];p.inventory=[];game.history.at(-1)!.hp=0;
        }
      }
      expect(validGame(game)).toBe(true);const before=structuredClone(game),playback={time:3.5,speed:2,paused:true};
      const decoded=decodeSave(JSON.stringify({schema:60,rules:"singleplayer-0.61",savedAt:1,revision:1,game,playback}));
      expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(decoded.data!.rules).toBe(RULES.version);
      expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});
      expect(decoded.data!.game.catalogVersion).toBe("secret-orb");expect(decoded.data!.playback).toEqual(playback);
      if(phase==="result"){nextRound(decoded.data!.game);expect(decoded.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(decoded.data!.game.catalogVersion).toBe("secret-orb");}
    });
  it("缺失目录字段的0.61存档回填旧目录，避免狂狮池容量从30误减到25",()=>{
    const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("Invalid reserve capture");
    const game=input;delete game.catalogVersion;game.combatVersion="terminator";
    const decoded=decodeSave(JSON.stringify({schema:60,rules:"singleplayer-0.61",savedAt:1,revision:1,game,playback:{time:0,speed:1,paused:false}}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.game.catalogVersion).toBe("terminator");
    expect(catalogCost(decoded.data!.game,"lion")).toBe(2);expect(validGame(decoded.data!.game)).toBe(true);
  });
  for(const entry of frozen.fixtures)
    it(`冻结旧${entry.version}狂狮完整回放`,async()=>{
      const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(entry.left,entry.right,oldVersion(entry.version)))));
      expect(Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")).toBe(entry.hash);
    });
});
