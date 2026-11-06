import type { Fighter } from "../engine/types";
import { combatAttack, attackInterval } from "../engine/abilities";
import { effectiveArmor } from "../engine/triggers";
import { fighterName } from "../engine/summons";
import { isPhoenixEgg } from "../engine/phoenix";
import { project } from "./projection";
import { taotieScale } from "./taotie";
import { wushiScale } from "./wushi";
import { petrified } from "../engine/warcry";

/** Only urgent, short labels belong beside every combatant. Full effects live in its inspector. */
export function compactBattleLabels(f: Fighter, time: number) {
  const labels: string[] = [];
  if (f.stunUntil > time)
    labels.push(petrified(f,time) ? "石化" : f.knockup && f.knockup.until > time ? "击飞" : "眩晕");
  if (f.charm) labels.push("魅惑");
  if (f.taunt && f.taunt.until > time) labels.push("嘲讽");
  if ((f.silenceUntil ?? 0) > time) labels.push("沉默");
  if (isPhoenixEgg(f)) labels.push("涅槃");
  if (f.bladeStorm && f.bladeStorm.until > time) labels.push("狂舞免伤");
  if (f.air?.cast) labels.push(f.air.cast.kind === "tornado" ? "龙卷蓄风" : f.air.cast.kind === "warcry" ? "战吼蓄力" : f.air.cast.kind === "terminator" ? "双轮装填" : f.air.cast.kind === "bombardment" ? "机群起飞" : "施法中");
  if (f.windup) labels.push("蓄力");
  if (f.shuriken?.casting) labels.push("飞镖蓄力");
  if (f.secretOrb?.casting) labels.push("秘法蓄力");
  if (f.secretOrb?.channel) labels.push("维持秘法球");
  if (f.wushi?.casting) labels.push("无式蓄力");
  if (f.hp > 0 && f.wushi && f.wushi.until > time) labels.push("无式变身");
  if (taotieScale(f, time) > 1) labels.push("饕餮狂暴");
  if (f.gale?.stacks === 10) labels.push("疾风满层");
  if (f.aurora?.stacks) labels.push(`极光 ${f.aurora.stacks}/3`);
  if (f.immortal?.spent && f.hp > 0) labels.push("残魂");
  if (f.signature?.concealed) labels.push("隐蔽");
  if (f.burn?.length) labels.push("灼烧");
  return labels.slice(0, 2);
}

/** Match the frontmost rendered sprite, including its body above the occupied cell. */
export function pickBattleFighter(
  fighters: Fighter[],
  point: { x: number; y: number },
  time = 0,
) {
  return (
    fighters
      .filter((f) => f.hp > 0)
      .sort((a, b) => b.y - a.y || b.uid - a.uid)
      .find((f) => {
        const p = project(f.x + 0.5, f.y + 0.65);
        const scale =
          (1 + (f.star - 1) * 0.12) *
          (0.78 + f.y * 0.035) *
          (f.summon ? 0.7 : 1) *
          taotieScale(f, time) * wushiScale(f, time);
        return (
          Math.abs(point.x - p.x) <= 40 * scale &&
          point.y >= p.y - 125 * scale &&
          point.y <= p.y + 12 * scale
        );
      })?.uid ?? null
  );
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function fighterBattleMarkup(
  f: Fighter,
  time: number,
  labels: string[],
) {
  const armor = Math.max(
    0,
    effectiveArmor(f, time) - (f.armorBreakUntil > time ? f.armorBreak : 0),
  );
  return `<h3>${escape(fighterName(f))} <small>${f.side === 0 ? "己方" : "敌方"} · ${"★".repeat(f.star)}</small></h3><div class="battle-inspector-stats"><span>生命 <b>${Math.max(0, Math.round(f.hp))} / ${Math.round(f.maxHp)}</b></span><span>能量 <b>${f.gospelAura ? "被动供能" : `${Math.round(f.mana)} / 100`}</b></span><span>攻击 <b>${Math.round(combatAttack(f, time))}</b></span><span>间隔 <b>${(attackInterval(f, time) / 4).toFixed(2)} 秒</b></span><span>护甲 <b>${armor.toFixed(1)}</b></span><span>法术减伤 <b>${Math.round(f.magicResist * 100)}%</b></span></div>${labels.length ? `<ul>${labels.map((label) => `<li>${escape(label)}</li>`).join("")}</ul>` : ""}<p>点击棋子固定详情 · 点击空处或按 Esc 收起</p>`;
}
