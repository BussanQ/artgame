import type { StoragePort } from "../engine/persistence";
export type Quality = "high" | "balanced" | "low";
export interface Preferences {
  soundEnabled: boolean;
  soundVolume: number;
  quality: Quality;
  damageNumbers: boolean;
  reducedMotion: boolean;
  pauseHidden: boolean;
}
export const PREFERENCES_KEY = "red-tides.preferences.v1";
export const QUALITY = {
  high: { name: "精细", width: 1280, height: 800, fps: 60, particles: 20 },
  balanced: { name: "均衡", width: 960, height: 600, fps: 45, particles: 10 },
  low: { name: "省电", width: 768, height: 480, fps: 30, particles: 0 },
} as const;
export function defaultPreferences(reducedMotion = false): Preferences {
  return {
    soundEnabled: true,
    soundVolume: 35,
    quality: "high",
    damageNumbers: true,
    reducedMotion,
    pauseHidden: true,
  };
}
export function loadPreferences(
  storage: StoragePort | null,
  reducedMotion = false,
): Preferences {
  const defaults = defaultPreferences(reducedMotion);
  try {
    const v: unknown = JSON.parse(storage?.getItem(PREFERENCES_KEY) ?? "null");
    if (!v || typeof v !== "object" || Array.isArray(v)) return defaults;
    const p = v as Record<string, unknown>;
    return {
      soundEnabled:
        typeof p.soundEnabled === "boolean"
          ? p.soundEnabled
          : defaults.soundEnabled,
      soundVolume:
        typeof p.soundVolume === "number" &&
        Number.isFinite(p.soundVolume) &&
        p.soundVolume >= 0 &&
        p.soundVolume <= 100
          ? Math.round(p.soundVolume)
          : defaults.soundVolume,
      quality:
        typeof p.quality === "string" && Object.hasOwn(QUALITY, p.quality)
          ? (p.quality as Quality)
          : defaults.quality,
      damageNumbers:
        typeof p.damageNumbers === "boolean"
          ? p.damageNumbers
          : defaults.damageNumbers,
      reducedMotion:
        typeof p.reducedMotion === "boolean"
          ? p.reducedMotion
          : defaults.reducedMotion,
      pauseHidden:
        typeof p.pauseHidden === "boolean"
          ? p.pauseHidden
          : defaults.pauseHidden,
    };
  } catch {
    return defaults;
  }
}
export function savePreferences(
  storage: StoragePort | null,
  preferences: Preferences,
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
export function settingsMarkup(p: Preferences): string {
  return `<div class="modal-backdrop"><section class="modal settings-modal" role="dialog" aria-modal="true" aria-label="游戏设置"><button class="close" data-action="close" aria-label="关闭">×</button><span class="eyebrow">PREFERENCES</span><h2>游戏设置</h2><p>设置立即生效，并保存在当前浏览器。</p>
    <label class="setting-row"><span><b>游戏音效</b><small>兵器、技能、招募和胜负提示；切到后台自动静音。</small></span><input type="checkbox" data-setting="soundEnabled" aria-label="游戏音效" ${p.soundEnabled ? "checked" : ""}></label>
    <label class="setting-row"><span><b>音效音量</b><small>当前 <output id="sound-volume">${p.soundVolume}</output>%</small></span><input type="range" min="0" max="100" step="5" value="${p.soundVolume}" data-setting="soundVolume" aria-label="音效音量"></label>
    <div class="sound-preview"><button data-action="sound-preview">试听音效</button><span class="sound-status" role="status">点击试听可检查声音</span></div>
    <label class="setting-row"><span><b>画面品质</b><small>省电模式降低画面分辨率、帧率和环境粒子。</small></span><select data-setting="quality" aria-label="画面品质">${Object.entries(
      QUALITY,
    )
      .map(
        ([key, v]) =>
          `<option value="${key}" ${p.quality === key ? "selected" : ""}>${v.name} · ${v.fps} 帧</option>`,
      )
      .join("")}</select></label>
    ${(
      [
        ["damageNumbers", "伤害数字", "显示实际生命伤害与护盾吸收数字。"],
        [
          "reducedMotion",
          "减少动态效果",
          "减少镜头内的摆动、挥击、粒子与飘字移动；保留生命和状态提示。",
        ],
        [
          "pauseHidden",
          "切到后台时暂停",
          "隐藏页面时暂停战斗播放和回合自动推进，返回后继续。",
        ],
      ] as const
    )
      .map(
        ([key, name, hint]) =>
          `<label class="setting-row"><span><b>${name}</b><small>${hint}</small></span><input type="checkbox" data-setting="${key}" aria-label="${name}" ${p[key] ? "checked" : ""}></label>`,
      )
      .join("")}
    <p class="micro">声音和画面设置不会改变战斗规则、伤害或奖励。播放速度可在战场切换。</p><p class="preferences-status" role="status">设置已载入</p></section></div>`;
}
