import {describe,it,expect} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,damage,heal,gainMana,interruptAirSkill,type CombatContext} from "../src/engine/abilities";
import {advanceExecutions,executionActionBusy,executionMarks,executionLanding,expireExecutionMarks} from "../src/engine/execution";
import {expireUndying,isUndying} from "../src/engine/immortality";
import {attackTargets,usesEnergy,skillReady} from "../src/engine/triggers";
import {EXECUTION} from "../src/data/skills";
import {EXECUTION_DEMO} from "../src/data/execution-demo";
import {unitDefinition} from "../src/data/unit-stats";
import {UNITS,COPIES,RULES} from "../src/data/units";
import {catalogCost} from "../src/data/catalog";
import {createGame,buy,sell,nextRound} from "../src/engine/game";
import {decodeSave,validGame,SAVE_SCHEMA} from "../src/engine/persistence";
import {isRecruitable} from "../src/engine/rotation";
import {synergies} from "../src/engine/synergies";
import {pieceCopies} from "../src/engine/progression";
import {equipmentStats} from "../src/data/items";
import {abilityCredit} from "../src/engine/ai";
import {itemScore} from "../src/engine/equipment";
import {compute} from "../src/compute/job";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {pieceDetails} from "../src/ui/bench-tooltip";
import {MELEE_ACTIONS,meleePose,isMelee} from "../src/render/melee";
import {executionLabels,executionPose} from "../src/render/execution";
import {compactBattleLabels,fighterBattleMarkup} from "../src/render/battle-inspection";
import {fighterName} from "../src/engine/summons";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type Fighter,type Piece,type Game,type CombatVersion} from "../src/engine/types";
import frozen from "./fixtures/pre-v073-execution-replays.json";

const piece=(defId:string,uid:number,star=1,position:number|null=35):Piece=>({defId,uid,star,position});
function fighter(id:string,uid:number,side:0|1,star=1,x=3,y=4){const f=army([piece(id,uid,star)],side)[0];Object.assign(f,{x,y,mana:100});return f;}
const context=(...fighters:Fighter[]):CombatContext=>({fighters,tick:10,events:[],effects:[]});
function setup(star=1){const source=fighter("reaper",101,0,star),target=fighter("guard",201,1,1,3,3);return {source,target,ctx:context(source,target)};}
function cast(star=1,hp=1){const s=setup(star);s.target.hp=hp;expect(castSkill(s.ctx,s.source,s.target)).toBe(true);s.ctx.tick+=EXECUTION.windup;advanceExecutions(s.ctx);return s;}
const hash=async(value:unknown)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))))).map(n=>n.toString(16).padStart(2,"0")).join("");
function oldGame(ban=false){
 const game=createGame(73,"classic");game.combatVersion="tortoise";game.catalogVersion="spirit-ward";
 if(ban)game.bannedSeries=["不朽","灵能","海神"];
 for(const p of game.players){p.pieces=[];p.shop=Array(RULES.shop).fill(null);p.gold=50;}
 game.pool=Object.fromEntries(UNITS.filter(u=>u.id!=="reaper").map(u=>[u.id,isRecruitable(game,u.id)?COPIES[catalogCost(game,u.id)]:0]));
 game.nextUid=1000;return game;
}
const save=(game:Game)=>JSON.stringify({schema:71,rules:"singleplayer-0.72",savedAt:1,revision:1,game,playback:{time:2,speed:2,paused:true}});
const computed=compute({kind:"replay",...EXECUTION_DEMO,version:CURRENT_COMBAT_VERSION});
if(computed.kind!=="replay")throw Error("Unexpected demo computation");
const demo=computed.battle;

