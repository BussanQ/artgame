import {describe,expect,it} from "vitest";
import {army,simulate,simulateOutcome} from "../src/engine/battle";
import {castSkill,damage,gainMana,heal,interruptAirSkill,type CombatContext} from "../src/engine/abilities";
import {advanceWildfireAction,advanceWildfirePulses,expireWildfires,wildfirePulseDamage} from "../src/engine/wildfire";
import {hatchPhoenix,isPhoenixEgg,phoenixFlameCells} from "../src/engine/phoenix";
import {skillReady,usesEnergy} from "../src/engine/triggers";
import {WILDFIRE,skillDescription,skillRole} from "../src/data/skills";
import {WILDFIRE_DEMO} from "../src/data/wildfire-demo";
import {unitDefinition,unitSprite} from "../src/data/unit-stats";
import {catalogCost,catalogUnit} from "../src/data/catalog";
import {COPIES,RULES,UNITS} from "../src/data/units";
import {traitTiers} from "../src/data/traits";
import {COMBAT_VERSIONS,CURRENT_COMBAT_VERSION,type CombatVersion,type Fighter,type Piece} from "../src/engine/types";
import {analyzeBattle} from "../src/engine/battle-analysis";
import {compute} from "../src/compute/job";
import {createGame,buy,sell,nextRound} from "../src/engine/game";
import {decodeSave,SAVE_SCHEMA,validGame} from "../src/engine/persistence";
import {mergeCount,pieceCopies} from "../src/engine/progression";
import {abilityCredit,pieceStrength} from "../src/engine/ai";
import {fighterSprite} from "../src/engine/summons";
import {wildfireLabels,wildfirePalette,wildfirePose} from "../src/render/wildfire";
import {compactBattleLabels} from "../src/render/battle-inspection";
import {REST_POSE} from "../src/render/melee";
import {pieceDetails,pieceDetailMarkup} from "../src/ui/bench-tooltip";
import {battleAnalysisMarkup} from "../src/ui/battle-analysis";
import {equipmentOverviewMarkup} from "../src/ui/equipment";
import {deploymentMarkup} from "../src/ui/deployment";
import {scoutingMarkup} from "../src/ui/scouting";
import {codexCards,codexFilters} from "../src/ui/unit-codex";
import {recruitmentMarkup} from "../src/ui/recruitment";
import frozen from "./fixtures/pre-v064-phoenix-replays.json";
import paid from "./fixtures/opening-ai-reserve.json";

const piece=(defId:string,uid:number,star=1):Piece=>({defId,uid,star,position:51});
function setup(star=1){
  const source=army([piece("phoenix",1,star)],0)[0],target=army([piece("guard",2)],1)[0];
  Object.assign(source,{x:3,y:6,mana:100});Object.assign(target,{x:3,y:3,hp:10000,maxHp:10000,magicResist:0});
  const ctx:CombatContext={fighters:[source,target],tick:0,events:[],effects:[]};return {source,target,ctx};
}
function begin(s:ReturnType<typeof setup>){expect(castSkill(s.ctx,s.source,s.target)).toBe(true);return s;}
function run(s:ReturnType<typeof setup>,ticks:number){
  for(let i=0;i<ticks;i++){
    s.ctx.tick++;hatchPhoenix(s.ctx);advanceWildfirePulses(s.ctx);
    for(const f of s.ctx.fighters)advanceWildfireAction(s.ctx,f);
    expireWildfires(s.ctx);
  }
}
function oldVersion(name:string):CombatVersion{
  const v=COMBAT_VERSIONS.find(v=>v===name);if(!v)throw Error(name);return v;
}

