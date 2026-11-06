import {describe,expect,it} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,damage,interruptAirSkill,type CombatContext} from "../src/engine/abilities";
import {advanceThornBindAction,advanceThornBinds,thornBindPulseDamage} from "../src/engine/thornbind";
import {expireUndying} from "../src/engine/immortality";
import {enterPhoenixEgg} from "../src/engine/phoenix";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {compute} from "../src/compute/job";
import {THORNBIND,skillDescription,skillName} from "../src/data/skills";
import {THORNBIND_DEMO} from "../src/data/thornbind-demo";
import {unitDefinition} from "../src/data/unit-stats";
import {RULES,UNITS} from "../src/data/units";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type CombatVersion,type Piece} from "../src/engine/types";
import {createGame,nextRound} from "../src/engine/game";
import {pieceCopies,mergeCount} from "../src/engine/progression";
import {decodeSave,SAVE_SCHEMA,validGame} from "../src/engine/persistence";
import {skillReady} from "../src/engine/triggers";
import {abilityCredit} from "../src/engine/ai";
import {thornBindLabels,thornBindPose} from "../src/render/thornbind";
import {REST_POSE} from "../src/render/melee";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import frozen from "./fixtures/pre-v066-thornbind-replays.json";
import paid from "./fixtures/opening-ai-reserve.json";

const piece=(defId:string,uid:number,star=1):Piece=>({defId,uid,star,position:35});
function setup(star=1){
  const source=army([piece("vine",1,star)],0)[0],target=army([piece("guard",2)],1)[0];
  Object.assign(source,{x:3,y:4,mana:100,hp:100});Object.assign(target,{x:3,y:3,hp:10000,maxHp:10000,magicResist:0});
  const ctx:CombatContext={fighters:[source,target],tick:0,events:[],effects:[]};return {source,target,ctx};
}
function begin(s:ReturnType<typeof setup>){expect(castSkill(s.ctx,s.source,s.target)).toBe(true);return s;}
function run(s:ReturnType<typeof setup>,ticks:number){
  for(let i=0;i<ticks;i++){s.ctx.tick++;expireUndying(s.ctx);advanceThornBinds(s.ctx);for(const f of s.ctx.fighters)advanceThornBindAction(s.ctx,f);}
}
function version(name:string):CombatVersion{const v=COMBAT_VERSIONS.find(v=>v===name);if(!v)throw Error(name);return v;}