describe("勾魂使的叠印与真实普通攻击",()=>{
 it("按原卡与S04加入三费不朽刺杀，2格双刀动作，并使四不朽可组成",()=>{
  expect(UNITS).toHaveLength(64);expect(unitDefinition("reaper")).toMatchObject({cost:3,traits:["不朽","刺杀"],hp:550,attack:56,armor:5,range:2,interval:4.8,initialMana:0});
  expect(EXECUTION.cooldown).toBe(60);expect(EXECUTION.puppetDuration.slice(1)).toEqual([16,24]);
  const lineup=["vine","bonedragon","treant","reaper"].map((id,i)=>piece(id,i+1,1,32+i));
  expect(synergies(lineup).find(s=>s.trait==="不朽")).toMatchObject({count:4,tier:2,active:true});
  expect(isMelee("reaper")).toBe(true);expect(pieceDetails(lineup[3]).melee).toBe(true);expect(MELEE_ACTIONS.reaper.name).toContain("弯刀");expect(meleePose("reaper",0.45)).not.toEqual(meleePose("shadowblade",0.45));
 });
 it("前三次命中叠印，叠满当击起改为真伤，不生成额外伤害包",()=>{
  const {source,target,ctx}=setup();target.armor=100;
  const amounts=[0,1,2,3].map(()=>damage(ctx,source,target,100));
  expect(amounts).toEqual([14,14,100,100]);expect(ctx.events).toHaveLength(4);expect(ctx.events.map(e=>e.damageType)).toEqual(["physical","physical","true","true"]);
  expect(source.reaper).toMatchObject({marks:3,trueHits:2,trueDamage:200});expect(executionMarks(source,target)).toBe(3);
 });
 it("闪避和残魂免伤不施印，护盾被命中仍可叠印",()=>{
  const {source,target,ctx}=setup();target.air!.flying=true;target.air!.evasion=1;
  damage(ctx,source,target,100);expect(target.reaperMarks).toBeUndefined();target.air!.evasion=0;
  target.immortal={duration:8,until:30,spent:true};damage(ctx,source,target,100);expect(target.reaperMarks).toBeUndefined();
  delete target.immortal;target.shield=200;damage(ctx,source,target,100);expect(executionMarks(source,target)).toBe(1);expect(ctx.events.at(-1)!.absorbed).toBeGreaterThan(0);
 });
 it("不同来源分别叠印，转火不把印记迁移或错误共享",()=>{
  const s=setup(),other=fighter("reaper",102,0,1,4,4),second=fighter("guard",202,1,1,4,3);s.ctx.fighters.push(other,second);
  damage(s.ctx,s.source,s.target,10);damage(s.ctx,s.source,s.target,10);damage(s.ctx,other,s.target,10);damage(s.ctx,other,s.target,10);
  expect(executionMarks(s.source,s.target)).toBe(2);expect(executionMarks(other,s.target)).toBe(2);expect(s.ctx.events.at(-1)!.damageType).toBe("physical");
  damage(s.ctx,s.source,second,10);expect(executionMarks(s.source,second)).toBe(1);expect(executionMarks(s.source,s.target)).toBe(2);
 });
 it("法术、周期及反伤不能施印；灵鱼能清除已有印记",()=>{
  const s=setup(),fish=fighter("fish",301,1,1,4,3);s.ctx.fighters.push(fish);
  damage(s.ctx,s.source,s.target,10,"magic",true);damage(s.ctx,s.source,s.target,10,"true",false,true,0,false,true);
  expect(s.target.reaperMarks).toBeUndefined();damage(s.ctx,s.source,s.target,10);expect(executionMarks(s.source,s.target)).toBe(1);
  expect(castSkill(s.ctx,fish,s.source)).toBe(true);expect(s.target.reaperMarks).toBeUndefined();
 });
 it("印记随死亡、化蛋、残魂或来源消亡清理，不遗留幽灵来源",()=>{
  const s=setup();damage(s.ctx,s.source,s.target,10);s.source.hp=0;expireExecutionMarks(s.ctx);expect(s.target.reaperMarks).toBeUndefined();
 });
});

