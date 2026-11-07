import { describe, expect, it } from "vitest";
import { army, simulate, simulateOutcome } from "../src/engine/battle";
import { advanceAirSkills, castSkill, type CombatContext } from "../src/engine/abilities";
import { advanceTerminatorMissiles, terminatorContains } from "../src/engine/terminator";
import { TERMINATOR, skillDescription, skillName } from "../src/data/skills";
import { TERMINATOR_DEMO } from "../src/data/terminator-demo";
import { unitDefinition, unitSprite } from "../src/data/unit-stats";
import { UNITS, COPIES, RULES } from "../src/data/units";
import { traitTiers } from "../src/data/traits";
import { COMBAT_VERSIONS, CURRENT_COMBAT_VERSION, type Fighter, type Piece } from "../src/engine/types";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { decodeSave, SAVE_SCHEMA, validGame } from "../src/engine/persistence";
import { createGame, nextRound } from "../src/engine/game";
import { mergeCount, pieceCopies } from "../src/engine/progression";
import { abilityCredit, pieceStrength } from "../src/engine/ai";
import { fighterSprite } from "../src/engine/summons";
import { terminatorLabels, terminatorPose } from "../src/render/terminator";
import { compactBattleLabels } from "../src/render/battle-inspection";
import { isMelee, REST_POSE } from "../src/render/melee";
import { isRanged, rangedPose } from "../src/render/ranged";
import { pieceDetails } from "../src/ui/bench-tooltip";
import { battleAnalysisMarkup } from "../src/ui/battle-analysis";
import frozen from "./fixtures/pre-v061-titan-replays.json";
import paid from "./fixtures/opening-ai-reserve.json";

const piece = (defId: string, uid: number, star = 1): Piece => ({ defId, uid, star, position: 51 });
function setup(star = 1) {
  const source = army([piece("titan", 1, star)], 0)[0], target = army([piece("guard", 2)], 1)[0];
  Object.assign(source, { x: 3, y: 6, mana: 100 });
  Object.assign(target, { x: 3, y: 3, hp: 10000, maxHp: 10000, magicResist: 0 });
  const ctx: CombatContext = { fighters: [source, target], tick: 0, events: [], effects: [] };
  return { source, target, ctx };
}
function begin(state: ReturnType<typeof setup>) {
  expect(castSkill(state.ctx, state.source, state.target)).toBe(true);
  return state;
}
function run(state: ReturnType<typeof setup>, ticks = 8) {
  for (let i = 0; i < ticks; i++) {
    state.ctx.tick++; advanceTerminatorMissiles(state.ctx); advanceAirSkills(state.ctx, state.source);
  }
}
function control(source: Fighter, kind: string) {
  if (kind === "stun") source.stunUntil = 100;
  if (kind === "silence") source.silenceUntil = 100;
  if (kind === "charm") { source.charm = { side: 0, until: 100, attack: source.attack }; source.side = 1; }
  if (kind === "death") source.hp = 0;
}
function oldVersion(name: string) {
  const version = COMBAT_VERSIONS.find(v => v === name); if (!version) throw Error(`Unknown version: ${name}`); return version;
}

