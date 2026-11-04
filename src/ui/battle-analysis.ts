import { isPhoenixEgg } from "../engine/phoenix";
import { RULES } from "../data/units";
import { fighterName, fighterSprite, summonOwnerName } from "../engine/summons";
import type { BattleAnalysis, BattleMetric } from "../engine/battle-analysis";

export const BATTLE_METRICS: Record<BattleMetric, string> = {
  damage: "生命伤害",
  received: "生命承伤",
  healing: "有效治疗",
  absorbed: "护盾吸收",
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function battleAnalysisMarkup(
  analysis: BattleAnalysis,
  metric: BattleMetric,
  title: string,
  maxFrame: number,
  maxTick: number,
  canReplay = false,
) {
  const maximum = Math.max(
    1,
    ...analysis.sides.flatMap((side) => side.fighters.map((f) => f[metric])),
  );
  return `<div class="modal-backdrop"><section class="modal battle-analysis-modal" role="dialog" aria-modal="true" aria-label="战斗分析"><button class="close" data-action="close" aria-label="关闭">×</button><span class="eyebrow">BATTLE ANALYSIS</span><h2>战斗分析</h2><p class="analysis-subtitle">${escape(title)} · ${analysis.complete ? (analysis.winner === 0 ? "己方胜利" : analysis.winner === 1 ? "己方失败" : "战斗平局") : "战斗片段"}</p>
  <div class="analysis-controls"><label>比较指标<select data-analysis-metric aria-label="战斗分析指标">${Object.entries(
    BATTLE_METRICS,
  )
    .map(
      ([key, label]) =>
        `<option value="${key}" ${metric === key ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label><label class="analysis-timeline">统计至 <output>${analysis.seconds.toFixed(2)} 秒</output><input type="range" data-analysis-frame aria-label="战斗分析时间" min="0" max="${maxFrame}" step="1" value="${analysis.index}" ${maxFrame ? "" : "disabled"}><small>可查看至 ${(maxTick * RULES.tickSeconds).toFixed(2)} 秒；不改变战场播放进度</small></label></div>
  <div class="analysis-sides">${analysis.sides
    .map(
      (side) =>
        `<section class="analysis-side ${side.side ? "enemy" : "friendly"}" aria-label="${side.side ? "敌方" : "己方"}贡献"><div class="analysis-side-heading"><h3>${side.side ? "敌方" : "己方"}</h3><span>存活 ${side.survivors}/${side.fighters.length}${side.souls ? ` · 残魂 ${side.souls}` : ""}</span></div><div class="analysis-totals"><span>${BATTLE_METRICS[metric]}<b>${side[metric].toLocaleString("zh-CN")}</b></span><small>伤害 ${side.damage} · 治疗 ${side.healing}<br>承伤 ${side.received} · 承盾 ${side.absorbed}</small></div><ol class="contribution-list">${
          [...side.fighters]
            .sort((a, b) => b[metric] - a[metric] || a.uid - b.uid)
            .map(
              (f) =>
                `<li><div class="contribution-heading"><img src="/assets/units/${fighterSprite(f)}.png" alt=""><span><b>${fighterName(f)}</b><small>${f.summon ? `召唤物 · ${f.star} 星${summonOwnerName(f)}召唤` : "★".repeat(f.star)}${f.hawkForm?.active ? " · 地面形态" : ""}${isPhoenixEgg(f) ? " · 涅槃火种" : f.phoenix?.hatched ? " · 已重生" : ""} · ${f.undying ? "残魂作战中" : f.hp > 0 ? `生命 ${Math.ceil(f.hp)}/${f.maxHp}` : "已阵亡"}</small></span><strong>${f[metric].toLocaleString("zh-CN")}</strong></div><div class="contribution-track" aria-hidden="true"><i style="width:${((f[metric] / maximum) * 100).toFixed(2)}%"></i></div><p class="contribution-detail">普攻 ${f.normalDamage} · 技能 ${f.skillDamage}${f.reflectedDamage ? ` · 反伤 ${f.reflectedDamage}` : ""} · 破盾 ${f.shieldDamage}<br>承伤 ${f.received} · 治疗 ${f.healing} · 承盾 ${f.absorbed}${f.energyGiven ? ` · 供能 ${Math.round(f.energyGiven)}` : ""} · 施法 ${f.casts} 次${f.evades ? ` · 闪避 ${f.evades} 次` : ""}</p></li>`,
            )
            .join("") || '<li class="empty">无参战棋子</li>'
        }</ol></section>`,
    )
    .join("")}</div>
  ${canReplay ? '<div class="analysis-playback"><button data-action="analysis-frame">查看此刻战场</button><button data-action="analysis-replay">从头回放这场战斗</button></div>' : ""}<p class="analysis-note">伤害与承伤仅计实际扣除生命，不含过量伤害；破盾与护盾吸收单独统计。有效治疗计入装甲再生，不含溢出及先锋自然再生。每枚棋子独立列出，双方条形使用相同刻度。查看实时战斗会暂停播放，关闭后可手动继续。</p></section></div>`;
}