describe("闪现刑杀与短暂无法选中",()=>{
 it("优先落在目标背后，起手扣能量/CD，半秒后释放，收束帧不能普攻",()=>{
  const s=setup();expect(executionLanding(s.ctx,s.source,s.target)).toEqual({x:3,y:2});expect(castSkill(s.ctx,s.source,s.target)).toBe(true);
  expect([s.source.x,s.source.y]).toEqual([3,2]);expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(70);expect(executionActionBusy(s.source,10)).toBe(true);
  s.ctx.tick=11;advanceExecutions(s.ctx);expect(s.source.reaper!.executions).toBe(0);
  s.ctx.tick=12;advanceExecutions(s.ctx);expect(s.source.reaper!.executions).toBe(1);expect(executionActionBusy(s.source,12)).toBe(true);expect(s.ctx.events.at(-1)!.amount).toBe(144);
 });
 it("没有相邻空位不消耗能量，背后被占可选侧翼，不能叠在友军身上",()=>{
  const s=setup();for(const [i,[x,y]] of [[3,2],[2,3],[4,3]].entries())s.ctx.fighters.push(fighter("guard",301+i,0,1,x,y));
  expect(executionLanding(s.ctx,s.source,s.target)).toBeUndefined();expect(castSkill(s.ctx,s.source,s.target)).toBe(false);expect(s.source.mana).toBe(100);
  s.ctx.fighters.pop();expect(castSkill(s.ctx,s.source,s.target)).toBe(true);expect([s.source.x,s.source.y]).toEqual([4,3]);
 });
 it("潜行不能被普通或召唤物选中，但仍承受已发出的范围伤害",()=>{
  const s=setup();castSkill(s.ctx,s.source,s.target);expect(attackTargets(s.target,s.ctx.fighters,10)).not.toContain(s.source);
  delete s.target.signature;expect(attackTargets(s.target,s.ctx.fighters,10)).not.toContain(s.source);
  const before=s.source.hp;damage(s.ctx,s.target,s.source,100,"magic",true);expect(s.source.hp).toBe(before-80);
 });
 it("满印翻倍并只清除本来源印记，法强在起手冻结",()=>{
  const s=setup(2);s.target.hp=s.target.maxHp=3000;s.target.reaperMarks=[{source:101,stacks:3},{source:102,stacks:2}];s.source.skillPower=1.5;
  castSkill(s.ctx,s.source,s.target);s.source.skillPower=20;s.ctx.tick=12;advanceExecutions(s.ctx);
  expect(s.ctx.events.at(-1)!.amount).toBe(720);expect(s.source.reaper).toMatchObject({executions:1,enhanced:1});expect(s.target.reaperMarks).toEqual([{source:102,stacks:2}]);
 });
 it.each(["stun","silence","charm","death"])("%s会打断，保留能量/CD成本且不重复记中断",status=>{
  const s=setup();castSkill(s.ctx,s.source,s.target);if(status==="stun")s.source.stunUntil=30;if(status==="silence")s.source.silenceUntil=30;
  if(status==="charm"){s.source.side=1;s.source.charm={side:0,attack:s.source.attack,until:30};}if(status==="death")s.source.hp=0;
  s.ctx.tick=12;advanceExecutions(s.ctx);interruptAirSkill(s.ctx,s.source);
  expect(s.source.reaper).toMatchObject({executions:0,interrupted:1});expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(70);expect(executionActionBusy(s.source,12)).toBe(true);
 });
 it("目标隐蔽、死亡、离开或变为友军时落空，不重选目标",()=>{
  for(const failure of ["hidden","dead","range","side"]){const s=setup();castSkill(s.ctx,s.source,s.target);
   if(failure==="hidden")s.target.air!.phaseUntil=30;if(failure==="dead")s.target.hp=0;if(failure==="range")s.target.x=7;if(failure==="side")s.target.side=0;
   s.ctx.tick=12;advanceExecutions(s.ctx);expect(s.source.reaper!.missed).toBe(1);expect(s.source.reaper!.executions).toBe(0);
  }
 });
 it("残魂可以开始刑杀，但残魂到期会撤销未释放的处决",()=>{
  const s=setup();s.source.immortal={duration:1,until:11,spent:true};s.source.hp=1;expect(castSkill(s.ctx,s.source,s.target)).toBe(true);
  s.ctx.tick=11;expireUndying(s.ctx);advanceExecutions(s.ctx);expect(s.source.hp).toBe(0);expect(s.source.reaper!.interrupted).toBe(1);expect(s.source.reaper!.executions).toBe(0);
 });
});