describe("燎原的持续区域",()=>{
  for(const [star,total,duration,pulses] of [[1,450,16,8],[2,600,22,11],[3,1050,28,14]])
    it(`${star}星在${duration/4}秒内分${pulses}跳累计${total}基础法伤，首跳不提前`,()=>{
      const s=begin(setup(star));expect(s.source.mana).toBe(0);expect(s.source.skillReadyAt).toBe(60);
      run(s,1);expect(s.source.wildfire!.formed).toBe(0);expect(s.target.hp).toBe(10000);
      run(s,1);expect(s.source.wildfire!.formed).toBe(1);expect(s.source.wildfire!.channel!.totalPulses).toBe(pulses);
      run(s,1);expect(s.target.hp).toBe(10000);run(s,duration-1);
      expect(s.target.hp).toBe(10000-total);expect(s.source.wildfire).toMatchObject({formed:1,pulses,hits:pulses,interrupted:0});
      expect(s.source.wildfire!.channel).toBeUndefined();expect(s.source.wildfire!.casting).toBeUndefined();
      expect(s.ctx.events.map(e=>[e.skill,e.primary,e.periodic,e.damageType])).toEqual(Array.from({length:pulses},()=>[true,false,true,"magic"]));
      expect(s.ctx.events.reduce((n,e)=>n+e.amount,0)).toBe(total);run(s,8);expect(s.target.hp).toBe(10000-total);
    });

  it("累积分摊不因8/11跳舍入丢失基础伤害，法强总预算也精确到整数",()=>{
    for(const total of [450,600,1050,675,900,1575])for(const pulses of [8,11,14])
      expect(Array.from({length:pulses},(_,i)=>wildfirePulseDamage(total,i,pulses)).reduce((a,b)=>a+b,0)).toBe(total);
    const s=setup(2);s.source.skillPower=1.5;begin(s);s.source.skillPower=10;s.source.attack=100000;
    run(s,24);expect(s.target.hp).toBe(9100);expect(s.source.wildfire!.channel).toBeUndefined();
  });

  it("固定5×3方向，目标离开不携带持续伤害，其他敌人进入才受后续跳数",()=>{
    const s=begin(setup());expect(phoenixFlameCells(s.source,s.target)).toHaveLength(15);run(s,4);
    expect(s.target.hp).toBe(9944);s.target.x=7;
    const incoming=army([piece("ghostjet",3)],1)[0],ally=army([piece("guard",4)],0)[0];
    Object.assign(incoming,{x:3,y:2,hp:10000,maxHp:10000,magicResist:0});incoming.air!.phaseUntil=100;
    Object.assign(ally,{x:3,y:4});s.ctx.fighters.push(incoming,ally);run(s,14);
    expect(s.target.hp).toBe(9944);expect(incoming.hp).toBe(9606);expect(ally.hp).toBe(ally.maxHp);
    expect(s.target.burn).toBeUndefined();expect(s.source.wildfire!.hits).toBe(8);
  });

  it("每跳读取当时魔抗和护盾，纯破盾计有效命中，不把破盾计为生命伤害",()=>{
    const s=begin(setup(2));s.target.shield=55;run(s,4);
    expect(s.target.hp).toBe(10000);expect(s.target.shield).toBe(0);expect(s.source.damage).toBe(0);
    expect(s.source.wildfire!.hits).toBe(1);s.target.magicResist=0.5;run(s,2);
    expect(s.target.hp).toBe(9973);s.target.magicResist=0;run(s,2);expect(s.target.hp).toBe(9918);
    expect(s.source.damage).toBe(82);expect(s.ctx.events[0]).toMatchObject({amount:0,absorbed:55});
  });

  it("狂舞免伤和不朽残魂不算有效命中；免伤结束后仍在区域才会受伤",()=>{
    const s=begin(setup()),soul=structuredClone(s.target);soul.uid=3;soul.y=2;
    soul.hp=1;soul.immortal={spent:true,until:100,duration:20};s.ctx.fighters.push(soul);
    s.target.bladeStorm={until:100,next:100,remaining:6,damage:1};run(s,4);
    expect(s.source.wildfire!.hits).toBe(0);expect(s.target.hp).toBe(10000);expect(soul.hp).toBe(1);
    delete s.target.bladeStorm;run(s,2);expect(s.source.wildfire!.hits).toBe(1);expect(s.target.hp).toBe(9943);
  });

  for(const phase of ["startup","channel"])for(const kind of ["stun","silence","charm","death"])
    it(`${kind}打断${phase}，不再结算或返还能量/冷却，只记一次中断`,()=>{
      const s=begin(setup(2));if(phase==="channel")run(s,4);const hp=s.target.hp;
      if(kind==="stun")s.source.stunUntil=100;if(kind==="silence")s.source.silenceUntil=100;
      if(kind==="charm"){s.source.charm={side:0,until:100,attack:s.source.attack};s.source.side=1;}
      if(kind==="death")s.source.hp=0;run(s,30);
      expect(s.target.hp).toBe(hp);expect(s.source.wildfire!.casting).toBeUndefined();expect(s.source.wildfire!.channel).toBeUndefined();
      expect(s.source.wildfire!.interrupted).toBe(1);expect(s.source.skillReadyAt).toBe(60);
      expect(s.ctx.effects.filter(e=>e.source===1&&e.name==="施法中断")).toHaveLength(1);
    });

  it("共享控制接口立即终止喷火，不留待下一帧才清理",()=>{
    const s=begin(setup());run(s,4);interruptAirSkill(s.ctx,s.source);
    expect(s.source.wildfire!.channel).toBeUndefined();expect(s.source.wildfire!.interrupted).toBe(1);
    run(s,20);expect(s.target.hp).toBe(9944);expect(s.source.wildfire!.interrupted).toBe(1);
  });

  for(const reason of ["range","friendly","hidden","dead","coincident","cooldown","stun","silence","charm"])
    it(`${reason}不开始新燎原、不消耗能量`,()=>{
      const s=setup();if(reason==="range")s.target.y=0;if(reason==="friendly")s.target.side=0;
      if(reason==="hidden")s.target.air!.phaseUntil=100;if(reason==="dead")s.target.hp=0;
      if(reason==="coincident")s.target.y=6;if(reason==="cooldown")s.source.skillReadyAt=1;
      if(reason==="stun")s.source.stunUntil=100;if(reason==="silence")s.source.silenceUntil=100;
      if(reason==="charm")s.source.charm={side:0,until:100,attack:s.source.attack};
      expect(castSkill(s.ctx,s.source,s.target)).toBe(false);expect(s.source.mana).toBe(100);expect(s.source.wildfire!.casting).toBeUndefined();
    });

  it("引导时不能重入；15秒冷却从蓄焰开始，结束后可再次施法",()=>{
    const s=begin(setup());run(s,4);s.source.mana=100;
    expect(skillReady(s.source)).toBe(false);expect(castSkill(s.ctx,s.source,s.target)).toBe(false);
    run(s,14);s.ctx.tick=59;expect(castSkill(s.ctx,s.source,s.target)).toBe(false);
    s.ctx.tick=60;begin(s);run(s,18);expect(s.source.wildfire!.formed).toBe(2);expect(s.target.hp).toBe(9100);
  });
});