describe("分段藤蔓与真实汲取",()=>{
  for(const [star,total] of [[1,192],[2,384],[3,768]])it(`${star}星三段伤害和治疗在两个真实行动空隙之间结算`,()=>{
    const s=begin(setup(star));expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(240);
    expect(skillReady(s.source)).toBe(false);expect(advanceThornBindAction(s.ctx,s.source)).toBe(true);
    run(s,1);expect(s.target.hp).toBe(10000);run(s,1);expect(s.target.hp).toBe(10000-total/3);expect(s.target.stunUntil).toBe(4);
    run(s,2);expect(s.target.stunUntil).toBe(s.ctx.tick);expect(s.target.thornRoot).toBeUndefined();
    run(s,1);expect(s.target.stunUntil).toBe(7);run(s,2);expect(s.target.stunUntil).toBe(s.ctx.tick);
    run(s,1);expect(s.source.thornbind).toMatchObject({pulses:3,hits:3,roots:3,healing:total,retargets:0,interrupted:0});
    expect(s.source.hp).toBe(100+total);expect(s.target.hp).toBe(10000-total);expect(s.source.thornbind!.channel).toBeUndefined();
    expect(advanceThornBindAction(s.ctx,s.source)).toBe(true);run(s,1);expect(advanceThornBindAction(s.ctx,s.source)).toBe(false);
    expect(s.ctx.events.every(e=>e.skill&&!e.primary&&e.periodic&&e.damageType==="magic")).toBe(true);
  });

  it("段间能释放瞬发护盾与反制打断，不能把三段拼成连续硬控",()=>{
    const s=begin(setup());run(s,2);s.target.mana=100;run(s,2);
    expect(s.target.stunUntil).toBeLessThanOrEqual(s.ctx.tick);expect(castSkill(s.ctx,s.target,s.source)).toBe(true);
    expect(s.target.shield).toBeGreaterThan(0);const hp=s.target.hp;run(s,1);
    expect(s.target.hp).toBe(hp);expect(s.source.thornbind).toMatchObject({pulses:1,healing:64,interrupted:1});
    expect(s.source.thornbind!.channel).toBeUndefined();expect(s.target.thornRoot).toBeUndefined();
  });

  it("按累计预算分摊舍入，攻击和法强在起手冻结，目标魔抗逐段读取",()=>{
    for(const total of [191.5,192,384,576,768])expect([0,1,2].reduce((n,i)=>n+thornBindPulseDamage(total,i),0)).toBe(Math.round(total));
    const s=setup(2);s.source.skillPower=1.5;begin(s);s.source.attack=1;s.source.skillPower=10;
    run(s,2);s.target.magicResist=0.5;run(s,3);s.target.magicResist=0;run(s,3);
    expect(s.target.hp).toBe(9520);expect(s.source.thornbind!.healing).toBe(480);
  });

  it("破盾和溢出治疗不算汲取，过量伤害只按真实扣血回复",()=>{
    const s=begin(setup());s.target.shield=100;run(s,2);expect(s.source.hp).toBe(100);
    run(s,3);expect(s.source.hp).toBe(128);s.source.hp=s.source.maxHp-5;s.target.hp=10;run(s,3);
    expect(s.source.hp).toBe(s.source.maxHp);expect(s.source.thornbind).toMatchObject({pulses:3,hits:3,healing:33,roots:2});
    expect(s.target.hp).toBe(0);expect(s.ctx.events.at(-1)!.amount).toBe(10);
  });

  for(const reason of ["death","range","hidden","friendly"])it(`${reason}使剩余段数转向最近合法敌人，不重置预算`,()=>{
    const s=begin(setup());run(s,2);
    const next=army([piece("guard",3)],1)[0];Object.assign(next,{x:4,y:4,hp:10000,maxHp:10000,magicResist:0});s.ctx.fighters.push(next);
    if(reason==="death")s.target.hp=0;if(reason==="range")s.target.y=2;if(reason==="hidden")s.target.air!.phaseUntil=100;if(reason==="friendly")s.target.side=0;
    run(s,6);expect(next.hp).toBe(9872);expect(s.source.thornbind).toMatchObject({pulses:3,retargets:1,healing:192});
  });

  it("所有目标失效立即结束，记录一次目标丢失，后续不会补段",()=>{
    const s=begin(setup());run(s,2);s.target.y=0;run(s,10);
    expect(s.source.thornbind).toMatchObject({pulses:1,interrupted:0});expect(s.source.thornbind!.channel).toBeUndefined();
    expect(s.ctx.effects.filter(e=>e.name==="目标丢失")).toHaveLength(1);
  });

  for(const phase of ["startup","channel"])for(const kind of ["stun","silence","charm","death"])
    it(`${kind}打断${phase}只记录一次且不返还冷却`,()=>{
      const s=begin(setup());if(phase==="channel")run(s,2);const hp=s.target.hp,healing=s.source.thornbind!.healing;
      if(kind==="stun")s.source.stunUntil=100;if(kind==="silence")s.source.silenceUntil=100;
      if(kind==="death")s.source.hp=0;if(kind==="charm"){s.source.charm={side:0,until:100,attack:s.source.attack};s.source.side=1;}
      run(s,15);expect(s.target.hp).toBe(hp);expect(s.source.thornbind!.healing).toBe(healing);expect(s.source.thornbind!.interrupted).toBe(1);
      expect(s.source.thornbind!.channel).toBeUndefined();expect(s.source.skillReadyAt).toBe(240);
    });

  it("灵鱼驱散当前短束缚，下一段仍能再次生效",()=>{
    const s=begin(setup());run(s,2);const fish=army([piece("fish",3)],1)[0];Object.assign(fish,{x:4,y:3,mana:100});s.ctx.fighters.push(fish);
    expect(castSkill(s.ctx,fish,s.source)).toBe(true);expect(s.target.thornRoot).toBeUndefined();expect(s.target.stunUntil).toBe(0);
    run(s,3);expect(s.target.thornRoot).toEqual({source:1,until:7});expect(s.source.thornbind!.roots).toBe(2);
  });

  for(const kind of ["blade","soul"])it(`${kind}免伤不产生汲取或束缚`,()=>{
    const s=begin(setup());if(kind==="blade")s.target.bladeStorm={until:100,next:100,remaining:6,damage:1};
    else{s.target.hp=1;s.target.immortal={spent:true,until:100,duration:20};}
    const hp=s.target.hp;run(s,8);expect(s.target.hp).toBe(hp);expect(s.source.hp).toBe(100);expect(s.target.thornRoot).toBeUndefined();
    expect(s.source.thornbind).toMatchObject({pulses:3,hits:0,roots:0,healing:0});
  });

  it("涅槃火种可被汲取伤害但不被控制，击碎后不再补段",()=>{
    const s=setup(),bird=army([piece("phoenix",3,2)],1)[0];Object.assign(bird,{x:3,y:3,hp:0,magicResist:0});
    expect(enterPhoenixEgg(s.ctx,bird)).toBe(true);s.target=bird;s.ctx.fighters[1]=bird;bird.hp=100;begin(s);run(s,8);
    expect(bird.hp).toBe(0);expect(s.source.thornbind).toMatchObject({pulses:2,hits:2,roots:0,healing:100});
    expect(bird.wildfire!.brokenEggs).toBe(1);
  });

  it("反伤击杀施法者不靠本段汲取复活，后续段数取消",()=>{
    const s=begin(setup());s.source.hp=1;s.target.reflection=20;run(s,8);
    expect(s.source.hp).toBe(0);expect(s.target.hp).toBe(9936);expect(s.source.thornbind).toMatchObject({pulses:1,healing:0,interrupted:1});
  });

  it("残魂可以施法但不能回血，期限不会被治疗延长且到期终止维持",()=>{
    const s=setup();s.source.hp=1;s.source.immortal={spent:true,until:6,duration:16};begin(s);run(s,8);
    expect(s.source.hp).toBe(0);expect(s.source.thornbind).toMatchObject({pulses:2,healing:0,interrupted:1});
    expect(s.source.thornbind!.channel).toBeUndefined();expect(s.source.immortal!.until).toBe(6);
  });

  it("共享打断立即删除维持，60秒冷却从起手计算，状态标签和姿态只读",()=>{
    const s=begin(setup()),before=structuredClone(s.source);expect(thornBindPose(s.source,1)).not.toEqual(REST_POSE);
    expect(thornBindLabels(s.source,1).join()).toContain("余3段");expect(s.source).toEqual(before);
    interruptAirSkill(s.ctx,s.source);interruptAirSkill(s.ctx,s.source);expect(s.source.thornbind!.interrupted).toBe(1);
    s.source.mana=100;s.ctx.tick=239;expect(castSkill(s.ctx,s.source,s.target)).toBe(false);s.ctx.tick=240;begin(s);
    expect(s.source.skillReadyAt).toBe(480);
  });

  for(const reason of ["range","friendly","hidden","dead","stun","silence","cooldown"])
    it(`${reason}不开始新维持或消耗能量`,()=>{
      const s=setup();if(reason==="range")s.target.y=0;if(reason==="friendly")s.target.side=0;
      if(reason==="hidden")s.target.air!.phaseUntil=100;if(reason==="dead")s.source.hp=0;
      if(reason==="stun")s.source.stunUntil=100;if(reason==="silence")s.source.silenceUntil=100;if(reason==="cooldown")s.source.skillReadyAt=1;
      expect(castSkill(s.ctx,s.source,s.target)).toBe(false);expect(s.source.mana).toBe(100);expect(s.source.thornbind!.channel).toBeUndefined();
    });
});