describe("刑傀击杀转化和死亡优先级",()=>{
 it.each([2,3])("%i星刑杀击杀生成独立我方残魂，持续时间按原卡4/6秒",star=>{
  const s=cast(star),puppet=s.ctx.fighters.find(f=>f.executionPuppet)!;
  expect(s.target.hp).toBe(0);expect(puppet.uid).not.toBe(s.target.uid);expect(puppet.side).toBe(0);expect(puppet.homeSide).toBe(0);expect(isUndying(puppet)).toBe(true);
  expect(puppet.executionPuppet).toMatchObject({owner:101,victim:201,born:12,until:12+EXECUTION.puppetDuration[star-1]});expect(puppet.damage).toBe(0);expect(s.source.reaper!.puppets).toBe(1);expect(fighterName(puppet)).toContain("刑傀");
 });
 it("一星或普通攻击击杀没有刑傀",()=>{
  expect(cast(1).ctx.fighters.some(f=>f.executionPuppet)).toBe(false);const s=setup(2);s.target.hp=1;damage(s.ctx,s.source,s.target,100);expect(s.ctx.fighters.some(f=>f.executionPuppet)).toBe(false);
 });
 it("残魂不能回能、治疗或施法，免疫伤害；来源死亡不提前消散",()=>{
  const s=cast(2),puppet=s.ctx.fighters.find(f=>f.executionPuppet)!;s.source.hp=0;
  expect(usesEnergy(puppet)).toBe(false);expect(skillReady(puppet)).toBe(false);gainMana(puppet,100,13);heal(s.ctx,s.source,puppet,1000);expect(puppet.hp).toBe(1);expect(puppet.mana).toBe(0);
  const enemy=fighter("infantry",301,1);s.ctx.fighters.push(enemy);expect(damage(s.ctx,enemy,puppet,1000)).toBe(0);
  s.ctx.tick=27;expireUndying(s.ctx);expect(puppet.hp).toBe(1);s.ctx.tick=28;expireUndying(s.ctx);expect(puppet.hp).toBe(0);
 });
 it("刑傀替代原敌人的不朽续战，不留下敌我两份残魂",()=>{
  const s=setup(2);s.target.immortal={duration:24,until:0,spent:false};s.target.hp=1;castSkill(s.ctx,s.source,s.target);s.ctx.tick=12;advanceExecutions(s.ctx);
  expect(s.target.hp).toBe(0);expect(s.target.immortal.spent).toBe(false);expect(s.ctx.fighters.filter(f=>f.executionPuppet)).toHaveLength(1);
 });
 it("支援余辉和爆裂虫殉爆优先，不生成刑傀",()=>{
  for(const id of ["guard","blastbug"]){const s=setup(2);if(id==="blastbug")s.target=fighter("blastbug",201,1,1,3,3);else s.target.supportHeal=100;
   s.target.hp=1;s.ctx=context(s.source,s.target,fighter("guard",202,1,1,6,6));castSkill(s.ctx,s.source,s.target);s.ctx.tick=12;advanceExecutions(s.ctx);
   expect(s.ctx.fighters.some(f=>f.executionPuppet)).toBe(false);if(id==="blastbug")expect(s.target.deathBurst).toBe("spent");
  }
 });
 it("不死鸟先化蛋，火种不被转化；已经重生的鸟可以变成刑傀",()=>{
  for(const stage of ["body","egg","hatched"]){const s=setup(2);s.target=fighter("phoenix",201,1,2,3,3);s.target.hp=1;
   if(stage==="egg"){s.target.phoenix!.spent=true;s.target.phoenix!.eggUntil=30;}
   if(stage==="hatched"){s.target.phoenix!.spent=true;s.target.phoenix!.hatched=true;}
   s.ctx=context(s.source,s.target);castSkill(s.ctx,s.source,s.target);s.ctx.tick=12;advanceExecutions(s.ctx);
   expect(s.ctx.fighters.some(f=>f.executionPuppet)).toBe(stage==="hatched");if(stage==="body")expect(s.target.phoenix!.eggUntil).toBeGreaterThan(12);
  }
 });
 it("已落地血鹰保留落地普攻，未落地者不能在刑傀期间再变形",()=>{
  for(const active of [false,true]){const s=setup(2);s.target=fighter("bloodhawk",201,1,1,3,3);s.target.hawkForm!.active=active;s.target.hp=1;s.ctx=context(s.source,s.target);
   castSkill(s.ctx,s.source,s.target);s.ctx.tick=12;advanceExecutions(s.ctx);const puppet=s.ctx.fighters.find(f=>f.executionPuppet)!;
   expect(puppet.hawkForm!.active).toBe(active);expect(skillReady(puppet)).toBe(false);
  }
 });
 it("转化敌方勾魂使不产生无限施印或再次转化",()=>{
  const s=setup(2);s.target=fighter("reaper",201,1,2,3,3);s.target.hp=1;s.ctx=context(s.source,s.target);castSkill(s.ctx,s.source,s.target);s.ctx.tick=12;advanceExecutions(s.ctx);
  const puppet=s.ctx.fighters.find(f=>f.executionPuppet)!;expect(puppet.reaper).toBeUndefined();expect(skillReady(puppet)).toBe(false);
 });
 it("敌人生前贡献留在原阵营，刑傀产生的伤害单独归功给我方",()=>{
  const s=setup(2),other=fighter("infantry",301,1,1,4,3);s.ctx.fighters.push(other);
  damage(s.ctx,s.target,s.source,100);s.target.hp=1;castSkill(s.ctx,s.source,s.target);s.ctx.tick=12;advanceExecutions(s.ctx);
  const puppet=s.ctx.fighters.find(f=>f.executionPuppet)!;damage(s.ctx,puppet,other,100);
  const analysis=analyzeBattle({frames:[{tick:12,fighters:s.ctx.fighters,events:s.ctx.events,effects:s.ctx.effects}],winner:null,damage:3});
  expect(analysis.sides[1].fighters.find(f=>f.uid===201)).toMatchObject({normalDamage:77});
  expect(analysis.sides[0].fighters.find(f=>f.uid===puppet.uid)).toMatchObject({normalDamage:77});
 });
 it("复制体不重复发出原主体的法球、光环或旧技能统计",()=>{
  for(const id of ["bonedragon","acolyte","deer"]){const s=setup(2);s.target=fighter(id,201,1,1,3,3);s.target.hp=1;s.ctx=context(s.source,s.target);
   castSkill(s.ctx,s.source,s.target);s.ctx.tick=12;advanceExecutions(s.ctx);const puppet=s.ctx.fighters.find(f=>f.executionPuppet)!;
   expect(puppet).toBeDefined();expect(puppet.boneblast).toBeUndefined();expect(puppet.gospelAura).toBeUndefined();expect(puppet.spiritWard).toBeUndefined();
  }
 });
});