describe("铁巨神终结者", () => {
  for (const [star, small, large, cooldown] of [[1,100,250,56],[2,200,350,48],[3,300,450,40]])
    it(`${star}星两弹分别${small}/${large}法伤、冷却${cooldown / 4}秒，不再附带眩晕`, () => {
      const state = begin(setup(star)); run(state);
      expect(state.target.hp).toBe(10000-small-large); expect(state.target.stunUntil).toBe(0);
      expect(state.source.skillReadyAt).toBe(cooldown); expect(state.source.mana).toBe(0);
      expect(state.ctx.events.filter(e => e.skill).map(e => e.amount)).toEqual([small,large]);
      expect(state.source.terminator).toMatchObject({smallLaunched:1,largeLaunched:1,detonated:2,hits:2,missiles:[]});
    });

  it("小弹在起手后发出，第二弹独立装填，落地前不提前扣血", () => {
    const state = begin(setup()); run(state,2);
    expect(state.source.terminator!.smallLaunched).toBe(0); expect(state.target.hp).toBe(10000);
    run(state,1); expect(state.source.terminator!.smallLaunched).toBe(1); expect(state.source.air!.cast!.remaining).toBe(1);
    run(state,1); expect(state.target.hp).toBe(10000);
    run(state,1); expect(state.target.hp).toBe(9900); expect(state.source.terminator!.largeLaunched).toBe(0);
    run(state,1); expect(state.source.terminator!.largeLaunched).toBe(1); expect(state.source.air!.cast).toBeUndefined();
    run(state,2); expect(state.target.hp).toBe(9650);
  });

  it("半径3格是包含边界的欧氏圆形，不是曼哈顿菱形", () => {
    const center={x:3,y:3};
    expect(terminatorContains(center,{x:6,y:3})).toBe(true);
    expect(terminatorContains(center,{x:6.001,y:3})).toBe(false);
    expect(terminatorContains(center,{x:5,y:5})).toBe(true);
    expect(terminatorContains(center,{x:5.2,y:5.2})).toBe(false);
  });

  for (const kind of ["stun","silence","charm","death"])
    it(`${kind}打断第一弹起手，两个未发射弹都取消而不退还能量和冷却`, () => {
      const state=begin(setup()); control(state.source,kind); run(state);
      expect(state.source.terminator).toMatchObject({smallLaunched:0,largeLaunched:0,detonated:0,hits:0});
      expect(state.source.air!.cast).toBeUndefined(); expect(state.target.hp).toBe(10000);
      expect(state.source.mana).toBe(0); expect(state.source.skillReadyAt).toBe(56);
      expect(state.ctx.effects.some(e=>e.name==="施法中断")).toBe(true);
    });

  for (const kind of ["stun","silence","charm","death"])
    it(`小弹发出后${kind}只取消尚未发出的大弹，小弹仍按原阵营落地`, () => {
      const state=begin(setup()); run(state,3); control(state.source,kind); run(state,5);
      // At exactly three tiles, a charmed caster has become an enemy of its own already-fired missile.
      expect(state.source.terminator).toMatchObject({smallLaunched:1,largeLaunched:0,detonated:1,hits:kind==="charm"?2:1});
      expect(state.target.hp).toBe(9900); expect(state.source.air!.cast).toBeUndefined();
      if(kind==="charm")expect(state.source.hp).toBe(state.source.maxHp-80); // Its innate 20% resistance still applies.
    });

  it("两弹冻结起手法强、不取普通攻击力；第二弹发出后阵亡和变阵营仍会落地", () => {
    const state=setup(2); state.source.skillPower=1.5; begin(state); run(state,6);
    Object.assign(state.source,{hp:0,side:1,skillPower:10,attack:10000}); run(state,2);
    expect(state.target.hp).toBe(10000-300-525); expect(state.source.terminator!.detonated).toBe(2);
  });

  it("固定落点不追踪目标；每弹检查各自落地时的位置，友军不受伤", () => {
    const state=setup(), other=structuredClone(state.target), ally=army([piece("guard",4)],0)[0];
    other.uid=3; other.x=5; Object.assign(ally,{x:3,y:3}); state.ctx.fighters.push(other,ally);
    begin(state); state.target.x=7;state.target.y=7;run(state,5);
    expect(state.target.hp).toBe(10000); expect(other.hp).toBe(9900);
    other.x=0;other.y=0;run(state,3); expect(other.hp).toBe(9900);
    expect(ally.hp).toBe(ally.maxHp); expect(state.source.terminator!.hits).toBe(1);
  });

  it("范围可命中已隐蔽和飞行的敌人，不会把同一弹结算成重复多次", () => {
    const state=setup(), hidden=army([piece("ghostjet",3)],1)[0];
    Object.assign(hidden,{x:4,y:3,hp:10000,maxHp:10000,magicResist:0}); hidden.air!.phaseUntil=100;
    state.ctx.fighters.push(hidden);begin(state);run(state,14);
    expect(hidden.hp).toBe(9650);expect(state.target.hp).toBe(9650);expect(state.source.terminator!.hits).toBe(4);
  });

  it("小弹反伤击杀铁巨神时，其余爆炸目标继续结算，未发出的大弹取消", () => {
    const state=setup(), other=structuredClone(state.target);other.uid=3;other.x=4;
    state.source.hp=1;state.target.reflection=10;state.ctx.fighters.push(other);begin(state);run(state);
    expect(state.source.hp).toBe(0);expect(other.hp).toBe(9900);expect(state.target.hp).toBe(9900);
    expect(state.source.terminator).toMatchObject({smallLaunched:1,largeLaunched:0,detonated:1,hits:2});
  });

  it("每弹独立减伤与破盾，免伤仅阻止当次命中，不会免疫后续大弹", () => {
    const state=setup(), immune=army([piece("swordthrall",3)],1)[0];
    Object.assign(state.target,{shield:150,magicResist:0.2});Object.assign(immune,{x:4,y:3,magicResist:0});
    immune.bladeStorm={until:100,next:100,remaining:6,damage:100};state.ctx.fighters.push(immune);
    begin(state);run(state,5);expect(state.target.shield).toBe(70);expect(state.target.hp).toBe(10000);
    expect(immune.hp).toBe(immune.maxHp);delete immune.bladeStorm;run(state,3);
    expect(state.target.hp).toBe(9870);expect(immune.hp).toBe(immune.maxHp-250);
    expect(state.source.terminator!.hits).toBe(3);
  });

  it("初始目标射程外、隐藏、同阵营或死亡时不扣能量和冷却", () => {
    for(const reason of ["range","hidden","friendly","dead"]){
      const {source,target,ctx}=setup();if(reason==="range")target.y=0;
      if(reason==="hidden")target.air!.phaseUntil=100;if(reason==="friendly")target.side=0;if(reason==="dead")target.hp=0;
      expect(castSkill(ctx,source,target)).toBe(false);expect(source.mana).toBe(100);expect(source.skillReadyAt).toBeUndefined();
    }
  });

  it("冷却期间保留能量，结束后下一次双轮独立结算", () => {
    const state=begin(setup());run(state);state.source.mana=100;state.ctx.tick=55;
    expect(castSkill(state.ctx,state.source,state.target)).toBe(false);expect(state.source.mana).toBe(100);
    state.ctx.tick=56;begin(state);run(state);expect(state.target.hp).toBe(9300);
    expect(state.source.terminator).toMatchObject({smallLaunched:2,largeLaunched:2,detonated:4,hits:4});
  });

  it("新旧本体、近远程动作和版本化形象分开，五费卡池容量不改", () => {
    expect(unitDefinition("titan")).toMatchObject({hp:900,attack:103,armor:15,range:5,interval:4.8,cost:5,skill:"终结者"});
    expect(pieceDetails(piece("titan",1))).toMatchObject({hp:900,attack:103,range:5,interval:1.2,skill:"终结者",action:"架炮装填与主炮后坐"});
    expect(pieceDetails(piece("titan",1),"bombardment")).toMatchObject({hp:1700,attack:120,range:1,interval:1,skill:"天坠",action:"蓄力重砸"});
    expect(isMelee("titan")).toBe(false);expect(isRanged("titan")).toBe(true);
    expect(isMelee("titan","bombardment")).toBe(true);expect(isRanged("titan","bombardment")).toBe(false);
    expect(unitSprite("titan")).toBe("titan-terminator");expect(unitSprite("titan","bombardment")).toBe("titan");
    expect(fighterSprite(setup().source)).toBe("titan-terminator");
    expect(createGame(1,"classic").pool.titan).toBe(COPIES[5]);expect(COPIES[5]).toBe(10);
    expect(skillName("titan")).toBe("终结者");expect(skillDescription("titan")).toContain("半径3格");
    expect(skillDescription("titan","bombardment")).toContain("眩晕");
  });

  it("完整/快速结算相同，装填禁止移动和普攻，第二弹发出后恢复行动，战报不读取未来", () => {
    const input=structuredClone(TERMINATOR_DEMO),full=simulate(input.left,input.right),quick=simulateOutcome(input.left,input.right);
    expect(input).toEqual(TERMINATOR_DEMO);expect(quick.final.fighters).toEqual(full.frames.at(-1)!.fighters);expect(quick.winner).toBe(full.winner);
    const final=analyzeBattle(full),titan=final.sides[0].fighters.find(f=>f.defId==="titan")!;
    expect(titan.terminator!.smallLaunched).toBeGreaterThan(0);expect(titan.terminator!.largeLaunched).toBeGreaterThan(0);expect(titan.terminator!.hits).toBeGreaterThan(2);
    expect(analyzeBattle(full,0).sides[0].fighters.find(f=>f.defId==="titan")!.terminator).toEqual({smallLaunched:0,largeLaunched:0,detonated:0,hits:0});
    expect(battleAnalysisMarkup(final,"damage","终结者",full.frames.length-1,full.frames.at(-1)!.tick)).toContain("有效波及");
    let previous:Fighter|undefined;
    for(const frame of full.frames){const f=frame.fighters.find(f=>f.defId==="titan")!;
      if(f.air?.cast?.kind==="terminator"){
        expect(frame.events.filter(e=>e.attacker===f.uid&&!e.skill&&!e.reflected)).toHaveLength(0);
        if(previous?.air?.cast?.kind==="terminator")expect([f.x,f.y]).toEqual([previous.x,previous.y]);
      }previous=f;
    }
    expect(full.frames.some(frame=>frame.fighters.some(f=>f.terminator?.missiles.length&&!f.air?.cast&&frame.events.some(e=>e.attacker===f.uid&&!e.skill&&!e.reflected)))).toBe(true);
  });

  it("起手/普通射击动作独立，提示只读，AI按有限伤害而非眩晕估值", () => {
    const state=begin(setup()),before=structuredClone(state.source);
    expect(compactBattleLabels(state.source,1)).toContain("双轮装填");expect(terminatorPose(state.source,1)).not.toEqual(REST_POSE);
    expect(terminatorLabels(state.source,1).join()).toContain("终结者冷却");expect(state.source).toEqual(before);
    expect(rangedPose("titan",0.5)).not.toEqual(rangedPose("cannon",0.5));
    const base=piece("titan",1),staff={...base,items:["staff"]};
    expect(abilityCredit(staff)).toBeGreaterThan(abilityCredit(base));expect(abilityCredit(staff)).toBeLessThanOrEqual(0.6);
    expect(pieceStrength(piece("titan",1,2))).toBeGreaterThan(pieceStrength(staff));
  });
});

