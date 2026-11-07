import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { COMBAT_VERSIONS, CURRENT_COMBAT_VERSION, hasAmbushRules, hasCoalitionRules,
  hasGospelRules, hasJungleRules, hasStormRules, hasWushiRules, hasWushiControlRules, hasShurikenRules, hasSecretOrbRules, hasInsectEvolutionRules } from "../src/engine/types";
import { traitTiers } from "../src/data/traits";
import { RULES, TRAITS } from "../src/data/units";
import { mergeCount } from "../src/engine/progression";
import { simulate } from "../src/engine/battle";
import { analyzeBattle } from "../src/engine/battle-analysis";
import { JUNGLE_DEMO } from "../src/data/jungle-demo";
import { WUSHI_DEMO } from "../src/data/wushi-demo";
import { SHURIKEN_DEMO } from "../src/data/shuriken-demo";
import { SECRET_ORB_DEMO, SECRET_ORB_COUNTER_DEMO } from "../src/data/secret-orb-demo";

const sha = (value:string|Buffer) => createHash("sha256").update(value).digest("hex");
const insects=["eyebug","blastbug","spider","wasp"].map((defId,i)=>({defId,uid:i+1,star:1,position:null}));
const versions=COMBAT_VERSIONS.map(version=>({version,
  capabilities:{ambush:hasAmbushRules(version),coalitions:hasCoalitionRules(version),
    gospel:hasGospelRules(version),storm:hasStormRules(version),jungle:hasJungleRules(version),wushi:hasWushiRules(version),
    wushiControl:hasWushiControlRules(version),
    shuriken:hasShurikenRules(version),
    secretOrb:hasSecretOrbRules(version),
    insectEvolution:hasInsectEvolutionRules(version)},
  traitTableSha256:sha(JSON.stringify(traitTiers(version))),
  traitThresholds:Object.fromEntries(Object.keys(TRAITS).map(trait=>[trait,
    traitTiers(version)[trait as keyof typeof TRAITS].map(tier=>tier.count)])),
  insectMergeCounts:{twoKindsOneStar:mergeCount(insects.slice(0,2),"eyebug",1,version),
    twoKindsTwoStar:mergeCount(insects.slice(0,2),"eyebug",2,version),
    fourKindsTwoStar:mergeCount(insects,"eyebug",2,version)},
}));
const battle=simulate(JUNGLE_DEMO.left,JUNGLE_DEMO.right,CURRENT_COMBAT_VERSION);
const wushiBattle=simulate(WUSHI_DEMO.left,WUSHI_DEMO.right,CURRENT_COMBAT_VERSION);
const shurikenBattle=simulate(SHURIKEN_DEMO.left,SHURIKEN_DEMO.right,CURRENT_COMBAT_VERSION);
const orbBattle=simulate(SECRET_ORB_DEMO.left,SECRET_ORB_DEMO.right,CURRENT_COMBAT_VERSION);
const orbCounterBattle=simulate(SECRET_ORB_COUNTER_DEMO.left,SECRET_ORB_COUNTER_DEMO.right,CURRENT_COMBAT_VERSION);
assert.deepEqual(orbBattle.frames.at(-1)!.fighters.find(f=>f.defId==="monk")!.secretOrb,
  {formed:1,pulses:7,hits:18,energyRemoved:51,interrupted:0});
assert.deepEqual(orbCounterBattle.frames.at(-1)!.fighters.find(f=>f.defId==="monk")!.secretOrb,
  {formed:1,pulses:3,hits:12,energyRemoved:33,interrupted:1});
const current=versions.at(-1)!;
assert.equal(current.version,CURRENT_COMBAT_VERSION);
assert.equal(current.traitTableSha256,versions.find(v=>v.version==="continuity")!.traitTableSha256);
assert.deepEqual(current.insectMergeCounts,{twoKindsOneStar:2,twoKindsTwoStar:3,fourKindsTwoStar:2});
assert.deepEqual(versions.find(v=>v.version==="jungle")!.insectMergeCounts,
  {twoKindsOneStar:3,twoKindsTwoStar:3,fourKindsTwoStar:3});