describe("藤蔓接入与历史边界",()=>{
  it("38版藤妖/骨龙定义冻结，新局采用实测身板并修正骨龙2.2秒间隔",()=>{
    expect(frozen.definitions).toHaveLength(38);for(const e of frozen.definitions)for(const unit of e.units)expect(unitDefinition(unit.id,version(e.version))).toEqual(unit);
    for(const u of UNITS.filter(u=>!["vine","bonedragon"].includes(u.id)))expect(unitDefinition(u.id,"thornbind")).toEqual(unitDefinition(u.id,"boneblast"));
    expect(unitDefinition("vine")).toMatchObject({cost:2,hp:650,attack:120,armor:5,range:1,interval:6.8,initialMana:25});
    expect(unitDefinition("bonedragon").interval/4).toBe(2.2);expect(unitDefinition("bonedragon","boneblast").interval/4).toBe(1.2);
    expect(skillName("vine")).toBe("荆棘缠绕");expect(skillDescription("vine")).toContain("三段合计");expect(skillName("vine","boneblast")).toBe("枯藤缠身");
    expect(mergeCount([piece("eyebug",1),piece("spider",2)],"eyebug",1)).toBe(2);
    expect(abilityCredit({...piece("vine",1),items:["staff"]})).toBeGreaterThan(abilityCredit(piece("vine",1)));
    expect(abilityCredit(piece("vine",1))).toBeLessThanOrEqual(0.6);expect(THORNBIND.cooldown/4).toBe(60);
  });

  for(const e of frozen.fixtures)it(`${e.version}小回放含旧藤妖施法且SHA不变`,async()=>{
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(e.left,e.right,version(e.version)))));
    expect(Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")).toBe(e.hash);expect(e.vineCasts).toBeGreaterThan(0);
  });

  it("一个真实二对二演示可汲取，完整/快速/Worker一致，回看不泄露未来段数",()=>{
    const before=structuredClone(THORNBIND_DEMO),full=simulate(THORNBIND_DEMO.left,THORNBIND_DEMO.right);
    const quick=simulateOutcome(THORNBIND_DEMO.left,THORNBIND_DEMO.right),worker=compute({kind:"replay",...THORNBIND_DEMO,version:CURRENT_COMBAT_VERSION});
    expect(worker.kind).toBe("replay");if(worker.kind!=="replay")return;
    expect(worker.battle).toEqual(full);expect(quick.final.fighters).toEqual(full.frames.at(-1)!.fighters);expect(THORNBIND_DEMO).toEqual(before);
    const start=analyzeBattle(full,0).sides[0].fighters.find(f=>f.uid===101)!,end=analyzeBattle(full).sides[0].fighters.find(f=>f.uid===101)!;
    expect(start.thornbind!.pulses).toBe(0);expect(end.thornbind!.pulses).toBeGreaterThan(0);expect(end.thornbind!.healing).toBeGreaterThan(0);expect(end.thornbind).not.toHaveProperty("channel");
    expect(battleAnalysisMarkup(analyzeBattle(full),"healing","藤蔓",full.frames.length-1,full.frames.at(-1)!.tick)).toContain("汲取治疗");
    for(const frame of full.frames)for(const f of frame.fighters.filter(f=>f.thornbind?.channel||f.thornbind?.actedAt===frame.tick))
      expect(frame.events.filter(e=>e.attacker===f.uid&&!e.skill&&!e.reflected&&!e.periodic)).toHaveLength(0);
  });

  for(const phase of ["prepare","battle","result","finished"] as const)it(`0.65 ${phase}迁移保留经营状态，准备期才升级能力`,()=>{
    const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("Invalid reserve capture");const game=input;game.combatVersion="boneblast";game.phase=phase;
    if(phase==="result"||phase==="finished"){
      game.round--;game.players[0].hp=game.history.at(-1)!.hp;
      if(phase==="finished"){
        const p=game.players[0];for(const held of p.pieces)game.pool[held.defId]+=pieceCopies(held);for(const id of p.shop)if(id)game.pool[id]++;
        p.hp=0;p.eliminatedRound=game.round;p.pieces=[];p.shop=[];p.inventory=[];game.history.at(-1)!.hp=0;
      }
    }
    const before=structuredClone(game),playback={time:2,speed:2,paused:true};
    const decoded=decodeSave(JSON.stringify({schema:64,rules:"singleplayer-0.65",savedAt:1,revision:1,game,playback}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(decoded.data!.rules).toBe(RULES.version);
    expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});expect(decoded.data!.playback).toEqual(playback);
    if(phase==="result"){nextRound(decoded.data!.game);expect(decoded.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(decoded.data!.game.catalogVersion).toBe("secret-orb");}
  });

  it("缺少目录的0.65存档回填boneblast，原目录价格池保持",()=>{
    const game=createGame(1,"classic");game.combatVersion="boneblast";delete game.catalogVersion;
    const decoded=decodeSave(JSON.stringify({schema:64,rules:"singleplayer-0.65",savedAt:1,revision:1,game,playback:{time:0,speed:1,paused:false}}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.game.catalogVersion).toBe("boneblast");expect(validGame(decoded.data!.game)).toBe(true);
  });
});
