import { describe, it, expect } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { castSkill, advanceAirSkills, damage, type CombatContext } from "../src/engine/abilities";
import { advanceJungleLandings, jungleContains } from "../src/engine/jungle";
import { JUNGLE, skillDescription, skillName } from "../src/data/skills";
import { unitDefinition, unitSprite } from "../src/data/unit-stats";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { fighterSprite } from "../src/engine/summons";
import { compute } from "../src/compute/job";
import { JUNGLE_DEMO } from "../src/data/jungle-demo";
import { CURRENT_COMBAT_VERSION, type Fighter, type Piece } from "../src/engine/types";
import { createGame, buy, startRound, settle, resumeRound, nextRound } from "../src/engine/game";
import { claimReward } from "../src/engine/equipment";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { isRecruitable } from "../src/engine/rotation";
import { unitCost } from "../src/data/catalog";
import { COPIES, RULES, UNITS } from "../src/data/units";
import { jungleChargePose } from "../src/render/jungle";
import { REST_POSE } from "../src/render/melee";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { codexCards, codexFilters } from "../src/ui/unit-codex";
import frozen from "./fixtures/pre-v054-replays.json";

const piece = (defId: string, uid: number, star = 1, position: number | null = 35): Piece => ({ defId, uid, star, position });
const fighter = (defId: string, uid: number, star = 1, side: 0 | 1 = 0): Fighter =>
  Object.assign(army([piece(defId, uid, star)], side)[0], { x: 3, y: side ? 3 : 5, mana: 100, magicResist: 0 });
const context = (...fighters: Fighter[]): CombatContext => ({ fighters, tick: 0, events: [], effects: [] });
function release(c: CombatContext, source: Fighter, target: Fighter, at = 0) {
  c.tick = at;
  expect(castSkill(c, source, target)).toBe(true);
  expect(source.air?.cast?.kind).toBe("jungle");
  c.tick = at + JUNGLE.windup;
  expect(advanceAirSkills(c, source)).toBe(true);
}

