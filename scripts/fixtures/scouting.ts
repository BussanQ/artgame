import { createGame } from "../../src/engine/game";
import { deployLineup } from "../../src/engine/ai";
import { validGame } from "../../src/engine/persistence";
import { pieceCopies } from "../../src/engine/progression";
import { catalogCost } from "../../src/data/catalog";
import { COPIES,UNITS } from "../../src/data/units";
import type { AiProfileId,Piece,RoundReport } from "../../src/engine/types";

/** Synthetic held-roster comparisons, never normal-economy or human-game evidence. */
export const SCOUTING_ROSTERS = [
  {name:"sniper-screen",profile:"infantry",ids:["guard","infantry","sniper","cannon","medic","thunderlord","fish"],star:2},
  {name:"psychic-mixed",profile:"psychic",ids:["cavalry","panda","thunderlord","adept","monk","master","wolf"],star:2},
  {name:"armor-guns",profile:"armor",ids:["irondog","ironape","specialist","sniper","repair","medic","cannon"],star:2},
  {name:"immortal-line",profile:"free",ids:["vine","bonedragon","infantry","sniper","medic","guard","cannon"],star:2},
  {name:"late-sniper",profile:"infantry",ids:["guard","infantry","sniper","cannon","medic","thunderlord","specialist"],star:3},
] as const;
export const SCOUTING_OPPONENTS = [
  {name:"infantry",ids:["guard","infantry","sniper","specialist","flametrooper","medic","birdrider"]},
  {name:"puppets",ids:["shieldthrall","swordthrall","axethrall","staffthrall","bladethrall","adept","medic"]},
  {name:"psychic",ids:["stormcaller","acolyte","arhat","thunderlord","guard","medic","ironrooster"]},
  {name:"beasts",ids:["panda","wolf","pangolin","elephant","venombeast","tiger","medic"]},
  {name:"fleet",ids:["ark","skycrab","ghostjet","whale","repair","dragonfly","cannon"]},
] as const;
export function scoutingFixture(rosterName:string,enemyName:string,formation:"spread"|"compact",ownTree=true,ownId:0|1=1){
  const spec=SCOUTING_ROSTERS.find(s=>s.name===rosterName),foe=SCOUTING_OPPONENTS.find(s=>s.name===enemyName);
  if(!spec||!foe)throw new Error("Unknown scouting fixture");
  const g=createGame(73,"classic");g.round=19;g.difficulty="standard";
  for(const p of g.players){
    p.pieces=[];p.inventory=[];p.shop=p.id<2?[null,null,null,null,null]:[];
    if(p.id>=2){p.hp=0;p.eliminatedRound=18;}
  }
  const player=g.players[ownId],enemy=g.players[1-ownId];
  player.level=enemy.level=7;player.gold=30;
  if(ownId!==0&&spec.profile!=="free")player.aiProfile=spec.profile as AiProfileId;
  player.pieces=spec.ids.map((defId,i):Piece=>({uid:i+1,defId,star:spec.star,position:null}));
  if(ownTree)player.pieces.push({uid:8,defId:"treant",star:1,position:null});
  enemy.pieces=foe.ids.map((defId,i):Piece=>({uid:101+i,defId,star:2,position:null}));
  g.nextUid=108;player.shop[0]="treant";
  g.pool=Object.fromEntries(UNITS.map(u=>[u.id,COPIES[catalogCost(g,u.id)]]));
  for(const owner of g.players){
    for(const p of owner.pieces)g.pool[p.defId]-=pieceCopies(p);
    for(const id of owner.shop)if(id)g.pool[id]--;
  }
  g.history=Array.from({length:18},(_,i):RoundReport=>({round:i+1,combatVersion:g.combatVersion,
    opponentId:2,opponentName:g.players[2].name,kind:"pvp",winner:0,damage:0,income:5,hp:100,gold:10,
    left:[{uid:100000,defId:"guard",star:1,position:35}],right:[]}));
  deployLineup(player,"standard");deployLineup(enemy,"standard",formation);
  if(!validGame(g))throw new Error(`Invalid scouting fixture ${rosterName}/${enemyName}/${formation}`);
  return{g,player,enemy};
}
