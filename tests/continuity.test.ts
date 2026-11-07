import { describe, it, expect } from "vitest";
import { COMBAT_VERSIONS, CURRENT_COMBAT_VERSION, hasJungleRules, hasStormRules,
  hasGospelRules, hasLightningRules, hasTarRules, hasTaotieRules, hasQiRules,
  hasAuroraRules, hasCoalitionRules, hasLineageRules, hasCounterplayRules,
  hasAmbushRules, hasInsectEvolutionRules, type Piece } from "../src/engine/types";
import { traitTiers, COALITION_TRAIT_TIERS, AIRSEA_TRAIT_TIERS } from "../src/data/traits";
import { traitBonuses } from "../src/engine/synergies";
import { army, simulate } from "../src/engine/battle";
import { mergeCount, mergePieces, pieceCopies } from "../src/engine/progression";
import { buy, createGame, nextRound, startRound, settle, resumeRound } from "../src/engine/game";
import { decodeSave, validGame, SAVE_SCHEMA } from "../src/engine/persistence";
import { claimReward } from "../src/engine/equipment";
import { COPIES, RULES, UNITS } from "../src/data/units";
import { unitCost } from "../src/data/catalog";
import { isRecruitable } from "../src/engine/rotation";
import frozen from "./fixtures/pre-v055-replays.json";

const piece = (defId:string,uid:number,star=1,position:number|null=35):Piece => ({defId,uid,star,position});
const lineup = (ids:string[]) => ids.map((id,i)=>piece(id,i+1,1,32+i));
function oldMatch(mode:"classic"|"rotation"="classic") {
  const g=createGame(311,mode),p=g.players[0];
  g.combatVersion=g.catalogVersion="jungle";
  for(const owner of g.players)owner.shop.fill(null);
  g.pool=Object.fromEntries(UNITS.map(u=>[u.id,isRecruitable(g,u.id)?COPIES[unitCost(u.id,"jungle")]:0]));
  const purchase=(id:string)=>{
    p.shop[0]=id;g.pool[id]--;expect(buy(g,p,0)).toBe(true);
  };
  purchase("eyebug");purchase("eyebug");purchase("spider");
  p.pieces.forEach((u,i)=>u.position=32+i);
  expect(p.pieces.filter(u=>u.defId==="eyebug")).toHaveLength(2);
  expect(validGame(g)).toBe(true);
  return {g,p,purchase};
}
const payload = (game:ReturnType<typeof createGame>) => JSON.stringify({schema:53,
  rules:"singleplayer-0.54",savedAt:1,revision:1,game,
  playback:{time:1.25,speed:2,paused:true}});

