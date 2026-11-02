import { isRanged, RANGED_ACTIONS } from "../render/ranged";
import { RULES, TRAITS, UNIT } from "../data/units";
import type { Piece } from "../engine/types";
import { isMelee, MELEE_ACTIONS } from "../render/melee";
export function pieceDetails(piece: Piece) {
  const u = UNIT[piece.defId],
    scale = 2 ** (piece.star - 1);
  return {
    name: u.name,
    hp: u.hp * scale,
    attack: u.attack * scale,
    armor: u.armor,
    range: u.range,
    interval: u.interval * RULES.tickSeconds,
    skill: u.skill,
    skillDamage: Math.round(u.attack * scale * 2.2),
    sell: u.cost * 3 ** (piece.star - 1),
    action: isMelee(u.id)
      ? MELEE_ACTIONS[u.id].name
      : isRanged(u.id)
        ? RANGED_ACTIONS[u.id].name
        : "普通攻击",
    traits: u.traits.map((t) => ({ name: t, ...TRAITS[t] })),
  };
}
export class BenchTooltip {
  private element = document.createElement("aside");
  private anchor: HTMLElement | null = null;
  private dismissTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    root: HTMLElement,
    private getPiece: (uid: number) => Piece | undefined,
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
    root.addEventListener("pointerover", (e) => {
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
    const d = pieceDetails(p);
    (anchor.querySelector("button") ?? anchor).setAttribute(
      "aria-describedby",
      this.element.id,
    );
    this.element.innerHTML = `<div class="tooltip-heading"><img src="/assets/units/${p.defId}.png" alt=""><div><strong>${d.name}</strong><span>${"★".repeat(p.star)} · ${p.star} 星</span><small>${d.range === 1 ? "近战" : "远程"} · ${d.action}</small></div></div><div class="tooltip-stats"><span>生命<b>${d.hp}</b></span><span>攻击<b>${d.attack}</b></span><span>护甲<b>${d.armor}</b></span><span>射程<b>${d.range} 格</b></span><span>攻击间隔<b>${d.interval.toFixed(2)} 秒</b></span><span>出售价格<b>${d.sell} 金</b></span></div><p class="tooltip-basis">当前星级基础属性 · 未计入上阵羁绊</p><section><b>${d.skill}</b><p>能量满 100 后，下一击造成 2.2 倍攻击伤害（基础 ${d.skillDamage}，实际受目标护甲影响）。</p></section><section><b>兵种与职业</b>${d.traits.map((t) => `<p><em>${t.name} · ${t.threshold} 个不同棋子</em>${t.description}</p>`).join("")}</section>`;
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
    const w = this.element.offsetWidth,
      h = this.element.offsetHeight;
    this.element.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2))}px`;
    const above = r.top - h - 10,
      below = r.bottom + 10;
    this.element.style.top = `${Math.max(12, Math.min(innerHeight - h - 12, above >= 12 ? above : below))}px`;
  }
}
