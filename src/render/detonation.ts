import {CURRENT_COMBAT_VERSION,hasDetonationRules,type CombatEffect,type Fighter,type CombatVersion} from "../engine/types";
import {DETONATION} from "../data/skills";
import {project} from "./projection";

/** Old catalog pieces keep their original close attack even in a newer battle. */
export function blastbugAnimationVersion(f:Pick<Fighter,"defId"|"deathBurst"|"detonation">,version:CombatVersion=CURRENT_COMBAT_VERSION):CombatVersion{
  return f.defId==="blastbug"&&f.deathBurst&&!f.detonation&&hasDetonationRules(version)?"sea-fog":version;
}

/** One burst at the actual death position; its tile outline matches the damage geometry. */
export function drawDetonationEffect(c:CanvasRenderingContext2D,e:CombatEffect,age:number,reduced:boolean){
  if(e.name!=="爆裂虫·自爆")return false;
  if(age<0||age>=3.5)return true;
  c.save();
  c.strokeStyle="#8cebf3";c.fillStyle="#77deed";
  c.lineWidth=reduced?1.5:2;c.globalAlpha=reduced?0.25:0.35*(1-age/3.5);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    if(Math.abs(x-e.from.x)+Math.abs(y-e.from.y)>DETONATION.radius)continue;
    const points=[project(x,y),project(x+1,y),project(x+1,y+1),project(x,y+1)];
    c.beginPath();c.moveTo(points[0].x,points[0].y);
    for(const p of points.slice(1))c.lineTo(p.x,p.y);
    c.closePath();c.fill();c.stroke();
  }
  const p=project(e.from.x+0.5,e.from.y+0.5);
  if(!reduced){
    c.globalAlpha=Math.max(0,1-age/3.5);c.lineWidth=3;c.shadowColor="#73eeff";c.shadowBlur=10;
    c.beginPath();c.ellipse(p.x,p.y-22,15+age*24,8+age*13,0,0,Math.PI*2);c.stroke();
    for(let i=0;i<10;i++){
      const a=i*Math.PI/5,r=16+age*26;
      c.beginPath();c.moveTo(p.x+Math.cos(a)*r,p.y-22+Math.sin(a)*r*0.55);
      c.lineTo(p.x+Math.cos(a)*(r+9),p.y-22+Math.sin(a)*(r+9)*0.55);c.stroke();
    }
  }
  c.globalAlpha=reduced?0.9:Math.max(0,1-age/4);
  c.font="bold 16px sans-serif";c.textAlign="center";c.fillStyle="#c9faff";
  c.fillText("自爆",p.x,p.y-63);c.restore();
  return true;
}

export function detonationLabels(f:Fighter){
  const s=f.detonation;
  if(!s)return [];
  return [`死亡自爆 ${s.explosions}/1次 · 波及 ${s.hits}人次 · 生命伤害 ${s.damage} · 破盾 ${s.shieldDamage}`,
    `自爆基础 ${DETONATION.damage[f.star-1]} · 法强后 ${Math.round(DETONATION.damage[f.star-1]*f.skillPower)} · 生命不增加伤害 · 2格范围`];
}
