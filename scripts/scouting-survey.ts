import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {SCOUTING_ROSTERS,SCOUTING_OPPONENTS,scoutingFixture} from "./fixtures/scouting";
import {deployTactically,scoutControlPurchase,tacticalScore} from "../src/engine/ai";
import {simulateOutcome} from "../src/engine/battle";
import {RULES} from "../src/data/units";

const cases=[],started=performance.now();
for(const roster of SCOUTING_ROSTERS)for(const foe of SCOUTING_OPPONENTS)for(const formation of ["spread","compact"] as const){
  const {g,player,enemy}=scoutingFixture(roster.name,foe.name,formation);
  const before=structuredClone(g),old=simulateOutcome(player.pieces,enemy.pieces),oldScore=tacticalScore(player.pieces,enemy.pieces);
  const treeBefore=player.pieces.find(piece=>piece.defId==="treant")!.position!==null;
  const trialStart=performance.now(),plan=deployTactically(g,player,{maximumTrials:20,equipInventory:false});
  const planningMs=performance.now()-trialStart;
  const now=simulateOutcome(player.pieces,enemy.pieces),score=tacticalScore(player.pieces,enemy.pieces);
  const offer=scoutingFixture(roster.name,foe.name,formation,false);
  const original=structuredClone(offer.g),purchaseStart=performance.now();
  const probe=scoutControlPurchase(offer.g,offer.player,0);
  const purchaseMs=performance.now()-purchaseStart;
  if(JSON.stringify(offer.g)!==JSON.stringify(original))throw new Error("Purchase probe mutated game");
  const withoutPositions=(game:typeof g)=>({...game,players:game.players.map(p=>({...p,pieces:p.pieces.map(({position,...piece})=>piece)}))});
  if(JSON.stringify(withoutPositions(g))!==JSON.stringify(withoutPositions(before)))throw new Error("Deployment changed non-placement state");
  if(score+1e-9<oldScore)throw new Error("Candidate search regressed from static baseline");
  cases.push({roster:roster.name,enemy:foe.name,formation,before:{winner:old.winner,score:oldScore,treeDeployed:treeBefore},
    after:{winner:now.winner,score,treeDeployed:player.pieces.find(p=>p.defId==="treant")!.position!==null,
      treeCombat:now.final.fighters.filter(f=>f.jungle).map(f=>({uid:f.uid,...f.jungle}))},
    planning:{trials:plan?.trials??0,milliseconds:planningMs},purchaseProbe:{...probe,milliseconds:purchaseMs,incomingUid:offer.g.nextUid},
    input:{player:before.players[player.id],opponent:enemy.pieces},positions:plan?.positions??[]});
}
const sha=(path:string)=>createHash("sha256").update(readFileSync(path)).digest("hex");
const timing=(values:number[])=>({median:[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)],maximum:Math.max(...values)});
const result={checkedAt:new Date().toISOString(),rules:RULES.version,
  method:"50 synthetic held-roster/public-opponent cases; identical ownership and gear for static versus tactical deployment. Not equal-budget armies, natural economy, browser timing or human win rate.",
  sourceFingerprints:Object.fromEntries(["src/engine/ai.ts","src/engine/battle.ts","src/data/traits.ts","src/engine/types.ts",
    "scripts/fixtures/scouting.ts","scripts/scouting-survey.ts"].map(p=>[p,sha(p)])),
  summary:{cases:cases.length,winsBefore:cases.filter(c=>c.before.winner===0).length,winsAfter:cases.filter(c=>c.after.winner===0).length,
    treesBefore:cases.filter(c=>c.before.treeDeployed).length,treesAfter:cases.filter(c=>c.after.treeDeployed).length,purchaseFlips:cases.filter(c=>c.purchaseProbe.improves).length,
    planningMs:timing(cases.map(c=>c.planning.milliseconds)),purchaseMs:timing(cases.map(c=>c.purchaseProbe.milliseconds)),totalMs:performance.now()-started},cases};
writeFileSync(`docs/analysis/scouting-v${RULES.version.split("-")[1].replace(".","")}-controlled.json`,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({summary:result.summary,purchaseFlips:cases.filter(c=>c.purchaseProbe.improves).map(c=>({roster:c.roster,enemy:c.enemy,formation:c.formation,trials:c.purchaseProbe.trials}))}));