describe("经营与历史兼容",()=>{
 it("45版旧63种定义哈希保持，旧战报不因新兵种混入额外属性",async()=>{
  expect(frozen.definitions).toHaveLength(45);for(const row of frozen.definitions)expect(await hash(frozen.ids.map(id=>unitDefinition(id,row.version as CombatVersion)))).toBe(row.sha256);
  expect(COMBAT_VERSIONS).toContain("execution");
 });
 for(const row of frozen.replays)it(`${row.version}旧小局面SHA保持`,async()=>expect(await hash(simulate(row.left,row.right,row.version as CombatVersion))).toBe(row.sha256));
 it.each([false,true])("旧目录迁移只补新兵种池，禁不朽=%s时正确按零/整池加入",ban=>{
  const game=oldGame(ban),before=structuredClone(game);expect(validGame(game)).toBe(true);const decoded=decodeSave(save(game));expect(decoded.status).toBe("migrated");const after=decoded.data!.game;
  expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(after.pool).toEqual({...before.pool,reaper:ban?0:COPIES[3]});expect(after.players).toEqual(before.players);expect(after.history).toEqual(before.history);expect(after.catalogVersion).toBe("spirit-ward");expect(after.combatVersion).toBe(CURRENT_COMBAT_VERSION);
 });
 it("旧战斗保持旧规则到下一准备阶段，不改变已存战报和已拥有费用",()=>{
  const game=oldGame();game.players[0].pieces=[piece("infantry",101)];game.pool.infantry--;game.phase="battle";
  const decoded=decodeSave(save(game));expect(decoded.status).toBe("migrated");expect(decoded.data!.game.combatVersion).toBe("tortoise");expect(catalogCost(decoded.data!.game,"turtle")).toBe(4);
  const p=decoded.data!.game.players[0];expect(p.pieces).toEqual(game.players[0].pieces);
 });
 it("购买、合星、出售与随机禁用守恒，刑傀不会出现在真实持有或卡池",()=>{
  const game=createGame(73,"classic"),p=game.players[0];p.gold=100;
  for(const owner of game.players){for(const id of owner.shop)if(id)game.pool[id]++;owner.shop=Array(5).fill(null);}
  for(let i=0;i<3;i++){p.shop[0]="reaper";game.pool.reaper--;expect(buy(game,p,0)).toBe(true);}
  const own=p.pieces.find(f=>f.defId==="reaper")!;expect(own.star).toBe(2);expect(p.pieces).toHaveLength(1);expect(pieceCopies(own)).toBe(3);expect(validGame(game)).toBe(true);
  sell(game,p,own.uid);expect(game.pool.reaper).toBe(COPIES[3]);expect(validGame(game)).toBe(true);expect(isRecruitable({bannedSeries:["不朽","野兽","空军"]},"reaper")).toBe(false);
 });
 it("当前档缺新池或伪造份数会拒绝，历史缺新池只在迁移前允许",()=>{
  const game=oldGame();game.combatVersion=CURRENT_COMBAT_VERSION;expect(validGame(game)).toBe(false);game.pool.reaper=COPIES[3]+1;expect(validGame(game)).toBe(false);
 });
});

