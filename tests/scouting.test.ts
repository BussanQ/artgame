import {describe,it,expect,vi} from "vitest";
import {scoutingFixture} from "../scripts/fixtures/scouting";
import {planTactically,scoutControlPurchase,deployTactically,tacticalScore,prepareBot} from "../src/engine/ai";
import {applyRecommendedDeployment} from "../src/engine/deployment";
import {compute} from "../src/compute/job";
import {buy,sell,roll,buyXp} from "../src/engine/game";
import {previewSale} from "../src/engine/recruitment";
import {validGame} from "../src/engine/persistence";
import {pieceCopies} from "../src/engine/progression";
import {catalogCost} from "../src/data/catalog";
import {isAiProfileId} from "../src/data/ai-profiles";
import reserveCapture from "./fixtures/scouted-control-reserve.json";
import type {Piece} from "../src/engine/types";
import * as battle from "../src/engine/battle";

describe("公开对手选阵与报价",()=>{
  it("保留同一批已持有棋子，搜索静态评分漏掉的树妖换位胜局",()=>{
    const {g,player,enemy}=scoutingFixture("sniper-screen","fleet","spread");
    const before=structuredClone(g),baseline=tacticalScore(player.pieces,enemy.pieces);
    const plan=planTactically(g,player,{equipInventory:false})!;
    expect(g).toEqual(before);expect(plan.trials).toBeLessThanOrEqual(20);
    expect(plan.winner).toBe(0);expect(plan.score).toBeGreaterThan(baseline);
    expect(plan.positions.find(p=>p.uid===8)?.position).not.toBeNull();
    deployTactically(g,player,{equipInventory:false});
    expect(tacticalScore(player.pieces,enemy.pieces)).toBe(plan.score);
    expect(validGame(g)).toBe(true);
  });
  it("当前手动站位进入候选，只有一次试算时不先改写它",()=>{
    const {g,player}=scoutingFixture("sniper-screen","fleet","spread");
    const before=structuredClone(g),positions=player.pieces.map(({uid,position})=>({uid,position}));
    const plan=planTactically(g,player,{maximumTrials:1,equipInventory:false})!;
    expect(plan.trials).toBe(1);expect(plan.positions).toEqual(positions);expect(g).toEqual(before);
  });
  it("试算次数受硬上限约束，非法预算和非准备阶段不启动",()=>{
    const {g,player}=scoutingFixture("sniper-screen","fleet","spread");
    for(const cap of [0,1,5,20,100,NaN]){
      const before=structuredClone(g),plan=planTactically(g,player,{maximumTrials:cap});
      if(!Number.isFinite(cap)||cap===0)expect(plan).toBeNull();
      else expect(plan!.trials).toBeLessThanOrEqual(Math.min(20,cap));
      expect(g).toEqual(before);
    }
    g.phase="battle";expect(planTactically(g,player)).toBeNull();
  });
  it("玩家推荐只提交站位，库存不会被试算偷偷穿戴，Worker不修改原对局",()=>{
    const {g,player,enemy}=scoutingFixture("sniper-screen","fleet","spread",true,0);
    player.inventory=["staff","crystal","aegis"];
    const before=structuredClone(g),reply=compute({kind:"deploy",game:g});
    expect(g).toEqual(before);expect(reply.kind).toBe("deployment");
    if(reply.kind!=="deployment")throw new Error("wrong result");
    expect(reply).not.toHaveProperty("game");expect(reply.trials).toBeLessThanOrEqual(20);
    expect(reply.opponent?.id).toBe(enemy.id);
    const plan=planTactically(g,player,{equipInventory:false})!;
    expect(reply.positions).toEqual(plan.positions);
    expect(applyRecommendedDeployment(g,reply.positions)).toBe(true);
    expect(player.inventory).toEqual(before.players[0].inventory);
    expect(player.pieces.map(({position,...p})=>p)).toEqual(before.players[0].pieces.map(({position,...p})=>p));
    expect({...g,players:[]}).toEqual({...before,players:[]});
    expect(g.players.slice(1)).toEqual(before.players.slice(1));
    expect(tacticalScore(player.pieces,enemy.pieces)).toBe(plan.score);
    expect(validGame(g)).toBe(true);
  });
  it("空对手时回退普通推荐；空阵容或错误阶段不会准备AI或花钱",()=>{
    const {g}=scoutingFixture("sniper-screen","fleet","spread",true,0);
    g.players[1].pieces.forEach(p=>p.position=null);
    const before=structuredClone(g),reply=compute({kind:"deploy",game:g});
    expect(reply.kind).toBe("deployment");if(reply.kind!=="deployment")throw Error("wrong result");
    expect(reply.opponent).toBeNull();expect(reply.trials).toBe(0);expect(g).toEqual(before);
    g.phase="battle";const invalid=structuredClone(g);
    expect(()=>compute({kind:"deploy",game:g})).toThrow();expect(g).toEqual(invalid);
    g.phase="prepare";g.players[0].pieces=[];
    expect(()=>compute({kind:"deploy",game:g})).toThrow();
  });
  it("非法、缺失、重复、过量的返回站位不能部分覆盖当前阵容",()=>{
    const {g}=scoutingFixture("sniper-screen","fleet","spread",true,0),before=structuredClone(g);
    const rows=g.players[0].pieces.map(({uid,position})=>({uid,position}));
    const invalid=[rows.slice(1),rows.map((r,i)=>i===0?{...r,uid:999999}:r),
      rows.map((r,i)=>({...r,position:i<2?35:r.position})),
      rows.map((r,i)=>i===0?{...r,position:31}:r),
      rows.map((r,i)=>i===0?{...r,position:NaN}:r),
      rows.map((r,i)=>({...r,position:32+i})),rows.map(r=>({...r,position:null}))];
    for(const positions of invalid){expect(applyRecommendedDeployment(g,positions)).toBe(false);expect(g).toEqual(before);}
    const partial=rows.map((r,i)=>({...r,position:i===0?35:null}));
    expect(applyRecommendedDeployment(g,partial)).toBe(true);expect(validGame(g)).toBe(true);
  });
  it("购买试算使用真实新UID与公开阵容，不改金币、卡池、随机数或装备",()=>{
    const {g,player}=scoutingFixture("sniper-screen","fleet","spread",false);
    const before=structuredClone(g),probe=scoutControlPurchase(g,player,0);
    expect(probe.improves).toBe(true);expect(probe.trials).toBeLessThanOrEqual(40);
    expect(probe.sellUid).toBeNull();expect(g).toEqual(before);
    for(const cap of [0,2,4,100,NaN]){
      const bounded=scoutControlPurchase(g,player,0,cap);
      expect(bounded.trials).toBeLessThanOrEqual(Number.isFinite(cap)?Math.min(40,cap):0);
      expect(g).toEqual(before);
    }
    player.gold=0;expect(scoutControlPurchase(g,player,0).trials).toBe(0);
  });
  it("通过正常付费交易取得有用控制位，准备阶段总预算不随刷新重置",()=>{
    const {g,player}=scoutingFixture("sniper-screen","fleet","spread",false);
    player.gold=5;player.hp=35;
    const pool=g.pool.treant,uid=g.nextUid;
    const report=prepareBot(g,player,{buy,sell,roll,buyXp})!;
    expect(report.controlPurchaseTrials).toBeLessThanOrEqual(40);
    expect(report.deploymentTrials).toBeLessThanOrEqual(20);
    expect(report.scoutedPurchases.length).toBeLessThanOrEqual(1);
    expect(player.pieces.find(p=>p.defId==="treant")).toMatchObject({uid,star:1});
    expect(player.gold).toBe(0);expect(g.pool.treant).toBe(pool);expect(g.nextUid).toBe(uid+1);
    expect(validGame(g)).toBe(true);
  });
  it("正常第23轮满备战先比较售前阵容，可胜时不额外买骨龙且付费事务守恒",()=>{
    const input:unknown=structuredClone(reserveCapture.game);
    if(!validGame(input)||!isAiProfileId(reserveCapture.profile))throw Error("invalid economic fixture");
    const g=input,p=g.players[0],before=structuredClone(g),expected=reserveCapture.expected;
    expect(g.round).toBe(23);expect(p.pieces.filter(piece=>piece.position===null)).toHaveLength(8);
    p.aiProfile=reserveCapture.profile;g.difficulty="standard";
    const baseline=planTactically(g,p)!;
    expect(baseline.winner).toBe(0);
    const proposal=scoutControlPurchase(g,p,p.shop.indexOf("bonedragon"));
    expect(proposal).toMatchObject({improves:false,baseline:baseline.score,sellUid:null});
    delete p.aiProfile;g.difficulty=before.difficulty;
    expect(g).toEqual(before);
    const items=()=>[...p.inventory,...p.pieces.flatMap(piece=>piece.items??[])].sort();
    const gear=items(),trades:{kind:"buy"|"sell";id:string;starsBefore:number[];price:number}[]=[];
    let xpBuys=0,refreshes=0;
    const actions:Parameters<typeof prepareBot>[2]={
      buy(game,owner,index){
        const id=owner.shop[index]!,price=catalogCost(game,id);
        const starsBefore=owner.pieces.filter(piece=>piece.defId===id).map(piece=>piece.star);
        const ok=buy(game,owner,index);
        if(ok)trades.push({kind:"buy",id,starsBefore,price});
        return ok;
      },
      sell(game,owner,uid){
        const piece=owner.pieces.find(piece=>piece.uid===uid)!,gold=owner.gold;
        const starsBefore=owner.pieces.filter(other=>other.defId===piece.defId).map(piece=>piece.star);
        const ok=sell(game,owner,uid);
        if(ok)trades.push({kind:"sell",id:piece.defId,starsBefore,price:owner.gold-gold});
        return ok;
      },
      roll(game,owner){const ok=roll(game,owner);if(ok)refreshes++;return ok;},
      buyXp(game,owner){const ok=buyXp(game,owner);if(ok)xpBuys++;return ok;},
    };
    let report:ReturnType<typeof prepareBot>;
    // Reproduce the survey's paid standard player proxy; formal opponents are untouched.
    p.id=1;p.aiProfile=reserveCapture.profile;g.difficulty="standard";
    try{report=prepareBot(g,p,actions);}
    finally{p.id=0;delete p.aiProfile;g.difficulty=before.difficulty;}
    expect(report!.scoutedPurchases).toEqual([]);
    expect(report!.controlPurchaseTrials).toBeLessThanOrEqual(40);
    expect(report!.deploymentTrials).toBeLessThanOrEqual(20);
    // The original 0.55 transaction log stays frozen; the first two normal
    // transactions suffice once an already winning army is the baseline.
    expect(trades).toEqual(expected.economy.trades.slice(0,2));
    expect(xpBuys).toBe(expected.economy.xpBuys);expect(refreshes).toBe(0);
    expect(p.gold).toBe(35);expect(p.level).toBe(expected.level);expect(p.hp).toBe(expected.hp);
    expect(p.gold).toBe(before.players[0].gold-5*xpBuys-2*refreshes+
      trades.reduce((gold,trade)=>gold+(trade.kind==="sell"?trade.price:-trade.price),0));
    expect(p.pieces.some(piece=>piece.defId==="bonedragon")).toBe(false);
    expect(p.pieces.filter(piece=>piece.position===null).length).toBeLessThanOrEqual(8);
    expect(items()).toEqual(gear);expect(g.players.slice(1)).toEqual(before.players.slice(1));
    expect(g.pool).toEqual({...before.pool,vajra:before.pool.vajra+3});
    expect(g.nextUid).toBe(before.nextUid+1);expect(g.seed).toBe(before.seed);
    expect(validGame(g)).toBe(true);
  });
  it("出售报价与真实交易一致，异虫售价与实际返池份数分别结算",()=>{
    const {g,player}=scoutingFixture("sniper-screen","fleet","spread",false);
    for(const id of ["eyebug","eyebug","spider"]){
      player.shop[1]=id;g.pool[id]--;expect(buy(g,player,1)).toBe(true);
    }
    const eye=player.pieces.find(p=>p.defId==="eyebug")!;
    eye.items=["staff","plate"];
    const before=structuredClone(g),quote=previewSale(g,player,eye.uid)!;
    expect(quote).toMatchObject({price:3,copies:2,defId:"eyebug"});expect(g).toEqual(before);
    const pool=g.pool.eyebug;expect(sell(g,player,eye.uid)).toBe(true);
    expect(player).toEqual(quote.after);expect(g.pool.eyebug).toBe(pool+2);
    expect(player.inventory).toEqual(["staff","plate"]);expect(validGame(g)).toBe(true);
  });
  it("多次付费刷新仍共用40次购买预算，实际模拟调用总数匹配记录",()=>{
    const {g,player}=scoutingFixture("sniper-screen","fleet","spread",false);
    player.gold=100;player.hp=35;
    const simulate=vi.spyOn(battle,"simulateOutcome");let rolls=0;
    try{
      const report=prepareBot(g,player,{buy,sell,buyXp,roll:(game,owner)=>{rolls++;return roll(game,owner);}})!;
      expect(rolls).toBeGreaterThan(1);
      expect(report.controlPurchaseTrials).toBeLessThanOrEqual(40);
      expect(report.deploymentTrials).toBeLessThanOrEqual(20);
      expect(simulate).toHaveBeenCalledTimes(report.controlPurchaseTrials+report.deploymentTrials);
      expect(validGame(g)).toBe(true);
    }finally{simulate.mockRestore();}
  });
  it("正式休闲AI保持低搜索策略，不进行控制位购买或战术试算",()=>{
    const {g,player}=scoutingFixture("sniper-screen","fleet","spread");
    g.difficulty="relaxed";player.gold=100;
    const report=prepareBot(g,player,{buy,sell,roll,buyXp})!;
    expect(report.controlPurchaseTrials).toBe(0);expect(report.deploymentTrials).toBe(0);
    expect(report.scoutedPurchases).toEqual([]);expect(validGame(g)).toBe(true);
  });
  it("满席仍保留成熟备战核心，公开试算不凭空腾出第九个备战位",()=>{
    const {g,player}=scoutingFixture("sniper-screen","fleet","spread",false);
    for(const defId of ["eyebug","blastbug","acolyte","repair","ironrooster","dragonfly","bat","turtle"]){
      const piece:Piece={uid:g.nextUid++,defId,star:3,position:null};
      g.pool[defId]-=pieceCopies(piece);player.pieces.push(piece);
    }
    expect(validGame(g)).toBe(true);
    const before=structuredClone(g),probe=scoutControlPurchase(g,player,0);
    expect(probe.improves).toBe(false);expect(g).toEqual(before);
  });
});
