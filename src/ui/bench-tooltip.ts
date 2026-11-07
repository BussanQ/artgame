import { unitArmor, unitDefinition, unitSprite,unitAttackInterval,unitMinimumAttackInterval } from "../data/unit-stats";
import { CURRENT_COMBAT_VERSION } from "../engine/types";
import { salePrice } from "../engine/progression";
import { traitTiers } from "../data/traits";
import { equipmentStats, ITEM } from "../data/items";
import { skillDescription, skillName } from "../data/skills";
import { isRanged, rangedActionName } from "../render/ranged";
import { RULES, UNIT } from "../data/units";
import type { Piece, CombatVersion } from "../engine/types";
import { isMelee, MELEE_ACTIONS } from "../render/melee";
export function pieceDetails(
  piece: Piece,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
  costVersion: CombatVersion = version,
) {
  version=piece.definitionVersion??version;
  const u = unitDefinition(piece.defId, version),
    scale = 2 ** (piece.star - 1),
    gear = equipmentStats(piece.items),
    tiers = traitTiers(version);
  return {
    name: u.name,
    flying: !!u.flying,
    melee: isMelee(u.id,version),
    hp: u.hp * scale + gear.hp,
    attack: u.attack * scale + gear.attack,
    armor: unitArmor(u, piece.star) + gear.armor,
    magicResist: Math.round(((u.magicResist ?? 0.2) + gear.magicResist) * 100),
    regeneration: u.regeneration ?? 0,
    range: u.range,
    interval: Math.max(unitMinimumAttackInterval(u,version), unitAttackInterval(u,piece.star,version) * (1 - gear.haste)) * RULES.tickSeconds,
    items: (piece.items ?? []).map((id) => ITEM[id]),
    skillPower: Math.round(gear.skillPower * 100),
    skill: skillName(u.id, version),
    skillDescription: skillDescription(u.id, version),
    sell: salePrice(piece, costVersion),
    action: isMelee(u.id, version)
      ? MELEE_ACTIONS[u.id].name
      : isRanged(u.id, version)
        ? rangedActionName(u.id, version)
        : "普通攻击",
    traits: u.traits.map((t) => ({
      name: t,
      threshold: tiers[t][0].count,
      description: tiers[t]
        .map((tier) => `${tier.count} 个：${tier.description}`)
        .join("；"),
    })),
  };
}
export function pieceDetailMarkup(
  p: Piece,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
  costVersion: CombatVersion = version,
): string {
  version=p.definitionVersion??version;
  const d = pieceDetails(p, version, costVersion);
  return `<div class="tooltip-heading"><img src="/assets/units/${unitSprite(p.defId, version, p.star)}.png" alt=""><div><strong>${d.name}</strong><span>${"★".repeat(p.star)} · ${p.star} 星</span><small>${d.flying ? "飞行" : "地面"} · ${d.melee ? "近战" : "远程"} · ${d.action}</small></div></div><div class="tooltip-stats"><span>生命<b>${d.hp}</b></span><span>攻击<b>${d.attack}</b></span><span>护甲<b>${d.armor}</b></span><span>射程<b>${d.range} 格</b></span><span>攻击间隔<b>${d.interval.toFixed(2)} 秒</b></span><span>出售价格<b>${d.sell} 金</b></span><span>法术减伤<b>${d.magicResist}%</b></span>${d.regeneration ? `<span>自然回复<b>${d.regeneration} 生命/秒</b></span>` : ""}</div><p class="tooltip-basis">当前星级与装备属性 · 未计入上阵羁绊</p><section><b>${d.skill}</b><p>${d.skillDescription}</p></section>${d.items.length ? `<section><b>已装备 · 技能强度 +${d.skillPower}%</b>${d.items.map((i) => `<p>${i.icon} ${i.name} · ${i.description}</p>`).join("")}</section>` : ""}<section><b>兵种与职业</b>${d.traits.map((t) => `<p><em>${t.name} · ${t.threshold} 个不同棋子</em>${t.description}</p>`).join("")}</section>`;
}
export function pieceInfoMarkup(
  p: Piece,
  version: CombatVersion = CURRENT_COMBAT_VERSION,
  costVersion: CombatVersion = version,
  finalReview = false,
): string {
  const title = finalReview ? "终局棋子详情" : "棋子详情";
  const location = p.position === null
    ? "备战席"
    : `场上 ${String.fromCharCode(65 + p.position % 8)}${Math.floor(p.position / 8) + 1}`;
  return `<div class="modal-backdrop"><section class="modal piece-info-modal" role="dialog" aria-modal="true" aria-label="${title}"><div class="piece-info-header"><div><span class="eyebrow">UNIT INTELLIGENCE</span><h2>${title}</h2></div><button class="close" data-action="close" aria-label="关闭">×</button></div><div class="piece-info-body">${finalReview ? `<p class="micro">终局回顾 · ${location} · 最后记录的星级与装备。</p>` : ""}${pieceDetailMarkup(p, version, costVersion)}</div></section></div>`;
}
export class BenchTooltip {
  private element = document.createElement("aside");
  private anchor: HTMLElement | null = null;
  private touchInput = false;
  private dismissTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    root: HTMLElement,
    private getPiece: (uid: number) => Piece | undefined,
    private getVersion: () => CombatVersion = () => CURRENT_COMBAT_VERSION,
    private getCostVersion?: () => CombatVersion,
  ) {
    this.element.id = "bench-tooltip";
    this.element.className = "bench-tooltip";
    this.element.setAttribute("role", "tooltip");
    this.element.hidden = true;
    document.body.append(this.element);
    const find = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>("[data-bench-info]")
        : null;
    root.addEventListener("pointerdown", (e) => {
      this.touchInput = e.pointerType === "touch";
      if (this.touchInput) this.hide();
    });
    root.addEventListener("pointerover", (e) => {
      if (e.pointerType === "touch") return;
      const a = find(e.target);
      if (a) this.show(a);
    });
    root.addEventListener("pointerout", (e) => {
      const a = find(e.target);
      if (
        a &&
        !a.contains(e.relatedTarget as Node) &&
        !this.element.contains(e.relatedTarget as Node)
      )
        this.dismissSoon();
    });
    root.addEventListener("focusin", (e) => {
      if (this.touchInput) return;
      const a = find(e.target);
      if (a) this.show(a);
    });
    root.addEventListener("focusout", (e) => {
      if (find(e.target) && !find(e.relatedTarget)) this.dismissSoon();
    });
    this.element.addEventListener("pointerenter", () =>
      clearTimeout(this.dismissTimer),
    );
    this.element.addEventListener("pointerleave", () => this.hide());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Tab") this.touchInput = false;
      if (e.key === "Escape") this.hide();
    });
    window.addEventListener("resize", () => this.position());
    window.addEventListener("scroll", () => this.position(), true);
  }
  private dismissSoon() {
    clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => this.hide(), 120);
  }
  hide() {
    clearTimeout(this.dismissTimer);
    this.anchor?.querySelector("button")?.removeAttribute("aria-describedby");
    this.anchor?.removeAttribute("aria-describedby");
    this.anchor = null;
    this.element.hidden = true;
  }
  private show(anchor: HTMLElement) {
    clearTimeout(this.dismissTimer);
    if (this.anchor === anchor && !this.element.hidden) return;
    const p = this.getPiece(Number(anchor.dataset.benchInfo));
    if (!p) return;
    this.hide();
    this.anchor = anchor;
    (anchor.querySelector("button") ?? anchor).setAttribute(
      "aria-describedby",
      this.element.id,
    );
    this.element.innerHTML = pieceDetailMarkup(
      p,
      this.getVersion(),
      this.getCostVersion?.() ?? this.getVersion(),
    );
    this.element.hidden = false;
    this.position();
  }
  private position() {
    if (!this.anchor || this.element.hidden) return;
    if (!this.anchor.isConnected) {
      this.hide();
      return;
    }
    const r = this.anchor.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) {
      this.hide();
      return;
    }
    // A compact bench can sit near the middle of the screen. Use the room
    // beside it for long descriptions before introducing an internal scroll.
    // Every placement keeps the hovered slot clear so it remains clickable.
    const spaceAbove = Math.max(0, r.top - 22),
      spaceBelow = Math.max(0, innerHeight - r.bottom - 22),
      placeAbove = spaceAbove >= spaceBelow;
    this.element.style.maxHeight = `${Math.max(0, innerHeight - 24)}px`;
    const naturalWidth = this.element.offsetWidth,
      naturalHeight = this.element.offsetHeight,
      fitsRight = r.right + naturalWidth + 22 <= innerWidth,
      fitsLeft = r.left >= naturalWidth + 22;
    if (
      naturalHeight > Math.max(spaceAbove, spaceBelow) &&
      (fitsRight || fitsLeft)
    ) {
      this.element.style.left = `${fitsRight ? r.right + 10 : r.left - naturalWidth - 10}px`;
      this.element.style.top = `${Math.max(12, Math.min(innerHeight - naturalHeight - 12, r.top + r.height / 2 - naturalHeight / 2))}px`;
      return;
    }
    this.element.style.maxHeight = `${placeAbove ? spaceAbove : spaceBelow}px`;
    const w = this.element.offsetWidth,
      h = this.element.offsetHeight;
    this.element.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
    this.element.style.top = `${placeAbove ? r.top - h - 10 : r.bottom + 10}px`;
  }
}