describe("同一小演示与真实贡献",()=>{
 it("Worker入口和快算一致，演示实际叠印、满印刑杀与转化，输入不变",()=>{
  const last=demo.frames.at(-1)!,source=last.fighters.find(f=>f.uid===101)!;expect(source.reaper!.trueHits).toBeGreaterThan(0);expect(source.reaper!.puppets).toBeGreaterThan(0);
  expect(simulateOutcome(EXECUTION_DEMO.left,EXECUTION_DEMO.right).final.fighters).toEqual(last.fighters);expect(EXECUTION_DEMO.left[0].items).toEqual(["heart","blade","coil"]);
  const born=demo.frames.find(f=>f.fighters.some(s=>s.executionPuppet))!;expect(born).toBeDefined();const puppet=born.fighters.find(f=>f.executionPuppet)!;
  expect(born.events.some(e=>e.attacker===puppet.uid)).toBe(false);expect(analyzeBattle(demo,0).sides[0].fighters.some(f=>f.executionPuppet)).toBe(false);
  expect(demo.frames.flatMap(f=>f.events).some(e=>e.attacker===puppet.uid&&e.amount>0)).toBe(true);
  expect(battleAnalysisMarkup(analyzeBattle(demo),"damage","刑杀",last.tick,last.tick)).toContain("刑傀");
 });
 it("详情、刻印和潜行姿态反映当前帧，AI分开计算普攻和刑杀收益",()=>{
  const s=setup();castSkill(s.ctx,s.source,s.target);expect(executionPose(s.source,11).alpha).toBeLessThan(1);expect(compactBattleLabels(s.source,11)).toContain("刑杀潜行");
  expect(executionLabels(s.source,11).join()).toContain("刑杀冷却");expect(fighterBattleMarkup(s.source,11,executionLabels(s.source,11))).toContain("潜行");
  const p=piece("reaper",1,2),gear=equipmentStats([]);expect(abilityCredit(p,{...gear,skillPower:1})).toBeGreaterThan(abilityCredit(p,gear));expect(itemScore(p,"crystal")).toBeGreaterThan(0);
 });
});