describe("终结者版本与存档",()=>{
  it("此前33版本铁巨神身板/职业保持，其他兵种、连携、异虫双合继承",()=>{
    for(const entry of frozen.definitions)expect(unitDefinition("titan",oldVersion(entry.version))).toEqual(entry.unit);
    // Compare the 0.61 introduction boundary, independently of later unit changes.
    for(const u of UNITS.filter(u=>u.id!=="titan"))expect(unitDefinition(u.id,"terminator")).toEqual(unitDefinition(u.id,"bombardment"));
    expect(traitTiers(CURRENT_COMBAT_VERSION)).toEqual(traitTiers("bombardment"));
    const party=["ark","master","panda","monk","stormcaller","acolyte","thunderlord"].map((id,i)=>({...piece(id,i+1),position:32+i}));
    expect(army(party,0)).toEqual(army(party,0,"bombardment"));
    expect(mergeCount([piece("eyebug",1),piece("spider",2)],"eyebug",1)).toBe(2);
  });
  for(const phase of ["prepare","battle","result","finished"] as const)
    it(`0.60 ${phase}迁移只在准备阶段切换能力，其余资源和旧目录保留`,()=>{
      // A paid reserve supplies resources. Phase/version variants below are explicit module fixtures.
      const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("Invalid reserve capture");const game=input;
      game.combatVersion="bombardment";game.phase=phase;
      if(phase==="result"||phase==="finished"){
        game.round--;game.players[0].hp=game.history.at(-1)!.hp;
        if(phase==="finished"){
          const p=game.players[0];for(const held of p.pieces)game.pool[held.defId]+=pieceCopies(held);for(const id of p.shop)if(id)game.pool[id]++;
          p.hp=0;p.eliminatedRound=game.round;p.pieces=[];p.shop=[];p.inventory=[];game.history.at(-1)!.hp=0;
        }
      }
      expect(validGame(game)).toBe(true);const before=structuredClone(game),playback={time:3.5,speed:2,paused:true};
      const decoded=decodeSave(JSON.stringify({schema:59,rules:"singleplayer-0.60",savedAt:1,revision:1,game,playback}));
      expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(decoded.data!.rules).toBe(RULES.version);
      expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});
      expect(decoded.data!.game.catalogVersion).toBe("secret-orb");expect(decoded.data!.playback).toEqual(playback);
      if(phase==="result"){nextRound(decoded.data!.game);expect(decoded.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(decoded.data!.game.catalogVersion).toBe("secret-orb");}
    });
  for(const entry of frozen.fixtures)
    it(`冻结旧${entry.version}铁巨神完整回放`,async()=>{
      const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(entry.left,entry.right,oldVersion(entry.version)))));
      expect(Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")).toBe(entry.hash);
    });
});