assert.equal(current.capabilities.wushi,true);
const firstForm=wushiBattle.frames.find(frame=>frame.fighters.some(f=>f.wushi && f.wushi.until>frame.tick));
assert.ok(firstForm,"the showcase must exercise an actual transformation");
const result={checkedAt:new Date().toISOString(),rules:RULES.version,combatVersion:CURRENT_COMBAT_VERSION,
  kind:"offline-rule-routing-and-deterministic-frame-audit-not-browser-evidence",
  sourceFingerprints:Object.fromEntries(["src/engine/types.ts","src/data/traits.ts","src/data/units.ts",
    "src/engine/progression.ts","src/engine/persistence.ts","src/engine/game.ts","src/engine/ai.ts",
    "src/engine/battle.ts","src/engine/wushi.ts","src/data/skills.ts","src/data/jungle-demo.ts",
    "src/data/wushi-demo.ts","scripts/inheritance-audit.ts"]
    .concat(["src/engine/shuriken.ts","src/data/shuriken-demo.ts","src/engine/secret-orb.ts","src/data/secret-orb-demo.ts"])
    .map(file=>[file,sha(readFileSync(file))])),
  versions,currentTraitTable:traitTiers(CURRENT_COMBAT_VERSION),
  demo:{winner:battle.winner,finalFrame:battle.frames.length-1,battleSha256:sha(JSON.stringify(battle)),
    initial:analyzeBattle(battle,0),final:analyzeBattle(battle)},
  wushiDemo:{kind:"unequal-budget-showcase-not-normal-economy",winner:wushiBattle.winner,
    finalFrame:wushiBattle.frames.length-1,battleSha256:sha(JSON.stringify(wushiBattle)),
    firstFormTick:firstForm.tick,initial:analyzeBattle(wushiBattle,0),final:analyzeBattle(wushiBattle)},
  shurikenDemo:{kind:"unequal-budget-showcase-not-normal-economy",winner:shurikenBattle.winner,
    finalFrame:shurikenBattle.frames.length-1,battleSha256:sha(JSON.stringify(shurikenBattle)),
    initial:analyzeBattle(shurikenBattle,0),final:analyzeBattle(shurikenBattle)},
  secretOrbDemo:{kind:"unequal-budget-showcase-not-normal-economy",winner:orbBattle.winner,
    finalFrame:orbBattle.frames.length-1,battleSha256:sha(JSON.stringify(orbBattle)),
    initial:analyzeBattle(orbBattle,0),final:analyzeBattle(orbBattle)},
  secretOrbCounterDemo:{kind:"one-unit-silence-counterplay-not-normal-economy",winner:orbCounterBattle.winner,
    finalFrame:orbCounterBattle.frames.length-1,battleSha256:sha(JSON.stringify(orbCounterBattle)),
    initial:analyzeBattle(orbCounterBattle,0),final:analyzeBattle(orbCounterBattle)},
};
const path=`docs/analysis/inheritance-v${RULES.version.split("-")[1].replace(".","")}.json`;
writeFileSync(path,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({path,versions:versions.length,current,
  demo:{winner:result.demo.winner,seconds:result.demo.final.seconds},
  wushiDemo:{winner:result.wushiDemo.winner,seconds:result.wushiDemo.final.seconds,
    firstFormTick:result.wushiDemo.firstFormTick},
  shurikenDemo:{winner:result.shurikenDemo.winner,seconds:result.shurikenDemo.final.seconds},
  secretOrbDemo:{winner:result.secretOrbDemo.winner,seconds:result.secretOrbDemo.final.seconds,
    monk:result.secretOrbDemo.final.sides[0].fighters.find(f=>f.defId==="monk")},
  secretOrbCounterDemo:{winner:result.secretOrbCounterDemo.winner,seconds:result.secretOrbCounterDemo.final.seconds,
    monk:result.secretOrbCounterDemo.final.sides[0].fighters.find(f=>f.defId==="monk")}}));