describe("完整继承的连携与异虫进化",()=>{
  it("当前版本继承全部能力开关和22类完整连携表",()=>{
    expect(COMBAT_VERSIONS).toContain("continuity");
    expect(COMBAT_VERSIONS.indexOf(CURRENT_COMBAT_VERSION)).toBeGreaterThanOrEqual(COMBAT_VERSIONS.indexOf("continuity"));
    for(const guard of [hasJungleRules,hasStormRules,hasGospelRules,hasLightningRules,hasTarRules,
      hasTaotieRules,hasQiRules,hasAuroraRules,hasCoalitionRules,hasLineageRules,hasCounterplayRules,
      hasAmbushRules,hasInsectEvolutionRules])expect(guard(CURRENT_COMBAT_VERSION)).toBe(true);
    expect(Object.keys(traitTiers(CURRENT_COMBAT_VERSION))).toHaveLength(22);
    expect(traitTiers(CURRENT_COMBAT_VERSION)).toEqual(COALITION_TRAIT_TIERS);
    expect(new Set(COMBAT_VERSIONS).size).toBe(COMBAT_VERSIONS.length);
  });
  it("0.54回退仍冻结供旧战报使用，0.53和当前版本采用恢复表",()=>{
    expect(traitTiers("jungle")).toEqual(AIRSEA_TRAIT_TIERS);
    expect(traitTiers("thunderstorm")).toEqual(COALITION_TRAIT_TIERS);
    const insects=[piece("eyebug",1),piece("blastbug",2),piece("spider",3),piece("wasp",4)];
    expect(mergeCount(insects,"eyebug",2,"jungle")).toBe(3);
    expect(mergeCount(insects,"eyebug",2,"thunderstorm")).toBe(2);
    expect(mergeCount(insects,"eyebug",2)).toBe(2);
    expect(mergeCount(insects,"eyebug",1,"legions")).toBe(3);
  });
  it("当前六步兵实际减甲18，六先锋实际增加14甲而不增加生命",()=>{
    const foot=lineup(["infantry","guard","flametrooper","grenadier","specialist","medic"]);
    expect(traitBonuses(foot).get("步兵")?.enemyArmor).toBe(18);
    const battle=simulate(foot,[piece("guard",101)]);
    expect(battle.frames[0].fighters.find(f=>f.uid===101)?.infantryArmorBreak).toBe(18);
    const front=lineup(["treant","elephant","venombeast","cavalry","flametrooper","bull"]);
    expect(traitBonuses(front).get("先锋")?.armor).toBe(14);
    const tree=army(front,0).find(f=>f.defId==="treant")!;
    expect(tree.armor).toBe(19);expect(tree.maxHp).toBe(950);
  });
  it("当前四异虫连锁升星保存实际份数、同名UID、装备和溢出库存",()=>{
    const p=createGame(311,"classic").players[0];
    p.pieces=[{...piece("eyebug",1),items:["staff","plate","blade"]},
      {...piece("eyebug",2),items:["coil","crystal"]},piece("eyebug",3),piece("eyebug",4),
      piece("blastbug",5),piece("spider",6),piece("wasp",7)];
    mergePieces(p);
    expect(p.pieces.find(p=>p.defId==="eyebug")).toMatchObject({uid:1,star:3,copies:4,items:["staff","plate","blade"]});
    expect(p.pieces.filter(p=>p.defId==="eyebug")).toHaveLength(1);
    expect(p.inventory).toEqual(["coil","crystal"]);
    expect(p.pieces.reduce((n,p)=>n+pieceCopies(p),0)).toBe(7);
    const ordinary=createGame(311,"classic").players[0];ordinary.pieces=[piece("guard",1),piece("guard",2),piece("guard",3)];
    mergePieces(ordinary);expect(ordinary.pieces).toEqual([expect.objectContaining({star:2})]);
  });
  for(const mode of ["classic","rotation"] as const)
    for(const phase of ["prepare","battle","result","finished"] as const)
      it(`0.54 ${mode}/${phase}迁移保留价格、资源、回放；只在准备期恢复进化`,()=>{
        const {g,p}=oldMatch(mode);
        if(phase==="finished")p.hp=1;
        const result=phase==="prepare"?null:startRound(g)!;
        if(phase==="result"||phase==="finished")settle(g,result!);
        for(let i=0;i<30&&phase==="finished"&&g.phase!=="finished";i++){
          if(g.reward)claimReward(g,0);nextRound(g);g.combatVersion="jungle";
          settle(g,startRound(g)!);
        }
        expect(g.phase).toBe(phase);expect(validGame(g)).toBe(true);
        const before=structuredClone(g),expected=structuredClone(g);
        if(phase==="prepare"){
          expected.combatVersion=CURRENT_COMBAT_VERSION;
          for(const player of expected.players.filter(p=>p.hp>0))mergePieces(player,CURRENT_COMBAT_VERSION);
        }
        const serialized=structuredClone(g);delete serialized.catalogVersion;
        const restored=decodeSave(payload(serialized));
        expect(restored.status).toBe("migrated");expect(restored.data!.schema).toBe(SAVE_SCHEMA);
        expect(restored.data!.rules).toBe(RULES.version);
        expect(restored.data!.game).toEqual(expected);
        expect(restored.data!.game.pool).toEqual(before.pool);
        expect(restored.data!.playback).toEqual({time:1.25,speed:2,paused:true});
        expect(validGame(restored.data!.game)).toBe(true);
        if(phase==="battle")expect(resumeRound(restored.data!.game)).toEqual(result);
        if(phase==="result"){
          const current=restored.data!.game,gold=current.players[0].gold;
          if(current.reward)claimReward(current,0);
          const history=structuredClone(current.history);nextRound(current);
          expect(current.combatVersion).toBe(CURRENT_COMBAT_VERSION);
          expect(current.players[0].gold).toBe(gold);
          expect(current.history).toEqual(history);
          expect(current.players[0].pieces.filter(u=>u.defId==="eyebug")).toHaveLength(1);
          expect(current.players[0].pieces.find(u=>u.defId==="eyebug")).toMatchObject({star:2,copies:2});
        }
      });
  it("准备期迁移自动修复遗留对子，保存已装备材料与溢出且不重复进化",()=>{
    const {g,p}=oldMatch();
    const eyes=p.pieces.filter(p=>p.defId==="eyebug");
    eyes[0].items=["staff","plate","blade"];eyes[1].items=["coil","crystal"];
    const pool=structuredClone(g.pool),gold=p.gold,seed=g.seed;
    const result=decodeSave(payload(g)).data!;
    expect(result.game.players[0].pieces.find(u=>u.defId==="eyebug")).toMatchObject({uid:eyes[0].uid,star:2,copies:2,items:eyes[0].items});
    expect(result.game.players[0].inventory).toEqual(["coil","crystal"]);
    expect(result.game.pool).toEqual(pool);expect(result.game.players[0].gold).toBe(gold);expect(result.game.seed).toBe(seed);
    const again=decodeSave(JSON.stringify(result));expect(again.status).toBe("saved");expect(again.data).toEqual(result);
  });
  for(const entry of frozen.fixtures)
    it(`冻结0.54回放 ${entry.name}`,async()=>{
      const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(entry.left,entry.right,"jungle"))));
      expect([...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("")).toBe(entry.hash);
    });
});
