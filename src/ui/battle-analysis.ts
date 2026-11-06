import { isPhoenixEgg } from "../engine/phoenix";
import { RULES } from "../data/units";
import { fighterName, fighterSprite, summonOwnerName } from "../engine/summons";
import type { BattleAnalysis, BattleMetric, UnitContribution } from "../engine/battle-analysis";

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
// The spell-specific count already describes these interrupted channels.
function interruptionMarkup(f: Pick<UnitContribution, "interruptions" | "secretOrb" | "wildfire" | "boneblast" | "thornbind" | "hive">) {
  const other = Math.max(0, f.interruptions - (f.secretOrb?.interrupted ?? 0) - (f.wildfire?.interrupted ?? 0) - (f.boneblast?.interrupted ?? 0) - (f.thornbind?.interrupted ?? 0) - (f.hive?.interrupted ?? 0));
  return other ? ` · 中断 ${other} 次` : "";
}
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
  return `<div class="modal-backdrop"><section class="modal battle-analysis-modal" role="dialog" aria-modal="true" aria-label="战斗分析"><header class="analysis-header"><div><span class="eyebrow">BATTLE ANALYSIS</span><h2>战斗分析</h2></div><button class="close" data-action="close" aria-label="关闭">×</button></header><div class="analysis-body"><p class="analysis-subtitle">${escape(title)} · ${analysis.complete ? (analysis.winner === 0 ? "己方胜利" : analysis.winner === 1 ? "己方失败" : "战斗平局") : "战斗片段"}</p>
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
                `<li><div class="contribution-heading"><img src="/assets/units/${fighterSprite(f)}.png" alt=""><span><b>${fighterName(f)}</b><small>${f.summon ? `召唤物 · ${f.star} 星${summonOwnerName(f)}召唤` : "★".repeat(f.star)}${f.hawkForm?.active ? " · 地面形态" : ""}${isPhoenixEgg(f) ? " · 涅槃火种" : f.phoenix?.hatched ? " · 已重生" : ""} · ${f.undying ? "残魂作战中" : f.hp > 0 ? `生命 ${Math.ceil(f.hp)}/${f.maxHp}` : "已阵亡"}</small></span><strong>${f[metric].toLocaleString("zh-CN")}</strong></div><div class="contribution-track" aria-hidden="true"><i style="width:${((f[metric] / maximum) * 100).toFixed(2)}%"></i></div><p class="contribution-detail">普攻 ${f.normalDamage} · 技能 ${f.skillDamage}${f.reflectedDamage ? ` · 反伤 ${f.reflectedDamage}` : ""} · 破盾 ${f.shieldDamage}<br>承伤 ${f.received} · 治疗 ${f.healing} · 承盾 ${f.absorbed}${f.energyGiven ? ` · 供能 ${Math.round(f.energyGiven)}` : ""} · 施法 ${f.casts} 次${f.hive ? ` · 连射 ${f.hive.volleys} 轮 / ${f.hive.needles} 针 · 震荡 ${f.hive.explosions} 次 · 内圈 ${f.hive.innerHits} 次 / 外圈 ${f.hive.outerHits} 次${f.hive.interrupted ? ` · 蓄力中断 ${f.hive.interrupted} 次` : ""}` : ""}${f.gaze ? ` · 凝视控制 ${f.gaze.controls} 人次 · 削能 ${Math.round(f.gaze.manaDrained)}` : ""}${f.rifle ? ` · 被动开火 ${f.rifle.shots} 次` : ""}${f.thornbind ? ` · 藤蔓结算 ${f.thornbind.pulses} 段 · 有效命中 ${f.thornbind.hits} 次 · 束缚 ${f.thornbind.roots} 次 · 汲取治疗 ${f.thornbind.healing} · 转火 ${f.thornbind.retargets} 次 · 藤蔓中断 ${f.thornbind.interrupted} 次` : ""}${f.boneblast ? ` · 骨球发出 ${f.boneblast.launched} 枚 · 落地 ${f.boneblast.detonated} 枚 · 有效波及 ${f.boneblast.hits} 人次 · 眩晕 ${f.boneblast.stuns} 次 · 蓄力中断 ${f.boneblast.interrupted} 次` : ""}${f.wildfire ? ` · 燎原形成 ${f.wildfire.formed} 次 · 脉冲 ${f.wildfire.pulses} 次 · 有效命中 ${f.wildfire.hits} 人次 · 中断 ${f.wildfire.interrupted} 次 · 涅槃火种 ${f.wildfire.eggs} 次 · 成功重生 ${f.wildfire.hatches} 次 · 火种破碎 ${f.wildfire.brokenEggs} 次` : ""}${f.tornado ? ` · 龙卷发出 ${f.tornado.launched} 道 · 接触 ${f.tornado.contacts} 人次 · 击飞 ${f.tornado.knockups} 次 · 落地眩晕 ${f.tornado.landings} 次` : ""}${f.warcry ? ` · 战吼 ${f.warcry.roars} 次 · 石化 ${f.warcry.petrified} 人次 · 反伤触发 ${f.warcry.retaliations} 次 / 伤害 ${f.warcry.retaliationDamage} / 破盾 ${f.warcry.retaliationShield}` : ""}${f.terminator ? ` · 小弹 ${f.terminator.smallLaunched} 枚 · 大弹 ${f.terminator.largeLaunched} 枚 · 引爆 ${f.terminator.detonated} 次 · 有效波及 ${f.terminator.hits} 人次` : ""}${f.bombardment ? ` · 机群出动 ${f.bombardment.launched} 次 · 轰炸命中 ${f.bombardment.hits} 人次` : ""}${f.secretOrb ? ` · 秘法球形成 ${f.secretOrb.formed} 次 · 脉冲 ${f.secretOrb.pulses} 次 · 有效波及 ${f.secretOrb.hits} 人次 · 实际削能 ${Math.round(f.secretOrb.energyRemoved)}${f.secretOrb.interrupted ? ` · 秘法球中断 ${f.secretOrb.interrupted} 次` : ""}` : ""}${f.shuriken ? ` · 飞镖发出 ${f.shuriken.launched} 枚 · 落地 ${f.shuriken.landings} 次 · 刃阵脉冲 ${f.shuriken.pulses} 次 · 有效波及 ${f.shuriken.hits} 人次${f.shuriken.interrupted ? ` · 飞镖蓄力中断 ${f.shuriken.interrupted} 次` : ""}` : ""}${f.wushi ? ` · 无式变身 ${f.wushi.forms} 次 · 横斩 ${f.wushi.sweeps} 次 · 波及 ${f.wushi.splashHits} 次${f.wushi.taunts !== undefined ? ` · 嘲讽施加 ${f.wushi.taunts} 人次` : ""}` : ""}${f.jungle ? ` · 丛林波 ${f.jungle.waves} 次 · 波及 ${f.jungle.hits} 次 · 击飞 ${f.jungle.knockups} 次 · 落地眩晕 ${f.jungle.landings} 次` : ""}${f.storm ? ` · 雷暴发出 ${f.storm.launched} 球 · 接触 ${f.storm.hits} 次 · 削能 ${Math.round(f.storm.energyRemoved)}` : ""}${f.gospelAura ? ` · 福音脉冲 ${f.gospelAura.pulses} 次 · 最多供能 ${f.gospelAura.peakTargets} 人` : ""}${interruptionMarkup(f)}${f.lostTargets ? ` · 目标丢失 ${f.lostTargets} 次` : ""}${f.lightning ? ` · 雷电攻击 ${f.lightning.attacks} 次 · 弹射 ${f.lightning.bounces} 次 / ${f.lightning.damage} 伤害` : ""}${f.tar ? ` · 投弹 ${f.tar.launched} 枚 · 引爆 ${f.tar.detonated} 枚` : ""}${f.taotie ? ` · 成功吞噬 ${f.taotie.feasts} 次` : ""}${f.criticalHits !== undefined ? ` · 暴击命中 ${f.criticalHits} 次` : ""}${f.peakGale !== undefined ? ` · 疾风最高 ${f.peakGale}/10层` : ""}${f.armorApplications !== undefined ? ` · 酸蚀命中 ${f.armorApplications} 次` : ""}${f.knockups !== undefined ? ` · 击飞 ${f.knockups} 次` : ""}${f.evades ? ` · 闪避 ${f.evades} 次` : ""}</p></li>`,
            )
            .join("") || '<li class="empty">无参战棋子</li>'
        }</ol></section>`,
    )
    .join("")}</div>
  ${canReplay ? '<div class="analysis-playback"><button data-action="analysis-frame">查看此刻战场</button><button data-action="analysis-replay">从头回放这场战斗</button></div>' : ""}<p class="analysis-note">伤害与承伤仅计实际扣除生命，不含过量伤害；破盾与护盾吸收单独统计。有效治疗计入装甲再生与棋子自带回复，不含溢出及旧版先锋自然再生。每枚棋子独立列出，双方条形使用相同刻度。中断次数按已记录的施法或蓄力中断计；目标丢失表示完成蓄力后失去合法目标。查看实时战斗会暂停播放，关闭后可手动继续。</p></div></section></div>`;
}