describe("树妖丛林之怒", () => {
  for (const [star, raw, duration] of [[1, 100, 4], [2, 200, 6], [3, 300, 8]])
    it(`${star}星固定伤害${raw}，击飞1秒后再眩晕${duration / 4}秒`, () => {
      const s = fighter("treant", 1, star), t = fighter("guard", 2, 3, 1), c = context(s, t);
      release(c, s, t);
      expect(t.hp).toBe(t.maxHp - raw);
      expect(s.shield).toBe(0);
      expect(s.skillReadyAt).toBe(120);
      expect(t.knockup).toEqual({ start: 4, until: 8 });
      expect(t.stunUntil).toBe(8);
      c.tick = 7; advanceJungleLandings(c);
      expect(s.jungle!.landings).toBe(0);
      c.tick = 8; advanceJungleLandings(c);
      expect(t.stunUntil).toBe(8 + duration);
      expect(t.jungleLandings).toBeUndefined();
      expect(s.jungle).toEqual({ waves: 1, hits: 1, knockups: 1, landings: 1 });
      expect(c.effects.filter(e => e.kind === "stun").map(e => [e.name, e.amount]))
        .toEqual([["击飞", 1], ["落地眩晕", duration / 4]]);
    });
  it("圆形4格包含边界和斜向内点，排除方形角落，双方用同一几何", () => {
    expect(jungleContains({x:3,y:5},{x:7,y:5})).toBe(true);
    expect(jungleContains({x:3,y:5},{x:6,y:3})).toBe(true);
    expect(jungleContains({x:3,y:5},{x:6,y:2})).toBe(false);
    expect(jungleContains({x:3,y:5},{x:7.01,y:5})).toBe(false);
    const s=fighter("treant",1),a=fighter("guard",2,3,1),b=fighter("guard",3,3,1),
      ally=fighter("guard",4),c=context(s,a,b,ally);
    a.x=6;a.y=3;b.x=6;b.y=2;release(c,s,a);
    expect(a.hp).toBe(a.maxHp-100);expect(b.hp).toBe(b.maxHp);expect(ally.hp).toBe(ally.maxHp);
  });
  it("先选圆内可见敌人，避免曼哈顿最近敌人在圆外时漏放技能", () => {
    const tree=piece("treant",1,2,32);tree.items=["staff","crystal"];
    // Enemy deployment is rotated 180 degrees: these become (4,3) and (2,1).
    const battle=simulate([tree],[piece("arhat",101,1,35),piece("specialist",102,1,53)]);
    expect(battle.frames[0].fighters.filter(f=>f.side===1).map(f=>[f.x,f.y]))
      .toEqual([[4,3],[2,1]]);
    expect(battle.frames[1].fighters.find(f=>f.uid===1)?.air?.cast)
      .toMatchObject({kind:"jungle",target:102});
  });
  it("蓄力无瞬时伤害，敌人可离开，范围内新进入或隐蔽的敌人仍被波及", () => {
    const s=fighter("treant",1),a=fighter("guard",2,3,1),b=fighter("fish",3,3,1),c=context(s,a,b);
    b.x=7;b.y=0;expect(castSkill(c,s,a)).toBe(true);expect(c.events).toEqual([]);
    a.x=7.01;a.y=5;b.x=3;b.y=3;b.air!.phaseUntil=100;
    c.tick=4;advanceAirSkills(c,s);
    expect(a.hp).toBe(a.maxHp);expect(b.hp).toBe(b.maxHp-100);
    expect(s.jungle!.hits).toBe(1);
  });
  for (const reason of ["stun","silence","charm","death"])
    it(`${reason}打断蓄力，能量与冷却不退款`,()=>{
      const s=fighter("treant",1),t=fighter("guard",2,3,1),c=context(s,t);
      expect(castSkill(c,s,t)).toBe(true);
      if(reason==="stun")s.stunUntil=10;
      if(reason==="silence")s.silenceUntil=10;
      if(reason==="charm")s.charm={side:0,until:10,attack:s.attack};
      if(reason==="death")s.hp=0;
      c.tick=4;advanceAirSkills(c,s);
      expect(s.jungle!.waves).toBe(0);expect(c.events).toEqual([]);
      expect(s.mana).toBe(0);expect(s.skillReadyAt).toBe(120);
      expect(c.effects.some(e=>e.name==="施法中断")).toBe(true);
    });
  for(const reason of ["out-of-range","friendly","hidden","dead","cooldown"])
    it(`${reason}初始目标不能启动或扣能量`,()=>{
      const s=fighter("treant",1),t=fighter("guard",2,3,1),c=context(s,t);
      if(reason==="out-of-range")t.x=7;t.y=0;
      if(reason==="friendly")t.side=0;
      if(reason==="hidden")t.air!.phaseUntil=100;
      if(reason==="dead")t.hp=0;
      if(reason==="cooldown")s.skillReadyAt=120;
      expect(castSkill(c,s,t)).toBe(false);expect(s.mana).toBe(100);expect(c.effects).toEqual([]);
    });
  it("蓄力中肉身死亡进入不朽残魂也会中断，不在残魂阶段补发旧蓄力",()=>{
    const s=fighter("treant",1),t=fighter("guard",2,3,1),c=context(s,t);
    s.hp=1;s.immortal={duration:16,until:0,spent:false};expect(castSkill(c,s,t)).toBe(true);
    c.tick=1;damage(c,t,s,10,"true",true);
    expect(s.hp).toBe(1);expect(s.immortal.spent).toBe(true);expect(s.air?.cast).toBeUndefined();
    c.tick=4;advanceAirSkills(c,s);expect(s.jungle!.waves).toBe(0);
    expect(c.effects.some(e=>e.name==="施法中断")).toBe(true);
  });
  it("技能强度仅放大施法快照伤害，攻击增益不放大固定伤害或控制",()=>{
    const s=fighter("treant",1),t=fighter("guard",2,3,1),c=context(s,t);
    s.skillPower=1.5;s.attack=9999;expect(castSkill(c,s,t)).toBe(true);s.skillPower=10;
    c.tick=4;advanceAirSkills(c,s);expect(t.hp).toBe(t.maxHp-150);
    expect(t.jungleLandings![0].duration).toBe(4);
  });
  it("护盾被击中仍受控制，技能免伤、残魂和火种不被击飞",()=>{
    const s=fighter("treant",1),shielded=fighter("guard",2,3,1),immune=fighter("swordthrall",3,3,1),
      soul=fighter("vine",4,1,1),egg=fighter("phoenix",5,2,1),c=context(s,shielded,immune,soul,egg);
    shielded.shield=1000;shielded.shieldUntil=100;
    immune.bladeStorm={until:100,next:100,remaining:6,damage:100};
    soul.immortal={duration:16,until:100,spent:true};soul.hp=1;
    egg.phoenix={spent:true,eggUntil:100,bodyMaxHp:900,hatched:false};
    release(c,s,shielded);
    expect(shielded.hp).toBe(shielded.maxHp);expect(shielded.shield).toBe(900);
    expect(shielded.jungleLandings).toHaveLength(1);
    for(const t of [immune,soul,egg])expect(t.jungleLandings).toBeUndefined();
    expect(s.jungle).toMatchObject({hits:4,knockups:1});
  });
  it("释放后的范围波与落地阶段不因施法者被反伤击杀或变阵营而消失",()=>{
    const s=fighter("treant",1),a=fighter("guard",2,3,1),b=fighter("guard",3,3,1),c=context(s,a,b);
    s.hp=1;a.reflection=20;release(c,s,a);
    expect(s.hp).toBe(0);expect(a.hp).toBe(a.maxHp-100);expect(b.hp).toBe(b.maxHp-100);
    s.side=1;c.tick=8;advanceJungleLandings(c);
    expect(s.jungle!.landings).toBe(2);expect(a.stunUntil).toBe(12);expect(b.stunUntil).toBe(12);
  });
  it("灵鱼驱散解除击飞和待发生的落地眩晕，不在到点时重新控制",()=>{
    const s=fighter("treant",1),t=fighter("guard",2,3,1),fish=fighter("fish",3,1,1),c=context(s,t,fish);
    fish.y=0;release(c,s,t);expect(fish.jungleLandings).toBeUndefined();
    c.tick=5;expect(castSkill(c,fish,s)).toBe(true);
    expect(t.stunUntil).toBe(0);expect(t.knockup).toBeUndefined();expect(t.jungleLandings).toBeUndefined();
    c.tick=8;advanceJungleLandings(c);expect(t.stunUntil).toBe(0);expect(s.jungle!.landings).toBe(0);
  });
  for(const kind of ["death","immortal","egg"])
    it(`${kind}期间清除尚未落地的控制`,()=>{
      const s=fighter("treant",1),t=fighter(kind==="egg"?"phoenix":"guard",2,2,1),c=context(s,t);
      t.hp=101;if(kind==="immortal")t.immortal={duration:16,until:0,spent:false};
      release(c,s,t);expect(t.jungleLandings).toHaveLength(1);
      c.tick=5;damage(c,s,t,10,"true",true);
      c.tick=8;advanceJungleLandings(c);
      expect(t.jungleLandings).toBeUndefined();expect(s.jungle!.landings).toBe(0);
    });
  it("重叠击飞延后到实际落地，按最高结束时间合并眩晕，不丢失来源统计",()=>{
    const a=fighter("treant",1),b=fighter("treant",2,3),t=fighter("guard",3,3,1),c=context(a,b,t);
    release(c,a,t);release(c,b,t,2);
    c.tick=8;advanceJungleLandings(c);expect(a.jungle!.landings).toBe(0);
    c.tick=10;advanceJungleLandings(c);
    expect(t.stunUntil).toBe(18);expect(t.jungleLandings).toBeUndefined();
    expect(a.jungle!.landings).toBe(1);expect(b.jungle!.landings).toBe(1);
  });
  it("30秒冷却未结束不吞能量，结束后才可再次蓄力",()=>{
    const s=fighter("treant",1),t=fighter("guard",2,3,1),c=context(s,t);
    release(c,s,t);s.mana=100;c.tick=119;expect(castSkill(c,s,t)).toBe(false);expect(s.mana).toBe(100);
    c.tick=120;expect(castSkill(c,s,t)).toBe(true);
  });
  it("采用950生命、45攻击、5甲、1.7秒和每秒5回复，旧身板/技能/形象保留",()=>{
    expect(unitDefinition("treant")).toMatchObject({hp:950,attack:45,armor:5,interval:6.8,regeneration:5});
    expect(unitDefinition("treant","thunderstorm")).toMatchObject({hp:1550,attack:90,armor:7,interval:4,skill:"古木震荡"});
    const current=army([piece("treant",1) ],0)[0],old=army([piece("treant",1)],0,"thunderstorm")[0];
    expect(current.regeneration).toBe(1.25);expect(current.innateRegen).toBe(true);expect(old.regeneration).toBe(0);
    expect(unitSprite("treant")).toBe("treant-jungle");expect(fighterSprite(current)).toBe("treant-jungle");
    expect(unitSprite("treant","thunderstorm")).toBe("treant");expect(fighterSprite(old)).toBe("treant");
    expect(skillName("treant")).toBe("丛林之怒");expect(skillDescription("treant")).toContain("1/1.5/2秒");
    expect(skillDescription("treant","thunderstorm")).toContain("20% 的护盾");
    expect(pieceDetails(piece("treant",1))).toMatchObject({regeneration:5,magicResist:20});
    expect(pieceDetails(piece("treant",1),"thunderstorm").regeneration).toBe(0);
    const filters = { ...codexFilters };
    try {
      Object.assign(codexFilters, { availability:"all",cost:"all",trait:"all",range:"all",query:"树妖",star:1 });
      const card = codexCards({combatVersion:"jungle"});
      expect(card).toContain("生命 950 · 攻击 45");
      expect(card).toContain("法术减伤 20% · 自然回复 5 生命/秒");
      expect(card).toContain("treant-jungle.png");
      codexFilters.star = 3;
      expect(codexCards({combatVersion:"jungle"})).toContain("生命 3800 · 攻击 180");
      expect(codexCards({combatVersion:"jungle"})).toContain("自然回复 5 生命/秒");
      codexFilters.star = 1;
      const oldCard = codexCards({combatVersion:"thunderstorm"});
      expect(oldCard).toContain("生命 1550 · 攻击 90");
      expect(oldCard).toContain("古木震荡");
      expect(oldCard).not.toContain("自然回复");
    } finally {
      Object.assign(codexFilters, filters);
    }
    expect(jungleChargePose(1).scaleY).toBeLessThan(1);expect(jungleChargePose(1,true)).toEqual(REST_POSE);
  });
  it("完整、快速与Worker一致，零时刻分析没有未来范围波或落地统计",()=>{
    const {left,right}=JUNGLE_DEMO,b=simulate(left,right),o=simulateOutcome(left,right);
    expect(o).toMatchObject({winner:b.winner,damage:b.damage});expect(o.final.fighters).toEqual(b.frames.at(-1)!.fighters);
    expect(compute({kind:"replay",left,right,version:CURRENT_COMBAT_VERSION})).toMatchObject({battle:b});
    expect(analyzeBattle(b,0).sides.flatMap(s=>s.fighters).filter(f=>f.jungle).every(f=>f.jungle!.waves===0&&f.jungle!.landings===0)).toBe(true);
    expect(analyzeBattle(b).sides[0].fighters.some(f=>(f.jungle?.knockups??0)>0&&(f.jungle?.landings??0)>0)).toBe(true);
  });
  for(const entry of frozen.fixtures)
    it(`冻结0.53回放 ${entry.name}`,async()=>{
      const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(entry.left,entry.right,"thunderstorm"))));
      expect([...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("")).toBe(entry.hash);
    });
});

