import {describe,expect,it} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {advanceAirSkills,castSkill,interruptAirSkill,type CombatContext} from "../src/engine/abilities";
import {advanceBoneBlasts,boneBlastContains} from "../src/engine/boneblast";
import {expireUndying} from "../src/engine/immortality";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {compute} from "../src/compute/job";
import {BONEBLAST,skillDescription} from "../src/data/skills";
import {BONEBLAST_DEMO} from "../src/data/boneblast-demo";
import {unitDefinition,unitSprite} from "../src/data/unit-stats";
import {RULES,UNITS} from "../src/data/units";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type CombatVersion,type Piece} from "../src/engine/types";
import {createGame,nextRound} from "../src/engine/game";
import {pieceCopies} from "../src/engine/progression";
import {decodeSave,SAVE_SCHEMA,validGame} from "../src/engine/persistence";
import {fighterSprite} from "../src/engine/summons";
import {boneBlastLabels,boneBlastPose} from "../src/render/boneblast";
import {REST_POSE} from "../src/render/melee";
import frozen from "./fixtures/pre-v065-bonedragon-replays.json";
import paid from "./fixtures/opening-ai-reserve.json";

const piece=(defId:string,uid:number,star=1):Piece=>({defId,uid,star,position:51});
function setup(star=1){
  const source=army([piece("bonedragon",1,star)],0)[0],target=army([piece("guard",2)],1)[0];
  Object.assign(source,{x:3,y:6,mana:100});Object.assign(target,{x:3,y:3,hp:10000,maxHp:10000,magicResist:0});
  const ctx:CombatContext={fighters:[source,target],tick:0,events:[],effects:[]};return {source,target,ctx};
}
function begin(s:ReturnType<typeof setup>){expect(castSkill(s.ctx,s.source,s.target)).toBe(true);return s;}
function run(s:ReturnType<typeof setup>,ticks:number){
  for(let i=0;i<ticks;i++){
    s.ctx.tick++;expireUndying(s.ctx);advanceBoneBlasts(s.ctx);
    for(const f of s.ctx.fighters)advanceAirSkills(s.ctx,f);
  }
}
function version(name:string):CombatVersion{
  const v=COMBAT_VERSIONS.find(v=>v===name);if(!v)throw Error(name);return v;
}
function control(s:ReturnType<typeof setup>,kind:string){
  if(kind==="stun")s.source.stunUntil=100;
  if(kind==="silence")s.source.silenceUntil=100;
  if(kind==="death")s.source.hp=0;
  if(kind==="charm"){s.source.charm={side:0,until:100,attack:s.source.attack};s.source.side=1;}
}