describe("燎原与涅槃的生命周期",()=>{
  it("小型演示通过真实模拟展示三种星级、持续喷火、中断和成功孵化",()=>{
    const before=structuredClone(WILDFIRE_DEMO),battle=simulate(WILDFIRE_DEMO.left,WILDFIRE_DEMO.right);
    expect(WILDFIRE_DEMO).toEqual(before);
    const birds=battle.frames.at(-1)!.fighters.filter(f=>f.wildfire);
    expect(new Set(birds.map(f=>f.star))).toEqual(new Set([1,2,3]));
    expect(birds.some(f=>f.wildfire!.pulses>0&&f.wildfire!.hits>0)).toBe(true);
    expect(birds.some(f=>f.wildfire!.interrupted>0&&f.wildfire!.hatches>0)).toBe(true);
    for(const frame of battle.frames){
      for(const f of frame.fighters.filter(f=>f.wildfire?.casting||f.wildfire?.channel)){
        expect(frame.events.filter(e=>e.attacker===f.uid&&!e.skill&&!e.reflected&&!e.periodic)).toHaveLength(0);
        const previous=battle.frames[frame.tick-1]?.fighters.find(a=>a.uid===f.uid);
        if(previous?.wildfire?.casting||previous?.wildfire?.channel)expect([f.x,f.y]).toEqual([previous.x,previous.y]);
      }
    }
  });

  for(const star of [1,2,3])it(`${star}星首次致死：一星阵亡，二/三星800/1600火种，三秒后满血零能量重生且保留冷却`,()=>{
    const s=setup(star);s.source=army([{...piece("phoenix",1,star),items:["heart"]}],0)[0];
    Object.assign(s.source,{x:3,y:6,mana:100});s.ctx.fighters[0]=s.source;const max=s.source.maxHp;
    begin(s);run(s,4);damage(s.ctx,s.target,s.source,99999,"true");
    expect(s.source.wildfire!.interrupted).toBe(1);expect(s.source.wildfire!.channel).toBeUndefined();
    expect(s.source.wildfire!.eggs).toBe(star===1?0:1);
    if(star===1){expect(s.source.hp).toBe(0);expect(isPhoenixEgg(s.source)).toBe(false);return;}
    expect(s.source.hp).toBe(star===2?800:1600);expect(s.source.air!.flying).toBe(false);expect(fighterSprite(s.source)).toBe("phoenix-egg");
    run(s,11);expect(isPhoenixEgg(s.source)).toBe(true);run(s,1);
    expect(s.source.hp).toBe(max);expect(s.source.mana).toBe(0);expect(s.source.healing).toBe(0);expect(s.source.skillReadyAt).toBe(60);
    expect(s.source.wildfire).toMatchObject({eggs:1,hatches:1,brokenEggs:0});expect(s.source.air!.flying).toBe(true);
    damage(s.ctx,s.target,s.source,99999,"true");run(s,15);expect(s.source.hp).toBe(0);expect(s.source.wildfire!.eggs).toBe(1);
  });

  it("反伤致死变蛋立即终止同一跳余下受害者，不能借新生命完成喷火",()=>{
    const s=setup(2),back=structuredClone(s.target);back.uid=3;back.y=2;s.ctx.fighters.push(back);
    s.source.hp=1;s.target.reflection=20;begin(s);run(s,4);
    expect(isPhoenixEgg(s.source)).toBe(true);expect(s.target.hp).toBe(9945);expect(back.hp).toBe(10000);
    expect(s.source.wildfire).toMatchObject({formed:1,pulses:1,hits:1,interrupted:1,eggs:1});
    run(s,12);expect(s.source.wildfire!.hatches).toBe(1);expect(back.hp).toBe(10000);
  });

  it("火种被击碎只记一次，后续不会孵化；治疗、护盾、回能及负面状态不会穿过变蛋",()=>{
    const s=setup(2);s.source.burn=[{source:2,next:1,remaining:3,damage:100}];
    s.source.sonic=[{source:2,next:1,remaining:3,damage:100}];
    damage(s.ctx,s.target,s.source,99999,"true");expect(s.source.burn).toBeUndefined();expect(s.source.sonic).toBeUndefined();
    s.source.hp=100;heal(s.ctx,s.source,s.source,10000);gainMana(s.source,100,s.ctx.tick);
    const deer=army([piece("deer",3)],0)[0];deer.mana=100;s.ctx.fighters.push(deer);castSkill(s.ctx,deer,s.target);
    expect(s.source.hp).toBe(100);expect(s.source.mana).toBe(0);expect(s.source.shield).toBe(0);expect(usesEnergy(s.source)).toBe(false);
    damage(s.ctx,s.target,s.source,99999,"true");damage(s.ctx,s.target,s.source,99999,"true");run(s,20);
    expect(s.source.hp).toBe(0);expect(s.source.wildfire).toMatchObject({eggs:1,brokenEggs:1,hatches:0});
  });

  it("最后一枚火种仍维持战斗；同一小局面完整、快速与Worker回放一致且输入不变",()=>{
    const left=[{...piece("phoenix",1,2),position:35}],right=[{...piece("guard",2,3),position:35}];
    const input=structuredClone([left,right]),full=simulate(left,right),quick=simulateOutcome(left,right);
    const worker=compute({kind:"replay",left,right,version:CURRENT_COMBAT_VERSION});
    expect(worker.kind).toBe("replay");if(worker.kind!=="replay")return;
    expect(worker.battle).toEqual(full);expect(quick.final.fighters).toEqual(full.frames.at(-1)!.fighters);
    expect([quick.winner,quick.damage]).toEqual([full.winner,full.damage]);expect([left,right]).toEqual(input);
    const egg=full.frames.find(f=>f.fighters.some(a=>a.uid===1&&a.hp>0&&isPhoenixEgg(a)))!;
    expect(egg).toBeDefined();expect(full.frames.at(-1)!.tick).toBeGreaterThan(egg.tick);
    expect(full.frames.some(f=>f.effects.some(e=>e.name==="浴火重生"))).toBe(true);
    for(const frame of full.frames){const live=frame.fighters.filter(f=>f.hp>0);
      expect(new Set(live.map(f=>`${f.x}:${f.y}`)).size).toBe(live.length);
      const a=frame.fighters.find(f=>f.uid===1)!;
      if(a.wildfire?.casting||a.wildfire?.channel||isPhoenixEgg(a))
        expect(frame.events.filter(e=>e.attacker===1&&!e.skill&&!e.reflected&&!e.periodic)).toHaveLength(0);
    }
    const before=analyzeBattle(full,0).sides[0].fighters[0],after=analyzeBattle(full).sides[0].fighters[0];
    expect(before.wildfire).toEqual({formed:0,pulses:0,hits:0,interrupted:0,eggs:0,hatches:0,brokenEggs:0});
    expect(after.wildfire).toMatchObject({eggs:1,hatches:1});
    expect(after.wildfire).not.toHaveProperty("channel");expect(battleAnalysisMarkup(analyzeBattle(full),"damage","涅槃",full.frames.length-1,full.frames.at(-1)!.tick)).toContain("成功重生 1 次");
  });

  it("专属喷火姿态、分星级配色与详情统计只读，不向过去时间片泄露未来统计",()=>{
    const s=begin(setup()),before=structuredClone(s.source);
    expect(wildfirePose(s.source,1)).not.toEqual(REST_POSE);expect(compactBattleLabels(s.source,1)).toContain("燎原蓄焰");
    expect(wildfireLabels(s.source,1).join()).toContain("燎原冷却");expect(s.source).toEqual(before);
    run(s,4);expect(wildfirePose(s.source,4)).not.toEqual(REST_POSE);expect(compactBattleLabels(s.source,4)).toContain("持续喷火");
    expect(wildfireLabels(s.source,4).join()).toContain("脉冲 1次");run(s,14);expect(wildfirePose(s.source,18)).toEqual(REST_POSE);
    expect(new Set([1,2,3].map(star=>wildfirePalette(star).fire)).size).toBe(3);
    const base=piece("phoenix",1),staff={...base,items:["staff"]};expect(abilityCredit(staff)).toBeGreaterThan(abilityCredit(base));
    expect(abilityCredit(staff)).toBeLessThanOrEqual(0.6);expect(pieceStrength(piece("phoenix",1,2))).toBeGreaterThan(pieceStrength(staff));
  });
});

