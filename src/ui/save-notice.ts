import type { SaveStatus } from "../engine/persistence";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Compact status in the toolbar; recovery actions remain available on demand. */
export interface SaveNoticeOptions {
  status?: SaveStatus;
  needsProtection?: boolean;
  hasPreservedData?: boolean;
  busy?: boolean;
}
export function saveNoticeMarkup(notice: string, conflict: boolean, options:SaveNoticeOptions={}) {
  const protect = options.needsProtection ?? (options.status === "incompatible");
  const failed=options.status==="unavailable"||options.status==="damaged";
  if (!notice && !conflict && !protect && !failed && !options.hasPreservedData) return "";
  const title=conflict?"存档已在另一窗口更新":protect||failed?"本局未保存":notice||"旧档已保留";
  const text=conflict?"另一窗口已更新存档。本窗口已暂停，请载入最新进度后继续。":protect
    ? `${notice?`${notice} `:""}旧存档无法在当前版本读取。本局尚未保存；可以保留旧档，再启用本局自动保存。`
    :failed?`${notice?`${notice} `:""}本局尚未保存。请检查浏览器存储空间与权限后重试。`
    :notice||"保留的旧档可以导出为文件，既有备份也会一并导出。";
  const blocked=options.busy?" disabled":"";
  const actions=conflict?'<button data-action="load">载入最新存档</button>':protect
    ?`<button class="primary" data-action="protect-save"${blocked}>保留旧档并保存本局</button>`
    :failed?`<button data-action="retry-save"${blocked}>重试保存</button>`
    :'<button data-action="load">载入最新存档</button>';
  const exportOld=protect||options.hasPreservedData?'<button data-action="export-old-save">导出旧档</button>':"";
  return `<details class="toolbar-save${conflict||protect||failed?" is-conflict":""}" data-disclosure="save-notice"><summary data-focus="save-notice" aria-label="存档状态：${escape(title)}" title="${escape(title)}"><span class="toolbar-save-text" role="status">${escape(title)}</span><span class="toolbar-save-short" aria-hidden="true">${conflict?"冲突":protect||failed?"未存":"存档"}</span></summary><div class="toolbar-save-panel"><p>${escape(text)}</p><div>${actions}${exportOld}<button data-action="dismiss-notice" aria-label="收起存档提示">收起</button></div></div></details>`;
}