describe("骨球的蓄力、飞行与落地",()=>{
  for(const [star,hurt] of [[1,284],[2,568],[3,1135]])
    it(`${star}星在蓄力与飞行结束后才结算一次范围伤害和一秒眩晕`,()=>{
      const s=begin(setup(star));expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(100);
      run(s,4);expect(s.source.boneblast!.launched).toBe(0);expect(s.target.hp).toBe(10000);
      run(s,1);expect(s.source.air!.cast).toBeUndefined();expect(s.source.boneblast!.orbs).toHaveLength(1);
      run(s,3);expect(s.target.hp).toBe(10000);run(s,1);
      expect(s.target.hp).toBe(10000-hurt);expect(s.target.stunUntil).toBe(13);
      expect(s.source.boneblast).toMatchObject({launched:1,detonated:1,hits:1,stuns:1,interrupted:0,orbs:[]});
      expect(s.ctx.events).toHaveLength(1);expect(s.ctx.events[0]).toMatchObject({skill:true,primary:false,damageType:"magic",amount:hurt});
      run(s,8);expect(s.target.hp).toBe(10000-hurt);
    });

  it("落点在起手时固定，目标移开或死亡不取消，进入者按圆形边界受击且不伤友军",()=>{
    const s=begin(setup());s.target.x=7;s.target.hp=0;
    const incoming=army([piece("ghostjet",3)],1)[0],edge=structuredClone(incoming),outside=structuredClone(incoming),ally=army([piece("guard",6)],0)[0];
    Object.assign(incoming,{x:3,y:3,hp:10000,maxHp:10000,magicResist:0});incoming.air!.phaseUntil=100;
    Object.assign(edge,{uid:4,x:4,y:3,hp:10000,maxHp:10000,magicResist:0});
    Object.assign(outside,{uid:5,x:4,y:4,hp:10000,maxHp:10000,magicResist:0});Object.assign(ally,{x:3,y:3});
    s.ctx.fighters.push(incoming,edge,outside,ally);run(s,9);
    expect([incoming.hp,edge.hp,outside.hp,ally.hp]).toEqual([9716,9716,10000,ally.maxHp]);
    expect(s.source.boneblast).toMatchObject({hits:2,stuns:2});
    expect(boneBlastContains({x:3,y:3},{x:3.6,y:3.8})).toBe(true);
    expect(boneBlastContains({x:3,y:3},{x:3.61,y:3.8})).toBe(false);
  });

  for(const kind of ["stun","silence","charm","death"])
    it(`${kind}能打断尚未发出的骨球，资源和冷却不返还且不重复记录`,()=>{
      const s=begin(setup());run(s,2);control(s,kind);run(s,12);
      expect(s.source.boneblast).toMatchObject({launched:0,detonated:0,interrupted:1});
      expect(s.source.air!.cast).toBeUndefined();expect(s.target.hp).toBe(10000);expect(s.source.skillReadyAt).toBe(100);
      expect(s.ctx.effects.filter(e=>e.source===1&&e.name==="施法中断")).toHaveLength(1);
    });

  for(const kind of ["stun","silence","charm","death"])
    it(`${kind}不撤销已经飞出的骨球，也不改变发射时阵营与伤害`,()=>{
      const s=begin(setup());run(s,5);control(s,kind);s.source.attack=1;s.source.skillPower=10;run(s,4);
      expect(s.target.hp).toBe(9716);expect(s.source.boneblast).toMatchObject({detonated:1,hits:1,interrupted:0});
    });

  it("落地读取当前魔抗和护盾，纯破盾计有效命中，免伤和残魂不受眩晕",()=>{
    const s=begin(setup());s.target.shield=200;s.target.magicResist=0.5;
    const immune=structuredClone(s.target),soul=structuredClone(s.target);
    Object.assign(immune,{uid:3,x:4,shield:0,bladeStorm:{until:100,next:100,remaining:6,damage:1}});
    Object.assign(soul,{uid:4,y:2,hp:1,shield:0,immortal:{spent:true,until:100,duration:20}});
    s.ctx.fighters.push(immune,soul);run(s,9);
    expect(s.target.hp).toBe(10000);expect(s.target.shield).toBe(58);expect(s.source.damage).toBe(0);
    expect(immune.hp).toBe(10000);expect(soul.hp).toBe(1);expect(immune.stunUntil).toBeLessThanOrEqual(9);expect(soul.stunUntil).toBeLessThanOrEqual(9);
    expect(s.source.boneblast).toMatchObject({hits:1,stuns:1});
  });

  it("反伤先击杀施法者仍结算同一骨球剩余敌人",()=>{
    const s=begin(setup()),back=structuredClone(s.target);back.uid=3;back.y=2;s.ctx.fighters.push(back);
    s.source.hp=1;s.target.reflection=20;run(s,9);
    expect(s.source.hp).toBe(0);expect([s.target.hp,back.hp]).toEqual([9716,9716]);
    expect(s.source.boneblast).toMatchObject({hits:2,stuns:2,detonated:1});
  });

  it("残魂到期清理未发出的骨球；已飞出的骨球独立落地",()=>{
    for(const launched of [false,true]){
      const s=begin(setup());if(launched)run(s,5);
      s.source.hp=1;s.source.immortal={spent:true,until:s.ctx.tick+1,duration:16};run(s,9-s.ctx.tick);
      expect(s.source.hp).toBe(0);expect(s.source.air!.cast).toBeUndefined();
      expect(s.source.boneblast).toMatchObject({launched:launched?1:0,detonated:launched?1:0,interrupted:launched?0:1});
      expect(s.target.hp).toBe(launched?9716:10000);
    }
  });

  for(const reason of ["range","friendly","hidden","dead","cooldown","stun","silence"])
    it(`${reason}不开始施法或消耗能量`,()=>{
      const s=setup();if(reason==="range")s.target.y=0;if(reason==="friendly")s.target.side=0;
      if(reason==="hidden")s.target.air!.phaseUntil=100;if(reason==="dead")s.target.hp=0;
      if(reason==="cooldown")s.source.skillReadyAt=1;if(reason==="stun")s.source.stunUntil=100;if(reason==="silence")s.source.silenceUntil=100;
      expect(castSkill(s.ctx,s.source,s.target)).toBe(false);expect(s.source.mana).toBe(100);expect(s.source.air!.cast).toBeUndefined();
    });

  it("共享打断立即生效，蓄力动作和标签只读",()=>{
    const s=begin(setup()),before=structuredClone(s.source);
    expect(boneBlastPose(s.source,2)).not.toEqual(REST_POSE);expect(boneBlastLabels(s.source,2).join()).toContain("骨爆冷却");
    expect(s.source).toEqual(before);interruptAirSkill(s.ctx,s.source);interruptAirSkill(s.ctx,s.source);run(s,10);
    expect(s.source.boneblast!.interrupted).toBe(1);expect(s.source.boneblast!.launched).toBe(0);
    expect(boneBlastPose(s.source,12)).toEqual(REST_POSE);
  });
});

