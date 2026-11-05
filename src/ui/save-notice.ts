const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Compact status in the toolbar; recovery actions remain available on demand. */
export function saveNoticeMarkup(notice: string, conflict: boolean) {
  if (!notice && !conflict) return "";
  const text = conflict
    ? "另一窗口已更新存档。本窗口已暂停，请载入最新进度后继续。"
    : notice;
  return `<details class="toolbar-save${conflict ? " is-conflict" : ""}" data-disclosure="save-notice"><summary data-focus="save-notice" aria-label="存档状态：${escape(text)}" title="${escape(text)}"><span class="toolbar-save-text" role="status">${escape(conflict ? "存档已在另一窗口更新" : notice)}</span><span class="toolbar-save-short" aria-hidden="true">${conflict ? "冲突" : "存档"}</span></summary><div class="toolbar-save-panel"><p>${escape(text)}</p><div><button data-action="load">载入最新存档</button>${conflict ? "" : '<button data-action="dismiss-notice" aria-label="关闭存档提示">关闭提示</button>'}</div></div></details>`;
}
