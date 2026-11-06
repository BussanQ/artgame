import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { advanceAirSkills, castSkill, type CombatContext } from "../src/engine/abilities";
import { advanceStormBolts, stormContact } from "../src/engine/thunderstorm";
import { THUNDERSTORM } from "../src/data/skills";
import { unitDefinition, unitSprite } from "../src/data/unit-stats";
import { unitCost } from "../src/data/catalog";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { compute } from "../src/compute/job";
import { THUNDERSTORM_DEMO } from "../src/data/thunderstorm-demo";
import { CURRENT_COMBAT_VERSION, type Fighter, type Piece } from "../src/engine/types";
import { createGame, buy, sell, startRound, settle, resumeRound, nextRound } from "../src/engine/game";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { claimReward } from "../src/engine/equipment";
import { COPIES, RULES, UNITS } from "../src/data/units";
import frozen from "./fixtures/pre-v053-replays.json";

const p=(defId:string,uid:number,star=1,position:number|null=59):Piece=>({defId,uid,star,position});
const f=(defId:string,uid:number,star=1,side:0|1=0):Fighter=>Object.assign(
  army([p(defId,uid,star)],side)[0],{x:3,y:5,mana:50,magicResist:0});
const context=(...fighters:Fighter[]):CombatContext=>({fighters,tick:0,events:[],effects:[]});
function launch(c:CombatContext,s:Fighter,target:Fighter) {
  s.x=3;s.y=7;s.mana=100;
  expect(castSkill(c,s,target)).toBe(true);
  c.tick=THUNDERSTORM.windup;
  expect(advanceAirSkills(c,s)).toBe(true);
  expect(s.storm!.launched).toBe(1);
}
function travel(c:CombatContext,ticks=16) {
  for(let i=0;i<ticks;i++){c.tick++;advanceStormBolts(c);}
}
describe("天师雷暴穿行与削能",()=>{
  for(const [star,raw,seconds] of [[1,150,5],[2,250,4],[3,350,3]])
    it(`${star}星伤害${raw}、冷却${seconds}秒，实际削能最多20`,()=>{
      const source=f("stormcaller",1,star),target=f("guard",2,1,1),c=context(source,target);
      target.maxHp=target.hp=10000;
      launch(c,source,target);
      expect(c.events).toEqual([]);
      expect(source.skillReadyAt).toBe(seconds*4);
      travel(c);
      expect(target.hp).toBe(10000-raw);
      expect(source.storm).toMatchObject({launched:1,hits:1,energyRemoved:20});
      expect(c.effects.filter(e=>e.kind==="drain")).toMatchObject([{amount:20}]);
    });
  it("扫掠检测包含半格宽边界，不跳过两帧之间的敌人",()=>{
    expect(stormContact({x:3,y:7},{x:3,y:3},{x:3.5,y:5})).not.toBeNull();
    expect(stormContact({x:3,y:7},{x:3,y:3},{x:3.51,y:5})).toBeNull();
    expect(stormContact({x:3,y:7},{x:3,y:3},{x:3,y:8})).toBeNull();
  });
  it("沿整条路径穿透，每球每单位仅一次；友军和圆外单位不受影响",()=>{
    const s=f("stormcaller",1),a=f("guard",2,1,1),b=f("guard",3,1,1),
      ally=f("guard",4),outside=f("guard",5,1,1),c=context(s,a,b,ally,outside);
    b.y=3;outside.x=4;outside.y=4;
    launch(c,s,a);travel(c);
    expect(c.events.map(e=>e.target)).toEqual([2,3]);
    expect(ally.hp).toBe(ally.maxHp);expect(outside.hp).toBe(outside.maxHp);
    expect(s.storm!.hits).toBe(2);
  });
  it("蓄力锁定方向而非追踪目标，移动可避开",()=>{
    const s=f("stormcaller",1),a=f("guard",2,1,1),c=context(s,a);
    s.x=3;s.y=7;s.mana=100;expect(castSkill(c,s,a)).toBe(true);
    a.x=6;c.tick=4;advanceAirSkills(c,s);travel(c);
    expect(c.events).toEqual([]);expect(s.storm!.hits).toBe(0);
  });
  for(const control of ["stun","silence","charm","death"])
    it(`${control}打断未发射蓄力，不退还已经消费的能量`,()=>{
      const s=f("stormcaller",1),a=f("guard",2,1,1),c=context(s,a);
      s.y=7;s.mana=100;expect(castSkill(c,s,a)).toBe(true);
      if(control==="stun")s.stunUntil=10;
      if(control==="silence")s.silenceUntil=10;
      if(control==="charm")s.charm={side:0,until:10,attack:s.attack};
      if(control==="death")s.hp=0;
      c.tick=4;advanceAirSkills(c,s);travel(c);
      expect(s.storm!.launched).toBe(0);expect(s.mana).toBe(0);
      expect(c.effects.some(e=>e.name==="施法中断")).toBe(true);
    });
  it("发射后天师死亡或改变阵营，已发射球保持原阵营继续穿行",()=>{
    const s=f("stormcaller",1),a=f("guard",2,1,1),c=context(s,a);
    launch(c,s,a);s.hp=0;s.side=1;travel(c);
    expect(a.hp).toBeLessThan(a.maxHp);expect(s.storm!.energyRemoved).toBe(20);
  });
  it("削能只扣实际存量，封能不免疫削能，不创造负能量或虚假统计",()=>{
    const s=f("stormcaller",1),a=f("guard",2,1,1),c=context(s,a);
    a.mana=7;a.manaLockUntil=100;launch(c,s,a);travel(c);
    expect(a.mana).toBe(0);expect(s.storm!.energyRemoved).toBe(7);
  });
  it("技能免伤和无能量目标不被削能，护盾吸收仍可削能",()=>{
    const s=f("stormcaller",1),a=f("swordthrall",2,1,1),b=f("guard",3,1,1),
      passive=f("thunderlord",4,1,1),c=context(s,a,b,passive);
    a.bladeStorm={until:100,next:100,remaining:6,damage:100};a.y=5;
    b.y=4;b.shield=500;b.shieldUntil=100;passive.y=3;
    launch(c,s,a);travel(c);
    expect(a.hp).toBe(a.maxHp);expect(a.mana).toBe(50);
    expect(b.hp).toBe(b.maxHp);expect(b.shield).toBeLessThan(500);
    expect(s.storm!.energyRemoved).toBe(20);
    expect(c.effects.filter(e=>e.kind==="drain").map(e=>e.target)).toEqual([3]);
  });
  it("伤害快照采用施法时法强，削能20不随法强放大",()=>{
    const s=f("stormcaller",1),a=f("guard",2,1,1),c=context(s,a);
    s.skillPower=1.5;launch(c,s,a);s.skillPower=10;travel(c);
    expect(a.hp).toBe(a.maxHp-225);expect(s.storm!.energyRemoved).toBe(20);
  });
  it("冷却尚未结束时保留能量，结束后可以再次蓄力",()=>{
    const s=f("stormcaller",1,3),a=f("guard",2,1,1),c=context(s,a);
    launch(c,s,a);s.mana=100;c.tick=11;
    expect(castSkill(c,s,a)).toBe(false);expect(s.mana).toBe(100);
    c.tick=12;expect(castSkill(c,s,a)).toBe(true);
  });
  for (const reason of ["out-of-range", "hidden", "friendly", "dead"])
    it(`初始目标${reason}时不扣能量、不开始冷却`,()=>{
      const s=f("stormcaller",1),a=f("guard",2,1,1),c=context(s,a);
      s.mana=100;
      if(reason==="out-of-range"){s.y=7;a.y=0;}
      if(reason==="hidden")a.air!.phaseUntil=10;
      if(reason==="friendly")a.side=0;
      if(reason==="dead")a.hp=0;
      expect(castSkill(c,s,a)).toBe(false);
      expect(s.mana).toBe(100);expect(s.skillReadyAt??0).toBe(0);
      expect(s.air!.cast).toBeUndefined();expect(c.effects).toEqual([]);
    });
  it("一费新目录、三费旧目录和版本化形象分开",()=>{
    expect(unitCost("stormcaller")).toBe(1);expect(unitCost("stormcaller","gospel")).toBe(3);
    expect(unitDefinition("stormcaller")).toMatchObject({hp:400,attack:40,armor:5,range:4,interval:4.4});
    expect(unitDefinition("stormcaller","gospel")).toMatchObject({hp:700,attack:65,range:3});
    expect(unitSprite("stormcaller")).toBe("stormcaller-thunderstorm");
    expect(unitSprite("stormcaller","gospel")).toBe("stormcaller");
  });
  it("完整、快速与Worker相同，零时刻分析不带未来统计",()=>{
    const {left,right}=THUNDERSTORM_DEMO,battle=simulate(left,right),outcome=simulateOutcome(left,right);
    expect(outcome.final.fighters).toEqual(battle.frames.at(-1)!.fighters);
    expect(outcome).toMatchObject({winner:battle.winner,damage:battle.damage});
    expect(compute({kind:"replay",left,right,version:CURRENT_COMBAT_VERSION})).toMatchObject({battle});
    const final=analyzeBattle(battle).sides[0].fighters.filter(f=>f.storm);
    expect(final.some(f=>f.storm!.hits>0 && f.storm!.energyRemoved>0)).toBe(true);
    expect(analyzeBattle(battle,0).sides[0].fighters.filter(f=>f.storm)
      .every(f=>f.storm!.launched===0 && f.storm!.energyRemoved===0)).toBe(true);
  });
  for(const entry of frozen.fixtures)
    it(`冻结0.52回放 ${entry.name}`,async()=>{
      const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(entry.left,entry.right,"gospel"))));
      expect([...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("")).toBe(entry.hash);
    });
});