describe("丛林版本迁移与正常购买",()=>{
  for(const [schema,rules,version] of [[52,"singleplayer-0.53","thunderstorm"],[51,"singleplayer-0.52","gospel"]] as const)
    for(const mode of ["classic","rotation"] as const)
      for(const phase of ["prepare","battle","result","finished"] as const)
        it(`${rules} ${mode} ${phase}仅准备期升级，价格/资源/战报/装备/播放不重置`,()=>{
          const game=createGame(311,mode),p=game.players[0];
          for(const owner of game.players)owner.shop=[null,null,null,null,null];
          game.combatVersion=game.catalogVersion=version;
          game.pool=Object.fromEntries(UNITS.map(u=>[u.id,isRecruitable(game,u.id)?COPIES[unitCost(u.id,version)]:0]));
          p.shop[0]="treant";game.pool.treant--;expect(buy(game,p,0)).toBe(true);expect(p.gold).toBe(5);
          p.pieces[0].position=35;p.pieces[0].items=["aegis"];p.inventory=["crystal"];
          if(phase==="finished"){
            p.hp=1;p.pieces[0].position=null;p.shop[1]="acolyte";game.pool.acolyte--;
            expect(buy(game,p,1)).toBe(true);p.pieces.at(-1)!.position=35;
          }
          const result=phase==="prepare"?null:startRound(game)!;
          if(phase==="result"||phase==="finished")settle(game,result!);
          for(let i=0;i<30 && phase==="finished" && game.phase!=="finished";i++){
            if(game.reward)claimReward(game,0);nextRound(game);game.combatVersion=version;
            settle(game,startRound(game)!);
          }
          expect(game.phase).toBe(phase);expect(validGame(game)).toBe(true);
          const before=structuredClone(game),serialized=structuredClone(game);delete serialized.catalogVersion;
          const decoded=decodeSave(JSON.stringify({schema,rules,savedAt:1,revision:1,game:serialized,
            playback:{time:1.25,speed:2,paused:true}}));
          expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);
          expect(decoded.data!.game).toEqual({...before,combatVersion:phase==="prepare"?CURRENT_COMBAT_VERSION:version});
          expect(decoded.data!.playback).toEqual({time:1.25,speed:2,paused:true});
          if(phase==="battle")expect(resumeRound(decoded.data!.game)).toEqual(result);
          if(phase==="result"){
            const g=decoded.data!.game,history=structuredClone(g.history);
            if(g.reward)claimReward(g,0);const old=structuredClone(g.history);nextRound(g);
            expect(g.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(g.history).toEqual(old);
            expect(g.history[0].combatVersion).toBe(history[0].combatVersion);
          }
        });
});