describe("燎原目录、形态与旧局兼容",()=>{
  it("36个旧定义冻结，其余棋子、22类连携及异虫双合不改变",()=>{
    expect(frozen.definitions).toHaveLength(36);
    for(const entry of frozen.definitions)expect(unitDefinition("phoenix",oldVersion(entry.version))).toEqual(entry.unit);
    for(const u of UNITS.filter(u=>u.id!=="phoenix"))expect(unitDefinition(u.id,"wildfire")).toEqual(unitDefinition(u.id,"tornado"));
    expect(traitTiers(CURRENT_COMBAT_VERSION)).toEqual(traitTiers("tornado"));
    const party=["lion","winddragon","titan","ark","treant","master","panda","monk"].map((id,i)=>({...piece(id,i+1),position:32+i}));
    expect(army(party,0)).toEqual(army(party,0,"tornado"));expect(mergeCount([piece("eyebug",1),piece("spider",2)],"eyebug",1)).toBe(2);
    expect(unitDefinition("phoenix")).toMatchObject({cost:3,hp:450,attack:76,armor:5,range:3,interval:6.4,initialMana:25});
    expect(pieceDetails(piece("phoenix",1))).toMatchObject({hp:450,attack:76,interval:1.6});
    expect(skillRole("phoenix")).toContain("矩形");expect(skillDescription("phoenix")).toContain("450/600/1050");
    expect(skillDescription("phoenix","tornado")).toContain("90%");
  });

  for(const version of ["tornado","wildfire"] as const)
    it(`${version}目录真实购买/出售保留四/三费、15/25份池容量`,()=>{
      const game=createGame(1,"classic"),p=game.players[0],price=version==="wildfire"?3:4;
      game.catalogVersion=version;game.pool.phoenix=COPIES[price];p.level=5;
      expect(catalogCost(game,"phoenix")).toBe(price);expect(catalogUnit(game,"phoenix")).toMatchObject({cost:price,hp:450});
      game.pool[p.shop[0]!]++;p.shop[0]="phoenix";game.pool.phoenix--;
      expect(validGame(game)).toBe(true);const gold=p.gold;expect(buy(game,p,0)).toBe(true);expect(p.gold).toBe(gold-price);
      expect(sell(game,p,p.pieces[0].uid)).toBe(true);expect(p.gold).toBe(gold);expect(game.pool.phoenix).toBe(COPIES[price]);expect(validGame(game)).toBe(true);
    });

  it("备战详情、精确部署、侦察、装备持有者、图鉴及商店均采用实际星级形态；旧版保持原图",()=>{
    const game=createGame(1,"classic"),p=game.players[0];
    for(const star of [1,2,3]){
      const a={...piece("phoenix",100,star),position:35,items:["staff"]},sprite=unitSprite("phoenix",CURRENT_COMBAT_VERSION,star);
      p.pieces=[a];p.level=5;
      expect(fighterSprite(army([a],0)[0])).toBe(sprite);expect(pieceDetailMarkup(a)).toContain(`/${sprite}.png`);
      expect(deploymentMarkup(p,null,false,true)).toContain(`/${sprite}.png`);expect(scoutingMarkup(game,0)).toContain(`/${sprite}.png`);
      expect(equipmentOverviewMarkup(game)).toContain(`/${sprite}.png`);codexFilters.star=star;
      expect(codexCards(game)).toContain(`/${sprite}.png`);expect(unitSprite("phoenix","tornado",star)).toBe("phoenix");
      expect(fighterSprite(army([a],0,"tornado")[0])).toBe("phoenix");
    }
    codexFilters.star=1;p.shop[0]="phoenix";expect(recruitmentMarkup(game,p,false)).toContain("/phoenix-wildfire-blue.png");
  });

  for(const phase of ["prepare","battle","result","finished"] as const)
    it(`0.63 ${phase}迁移仅准备期采用新技能，资源、旧目录、历史和播放进度保留`,()=>{
      const input:unknown=structuredClone(paid.game);if(!validGame(input))throw Error("Invalid reserve capture");const game=input;
      game.combatVersion="tornado";game.phase=phase;
      if(phase==="result"||phase==="finished"){
        game.round--;game.players[0].hp=game.history.at(-1)!.hp;
        if(phase==="finished"){
          const p=game.players[0];for(const held of p.pieces)game.pool[held.defId]+=pieceCopies(held);for(const id of p.shop)if(id)game.pool[id]++;
          p.hp=0;p.eliminatedRound=game.round;p.pieces=[];p.shop=[];p.inventory=[];game.history.at(-1)!.hp=0;
        }
      }
      expect(validGame(game)).toBe(true);const before=structuredClone(game),playback={time:3.5,speed:2,paused:true};
      const decoded=decodeSave(JSON.stringify({schema:62,rules:"singleplayer-0.63",savedAt:1,revision:1,game,playback}));
      expect(decoded.status).toBe("migrated");expect(decoded.data!.schema).toBe(SAVE_SCHEMA);expect(decoded.data!.rules).toBe(RULES.version);
      expect(decoded.data!.game).toEqual({...before,...(phase==="prepare"?{combatVersion:CURRENT_COMBAT_VERSION}:{})});
      expect(decoded.data!.game.catalogVersion).toBe("secret-orb");expect(decoded.data!.playback).toEqual(playback);
      if(phase==="result"){nextRound(decoded.data!.game);expect(decoded.data!.game.combatVersion).toBe(CURRENT_COMBAT_VERSION);expect(decoded.data!.game.catalogVersion).toBe("secret-orb");}
    });

  it("缺少目录的0.63新局回填tornado，四费15份不被换成三费25份",()=>{
    const game=createGame(1,"classic");game.combatVersion="tornado";delete game.catalogVersion;game.pool.phoenix=COPIES[4];
    const decoded=decodeSave(JSON.stringify({schema:62,rules:"singleplayer-0.63",savedAt:1,revision:1,game,playback:{time:0,speed:1,paused:false}}));
    expect(decoded.status).toBe("migrated");expect(decoded.data!.game.catalogVersion).toBe("tornado");
    expect(catalogCost(decoded.data!.game,"phoenix")).toBe(4);expect(validGame(decoded.data!.game)).toBe(true);
  });

  for(const entry of frozen.fixtures)
    it(`冻结旧${entry.version}不死鸟完整回放，包括6次施法和一次涅槃`,async()=>{
      const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(simulate(entry.left,entry.right,oldVersion(entry.version)))));
      expect(Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")).toBe(entry.hash);
      expect([entry.phoenixCasts,entry.eggs,entry.hatches]).toEqual([6,1,1]);
    });
});