describe("雷暴目录及两代四阶段存档迁移",()=>{
  it("新局天师45份，真实购买花1金，出售回收实际一份",()=>{
    const game=createGame(137,"classic"),player=game.players[0];
    // Return rolled offers before placing the deterministic shop fixture.
    for(const owner of game.players){
      for(const offer of owner.shop)if(offer)game.pool[offer]++;
      owner.shop=[null,null,null,null,null];
    }
    expect(game.pool.stormcaller).toBe(45);
    player.shop[0]="stormcaller";game.pool.stormcaller--;
    expect(validGame(game)).toBe(true);
    expect(buy(game,player,0)).toBe(true);
    expect(player.gold).toBe(9);expect(player.pieces[0].defId).toBe("stormcaller");
    expect(validGame(game)).toBe(true);
    expect(sell(game,player,player.pieces[0].uid)).toBe(true);
    expect(player.gold).toBe(10);expect(game.pool.stormcaller).toBe(45);
    expect(validGame(game)).toBe(true);
  });
  for(const [schema,rules,version] of [[51,"singleplayer-0.52","gospel"],[50,"singleplayer-0.51","lightning"]] as const)
    for(const phase of ["prepare","battle","result","finished"] as const)
      it(`${rules} ${phase}保持三费目录、资源与历史，仅准备期升级`,()=>{
        const game=createGame(137,"classic"),player=game.players[0];
        for(const p of game.players)p.shop=[null,null,null,null,null];
        game.combatVersion=game.catalogVersion=version;
        game.pool=Object.fromEntries(UNITS.map(u=>[u.id,COPIES[unitCost(u.id,version)]]));
        player.shop[0]="stormcaller";game.pool.stormcaller--;expect(buy(game,player,0)).toBe(true);
        expect(player.gold).toBe(7);player.pieces[0].position=51;
        if(phase==="finished"){
          // Keep the priced unit safely on the bench while a paid lone support loses round one.
          player.hp=1;player.pieces[0].position=null;
          player.shop[1]="acolyte";game.pool.acolyte--;
          expect(buy(game,player,1)).toBe(true);player.pieces.at(-1)!.position=35;
        }
        const result=phase==="prepare"?null:startRound(game)!;
        if(phase==="result"||phase==="finished")settle(game,result!);
        while(phase==="finished" && game.phase!=="finished"){
          if(game.reward)claimReward(game,0);
          nextRound(game);game.combatVersion=version;
          const next=startRound(game)!;settle(game,next);
        }
        expect(game.phase).toBe(phase);expect(validGame(game)).toBe(true);
        const before=structuredClone(game),serialized=structuredClone(game);delete serialized.catalogVersion;
        const decoded=decodeSave(JSON.stringify({schema,rules,savedAt:1,revision:1,game:serialized,
          playback:{time:1.25,speed:2,paused:true}}));
        expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
        expect(decoded.data!.rules).toBe(RULES.version);
        const restored=decoded.data!.game;
        expect(restored).toEqual({...before,combatVersion:phase==="prepare"?CURRENT_COMBAT_VERSION:version});
        expect(restored.catalogVersion).toBe(version);
        if(phase==="battle")expect(resumeRound(restored)!.battle).toEqual(result!.battle);
        if(phase==="prepare"){
          expect(army(restored.players[0].pieces,0,restored.combatVersion)[0].storm).toBeDefined();
          const gold=restored.players[0].gold;sell(restored,restored.players[0],restored.players[0].pieces[0].uid);
          expect(restored.players[0].gold-gold).toBe(3);
        }
        if(phase==="result"){
          if(restored.reward)claimReward(restored,0);nextRound(restored);
          expect(restored.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(restored.history[0].combatVersion).toBe(version);expect(validGame(restored)).toBe(true);
        }
      });
});