describe("骨爆版本与真实引擎接入",()=>{
  it("37个旧定义冻结，其余单位保持，当前四费本体和图像路由一致",()=>{
    expect(frozen.definitions).toHaveLength(37);
    for(const entry of frozen.definitions)expect(unitDefinition("bonedragon",version(entry.version))).toEqual(entry.unit);
    for(const u of UNITS.filter(u=>u.id!=="bonedragon"))expect(unitDefinition(u.id,"boneblast")).toEqual(unitDefinition(u.id,"wildfire"));
    expect(unitDefinition("bonedragon","boneblast")).toMatchObject({cost:4,hp:950,attack:129,armor:5,range:4,interval:4.8,skill:"骨爆"});
    expect(unitSprite("bonedragon")).toBe("bonedragon-boneblast");expect(fighterSprite(setup().source)).toBe("bonedragon-boneblast");
    expect(unitSprite("bonedragon","wildfire")).toBe("bonedragon");expect(skillDescription("bonedragon")).toContain("25秒");
    expect(BONEBLAST.cooldown/4).toBe(25);
  });

  for(const entry of frozen.fixtures)
    it(`冻结${entry.version}旧小回放，包含旧施法与残魂`,async()=>{
      const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(entry.left,entry.right,version(entry.version)))));
      expect(Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")).toBe(entry.hash);
    });

  it("单个三对三演示实际产生骨球，完整、快速与Worker结果一致且不修改输入",()=>{
    const before=structuredClone(BONEBLAST_DEMO),full=simulate(BONEBLAST_DEMO.left,BONEBLAST_DEMO.right);
    const quick=simulateOutcome(BONEBLAST_DEMO.left,BONEBLAST_DEMO.right),worker=compute({kind:"replay",...BONEBLAST_DEMO,version:CURRENT_COMBAT_VERSION});
    expect(worker.kind).toBe("replay");if(worker.kind!=="replay")return;
    expect(worker.battle).toEqual(full);expect(quick.final.fighters).toEqual(full.frames.at(-1)!.fighters);expect(BONEBLAST_DEMO).toEqual(before);
    const final=full.frames.at(-1)!.fighters.find(f=>f.uid===101)!;
    expect(final.boneblast!.launched).toBeGreaterThan(0);expect(final.boneblast!.detonated).toBeGreaterThan(0);expect(final.boneblast!.hits).toBeGreaterThan(0);
    for(const frame of full.frames)for(const f of frame.fighters.filter(f=>f.air?.cast?.kind==="boneblast"))
      expect(frame.events.filter(e=>e.attacker===f.uid&&!e.skill&&!e.reflected&&!e.periodic)).toHaveLength(0);
    const start=analyzeBattle(full,0).sides[0].fighters.find(f=>f.uid===101)!,end=analyzeBattle(full).sides[0].fighters.find(f=>f.uid===101)!;
    expect(start.boneblast).toMatchObject({launched:0,detonated:0,hits:0,stuns:0,interrupted:0});
    expect(end.boneblast!.hits).toBeGreaterThan(0);expect(end.boneblast).not.toHaveProperty("orbs");
  });

  for(const phase of ["prepare","battle","result","finished"] as const)
    it(`0.64 ${phase}迁移保留资源、旧目录与播放进度，仅准备期升级`,()=>{
      const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("Invalid reserve capture");const game=input;
      game.combatVersion="wildfire";game.phase=phase;
      if(phase==="result"||phase==="finished"){
        game.round--;game.players[0].hp=game.history.at(-1)!.hp;
        if(phase==="finished"){
          const p=game.players[0];for(const held of p.pieces)game.pool[held.defId]+=pieceCopies(held);
          for(const id of p.shop)if(id)game.pool[id]++;
          p.hp=0;p.eliminatedRound=game.round;p.pieces=[];p.shop=[];p.inventory=[];game.history.at(-1)!.hp=0;
        }
      }
      const before=structuredClone(game),playback={time:3.5,speed:2,paused:true};
      const decoded=decodeSave(JSON.stringify({schema:63,rules:"singleplayer-0.64",savedAt:1,revision:1,game,playback}));
      expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(decoded.data!.rules).toBe(RULES.version);
      expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});
      expect(decoded.data!.game.catalogVersion).toBe("secret-orb");expect(decoded.data!.playback).toEqual(playback);
      if(phase==="result"){nextRound(decoded.data!.game);expect(decoded.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);}
    });

  it("缺少目录的0.64存档回填wildfire而不改用新版目录",()=>{
    const game=createGame(1,"classic");game.combatVersion="wildfire";delete game.catalogVersion;
    const decoded=decodeSave(JSON.stringify({schema:63,rules:"singleplayer-0.64",savedAt:1,revision:1,game,playback:{time:0,speed:1,paused:false}}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.game.catalogVersion).toBe("wildfire");expect(validGame(decoded.data!.game)).toBe(true);
  });
});
