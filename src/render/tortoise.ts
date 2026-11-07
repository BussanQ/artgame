import type {Fighter} from "../engine/types";
import {TORTOISE} from "../data/skills";
import {REST_POSE,type AttackPose} from "./melee";
import {project} from "./projection";

export function tortoisePose(f:Pick<Fighter,"tortoise">,time:number,attack?:number):AttackPose{
  const state=f.tortoise;if(!state)return {...REST_POSE};
  if(state.casting){
    const t=Math.min(1,Math.max(0,(time-state.casting.start)/(state.casting.release-state.casting.start)));
    return {...REST_POSE,scaleX:1+t*0.08,scaleY:1-t*0.12,lift:-t*3};
  }
  if(state.mode==="shell")return {...REST_POSE,scaleX:1.05,scaleY:0.94};
  if(state.mode==="breach"&&attack!==undefined){
    const wave=Math.sin(Math.max(0,Math.min(1,attack))*Math.PI);
    return {...REST_POSE,forward:wave*16,lift:Math.sin(attack*Math.PI*2)*5,rotation:-wave*0.12,scaleX:1+wave*0.08,scaleY:1-wave*0.1,impact:wave};
  }
  return {...REST_POSE};
}
export function drawTortoises(c:CanvasRenderingContext2D,fighters:Fighter[],time:number,reducedMotion:boolean){
  c.save();
  for(const source of fighters){
    const state=source.tortoise;if(!state||source.hp<=0)continue;
    const at=project(source.x+0.5,source.y+0.6);
    if(state.mode==="shell"||state.casting){
      c.strokeStyle="#a6eac9";c.lineWidth=2;c.globalAlpha=0.75;
      c.beginPath();c.ellipse(at.x,at.y-25,43,40,0,Math.PI,Math.PI*2);c.stroke();
      if(state.mode==="shell"){
        c.setLineDash([3,7]);c.beginPath();c.ellipse(at.x,at.y,48,15,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
      }
    }
    const strike=state.strike;
    if(strike&&time>=strike.tick&&time-strike.tick<2.4){
      const center=project(strike.x+0.5,strike.y+0.5),t=(time-strike.tick)/2.4,r=reducedMotion?1:0.4+t*0.8;
      c.globalAlpha=0.75*(1-t);c.strokeStyle="#ffc57b";c.lineWidth=3;
      c.beginPath();c.ellipse(center.x,center.y,53*r,24*r,0,0,Math.PI*2);c.stroke();
    }
  }
  c.restore();
}
export function tortoiseLabels(f:Fighter,time:number){
  const state=f.tortoise;if(!state)return [];
  const labels=[`玄武变形 ${state.formed}次 · 引火 ${state.taunts}人次`,`破壳群攻 ${state.swings}轮 · 额外命中 ${state.splashHits}人次`];
  if(state.casting)labels.push(`玄武蓄势 ${Math.max(0,(state.casting.release-time)/4).toFixed(2)}s`);
  if(state.mode){
    labels.push(`${state.mode==="shell"?"龟缩":"破壳"}判定 · 我方${state.allies} / 敌方${state.enemies}`);
    labels.push(state.mode==="shell"?`龟缩护甲 +${TORTOISE.armor[f.star-1]} · 法术减伤 +${Math.round(TORTOISE.resist[f.star-1]*100)}% · 停止普攻`:
      `破壳护甲 -${TORTOISE.breachArmorLoss} · 群攻 ${Math.round(TORTOISE.multiplier[f.star-1]*100)}%攻击`);
  }
  if(!state.mode&&(f.skillReadyAt??0)>time)labels.push(`玄武冷却 ${((f.skillReadyAt!-time)/4).toFixed(1)}s`);
  if(state.interrupted)labels.push(`变形中断 ${state.interrupted}次`);
  return labels;
}
