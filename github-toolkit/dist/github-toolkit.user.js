// ==UserScript==
// @name         GitHub Toolkit
// @namespace    github-toolkit
// @version      2.9.0
// @author       Cores
// @description  高内聚低耦合的 GitHub 模块化工具台（图标操作 + 复制上游链接）
// @license      MIT
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @downloadURL  https://raw.githubusercontent.com/coresZ/userscript/refs/heads/main/github-toolkit/dist/github-toolkit.user.js
// @updateURL    https://raw.githubusercontent.com/coresZ/userscript/refs/heads/main/github-toolkit/dist/github-toolkit.meta.js
// @match        https://github.com/*
// @match        https://gist.github.com/*
// @require      https://update.greasyfork.org/scripts/593538/webdev-component.js
// @connect      api.github.com
// @connect      *
// @grant        GM_addStyle
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const Logger = {
    prefix: "[GH-Toolkit]",
    log: (...args) => console.log(Logger.prefix, ...args),
    warn: (...args) => console.warn(Logger.prefix, ...args),
    error: (...args) => console.error(Logger.prefix, ...args)
  };
  class EventBus {
    listeners = /* @__PURE__ */ new Map();
    on(event, handler) {
      if (!this.listeners.has(event)) this.listeners.set(event, /* @__PURE__ */ new Set());
      this.listeners.get(event).add(handler);
      return () => this.off(event, handler);
    }
    off(event, handler) {
      this.listeners.get(event)?.delete(handler);
    }
    emit(event, payload) {
      this.listeners.get(event)?.forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          Logger.error("Event handler error:", event, e);
        }
      });
    }
  }
  class DOMHelper {
    qs(sel, root = document) {
      return root.querySelector(sel);
    }
    qsa(sel, root = document) {
      return [...root.querySelectorAll(sel)];
    }
    observe(selector, callback) {
      const processed = /* @__PURE__ */ new WeakSet();
      const run = () => {
        this.qsa(selector).forEach((node) => {
          if (processed.has(node)) return;
          processed.add(node);
          callback([node]);
        });
      };
      run();
      const obs = new MutationObserver(run);
      obs.observe(document.body, { childList: true, subtree: true });
      return obs;
    }
  }
  const STYLE_ID = "ghtk-style-v1";
  const ROOT_ID = "ghtk-root";
  const CSS_SOURCE = `
  /* ===== token ===== */
  #ghtk-root {
    --ghtk-ctl-h: 30px;
    --ghtk-ctl-radius: 6px;
    --ghtk-ctl-font: 12px;
    --ghtk-icon: 14px;
    --ghtk-gap: 8px;
    --ghtk-gap-lg: 12px;
    --ghtk-fs-title: 14px;
    --ghtk-fs-name: 13px;
    --ghtk-fs-body: 12px;
    --ghtk-fs-small: 11px;
    --ghtk-font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
    --ghtk-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

    --ghtk-bg: var(--bgColor-default, #ffffff);
    --ghtk-bg-muted: var(--bgColor-muted, #f6f8fa);
    --ghtk-bg-inset: var(--bgColor-inset, #f6f8fa);
    --ghtk-bg-neutral: var(--bgColor-neutral-muted, rgba(129, 139, 152, 0.12));
    --ghtk-bg-hover: var(--control-bgColor-hover, #eff2f5);
    --ghtk-bg-emphasis: var(--bgColor-emphasis, #25292e);
    --ghtk-fg: var(--fgColor-default, #1f2328);
    --ghtk-fg-muted: var(--fgColor-muted, #59636e);
    --ghtk-fg-on-emphasis: var(--fgColor-onEmphasis, #ffffff);
    --ghtk-border: var(--borderColor-default, #d1d9e0);
    --ghtk-border-muted: var(--borderColor-muted, rgba(209, 217, 224, 0.7));
    --ghtk-accent: var(--fgColor-accent, #0969da);
    --ghtk-accent-bg: var(--bgColor-accent-muted, #ddf4ff);
    --ghtk-accent-border: var(--borderColor-accent-muted, rgba(84, 174, 255, 0.4));
    --ghtk-accent-emphasis: var(--bgColor-accent-emphasis, #0969da);
    --ghtk-danger: var(--fgColor-danger, #d1242f);
    --ghtk-danger-bg: var(--bgColor-danger-muted, #ffebe9);
    --ghtk-danger-emphasis: var(--bgColor-danger-emphasis, #cf222e);
    --ghtk-knob: var(--fgColor-onEmphasis, #ffffff);
    --ghtk-focus: var(--focus-outlineColor, #0969da);
    --ghtk-shadow: var(--shadow-floating-large, 0 0 0 1px rgba(209, 217, 224, 0.5), 0 24px 48px rgba(37, 41, 46, 0.2));
    --ghtk-shadow-sm: var(--shadow-floating-small, 0 0 0 1px rgba(209, 217, 224, 0.5), 0 6px 18px rgba(37, 41, 46, 0.14));
    --ghtk-backdrop: rgba(31, 35, 40, 0.28);
  }

  /* ===== reset（零特异性） ===== */
  :where(#ghtk-root),
  :where(#ghtk-root) * {
    box-sizing: border-box;
    font-family: var(--ghtk-font);
    -webkit-font-smoothing: antialiased;
    letter-spacing: normal;
    text-transform: none;
    text-shadow: none;
    float: none;
  }
  :where(#ghtk-root) :where(button, input, textarea, select) {
    margin: 0;
    font-size: var(--ghtk-ctl-font);
    line-height: 1;
    color: inherit;
    vertical-align: middle;
    appearance: none;
    -webkit-appearance: none;
  }
  :where(#ghtk-root) :where(a) { text-decoration: none; }
  :where(#ghtk-root) :where(svg) { display: block; flex-shrink: 0; fill: currentColor; }
  :where(#ghtk-root) :where(code, .ghtk-cmd, .ghtk-cmd *) { font-family: var(--ghtk-mono); }
  #ghtk-root [hidden] { display: none; }

  /* ===== 焦点：鼠标点击不出框，键盘操作显示焦点框 ===== */
  :where(#ghtk-root) :focus { outline: none; }
  :where(#ghtk-root) :focus-visible {
    outline: 2px solid var(--ghtk-focus);
    outline-offset: 2px;
  }
  #ghtk-root .ghtk-tab:focus-visible,
  #ghtk-root .ghtk-rail-item:focus-visible,
  #ghtk-root .ghtk-menu-item:focus-visible,
  #ghtk-root .ghtk-settings > summary:focus-visible,
  #ghtk-root .ghtk-cmd:focus-visible {
    outline-offset: -2px;
  }
  #ghtk-root .ghtk-input:focus,
  #ghtk-root .ghtk-modal-input:focus {
    border-color: var(--ghtk-focus);
    outline: 2px solid var(--ghtk-focus);
    outline-offset: -1px;
  }
  #ghtk-root .ghtk-search:focus-within {
    border-color: var(--ghtk-focus);
    box-shadow: inset 0 0 0 1px var(--ghtk-focus);
  }
  #ghtk-root .ghtk-search input:focus { outline: none; }

  #ghtk-root ::-webkit-scrollbar { width: 6px; height: 6px; }
  #ghtk-root ::-webkit-scrollbar-thumb { background: var(--ghtk-border); border-radius: 3px; }
  #ghtk-root ::-webkit-scrollbar-track { background: transparent; }

  /* ===== 悬浮球 ===== */
  .ghtk-fab {
    position: fixed;
    right: 20px;
    bottom: 24px;
    width: 48px;
    height: 48px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--ghtk-bg-emphasis);
    color: var(--ghtk-fg-on-emphasis);
    box-shadow: 0 4px 16px rgba(1, 4, 9, 0.28);
    cursor: grab;
    z-index: 2147483641;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .ghtk-fab:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(1, 4, 9, 0.34); }
  .ghtk-fab:active { cursor: grabbing; }
  .ghtk-fab svg { width: 20px; height: 20px; }

  /* ===== 面板 ===== */
  .ghtk-panel {
    position: fixed;
    right: 20px;
    bottom: 84px;
    width: 400px;
    height: 560px;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    display: flex;
    flex-direction: column;
    background: var(--ghtk-bg);
    color: var(--ghtk-fg);
    border: 1px solid var(--ghtk-border);
    border-radius: 14px;
    box-shadow: var(--ghtk-shadow);
    overflow: hidden;
    z-index: 2147483640;
    font-size: var(--ghtk-fs-body);
    line-height: 1.5;
  }
  .ghtk-panel-head {
    flex: 0 0 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ghtk-gap);
    padding: 0 8px 0 16px;
    background: var(--ghtk-bg-muted);
    border-bottom: 1px solid var(--ghtk-border);
    cursor: move;
    user-select: none;
  }
  .ghtk-panel-title {
    min-width: 0;
    font-size: var(--ghtk-fs-name);
    font-weight: 600;
    color: var(--ghtk-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ghtk-head-actions { display: flex; align-items: center; gap: 2px; }
  .ghtk-panel-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }

  /* ===== 图标按钮（30x30 热区） ===== */
  .ghtk-icon-btn {
    width: var(--ghtk-ctl-h);
    height: var(--ghtk-ctl-h);
    flex: 0 0 var(--ghtk-ctl-h);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--ghtk-ctl-radius);
    background: transparent;
    color: var(--ghtk-fg-muted);
    cursor: pointer;
    transition: background .12s, color .12s;
  }
  .ghtk-icon-btn:hover { background: var(--ghtk-bg-neutral); color: var(--ghtk-fg); }
  .ghtk-icon-btn[aria-expanded="true"] { background: var(--ghtk-bg-neutral); color: var(--ghtk-fg); }
  .ghtk-icon-btn svg { width: var(--ghtk-icon); height: var(--ghtk-icon); }
  .ghtk-stroke { fill: none; stroke: currentColor; }

  /* ===== Tab ===== */
  .ghtk-tabs {
    flex: 0 0 auto;
    display: flex;
    padding: 0 8px;
    border-bottom: 1px solid var(--ghtk-border);
  }
  .ghtk-tab {
    flex: 1;
    height: 36px;
    padding: 0 8px;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    background: transparent;
    color: var(--ghtk-fg-muted);
    font-size: var(--ghtk-fs-body);
    cursor: pointer;
  }
  .ghtk-tab:hover { color: var(--ghtk-fg); }
  .ghtk-tab.active {
    color: var(--ghtk-accent);
    font-weight: 600;
    border-bottom-color: var(--ghtk-accent-emphasis);
  }
  .ghtk-tab-content { display: none; flex: 1; min-height: 0; flex-direction: column; }
  .ghtk-tab-content.active { display: flex; }
  .ghtk-scroll-area { flex: 1; min-height: 0; overflow-y: auto; }

  /* ===== 按钮 ===== */
  .ghtk-btn {
    height: var(--ghtk-ctl-h);
    min-width: 76px;
    padding: 0 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid var(--ghtk-border);
    border-radius: var(--ghtk-ctl-radius);
    background: var(--ghtk-bg-muted);
    color: var(--ghtk-fg);
    font-size: var(--ghtk-ctl-font);
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
    transition: background .12s, border-color .12s;
  }
  .ghtk-btn:hover { background: var(--ghtk-bg-hover); }
  .ghtk-btn.primary {
    background: var(--ghtk-accent-emphasis);
    border-color: transparent;
    color: var(--ghtk-fg-on-emphasis);
    font-weight: 600;
  }
  .ghtk-btn.primary:hover { background: color-mix(in srgb, var(--ghtk-accent-emphasis) 88%, #000000); }
  .ghtk-btn.danger-solid {
    background: var(--ghtk-danger-emphasis);
    border-color: transparent;
    color: var(--ghtk-fg-on-emphasis);
    font-weight: 600;
  }
  .ghtk-btn.danger-solid:hover { background: color-mix(in srgb, var(--ghtk-danger-emphasis) 88%, #000000); }
  .ghtk-btn:disabled { opacity: .6; cursor: default; }
  .ghtk-btn[aria-busy="true"] { opacity: .7; cursor: progress; pointer-events: none; }
  .ghtk-btn.block { width: 100%; }
  .ghtk-btn-row { display: flex; gap: var(--ghtk-gap); }
  .ghtk-btn-row > .ghtk-btn { flex: 1; min-width: 0; }
  .ghtk-spinner {
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: ghtk-spin .7s linear infinite;
  }

  /* ===== 输入框 ===== */
  .ghtk-input,
  .ghtk-modal-input {
    width: 100%;
    height: var(--ghtk-ctl-h);
    padding: 0 10px;
    border: 1px solid var(--ghtk-border);
    border-radius: var(--ghtk-ctl-radius);
    background: var(--ghtk-bg);
    color: var(--ghtk-fg);
    font-size: var(--ghtk-ctl-font);
    line-height: normal;
  }
  .ghtk-input::placeholder,
  .ghtk-modal-input::placeholder,
  .ghtk-search input::placeholder { color: var(--ghtk-fg-muted); opacity: 1; }

  .ghtk-chip {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border: 1px solid var(--ghtk-accent-border);
    border-radius: 999px;
    background: var(--ghtk-accent-bg);
    color: var(--ghtk-accent);
    font-size: var(--ghtk-fs-small);
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ===== 绑定 Tab：工具栏 ===== */
  .ghtk-toolbar {
    flex: 0 0 auto;
    display: flex;
    gap: var(--ghtk-gap);
    padding: 10px 12px;
    border-bottom: 1px solid var(--ghtk-border);
  }
  .ghtk-search {
    flex: 1;
    min-width: 0;
    height: var(--ghtk-ctl-h);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid var(--ghtk-border);
    border-radius: var(--ghtk-ctl-radius);
    background: var(--ghtk-bg-muted);
    color: var(--ghtk-fg-muted);
  }
  .ghtk-search svg { width: var(--ghtk-icon); height: var(--ghtk-icon); }
  .ghtk-search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--ghtk-fg);
    font-size: var(--ghtk-ctl-font);
    font-weight: 400;
    line-height: normal;
  }
  .ghtk-toolbar-add {
    border-color: var(--ghtk-border);
    background: var(--ghtk-bg-muted);
    color: var(--ghtk-fg);
  }
  .ghtk-toolbar-add.active {
    border-color: var(--ghtk-accent-border);
    background: var(--ghtk-accent-bg);
    color: var(--ghtk-accent);
  }

  /* ===== 绑定 Tab：左栏 ===== */
  .ghtk-split { flex: 1; min-height: 0; display: flex; }
  .ghtk-rail {
    flex: 0 0 152px;
    width: 152px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--ghtk-bg-muted);
    border-right: 1px solid var(--ghtk-border);
  }
  .ghtk-rail-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 6px;
    color: var(--ghtk-fg-muted);
    font-size: var(--ghtk-fs-small);
    font-weight: 600;
  }
  .ghtk-rail-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 6px 8px;
  }
  .ghtk-rail-item {
    position: relative;
    flex: 0 0 auto;
    width: 100%;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 10px;
    border: none;
    border-radius: var(--ghtk-ctl-radius);
    background: transparent;
    color: var(--ghtk-fg);
    text-align: left;
    cursor: pointer;
  }
  .ghtk-rail-item:hover { background: var(--ghtk-bg-neutral); }
  .ghtk-rail-item.active { background: var(--ghtk-accent-bg); }
  .ghtk-rail-item.active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 2px;
    background: var(--ghtk-accent-emphasis);
  }
  .ghtk-rail-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ghtk-rail-name {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    font-size: var(--ghtk-fs-name);
    font-weight: 600;
    line-height: 16px;
    color: var(--ghtk-fg);
  }
  .ghtk-rail-name > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ghtk-rail-name svg { width: 12px; height: 12px; color: var(--ghtk-accent); }
  .ghtk-rail-item.active .ghtk-rail-name { color: var(--ghtk-accent); }
  .ghtk-rail-owner {
    font-size: var(--ghtk-fs-small);
    line-height: 14px;
    color: var(--ghtk-fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ghtk-rail-count {
    flex-shrink: 0;
    min-width: 16px;
    text-align: right;
    font-size: var(--ghtk-fs-small);
    color: var(--ghtk-fg-muted);
  }
  .ghtk-rail-empty {
    padding: 16px 8px;
    text-align: center;
    color: var(--ghtk-fg-muted);
    font-size: var(--ghtk-fs-small);
    line-height: 1.6;
  }

  /* 当前仓库入口：只在当前仓库还没进列表时出现 */
  .ghtk-current-repo {
    flex: 0 0 auto;
    height: var(--ghtk-ctl-h);
    margin: 0 6px 6px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border: 1px dashed var(--ghtk-border);
    border-radius: var(--ghtk-ctl-radius);
    background: transparent;
    color: var(--ghtk-fg-muted);
    text-align: left;
    cursor: pointer;
  }
  .ghtk-current-repo:hover {
    border-color: var(--ghtk-accent-border);
    background: var(--ghtk-accent-bg);
    color: var(--ghtk-accent);
  }
  .ghtk-current-repo svg { width: 12px; height: 12px; }
  .ghtk-cur-name {
    flex: 1;
    min-width: 0;
    font-size: var(--ghtk-fs-body);
    font-weight: 600;
    color: var(--ghtk-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ghtk-current-repo:hover .ghtk-cur-name { color: var(--ghtk-accent); }
  .ghtk-current-repo[aria-busy="true"] { opacity: .6; cursor: progress; }

  /* ===== 绑定 Tab：右栏详情 ===== */
  .ghtk-detail { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ghtk-detail-head {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 8px 8px 14px;
    border-bottom: 1px solid var(--ghtk-border);
  }
  .ghtk-detail-title-row { display: flex; align-items: center; gap: 2px; min-width: 0; }
  .ghtk-detail-title {
    flex: 1;
    min-width: 0;
    font-size: var(--ghtk-fs-title);
    font-weight: 600;
    color: var(--ghtk-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  a.ghtk-detail-title:hover { color: var(--ghtk-accent); text-decoration: underline; }
  .ghtk-detail-sub {
    font-size: var(--ghtk-fs-small);
    color: var(--ghtk-fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* about 区块固定 96px：加载中 / 无数据 / 有数据三种状态同高 */
  .ghtk-about {
    flex: 0 0 96px;
    height: 96px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 8px 8px 14px;
    border-bottom: 1px solid var(--ghtk-border);
    overflow: hidden;
  }
  .ghtk-about-top { display: flex; align-items: flex-start; gap: 4px; }
  .ghtk-about-desc {
    flex: 1;
    min-width: 0;
    font-size: var(--ghtk-fs-body);
    line-height: 17px;
    color: var(--ghtk-fg);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .ghtk-about-desc.muted { color: var(--ghtk-fg-muted); }
  .ghtk-about-more { margin-top: -6px; }
  .ghtk-about-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 16px;
    font-size: var(--ghtk-fs-small);
    color: var(--ghtk-fg-muted);
    white-space: nowrap;
    overflow: hidden;
  }
  .ghtk-about-meta .ghtk-meta-item { display: inline-flex; align-items: center; gap: 4px; }
  .ghtk-about-meta svg { width: 12px; height: 12px; }
  .ghtk-lang-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .ghtk-topics { display: flex; gap: 4px; min-height: 18px; overflow: hidden; }
  .ghtk-topic {
    display: inline-block;
    max-width: 120px;
    height: 18px;
    padding: 0 7px;
    border-radius: 999px;
    background: var(--ghtk-accent-bg);
    color: var(--ghtk-accent);
    font-size: var(--ghtk-fs-small);
    font-weight: 500;
    line-height: 18px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }
  .ghtk-topics .ghtk-topic { min-width: 0; }
  .ghtk-topic.more { background: var(--ghtk-bg-neutral); color: var(--ghtk-fg-muted); }

  .ghtk-detail-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 14px;
  }
  .ghtk-sec-label { font-size: var(--ghtk-fs-small); font-weight: 600; color: var(--ghtk-fg-muted); }
  .ghtk-drow {
    flex: 0 0 auto;
    height: 32px;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .ghtk-drow-branch { flex-shrink: 0; color: var(--ghtk-fg-muted); font-size: var(--ghtk-fs-small); }
  .ghtk-drow-name {
    flex: 0 1 auto;
    min-width: 0;
    font-size: var(--ghtk-fs-body);
    color: var(--ghtk-accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ghtk-drow-name:hover { text-decoration: underline; }
  .ghtk-drow-pin { display: inline-flex; flex-shrink: 0; color: var(--ghtk-accent); }
  .ghtk-drow-pin svg { width: 12px; height: 12px; }
  .ghtk-drow-rm { margin-left: auto; opacity: .5; }
  .ghtk-drow:hover .ghtk-drow-rm,
  .ghtk-drow-rm:focus-visible { opacity: 1; }
  .ghtk-drow-rm:hover { color: var(--ghtk-danger); background: var(--ghtk-danger-bg); }
  .ghtk-empty-cta {
    width: 100%;
    min-height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 10px;
    border: 1px dashed var(--ghtk-border);
    border-radius: 8px;
    background: transparent;
    color: var(--ghtk-fg-muted);
    font-size: var(--ghtk-fs-body);
    line-height: 1.4;
    cursor: pointer;
  }
  .ghtk-empty-cta strong { color: var(--ghtk-accent); font-weight: 600; }
  .ghtk-empty-cta:hover { border-color: var(--ghtk-accent-border); background: var(--ghtk-accent-bg); }
  .ghtk-empty-cta[aria-busy="true"] { opacity: .6; cursor: progress; pointer-events: none; }
  .ghtk-detail-foot {
    flex: 0 0 auto;
    padding: 10px 14px 12px;
    border-top: 1px solid var(--ghtk-border);
  }

  /* ===== 绑定 Tab：添加视图 / 空状态 ===== */
  .ghtk-addview { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .ghtk-addview-head {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--ghtk-border);
  }
  .ghtk-addview-title { font-size: var(--ghtk-fs-title); font-weight: 600; color: var(--ghtk-fg); }
  .ghtk-addview-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--ghtk-gap-lg);
    padding: 12px 14px;
  }
  .ghtk-field { display: flex; flex-direction: column; gap: 6px; }
  .ghtk-field-label { font-size: var(--ghtk-fs-small); font-weight: 600; color: var(--ghtk-fg-muted); }
  .ghtk-field-row { display: flex; gap: var(--ghtk-gap); }
  .ghtk-field-row > .ghtk-input { flex: 1; min-width: 0; width: auto; }
  .ghtk-field-row > .ghtk-btn { flex: 0 0 auto; }
  .ghtk-detect {
    display: flex;
    flex-direction: column;
    gap: var(--ghtk-gap);
    padding: 10px 12px;
    border: 1px solid var(--ghtk-accent-border);
    border-radius: 8px;
    background: var(--ghtk-accent-bg);
  }
  .ghtk-detect-label { font-size: var(--ghtk-fs-small); font-weight: 600; color: var(--ghtk-accent); }
  .ghtk-detect-name {
    font-size: var(--ghtk-fs-name);
    font-weight: 600;
    color: var(--ghtk-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ghtk-note { font-size: var(--ghtk-fs-small); color: var(--ghtk-fg-muted); line-height: 1.5; }
  .ghtk-blank {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ghtk-gap-lg);
    padding: 24px;
    text-align: center;
    color: var(--ghtk-fg-muted);
    font-size: var(--ghtk-fs-body);
  }

  /* ===== 加速 Tab ===== */
  .ghtk-accel { display: flex; flex-direction: column; gap: 16px; padding: 14px 16px 16px; }
  .ghtk-accel-sec { display: flex; flex-direction: column; gap: var(--ghtk-gap-lg); }
  .ghtk-accel-sec + .ghtk-accel-sec { padding-top: 16px; border-top: 1px solid var(--ghtk-border-muted); }
  .ghtk-sec-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ghtk-gap);
    min-height: var(--ghtk-ctl-h);
  }
  .ghtk-sec-title { flex-shrink: 0; font-size: var(--ghtk-fs-body); font-weight: 600; color: var(--ghtk-fg); }
  .ghtk-sec-note {
    min-width: 0;
    font-size: var(--ghtk-fs-small);
    color: var(--ghtk-fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ghtk-seg {
    display: inline-flex;
    flex-shrink: 0;
    height: var(--ghtk-ctl-h);
    padding: 2px;
    gap: 2px;
    border: 1px solid var(--ghtk-border);
    border-radius: var(--ghtk-ctl-radius);
    background: var(--ghtk-bg-muted);
  }
  .ghtk-seg button {
    height: 100%;
    min-width: 52px;
    padding: 0 10px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--ghtk-fg-muted);
    font-size: var(--ghtk-fs-small);
    font-weight: 600;
    cursor: pointer;
  }
  .ghtk-seg button:hover { color: var(--ghtk-fg); }
  .ghtk-seg button.on {
    background: var(--ghtk-bg);
    color: var(--ghtk-accent);
    box-shadow: 0 0 0 1px var(--ghtk-border);
  }
  .ghtk-cmd {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 8px 10px;
    border: 1px solid var(--ghtk-border);
    border-radius: var(--ghtk-ctl-radius);
    background: var(--ghtk-bg-inset);
    color: var(--ghtk-fg);
    font-size: var(--ghtk-fs-body);
    line-height: 1.5;
    white-space: nowrap;
    overflow-x: auto;
  }
  .ghtk-cmd-prompt { flex-shrink: 0; color: var(--ghtk-fg-muted); user-select: none; }
  .ghtk-hint {
    padding-top: 10px;
    border-top: 1px dashed var(--ghtk-border);
    color: var(--ghtk-fg-muted);
    font-size: var(--ghtk-fs-small);
    line-height: 1.7;
  }
  .ghtk-hint code {
    padding: 0 4px;
    border-radius: 4px;
    background: var(--ghtk-bg-neutral);
    font-size: var(--ghtk-fs-small);
  }
  .ghtk-settings {
    border: 1px solid var(--ghtk-border);
    border-radius: 8px;
    overflow: hidden;
  }
  .ghtk-settings > summary {
    height: 36px;
    display: flex;
    align-items: center;
    gap: var(--ghtk-gap);
    padding: 0 10px 0 12px;
    background: var(--ghtk-bg-muted);
    color: var(--ghtk-fg);
    font-size: var(--ghtk-fs-body);
    font-weight: 600;
    list-style: none;
    cursor: pointer;
    user-select: none;
  }
  .ghtk-settings > summary::-webkit-details-marker { display: none; }
  .ghtk-settings > summary::marker { content: ""; }
  .ghtk-settings[open] > summary { border-bottom: 1px solid var(--ghtk-border); }
  .ghtk-settings-value {
    flex: 1;
    min-width: 0;
    text-align: right;
    font-size: var(--ghtk-fs-small);
    font-weight: 400;
    color: var(--ghtk-fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ghtk-settings > summary svg { width: 12px; height: 12px; color: var(--ghtk-fg-muted); transition: transform .15s; }
  .ghtk-settings[open] > summary svg { transform: rotate(180deg); }
  .ghtk-settings-body { display: flex; flex-direction: column; gap: var(--ghtk-gap); padding: 12px; }

  /* ===== 插件 Tab ===== */
  .ghtk-plugins { display: flex; flex-direction: column; padding: 8px 16px 12px; }
  .ghtk-plugin-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ghtk-gap-lg);
    padding: 12px 0;
    border-bottom: 1px solid var(--ghtk-border-muted);
  }
  .ghtk-plugin-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ghtk-plugin-name { font-size: var(--ghtk-fs-name); font-weight: 600; color: var(--ghtk-fg); }
  .ghtk-plugin-desc { font-size: var(--ghtk-fs-small); color: var(--ghtk-fg-muted); line-height: 1.5; }
  .ghtk-plugins-foot {
    padding-top: 12px;
    text-align: center;
    font-size: var(--ghtk-fs-small);
    color: var(--ghtk-fg-muted);
  }
  .ghtk-switch {
    position: relative;
    flex: 0 0 40px;
    width: 40px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--ghtk-border);
    border-radius: 999px;
    background: var(--ghtk-bg-neutral);
    cursor: pointer;
    transition: background .15s, border-color .15s;
  }
  .ghtk-switch::before { content: ""; position: absolute; inset: -5px -3px; }
  .ghtk-switch-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--ghtk-knob);
    box-shadow: 0 1px 2px rgba(31, 35, 40, 0.3);
    transition: transform .15s;
    pointer-events: none;
  }
  .ghtk-switch.on { background: var(--ghtk-accent-emphasis); border-color: transparent; }
  .ghtk-switch.on .ghtk-switch-knob { transform: translateX(18px); }

  /* ===== 气泡 ===== */
  .ghtk-popover {
    position: fixed;
    z-index: 2147483644;
    font-size: var(--ghtk-fs-body);
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    background: var(--ghtk-bg);
    color: var(--ghtk-fg);
    border: 1px solid var(--ghtk-border);
    border-radius: 12px;
    box-shadow: var(--ghtk-shadow);
    animation: ghtk-pop .14s ease-out;
  }
  .ghtk-pop-inner {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    overflow: hidden;
  }
  .ghtk-pop-arrow {
    position: absolute;
    z-index: 1;
    width: 10px;
    height: 10px;
    background: var(--ghtk-bg);
    border: 1px solid var(--ghtk-border);
    transform: rotate(45deg);
  }
  .ghtk-pop-arrow.up { top: -6px; border-right-color: transparent; border-bottom-color: transparent; }
  .ghtk-pop-arrow.down { bottom: -6px; border-left-color: transparent; border-top-color: transparent; }
  .ghtk-pop-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ghtk-gap);
    padding: 6px 6px 6px 14px;
    border-bottom: 1px solid var(--ghtk-border);
  }
  .ghtk-pop-title {
    min-width: 0;
    font-size: var(--ghtk-fs-title);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ghtk-pop-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--ghtk-gap-lg);
    padding: 12px 14px 14px;
  }
  .ghtk-pop-desc { font-size: var(--ghtk-fs-body); line-height: 1.6; color: var(--ghtk-fg); word-break: break-word; }
  .ghtk-pop-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
  .ghtk-pop-cell { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ghtk-pop-k { font-size: var(--ghtk-fs-small); color: var(--ghtk-fg-muted); }
  .ghtk-pop-v {
    font-size: var(--ghtk-fs-body);
    font-weight: 600;
    color: var(--ghtk-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ghtk-pop-group { display: flex; flex-direction: column; gap: 6px; }
  .ghtk-pop-sec { font-size: var(--ghtk-fs-small); font-weight: 600; color: var(--ghtk-fg-muted); }
  .ghtk-pop-topics { display: flex; flex-wrap: wrap; gap: 4px; }
  .ghtk-pop-topics .ghtk-topic { max-width: none; }
  .ghtk-pop-home { font-size: var(--ghtk-fs-body); color: var(--ghtk-accent); word-break: break-all; }
  .ghtk-pop-home:hover { text-decoration: underline; }
  .ghtk-pop-note { font-size: var(--ghtk-fs-small); color: var(--ghtk-fg-muted); }

  /* ===== 下拉菜单 ===== */
  .ghtk-menu {
    position: fixed;
    z-index: 2147483644;
    min-width: 160px;
    font-size: var(--ghtk-fs-body);
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    background: var(--ghtk-bg);
    border: 1px solid var(--ghtk-border);
    border-radius: 10px;
    box-shadow: var(--ghtk-shadow-sm);
    animation: ghtk-pop .12s ease-out;
  }
  .ghtk-menu-item {
    height: var(--ghtk-ctl-h);
    display: flex;
    align-items: center;
    padding: 0 10px;
    border: none;
    border-radius: var(--ghtk-ctl-radius);
    background: transparent;
    color: var(--ghtk-fg);
    font-size: var(--ghtk-fs-body);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .ghtk-menu-item:hover,
  .ghtk-menu-item:focus { background: var(--ghtk-bg-neutral); }
  .ghtk-menu-item.danger { color: var(--ghtk-danger); }
  .ghtk-menu-item.danger:hover,
  .ghtk-menu-item.danger:focus { background: var(--ghtk-danger-bg); }

  /* ===== 对话框（定位由 JS 用 important 内联覆盖到面板区域） ===== */
  .ghtk-modal-mask {
    position: fixed;
    inset: 0;
    z-index: 2147483645;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: var(--ghtk-backdrop);
    animation: ghtk-fade .12s ease-out;
  }
  .ghtk-modal-mask.in-panel { padding: 12px; }
  .ghtk-modal {
    width: 100%;
    max-width: 340px;
    font-size: var(--ghtk-fs-body);
    line-height: 1.5;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--ghtk-bg);
    color: var(--ghtk-fg);
    border: 1px solid var(--ghtk-border);
    border-radius: 12px;
    box-shadow: var(--ghtk-shadow);
    overflow: hidden;
    animation: ghtk-pop .14s ease-out;
  }
  .ghtk-modal-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ghtk-gap);
    padding: 8px 8px 8px 16px;
    border-bottom: 1px solid var(--ghtk-border);
  }
  .ghtk-modal-title { font-size: var(--ghtk-fs-title); font-weight: 600; color: var(--ghtk-fg); }
  .ghtk-modal-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--ghtk-gap-lg);
    padding: 16px;
  }
  .ghtk-modal-content { font-size: var(--ghtk-fs-body); line-height: 1.6; color: var(--ghtk-fg); word-break: break-word; }
  .ghtk-modal-content b { font-weight: 600; }
  .ghtk-modal-footer {
    flex: 0 0 auto;
    display: flex;
    justify-content: flex-end;
    gap: var(--ghtk-gap);
    padding: 12px 16px;
    border-top: 1px solid var(--ghtk-border);
  }

  /* ===== 提示条（单例） ===== */
  .ghtk-toast {
    position: fixed;
    left: 50%;
    bottom: 32px;
    z-index: 2147483647;
    max-width: calc(100vw - 32px);
    padding: 8px 14px;
    border-radius: 8px;
    background: var(--ghtk-bg-emphasis);
    color: var(--ghtk-fg-on-emphasis);
    font-size: var(--ghtk-fs-body);
    line-height: 1.4;
    box-shadow: var(--ghtk-shadow-sm);
    opacity: 0;
    transform: translate(-50%, 8px);
    transition: opacity .18s ease, transform .18s ease;
    pointer-events: none;
  }
  .ghtk-toast.show { opacity: 1; transform: translate(-50%, 0); }

  @keyframes ghtk-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ghtk-pop { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
  @keyframes ghtk-spin { to { transform: rotate(360deg); } }

  @media (max-width: 480px) {
    .ghtk-panel {
      left: 8px;
      right: 8px;
      top: auto;
      bottom: 80px;
      width: auto;
      height: 70vh;
    }
    .ghtk-rail { flex-basis: 128px; width: 128px; }
  }
  @media (prefers-reduced-motion: reduce) {
    #ghtk-root *,
    #ghtk-root *::before,
    #ghtk-root *::after {
      animation: none;
      transition: none;
    }
    #ghtk-root .ghtk-spinner { animation: ghtk-spin 1.6s linear infinite; }
  }
  @media (hover: none) {
    .ghtk-drow-rm { opacity: 1; }
  }
`;
  function important(css) {
    const frames = [];
    const masked = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, (m) => {
      frames.push(m);
      return "@@GHTK_FRAME_" + (frames.length - 1) + "@@";
    });
    const out = masked.replace(
      /((?:^|[{;]|\*\/)\s*)(-?[a-z][a-z-]*\s*:\s*)([^;{}]+?)(\s*)(?=[;}])/g,
      (m, pre, prop, val, ws) => /!important$/.test(val) ? m : pre + prop + val + " !important" + ws
    );
    return out.replace(/@@GHTK_FRAME_(\d+)@@/g, (_m, i) => frames[Number(i)]);
  }
  const CSS$1 = important(CSS_SOURCE);
  function injectGlobalStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS$1;
    (document.head || document.documentElement).appendChild(style);
    if (!observerStarted) {
      observerStarted = true;
      const ensure = () => {
        if (!document.getElementById(STYLE_ID)) {
          const s = document.createElement("style");
          s.id = STYLE_ID;
          s.textContent = CSS$1;
          (document.head || document.documentElement).appendChild(s);
        }
      };
      new MutationObserver(() => {
        if (!document.getElementById(STYLE_ID)) ensure();
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  let observerStarted = false;
  function getRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.style.cssText = "position:static;display:contents;";
      document.body.appendChild(root);
    }
    return root;
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function compactNum(n) {
    if (n < 1e3) return String(n);
    if (n < 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    return Math.round(n / 1e3) + "k";
  }
  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      const ok2 = await Promise.race([
        navigator.clipboard.writeText(text).then(
          () => true,
          () => false
        ),
        new Promise((r) => setTimeout(() => r(false), 800))
      ]);
      if (ok2) return true;
    }
    const prev = document.activeElement;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
    getRoot().appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    prev?.focus?.({ preventScroll: true });
    return ok;
  }
  const svg = (d) => `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
  const ICON = {
    search: svg(
      "M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"
    ),
    plus: svg(
      "M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"
    ),
    x: svg(
      "M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
    ),
    copy: svg(
      "M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
    ),
    kebab: svg(
      "M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
    ),
    info: svg(
      "M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
    ),
    pin: svg("M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10Zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"),
    circle: svg("M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"),
    star: svg(
      "M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"
    ),
    fork: svg(
      "M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"
    ),
    chevron: svg(
      "M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"
    )
  };
  const stack = [];
  const idleQueue = [];
  let baseClose = null;
  let listening = false;
  function ensureListener() {
    if (listening) return;
    listening = true;
    document.addEventListener("keydown", onKeydown);
  }
  function onKeydown(e) {
    if (e.key !== "Escape" || e.isComposing) return;
    const top = stack[stack.length - 1];
    if (top) {
      e.preventDefault();
      closeLayer(top);
      return;
    }
    if (!baseClose) return;
    const t = e.target instanceof HTMLElement ? e.target : null;
    const inOwnUi = !!t?.closest("#ghtk-root");
    const editable = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (editable && !inOwnUi) return;
    baseClose();
  }
  function closeLayer(layer) {
    const i = stack.indexOf(layer);
    if (i < 0) return;
    stack.splice(i, 1);
    try {
      layer.close();
    } finally {
      flushIdle();
    }
  }
  function pushLayer(kind, close) {
    ensureListener();
    const layer = { kind, close };
    stack.push(layer);
    return () => {
      const i = stack.indexOf(layer);
      if (i < 0) return;
      stack.splice(i, 1);
      flushIdle();
    };
  }
  function setBaseLayer(close) {
    ensureListener();
    baseClose = close;
  }
  function hasModal() {
    return stack.some((l) => l.kind === "modal");
  }
  function whenIdle(fn) {
    if (!hasModal()) {
      fn();
      return;
    }
    if (!idleQueue.includes(fn)) idleQueue.push(fn);
  }
  function flushIdle() {
    if (hasModal() || !idleQueue.length) return;
    const fns = idleQueue.splice(0);
    setTimeout(() => fns.forEach((f) => f()), 0);
  }
  function closeTransientLayers() {
    for (const l of stack.slice().reverse()) {
      if (l.kind === "transient") closeLayer(l);
    }
  }
  function closeAllLayers() {
    for (const l of stack.slice().reverse()) closeLayer(l);
  }
  const FAB_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M15 2.75a.75.75 0 0 1-.75.75h-4a.75.75 0 0 1 0-1.5h4a.75.75 0 0 1 .75.75Zm-8.5.75v1.25a.75.75 0 0 0 1.5 0v-4a.75.75 0 0 0-1.5 0V2H1.75a.75.75 0 0 0 0 1.5H6.5Zm1.25 5.5a.75.75 0 0 0 0-1.5h-6a.75.75 0 0 0 0 1.5h6ZM15 8a.75.75 0 0 1-.75.75H11.5V10a.75.75 0 1 1-1.5 0V6a.75.75 0 0 1 1.5 0v1.25h2.75A.75.75 0 0 1 15 8Zm-9 5.25v-2a.75.75 0 0 0-1.5 0v1.25H1.75a.75.75 0 1 0 0 1.5H4.5v1.25a.75.75 0 0 0 1.5 0v-2Zm9 2v-2.25a.75.75 0 0 0-1.5 0V15h-4a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 .75-.75v-1.5Z"/></svg>`;
  const CLOUD_ICON = `<svg class="ghtk-stroke" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
  const FAB_POS_KEY = "fab-position";
  const PANEL_POS_KEY = "panel-position";
  const FAB_SIZE = 48;
  const PANEL_W = 400;
  const PANEL_H = 560;
  const EDGE = 8;
  const DRAG_THRESHOLD = 4;
  function isPoint(v) {
    return !!v && typeof v.left === "number" && typeof v.top === "number";
  }
  class UIManager {
    panel = null;
    fab = null;
    fabPos = null;
    suppressClick = false;
    resizeBound = false;
    toastEl = null;
    toastTimer = null;
    /** 由主程序注入：点击悬浮球时切换面板 */
    onFabToggle = () => {
    };
    /** 由主程序注入：点击标题栏云图标时打开云端备份面板 */
    onCloudClick = () => {
    };
    // ---------- 悬浮球 ----------
    createFab() {
      if (this.fab && this.fab.isConnected) return;
      injectGlobalStyles();
      document.querySelectorAll(".ghtk-fab").forEach((el) => el.remove());
      const fab = document.createElement("button");
      fab.className = "ghtk-fab";
      fab.type = "button";
      fab.title = "GitHub Toolkit（可拖动）";
      fab.setAttribute("aria-label", "GitHub Toolkit");
      fab.setAttribute("aria-expanded", this.panel ? "true" : "false");
      fab.innerHTML = FAB_ICON;
      this.fab = fab;
      fab.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (this.suppressClick) {
            this.suppressClick = false;
            return;
          }
          try {
            this.onFabToggle();
          } catch (err) {
            Logger.error("FAB click error:", err);
            this.toast("打开面板失败");
          }
        },
        true
      );
      getRoot().appendChild(fab);
      const saved = GM_getValue(FAB_POS_KEY, null);
      if (isPoint(saved)) this.applyFabPos(saved);
      this.enableFabDrag(fab);
      if (!this.resizeBound) {
        this.resizeBound = true;
        window.addEventListener(
          "resize",
          () => {
            if (this.fabPos) this.applyFabPos(this.fabPos);
            if (this.panel) {
              const r = this.panel.getBoundingClientRect();
              this.setPanelPos(this.clampPanelPos({ left: r.left, top: r.top }));
            }
          },
          { passive: true }
        );
      }
    }
    applyFabPos(pos) {
      if (!this.fab) return;
      const maxLeft = Math.max(EDGE, window.innerWidth - FAB_SIZE - EDGE);
      const maxTop = Math.max(EDGE, window.innerHeight - FAB_SIZE - EDGE);
      const p = {
        left: Math.min(Math.max(EDGE, pos.left), maxLeft),
        top: Math.min(Math.max(EDGE, pos.top), maxTop)
      };
      this.fabPos = p;
      this.fab.style.left = p.left + "px";
      this.fab.style.top = p.top + "px";
      this.fab.style.right = "auto";
      this.fab.style.bottom = "auto";
    }
    enableFabDrag(fab) {
      fab.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const rect = fab.getBoundingClientRect();
        const sx = e.clientX;
        const sy = e.clientY;
        let moved = false;
        const onMove = (ev) => {
          const dx = ev.clientX - sx;
          const dy = ev.clientY - sy;
          if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          moved = true;
          this.applyFabPos({ left: rect.left + dx, top: rect.top + dy });
        };
        const onUp = () => {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          document.removeEventListener("pointercancel", onUp);
          if (!moved) return;
          this.suppressClick = true;
          setTimeout(() => this.suppressClick = false, 0);
          if (this.fabPos) GM_setValue(FAB_POS_KEY, this.fabPos);
          GM_deleteValue(PANEL_POS_KEY);
          if (this.panel) this.positionPanel();
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
      });
    }
    // ---------- 面板 ----------
    showPanel(html, title = "GitHub Toolkit") {
      injectGlobalStyles();
      this.removePanel();
      const panel = document.createElement("div");
      panel.className = "ghtk-panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", title);
      panel.innerHTML = `
      <div class="ghtk-panel-head">
        <span class="ghtk-panel-title">${escapeHtml(title)}</span>
        <span class="ghtk-head-actions">
          <button class="ghtk-icon-btn ghtk-cloud-btn" type="button" title="云端备份" aria-label="云端备份">${CLOUD_ICON}</button>
          <button class="ghtk-icon-btn ghtk-close-btn" type="button" title="关闭（Esc）" aria-label="关闭">${ICON.x}</button>
        </span>
      </div>
      <div class="ghtk-panel-body">${html}</div>
    `;
      getRoot().appendChild(panel);
      this.panel = panel;
      this.positionPanel();
      panel.querySelector(".ghtk-close-btn")?.addEventListener("click", () => this.hidePanel());
      panel.querySelector(".ghtk-cloud-btn")?.addEventListener("click", () => this.onCloudClick());
      this.enablePanelDrag(panel);
      setBaseLayer(() => this.hidePanel());
      this.fab?.setAttribute("aria-expanded", "true");
    }
    /** 只拆掉面板 DOM（重建用）：关掉气泡/菜单等临时层，保留打开中的对话框 */
    removePanel() {
      closeTransientLayers();
      this.panel?.remove();
      this.panel = null;
    }
    /** 关闭面板：连同所有弹层一起关 */
    hidePanel() {
      if (!this.panel) return;
      const hadFocus = this.panel.contains(document.activeElement);
      closeAllLayers();
      this.panel?.remove();
      this.panel = null;
      setBaseLayer(null);
      this.fab?.setAttribute("aria-expanded", "false");
      if (hadFocus) this.fab?.focus({ preventScroll: true });
    }
    /** 有拖动记录用记录的位置，否则贴着悬浮球（优先上方，放不下翻到下方） */
    positionPanel() {
      if (!this.panel) return;
      const saved = GM_getValue(PANEL_POS_KEY, null);
      this.setPanelPos(this.clampPanelPos(isPoint(saved) ? saved : this.nearFab()));
    }
    nearFab() {
      const w = this.panel?.offsetWidth || PANEL_W;
      const h = this.panel?.offsetHeight || PANEL_H;
      const fab = this.fab?.getBoundingClientRect();
      if (!fab) return { left: window.innerWidth - w - 20, top: window.innerHeight - h - 84 };
      let left = fab.right - w;
      if (left < EDGE) left = fab.left;
      let top = fab.top - h - 12;
      if (top < EDGE) top = fab.bottom + 12;
      return { left, top };
    }
    clampPanelPos(p) {
      const w = this.panel?.offsetWidth || PANEL_W;
      const h = this.panel?.offsetHeight || PANEL_H;
      return {
        left: Math.min(Math.max(EDGE, p.left), Math.max(EDGE, window.innerWidth - w - EDGE)),
        top: Math.min(Math.max(EDGE, p.top), Math.max(EDGE, window.innerHeight - h - EDGE))
      };
    }
    setPanelPos(p) {
      if (!this.panel) return;
      this.panel.style.left = Math.round(p.left) + "px";
      this.panel.style.top = Math.round(p.top) + "px";
      this.panel.style.right = "auto";
      this.panel.style.bottom = "auto";
    }
    /** 拖动标题栏移动面板，松手后记住位置 */
    enablePanelDrag(panel) {
      const head = panel.querySelector(".ghtk-panel-head");
      if (!head) return;
      head.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (e.target.closest("button")) return;
        if (window.matchMedia("(max-width: 480px)").matches) return;
        e.preventDefault();
        const rect = panel.getBoundingClientRect();
        const sx = e.clientX;
        const sy = e.clientY;
        let moved = false;
        const onMove = (ev) => {
          const dx = ev.clientX - sx;
          const dy = ev.clientY - sy;
          if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          moved = true;
          this.setPanelPos(this.clampPanelPos({ left: rect.left + dx, top: rect.top + dy }));
        };
        const onUp = () => {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          document.removeEventListener("pointercancel", onUp);
          if (!moved || !this.panel) return;
          const r = this.panel.getBoundingClientRect();
          GM_setValue(PANEL_POS_KEY, { left: Math.round(r.left), top: Math.round(r.top) });
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
      });
    }
    // ---------- 提示条（单例：新提示替换旧提示） ----------
    toast(msg, duration = 2200) {
      injectGlobalStyles();
      let t = this.toastEl;
      if (!t || !t.isConnected) {
        t = document.createElement("div");
        t.className = "ghtk-toast";
        t.setAttribute("role", "status");
        t.setAttribute("aria-live", "polite");
        getRoot().appendChild(t);
        this.toastEl = t;
      }
      const el = t;
      el.textContent = msg;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      requestAnimationFrame(() => el.classList.add("show"));
      this.toastTimer = setTimeout(() => el.classList.remove("show"), duration);
    }
  }
  class PageRouter {
    current;
    eventBus;
    constructor(eventBus2) {
      this.eventBus = eventBus2;
      this.current = this.parse();
    }
    parse() {
      const path = location.pathname;
      const parts = path.split("/").filter(Boolean);
      if (location.hostname === "gist.github.com") {
        return { type: "gist", owner: parts[0], id: parts[1] };
      }
      if (parts.length === 0) return { type: "home" };
      const [owner, repo, ...rest] = parts;
      if (!repo) return { type: "user", owner };
      const base = { type: "repo", owner, repo };
      if (rest[0] === "issues") {
        if (rest[1] && /^\d+$/.test(rest[1])) return { ...base, type: "issue", number: +rest[1] };
        return { ...base, type: "issues" };
      }
      if (rest[0] === "pull") {
        if (rest[1] && /^\d+$/.test(rest[1])) return { ...base, type: "pull_request", number: +rest[1] };
        return { ...base, type: "pulls" };
      }
      if (rest[0] === "blob") {
        return { ...base, type: "blob", branch: rest[1], path: rest.slice(2).join("/") };
      }
      if (rest[0] === "tree") {
        return { ...base, type: "tree", branch: rest[1], path: rest.slice(2).join("/") };
      }
      if (rest[0] === "commit") return { ...base, type: "commit", sha: rest[1] };
      if (rest[0] === "compare") return { ...base, type: "compare" };
      if (rest[0] === "settings") return { ...base, type: "settings" };
      if (rest[0] === "actions") return { ...base, type: "actions" };
      return base;
    }
    start() {
      this.eventBus.emit("page:enter", this.current);
      const check = () => {
        const next = this.parse();
        if (JSON.stringify(next) !== JSON.stringify(this.current)) {
          this.eventBus.emit("page:leave", this.current);
          this.current = next;
          this.eventBus.emit("page:enter", this.current);
          this.eventBus.emit("page:change", this.current);
        }
      };
      document.addEventListener("turbo:load", check);
      document.addEventListener("pjax:end", check);
      document.addEventListener("soft-nav:end", check);
      window.addEventListener("popstate", check);
      let timer = null;
      new MutationObserver(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(check, 400);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
  class Storage {
    ns;
    constructor(namespace = "global") {
      this.ns = `gh-toolkit:${namespace}:`;
    }
    get(key, defaultValue = null) {
      return GM_getValue(this.ns + key, defaultValue);
    }
    set(key, value) {
      GM_setValue(this.ns + key, value);
    }
  }
  class PluginManager {
    plugins = /* @__PURE__ */ new Map();
    enabled = /* @__PURE__ */ new Set();
    instances = /* @__PURE__ */ new Map();
    core;
    constructor(core) {
      this.core = core;
    }
    register(plugin) {
      if (this.plugins.has(plugin.id)) return;
      this.plugins.set(plugin.id, plugin);
      Logger.log("Registered:", plugin.id);
    }
    async enable(id) {
      const plugin = this.plugins.get(id);
      if (!plugin || this.enabled.has(id)) return;
      const ctx = {
        eventBus: this.core.eventBus,
        storage: new Storage(id),
        ui: this.core.ui,
        dom: this.core.dom,
        page: this.core.router.current,
        log: {
          log: (...a) => Logger.log(`[${id}]`, ...a),
          warn: (...a) => Logger.warn(`[${id}]`, ...a),
          error: (...a) => Logger.error(`[${id}]`, ...a)
        }
      };
      try {
        if (plugin.onInit) await plugin.onInit(ctx);
        if (plugin.matches && !plugin.matches(ctx.page)) {
          this.instances.set(id, { ctx, active: false });
          return;
        }
        if (plugin.onEnable) await plugin.onEnable(ctx);
        this.enabled.add(id);
        this.instances.set(id, { ctx, active: true });
        Logger.log("Enabled:", id);
      } catch (e) {
        Logger.error("Enable failed:", id, e);
      }
    }
    async disable(id) {
      if (!this.enabled.has(id)) return;
      const inst = this.instances.get(id);
      const plugin = this.plugins.get(id);
      try {
        if (plugin?.onDisable && inst) await plugin.onDisable(inst.ctx);
        this.enabled.delete(id);
        if (inst) inst.active = false;
        Logger.log("Disabled:", id);
      } catch (e) {
        Logger.error("Disable failed:", id, e);
      }
    }
    async onPageChange(page) {
      for (const [id, plugin] of this.plugins) {
        const should = !plugin.matches || plugin.matches(page);
        const isEnabled = this.enabled.has(id);
        const inst = this.instances.get(id);
        if (inst) inst.ctx.page = page;
        if (should && !isEnabled) await this.enable(id);
        else if (!should && isEnabled) await this.disable(id);
      }
    }
    getAll() {
      return [...this.plugins.values()];
    }
    /** 取插件运行时上下文（未初始化过时返回 null） */
    getContext(id) {
      return this.instances.get(id)?.ctx ?? null;
    }
    isEnabled(id) {
      return this.enabled.has(id);
    }
  }
  function navigateTo(url) {
    const w = window;
    const turbo = w.Turbo?.visit ? w.Turbo : w.turbo?.visit ? w.turbo : null;
    if (turbo?.visit) {
      turbo.visit(url);
      return;
    }
    window.location.href = url;
  }
  function bindSoftNav() {
    if (softNavBound) return;
    softNavBound = true;
    document.addEventListener(
      "click",
      (ev) => {
        const e = ev;
        const target = e.target;
        const link = target?.closest?.("a[data-ghtk-nav]");
        if (!link) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const href = link.getAttribute("href");
        if (!href) return;
        e.preventDefault();
        e.stopPropagation();
        navigateTo(link.href);
      },
      true
    );
  }
  let softNavBound = false;
  const BACKUP_KEYS = {
    bindings: "upstream-downstream-bindings",
    enabledPlugins: "enabled-plugins",
    accelBase: "accel-base-url",
    egoIdentity: "ego-identity",
    egoProtocol: "ego-protocol"
  };
  let webdev = null;
  function ensureWebdev() {
    if (webdev) return webdev;
    try {
      if (typeof WebdevComponent === "undefined" || !WebdevComponent?.createWebdev) {
        Logger.warn("WebdevComponent 未加载（@require 缺失或网络失败）");
        return null;
      }
      webdev = WebdevComponent.createWebdev({
        key: "ghtk-webdev-v1",
        defaultFile: "github-toolkit-backup.json",
        storage: {
          get: (k, d) => GM_getValue(k, d),
          set: (k, v) => GM_setValue(k, v)
        },
        // 上传数据源：只收集备份范围内的键
        exportPayload() {
          return JSON.stringify({
            app: "github-toolkit",
            version: 1,
            exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
            data: {
              bindings: GM_getValue(BACKUP_KEYS.bindings, []),
              enabledPlugins: GM_getValue(BACKUP_KEYS.enabledPlugins, []),
              accelBase: GM_getValue(BACKUP_KEYS.accelBase, null),
              egoIdentity: GM_getValue(BACKUP_KEYS.egoIdentity, ""),
              egoProtocol: GM_getValue(BACKUP_KEYS.egoProtocol, "ssh")
            }
          });
        },
        // 下载数据接收器：校验并回写，返回统计供组件 UI 展示
        importPayload(data) {
          if (!data || data.app !== "github-toolkit" || !data.data) {
            throw new Error("不是 GitHub Toolkit 的备份文件");
          }
          const d = data.data;
          const counts = [];
          if (Array.isArray(d.bindings)) {
            GM_setValue(BACKUP_KEYS.bindings, d.bindings);
            counts.push(`绑定 ${d.bindings.length}`);
          }
          if (Array.isArray(d.enabledPlugins)) {
            GM_setValue(BACKUP_KEYS.enabledPlugins, d.enabledPlugins);
            counts.push(`插件 ${d.enabledPlugins.length}`);
          }
          if (typeof d.accelBase === "string" && d.accelBase) {
            GM_setValue(BACKUP_KEYS.accelBase, d.accelBase);
            counts.push("加速地址");
          }
          if (typeof d.egoIdentity === "string") {
            GM_setValue(BACKUP_KEYS.egoIdentity, d.egoIdentity);
            counts.push("ego 身份");
          }
          if (d.egoProtocol === "ssh" || d.egoProtocol === "https") {
            GM_setValue(BACKUP_KEYS.egoProtocol, d.egoProtocol);
            counts.push("ego 协议");
          }
          return { restored: counts.join("、") || "无数据" };
        }
      });
      return webdev;
    } catch (e) {
      Logger.error("WebdevComponent 初始化失败:", e);
      return null;
    }
  }
  function openCloudPanel() {
    const w = ensureWebdev();
    if (!w) return false;
    try {
      w.openPanel();
      return true;
    } catch (e) {
      Logger.error("打开云端面板失败:", e);
      return false;
    }
  }
  let active = null;
  let seq = 0;
  const Modal = {
    show({
      title = "提示",
      content = "",
      showInput = false,
      inputValue = "",
      placeholder = "",
      confirmText = "确定",
      cancelText = "取消",
      danger = false
    } = {}) {
      return new Promise((resolve) => {
        active?.(null);
        const prevFocus = document.activeElement;
        const titleId = `ghtk-modal-title-${++seq}`;
        const mask = document.createElement("div");
        mask.className = "ghtk-modal-mask";
        mask.innerHTML = `
        <div class="ghtk-modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
          <div class="ghtk-modal-header">
            <span class="ghtk-modal-title" id="${titleId}">${escapeHtml(title)}</span>
            <button class="ghtk-icon-btn ghtk-modal-close" type="button" title="关闭" aria-label="关闭">${ICON.x}</button>
          </div>
          <div class="ghtk-modal-body">
            ${content ? `<div class="ghtk-modal-content">${content}</div>` : ""}
            ${showInput ? `<input class="ghtk-modal-input" type="text" value="${escapeHtml(inputValue)}" placeholder="${escapeHtml(
        placeholder
      )}" aria-label="${escapeHtml(placeholder || title)}" autocomplete="off" spellcheck="false" />` : ""}
          </div>
          <div class="ghtk-modal-footer">
            <button class="ghtk-btn" data-action="cancel" type="button">${escapeHtml(cancelText)}</button>
            <button class="ghtk-btn ${danger ? "danger-solid" : "primary"}" data-action="confirm" type="button">${escapeHtml(
        confirmText
      )}</button>
          </div>
        </div>
      `;
        injectGlobalStyles();
        getRoot().appendChild(mask);
        const setBox = (r) => {
          mask.style.setProperty("left", r.left + "px", "important");
          mask.style.setProperty("top", r.top + "px", "important");
          mask.style.setProperty("width", r.width + "px", "important");
          mask.style.setProperty("height", r.height + "px", "important");
          mask.style.setProperty("right", "auto", "important");
          mask.style.setProperty("bottom", "auto", "important");
        };
        const panel = document.querySelector(".ghtk-panel");
        if (panel) {
          mask.classList.add("in-panel");
          mask.style.setProperty("border-radius", "14px", "important");
          setBox(panel.getBoundingClientRect());
        }
        const input = mask.querySelector(".ghtk-modal-input");
        let done = false;
        let rafId = 0;
        let lastKey = "";
        let release = () => {
        };
        const finish = (result) => {
          if (done) return;
          done = true;
          if (active === finish) active = null;
          if (rafId) cancelAnimationFrame(rafId);
          release();
          mask.remove();
          if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true });
          resolve(result);
        };
        active = finish;
        release = pushLayer("modal", () => finish(null));
        const syncToPanel = () => {
          if (!mask.isConnected) return;
          const p = document.querySelector(".ghtk-panel");
          if (p && mask.classList.contains("in-panel")) {
            const r = p.getBoundingClientRect();
            const key = [r.left, r.top, r.width, r.height].map((n) => Math.round(n)).join(",");
            if (key !== lastKey) {
              lastKey = key;
              setBox(r);
            }
          }
          rafId = requestAnimationFrame(syncToPanel);
        };
        if (mask.classList.contains("in-panel")) rafId = requestAnimationFrame(syncToPanel);
        const confirmValue = () => showInput ? input ? input.value.trim() : "" : true;
        mask.querySelector(".ghtk-modal-close")?.addEventListener("click", () => finish(null));
        mask.querySelector('[data-action="cancel"]')?.addEventListener("click", () => finish(null));
        mask.querySelector('[data-action="confirm"]')?.addEventListener("click", () => finish(confirmValue()));
        let downOnMask = false;
        mask.addEventListener("pointerdown", (e) => {
          downOnMask = e.target === mask;
        });
        mask.addEventListener("click", (e) => {
          if (e.target === mask && downOnMask) finish(null);
        });
        mask.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && e.target === input && !e.isComposing) {
            e.preventDefault();
            finish(confirmValue());
            return;
          }
          if (e.key !== "Tab") return;
          const list = Array.from(mask.querySelectorAll("button, input")).filter(
            (el) => !el.hasAttribute("disabled")
          );
          if (!list.length) return;
          const first = list[0];
          const last = list[list.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        });
        setTimeout(() => {
          if (done) return;
          if (input) {
            input.focus({ preventScroll: true });
            input.select();
            return;
          }
          const target = mask.querySelector(danger ? '[data-action="cancel"]' : '[data-action="confirm"]');
          target?.focus({ preventScroll: true });
        }, 30);
      });
    }
  };
  const PREFIX = "ghtk-cache:";
  const MAX_ENTRIES = 200;
  const MAX_ENTRY_BYTES = 100 * 1024;
  class PersistentCache {
    memory = /* @__PURE__ */ new Map();
    /** 按 key 记录最近访问时间，用于 LRU 淘汰 */
    hits = /* @__PURE__ */ new Map();
    /** key 索引，用于容量控制 */
    indexLoaded = false;
    index = [];
    /** 读取缓存：内存优先，其次持久层 */
    read(fullKey, ttl) {
      const now = Date.now();
      const mem = this.memory.get(fullKey);
      if (mem) {
        const fresh = now - mem.at < ttl;
        this.touch(fullKey);
        return { data: mem.data, stale: !fresh };
      }
      try {
        const raw = GM_getValue(PREFIX + fullKey, null);
        if (raw && typeof raw.at === "number") {
          this.memory.set(fullKey, raw);
          this.touch(fullKey);
          const fresh = now - raw.at < ttl;
          return { data: raw.data, stale: !fresh };
        }
      } catch {
      }
      return { data: null, stale: true };
    }
    /** 写入缓存（同时写内存与持久层） */
    write(fullKey, data) {
      const entry = { data, at: Date.now() };
      this.memory.set(fullKey, entry);
      this.touch(fullKey);
      try {
        const serialized = JSON.stringify(entry);
        if (serialized.length > MAX_ENTRY_BYTES) return;
        GM_setValue(PREFIX + fullKey, entry);
        this.addToIndex(fullKey);
      } catch {
      }
    }
    /** 记录访问时间并维护索引 */
    touch(fullKey) {
      this.hits.set(fullKey, Date.now());
    }
    loadIndex() {
      if (this.indexLoaded) return;
      this.indexLoaded = true;
      try {
        const raw = GM_getValue(PREFIX + "__index__", null);
        if (Array.isArray(raw)) this.index = raw;
      } catch {
        this.index = [];
      }
    }
    addToIndex(fullKey) {
      this.loadIndex();
      if (this.index.includes(fullKey)) return;
      this.index.push(fullKey);
      if (this.index.length > MAX_ENTRIES) {
        const sorted = [...this.index].sort(
          (a, b) => (this.hits.get(a) ?? 0) - (this.hits.get(b) ?? 0)
        );
        const removeCount = this.index.length - MAX_ENTRIES;
        const toRemove = sorted.slice(0, removeCount);
        for (const k of toRemove) {
          this.index = this.index.filter((x) => x !== k);
          this.memory.delete(k);
          try {
            GM_deleteValue(PREFIX + k);
          } catch {
          }
        }
      }
      try {
        GM_setValue(PREFIX + "__index__", this.index);
      } catch {
      }
    }
    /** 清空全部缓存（供调试/菜单使用） */
    clear() {
      this.memory.clear();
      this.hits.clear();
      this.loadIndex();
      for (const k of this.index) {
        try {
          GM_deleteValue(PREFIX + k);
        } catch {
        }
      }
      this.index = [];
      try {
        GM_setValue(PREFIX + "__index__", []);
      } catch {
      }
    }
  }
  const cache = new PersistentCache();
  function cachedFetch(opts, fetcher, onData) {
    const { data, stale } = cache.read(opts.key, opts.ttl);
    if (data !== null) {
      onData(data);
      if (!stale) return;
    }
    fetcher().then((fresh) => {
      if (fresh !== null && fresh !== void 0) {
        cache.write(opts.key, fresh);
        if (data === null || JSON.stringify(fresh) !== JSON.stringify(data)) {
          onData(fresh);
        }
      } else if (data === null) {
        onData(null);
      }
    });
  }
  const API_HEADERS = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  function getCurrentUser(dom2) {
    const meta = dom2.qs('meta[name="user-login"]') || dom2.qs('meta[name="octolytics-actor-login"]');
    if (meta?.content?.trim()) return meta.content.trim();
    const dataLogin = dom2.qs("[data-login]");
    if (dataLogin?.getAttribute("data-login")) return dataLogin.getAttribute("data-login").trim();
    const avatar = dom2.qs('img.avatar[alt^="@"]') || dom2.qs('[data-testid="github-avatar"][alt^="@"]');
    if (avatar?.alt) {
      const m = avatar.alt.match(/@([\w-]+)/);
      if (m) return m[1];
    }
    return null;
  }
  function fetchRepoInfo(owner, repo) {
    return new Promise((resolve) => {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url: `https://api.github.com/repos/${owner}/${repo}`,
          headers: API_HEADERS,
          onload: (res) => {
            if (res.status !== 200) {
              resolve(null);
              return;
            }
            try {
              const data = JSON.parse(res.responseText);
              resolve({
                full_name: data.full_name,
                fork: !!data.fork,
                parent: data.parent ? {
                  full_name: data.parent.full_name,
                  owner: data.parent.owner.login,
                  repo: data.parent.name
                } : null,
                source: data.source ? {
                  full_name: data.source.full_name,
                  owner: data.source.owner.login,
                  repo: data.source.name
                } : null
              });
            } catch {
              resolve(null);
            }
          },
          onerror: () => resolve(null),
          ontimeout: () => resolve(null)
        });
      } catch {
        resolve(null);
      }
    });
  }
  const forkCache = /* @__PURE__ */ new Map();
  const FORK_CACHE_TTL = 10 * 60 * 1e3;
  const aboutCache = /* @__PURE__ */ new Map();
  const ABOUT_TTL = 24 * 60 * 60 * 1e3;
  const LAST_COMMIT_TTL = 60 * 60 * 1e3;
  const lastCommitMem = /* @__PURE__ */ new Map();
  function loadLastCommit(owner, repo, onData) {
    const key = `lastcommit:${owner}/${repo}`.toLowerCase();
    cachedFetch(
      { key, ttl: LAST_COMMIT_TTL },
      () => fetchLastCommit(owner, repo),
      (date) => {
        if (date) lastCommitMem.set(key, date);
        onData(date);
      }
    );
  }
  function fetchLastCommit(owner, repo) {
    return new Promise((resolve) => {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url: `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
          headers: API_HEADERS,
          onload: (res) => {
            if (res.status !== 200) {
              resolve(null);
              return;
            }
            try {
              const arr = JSON.parse(res.responseText);
              const date = Array.isArray(arr) && arr[0]?.commit?.committer?.date ? arr[0].commit.committer.date : null;
              resolve(date);
            } catch {
              resolve(null);
            }
          },
          onerror: () => resolve(null),
          ontimeout: () => resolve(null)
        });
      } catch {
        resolve(null);
      }
    });
  }
  function loadRepoAbout(owner, repo, onData) {
    const key = `about:${owner}/${repo}`.toLowerCase();
    cachedFetch(
      { key, ttl: ABOUT_TTL },
      () => fetchRepoAbout(owner, repo),
      (data) => {
        if (data) aboutCache.set(key, { data, at: Date.now() });
        onData(data);
      }
    );
  }
  function fetchRepoAbout(owner, repo) {
    const key = `about:${owner}/${repo}`.toLowerCase();
    const cached = aboutCache.get(key);
    if (cached && Date.now() - cached.at < ABOUT_TTL) {
      return Promise.resolve(cached.data);
    }
    return new Promise((resolve) => {
      const done = (data) => {
        aboutCache.set(key, { data, at: Date.now() });
        resolve(data);
      };
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url: `https://api.github.com/repos/${owner}/${repo}`,
          headers: API_HEADERS,
          onload: (res) => {
            if (res.status !== 200) {
              done(null);
              return;
            }
            try {
              const d = JSON.parse(res.responseText);
              done({
                full_name: d.full_name,
                owner: d.owner?.login ?? owner,
                repo: d.name ?? repo,
                description: d.description ?? null,
                homepage: d.homepage || null,
                language: d.language ?? null,
                license: d.license?.spdx_id ?? d.license?.name ?? null,
                stars: d.stargazers_count ?? 0,
                forks: d.forks_count ?? 0,
                openIssues: d.open_issues_count ?? 0,
                topics: Array.isArray(d.topics) ? d.topics : [],
                archived: !!d.archived,
                updatedAt: d.pushed_at ?? d.updated_at ?? null,
                ownerAvatar: d.owner?.avatar_url ?? null
              });
            } catch {
              done(null);
            }
          },
          onerror: () => done(null),
          ontimeout: () => done(null)
        });
      } catch {
        done(null);
      }
    });
  }
  function checkHasForked(currentUser, owner, repo) {
    const forkUrl = `https://github.com/${currentUser}/${repo}`;
    const cacheKey = `${currentUser}/${owner}/${repo}`.toLowerCase();
    const cached = forkCache.get(cacheKey);
    if (cached && Date.now() - cached.at < FORK_CACHE_TTL) {
      return Promise.resolve({
        forkUrl: cached.url,
        reason: cached.url ? "fork" : "not-fork"
      });
    }
    const remember = (result) => {
      if (result.reason === "fork" || result.reason === "not-fork") {
        forkCache.set(cacheKey, { url: result.forkUrl, at: Date.now() });
      }
      return result;
    };
    return new Promise((resolve) => {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url: `https://api.github.com/repos/${currentUser}/${repo}`,
          headers: API_HEADERS,
          onload: async (res) => {
            if (res.status === 200) {
              try {
                const data = JSON.parse(res.responseText);
                const parentFull = data.parent?.full_name || data.source?.full_name || "";
                const isForkOfThis = parentFull.toLowerCase() === `${owner}/${repo}`.toLowerCase();
                if (data.fork) {
                  resolve(remember({ forkUrl, reason: "fork" }));
                  return;
                }
                resolve(remember({ forkUrl: null, reason: "not-fork" }));
                return;
              } catch {
                resolve(remember({ forkUrl: null, reason: "unknown" }));
                return;
              }
            }
            if (res.status === 403 || res.status === 429) {
              const htmlHit = await probeForkByHtml(currentUser, owner, repo);
              if (htmlHit === true) {
                resolve(remember({ forkUrl, reason: "fork" }));
              } else if (htmlHit === false) {
                resolve(remember({ forkUrl: null, reason: "not-fork" }));
              } else {
                resolve({ forkUrl: null, reason: "rate-limited" });
              }
              return;
            }
            if (res.status === 404) {
              const htmlHit = await probeForkByHtml(currentUser, owner, repo);
              if (htmlHit === true) {
                resolve(remember({ forkUrl, reason: "fork" }));
              } else {
                resolve(remember({ forkUrl: null, reason: "not-fork" }));
              }
              return;
            }
            resolve({ forkUrl: null, reason: "unknown" });
          },
          onerror: () => resolve({ forkUrl: null, reason: "unknown" }),
          ontimeout: () => resolve({ forkUrl: null, reason: "unknown" })
        });
      } catch {
        resolve({ forkUrl: null, reason: "unknown" });
      }
    });
  }
  function probeForkByHtml(user, owner, repo) {
    return new Promise((resolve) => {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url: `https://github.com/${user}/${repo}`,
          headers: { Accept: "text/html" },
          timeout: 8e3,
          onload: (res) => {
            if (res.status === 404) {
              resolve(false);
              return;
            }
            if (res.status !== 200) {
              resolve(null);
              return;
            }
            const html = res.responseText || "";
            if (/forked\s*from[\s\S]{0,400}?href="\/([^"/]+)\/([^"/?]+)"/i.test(html)) {
              resolve(true);
              return;
            }
            resolve(null);
          },
          onerror: () => resolve(null),
          ontimeout: () => resolve(null)
        });
      } catch {
        resolve(null);
      }
    });
  }
  let current$1 = null;
  function isPopoverOpen() {
    return !!current$1;
  }
  function closePopover() {
    if (!current$1) return;
    const p = current$1;
    current$1 = null;
    const hadFocus = p.el.contains(document.activeElement);
    p.cleanup();
    p.release();
    p.el.remove();
    p.anchor.setAttribute("aria-expanded", "false");
    if (hadFocus && p.anchor.isConnected) p.anchor.focus({ preventScroll: true });
    p.onClose?.();
  }
  function showAboutPopover({ about, anchor, extraMeta = [], onClose }) {
    injectGlobalStyles();
    const key = about.full_name.toLowerCase();
    if (current$1 && current$1.key === key) {
      closePopover();
      return;
    }
    closePopover();
    const rows = [
      ["主语言", about.language || "—"],
      ["Star", compactNum(about.stars)],
      ["Fork", compactNum(about.forks)],
      ["许可证", about.license || "—"],
      ["未关闭 Issue/PR", String(about.openIssues)],
      ...extraMeta
    ];
    const desc = about.description?.trim() || "暂无简介";
    const topics = about.topics.length ? `<div class="ghtk-pop-group">
         <div class="ghtk-pop-sec">主题 · ${about.topics.length}</div>
         <div class="ghtk-pop-topics">${about.topics.map((t) => `<span class="ghtk-topic">${escapeHtml(t)}</span>`).join("")}</div>
       </div>` : "";
    const homeRaw = (about.homepage || "").trim();
    const homeHref = homeRaw ? /^https?:\/\//i.test(homeRaw) ? homeRaw : "https://" + homeRaw : "";
    const home = homeHref && /^https?:\/\/[^\s"'<>]+$/i.test(homeHref) ? `<div class="ghtk-pop-group">
           <div class="ghtk-pop-sec">主页</div>
           <a class="ghtk-pop-home" href="${escapeHtml(homeHref)}" target="_blank" rel="noreferrer">${escapeHtml(
    homeHref.replace(/^https?:\/\//i, "")
  )}</a>
         </div>` : "";
    const el = document.createElement("div");
    el.className = "ghtk-popover";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", about.full_name);
    el.innerHTML = `
    <div class="ghtk-pop-arrow" aria-hidden="true"></div>
    <div class="ghtk-pop-inner">
      <div class="ghtk-pop-head">
        <div class="ghtk-pop-title" title="${escapeHtml(about.full_name)}">${escapeHtml(about.full_name)}</div>
        <button class="ghtk-icon-btn ghtk-pop-close" type="button" title="关闭" aria-label="关闭">${ICON.x}</button>
      </div>
      <div class="ghtk-pop-body">
        <div class="ghtk-pop-desc">${escapeHtml(desc)}</div>
        <div class="ghtk-pop-grid">
          ${rows.map(
    ([k, v]) => `<div class="ghtk-pop-cell">
                <div class="ghtk-pop-k">${escapeHtml(k)}</div>
                <div class="ghtk-pop-v" title="${escapeHtml(v)}">${escapeHtml(v)}</div>
              </div>`
  ).join("")}
        </div>
        ${topics}
        ${home}
        ${about.archived ? '<div class="ghtk-pop-note">该仓库已归档</div>' : ""}
      </div>
    </div>
  `;
    getRoot().appendChild(el);
    const panel = document.querySelector(".ghtk-panel");
    const b = panel ? panel.getBoundingClientRect() : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const margin = 8;
    const gap = 8;
    const pw = Math.max(240, Math.min(384, b.width - margin * 2));
    el.style.setProperty("width", pw + "px", "important");
    el.style.setProperty("max-height", Math.max(200, b.height - margin * 2) + "px", "important");
    const ph = el.offsetHeight;
    const a = anchor.getBoundingClientRect();
    const left = Math.min(Math.max(b.left + margin, a.left + a.width / 2 - pw / 2), b.right - pw - margin);
    let top;
    let arrow;
    if (a.bottom + gap + ph <= b.bottom - margin) {
      top = a.bottom + gap;
      arrow = "up";
    } else if (a.top - gap - ph >= b.top + margin) {
      top = a.top - gap - ph;
      arrow = "down";
    } else {
      top = Math.max(b.top + margin, b.bottom - margin - ph);
      arrow = null;
    }
    el.style.setProperty("left", left + "px", "important");
    el.style.setProperty("top", top + "px", "important");
    const arrowEl = el.querySelector(".ghtk-pop-arrow");
    if (arrowEl) {
      if (arrow) {
        arrowEl.classList.add(arrow);
        const ax = Math.min(Math.max(14, a.left + a.width / 2 - left - 5), pw - 24);
        arrowEl.style.setProperty("left", ax + "px", "important");
      } else {
        arrowEl.remove();
      }
    }
    el.querySelector(".ghtk-pop-close")?.addEventListener("click", () => closePopover());
    let alive = true;
    const onDown = (e) => {
      const t = e.target;
      if (!t || el.contains(t) || anchor.contains(t)) return;
      if (t.closest("[data-ghtk-popover-trigger]")) return;
      closePopover();
    };
    setTimeout(() => {
      if (alive) document.addEventListener("pointerdown", onDown, true);
    }, 0);
    const p = {
      el,
      anchor,
      key,
      onClose,
      release: () => {
      },
      cleanup: () => {
        alive = false;
        document.removeEventListener("pointerdown", onDown, true);
      }
    };
    current$1 = p;
    p.release = pushLayer("transient", () => closePopover());
    anchor.setAttribute("aria-expanded", "true");
    el.querySelector(".ghtk-pop-close")?.focus({ preventScroll: true });
  }
  let current = null;
  function closeMenu(restoreFocus = true) {
    if (!current) return;
    const m = current;
    current = null;
    const hadFocus = m.el.contains(document.activeElement);
    m.cleanup();
    m.release();
    m.el.remove();
    m.anchor.setAttribute("aria-expanded", "false");
    if (restoreFocus && hadFocus && m.anchor.isConnected) m.anchor.focus({ preventScroll: true });
  }
  function showMenu(anchor, items) {
    if (current && current.anchor === anchor) {
      closeMenu();
      return;
    }
    closeMenu(false);
    injectGlobalStyles();
    const el = document.createElement("div");
    el.className = "ghtk-menu";
    el.setAttribute("role", "menu");
    el.innerHTML = items.map(
      (it, i) => `<button class="ghtk-menu-item${it.danger ? " danger" : ""}" type="button" role="menuitem" tabindex="-1" data-i="${i}">${escapeHtml(
      it.label
    )}</button>`
    ).join("");
    getRoot().appendChild(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    const left = Math.min(Math.max(margin, r.right - w), window.innerWidth - w - margin);
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - margin) top = Math.max(margin, r.top - h - 4);
    el.style.setProperty("left", left + "px", "important");
    el.style.setProperty("top", top + "px", "important");
    const buttons = Array.from(el.querySelectorAll(".ghtk-menu-item"));
    const focusAt = (i) => buttons[(i + buttons.length) % buttons.length]?.focus({ preventScroll: true });
    el.addEventListener("click", (e) => {
      const b = e.target.closest(".ghtk-menu-item");
      if (!b) return;
      const item = items[Number(b.dataset.i)];
      closeMenu();
      item?.onSelect();
    });
    el.addEventListener("keydown", (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusAt(i + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusAt(i - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusAt(0);
      } else if (e.key === "End") {
        e.preventDefault();
        focusAt(buttons.length - 1);
      } else if (e.key === "Tab") {
        closeMenu(false);
      }
    });
    let alive = true;
    const onDown = (e) => {
      const t = e.target;
      if (!t || el.contains(t) || anchor.contains(t)) return;
      closeMenu(false);
    };
    setTimeout(() => {
      if (alive) document.addEventListener("pointerdown", onDown, true);
    }, 0);
    const m = {
      el,
      anchor,
      release: () => {
      },
      cleanup: () => {
        alive = false;
        document.removeEventListener("pointerdown", onDown, true);
      }
    };
    current = m;
    m.release = pushLayer("transient", () => closeMenu());
    anchor.setAttribute("aria-expanded", "true");
    focusAt(0);
  }
  function relativeTime(iso) {
    const then = new Date(iso).getTime();
    if (isNaN(then)) return "—";
    const diff = Date.now() - then;
    const MIN = 6e4;
    const HOUR = 36e5;
    const DAY = 864e5;
    if (diff < MIN) return "刚刚";
    if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
    if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
    if (diff < DAY * 30) return `${Math.floor(diff / DAY)} 天前`;
    if (diff < DAY * 365) return `${Math.floor(diff / (DAY * 30))} 个月前`;
    return `${Math.floor(diff / (DAY * 365))} 年前`;
  }
  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const BIND_STORAGE_KEY = "upstream-downstream-bindings";
  function loadBindings() {
    const v = GM_getValue(BIND_STORAGE_KEY, []);
    return Array.isArray(v) ? v : [];
  }
  function saveBindings(list) {
    GM_setValue(BIND_STORAGE_KEY, list);
  }
  const fullOf = (b) => `${b.owner}/${b.repo}`;
  const keyOf = (s) => s.toLowerCase();
  function parseRepo(input) {
    const s = String(input || "").trim().replace(/^git@github\.com:/i, "").replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/[?#].*$/, "");
    const parts = s.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,38}$/.test(owner)) return null;
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo) || repo === "." || repo === "..") return null;
    return { owner, repo };
  }
  const detectCache = /* @__PURE__ */ new Map();
  function detectUpstream(owner, repo) {
    const key = keyOf(`${owner}/${repo}`);
    const hit = detectCache.get(key);
    if (hit) return hit;
    const p = fetchRepoInfo(owner, repo).then((info) => {
      if (!info) return { state: "failed" };
      const up = info.parent || info.source;
      if (!info.fork || !up) return { state: "none" };
      return { state: "fork", upstream: up.full_name };
    });
    detectCache.set(key, p);
    void p.then((d) => {
      if (d.state === "failed") detectCache.delete(key);
    });
    return p;
  }
  const viewMemory = { query: "", selected: "", railScroll: 0 };
  function fitTopics(scope) {
    const row = scope.querySelector(".ghtk-topics");
    if (!row || !row.clientWidth) return;
    const chips = Array.from(row.querySelectorAll(".ghtk-topic:not(.more)"));
    const more = row.querySelector(".ghtk-topic.more");
    if (!chips.length || !more) return;
    chips.forEach((c) => c.hidden = false);
    more.hidden = true;
    if (row.scrollWidth <= row.clientWidth) return;
    let shown = chips.length;
    more.hidden = false;
    while (shown > 1) {
      shown--;
      chips[shown].hidden = true;
      more.textContent = `+${chips.length - shown}`;
      if (row.scrollWidth <= row.clientWidth) return;
    }
  }
  const LANG_COLORS = {
    JavaScript: "#f1e05a",
    TypeScript: "#3178c6",
    Python: "#3572A5",
    Go: "#00ADD8",
    Rust: "#dea584",
    Java: "#b07219",
    "C++": "#f34b7d",
    C: "#555555",
    "C#": "#178600",
    Ruby: "#701516",
    PHP: "#4F5D95",
    Swift: "#F05138",
    Kotlin: "#A97BFF",
    Dart: "#00B4AB",
    Shell: "#89e051",
    HTML: "#e34c26",
    CSS: "#563d7c",
    Vue: "#41b883",
    SCSS: "#c6538c",
    Lua: "#000080",
    Zig: "#ec915c"
  };
  function renderAbout(about) {
    if (!about) {
      const text = about === void 0 ? "正在加载仓库简介…" : "无仓库信息";
      return `
      <div class="ghtk-about">
        <div class="ghtk-about-top"><div class="ghtk-about-desc muted">${text}</div></div>
        <div class="ghtk-about-meta"></div>
        <div class="ghtk-topics"></div>
      </div>`;
    }
    const desc = about.description?.trim() || "";
    const meta = [];
    if (about.language) {
      const color = Object.prototype.hasOwnProperty.call(LANG_COLORS, about.language) ? LANG_COLORS[about.language] : "#8b949e";
      meta.push(
        `<span class="ghtk-meta-item"><span class="ghtk-lang-dot" style="background:${color}"></span>${escapeHtml(about.language)}</span>`
      );
    }
    if (about.stars) meta.push(`<span class="ghtk-meta-item" title="Star">${ICON.star}${compactNum(about.stars)}</span>`);
    if (about.forks) meta.push(`<span class="ghtk-meta-item" title="Fork">${ICON.fork}${compactNum(about.forks)}</span>`);
    if (about.license) meta.push(`<span class="ghtk-meta-item">${escapeHtml(about.license)}</span>`);
    const topics = about.topics.map((t, i) => `<span class="ghtk-topic" title="${escapeHtml(t)}"${i >= 3 ? " hidden" : ""}>${escapeHtml(t)}</span>`).join("") + (about.topics.length > 3 ? `<span class="ghtk-topic more">+${about.topics.length - 3}</span>` : '<span class="ghtk-topic more" hidden></span>');
    return `
    <div class="ghtk-about">
      <div class="ghtk-about-top">
        <div class="ghtk-about-desc${desc ? "" : " muted"}">${desc ? escapeHtml(desc) : "暂无简介"}</div>
        <button class="ghtk-icon-btn ghtk-about-more" type="button" data-act="about" data-ghtk-popover-trigger
          title="查看完整信息" aria-label="查看完整信息" aria-haspopup="dialog" aria-expanded="false">${ICON.info}</button>
      </div>
      <div class="ghtk-about-meta">${meta.join("")}</div>
      <div class="ghtk-topics">${topics}</div>
    </div>`;
  }
  const UpstreamBindPlugin = {
    id: "upstream-bind",
    name: "上游/下游仓库绑定",
    version: "2.9.0",
    description: "自动检测当前仓库上游，支持手动添加与上下游绑定",
    matches() {
      return true;
    },
    async onEnable() {
    },
    onDisable() {
    },
    panelTab: {
      id: "fork",
      label: "绑定",
      render() {
        return `
        <div class="ghtk-toolbar">
          <label class="ghtk-search">
            ${ICON.search}
            <input type="text" id="ghtk-search-input" placeholder="搜索绑定" aria-label="搜索上游或下游" autocomplete="off" spellcheck="false" />
          </label>
          <button class="ghtk-icon-btn ghtk-toolbar-add" id="ghtk-add-toggle" type="button"
            title="添加上游" aria-label="添加上游" aria-pressed="false">${ICON.plus}</button>
        </div>
        <div class="ghtk-split">
          <div class="ghtk-rail">
            <div class="ghtk-rail-head"><span>上游</span><span id="ghtk-rail-total"></span></div>
            <button class="ghtk-current-repo" id="ghtk-current-repo" type="button" hidden>
              ${ICON.pin}<span class="ghtk-cur-name" id="ghtk-current-repo-name"></span>${ICON.circle}
            </button>
            <div class="ghtk-rail-list" id="ghtk-rail-list" role="listbox" aria-label="上游列表"></div>
          </div>
          <div class="ghtk-detail" id="ghtk-detail"></div>
        </div>
      `;
      },
      mount(ctx, root) {
        const railList = root.querySelector("#ghtk-rail-list");
        const railTotal = root.querySelector("#ghtk-rail-total");
        const detail = root.querySelector("#ghtk-detail");
        const addToggle = root.querySelector("#ghtk-add-toggle");
        const searchInput = root.querySelector("#ghtk-search-input");
        const curBtn = root.querySelector("#ghtk-current-repo");
        const curName = root.querySelector("#ghtk-current-repo-name");
        if (!railList || !railTotal || !detail || !addToggle || !searchInput || !curBtn || !curName) return;
        const currentUser = getCurrentUser(ctx.dom);
        const page = ctx.page;
        const currentRepo = page.owner && page.repo ? `${page.owner}/${page.repo}` : "";
        const curKey = keyOf(currentRepo);
        const state = {
          selected: "",
          addMode: false,
          draft: "",
          detection: currentRepo ? { state: "pending" } : { state: "none" },
          about: /* @__PURE__ */ new Map(),
          lastCommit: /* @__PURE__ */ new Map(),
          requested: /* @__PURE__ */ new Set(),
          bindingKey: "",
          dirty: false
        };
        const detectionPromise = currentRepo ? detectUpstream(page.owner, page.repo) : Promise.resolve({ state: "none" });
        let releaseAdd = null;
        const isUpstreamOfCurrent = (b) => !!curKey && keyOf(fullOf(b)) === curKey;
        const isDownstreamOfCurrent = (b) => !!curKey && (b.downstreams || []).some((d) => keyOf(d) === curKey);
        const isRelated = (b) => isUpstreamOfCurrent(b) || isDownstreamOfCurrent(b);
        const setSelected = (key) => {
          state.selected = key;
          viewMemory.selected = key;
        };
        const pickInitial = () => {
          const list = loadBindings();
          const pick = list.find(isUpstreamOfCurrent) || list.find(isDownstreamOfCurrent) || list.find((b) => keyOf(fullOf(b)) === viewMemory.selected) || list[0];
          setSelected(pick ? keyOf(fullOf(pick)) : "");
        };
        const findSelected = (list = loadBindings()) => list.find((b) => keyOf(fullOf(b)) === state.selected) || null;
        const matchesQuery = (b, q) => !q || keyOf(fullOf(b)).includes(q) || (b.downstreams || []).some((d) => keyOf(d).includes(q));
        const copy = (text) => {
          void copyText(text).then((ok) => ctx.ui.toast(ok ? "已复制" : "复制失败"));
        };
        const updateCurrentEntry = () => {
          const list = loadBindings();
          if (!currentRepo || list.some(isRelated)) {
            curBtn.hidden = true;
            return;
          }
          curBtn.hidden = false;
          curName.textContent = currentRepo;
          const d = state.detection;
          let tip;
          if (d.state === "pending") tip = `当前仓库：${currentRepo}
正在检测上游…`;
          else if (d.state === "fork") tip = `当前仓库：${currentRepo}
未绑定 · 上游是 ${d.upstream}
点击绑定为它的下游`;
          else if (d.state === "failed") tip = `当前仓库：${currentRepo}
未绑定 · 上游检测失败
点击手动添加`;
          else tip = `当前仓库：${currentRepo}
未绑定
点击添加为上游`;
          curBtn.title = tip;
          curBtn.setAttribute("aria-label", tip.replace(/\n/g, "，"));
          if (d.state === "pending") curBtn.setAttribute("aria-busy", "true");
          else curBtn.removeAttribute("aria-busy");
        };
        const renderRail = () => {
          updateCurrentEntry();
          const list = loadBindings();
          railTotal.textContent = list.length ? String(list.length) : "";
          if (!list.length) {
            railList.innerHTML = `<div class="ghtk-rail-empty">暂无绑定</div>`;
            return;
          }
          const q = viewMemory.query.trim().toLowerCase();
          const rows = list.filter((b) => matchesQuery(b, q));
          if (!rows.length) {
            railList.innerHTML = `<div class="ghtk-rail-empty">无匹配</div>`;
            return;
          }
          const activeVisible = !state.addMode && rows.some((b) => keyOf(fullOf(b)) === state.selected);
          railList.innerHTML = rows.map((b, i) => {
            const key = keyOf(fullOf(b));
            const active2 = !state.addMode && key === state.selected;
            const related = isRelated(b);
            const count = (b.downstreams || []).length;
            const tabIndex = active2 || !activeVisible && i === 0 ? "0" : "-1";
            const tip = `${fullOf(b)}${related ? " · 与当前仓库相关" : ""} · ${count} 个下游`;
            return `
              <button class="ghtk-rail-item${active2 ? " active" : ""}" type="button" role="option"
                aria-selected="${active2}" tabindex="${tabIndex}" data-key="${escapeHtml(key)}" title="${escapeHtml(tip)}">
                <span class="ghtk-rail-text">
                  <span class="ghtk-rail-name">${related ? ICON.pin : ""}<span>${escapeHtml(b.repo)}</span></span>
                  <span class="ghtk-rail-owner">${escapeHtml(b.owner)}</span>
                </span>
                <span class="ghtk-rail-count">${count}</span>
              </button>`;
          }).join("");
          railList.scrollTop = viewMemory.railScroll;
        };
        const selectKey = (key, focus = false) => {
          if (state.addMode) exitAddMode(false);
          setSelected(key);
          renderRail();
          renderDetail();
          if (focus) {
            railList.querySelector(`.ghtk-rail-item[data-key="${CSS.escape(key)}"]`)?.focus();
          }
        };
        railList.addEventListener("click", (e) => {
          const item = e.target.closest(".ghtk-rail-item");
          if (item?.dataset.key) selectKey(item.dataset.key);
        });
        railList.addEventListener("keydown", (e) => {
          const items = Array.from(railList.querySelectorAll(".ghtk-rail-item"));
          const i = items.indexOf(document.activeElement);
          if (i < 0) return;
          let next;
          if (e.key === "ArrowDown") next = Math.min(items.length - 1, i + 1);
          else if (e.key === "ArrowUp") next = Math.max(0, i - 1);
          else if (e.key === "Home") next = 0;
          else if (e.key === "End") next = items.length - 1;
          else return;
          e.preventDefault();
          const key = items[next]?.dataset.key;
          if (key) selectKey(key, true);
        });
        railList.addEventListener(
          "scroll",
          () => {
            viewMemory.railScroll = railList.scrollTop;
          },
          { passive: true }
        );
        const enterAddMode = (prefill = "") => {
          if (!state.addMode) {
            state.addMode = true;
            releaseAdd = pushLayer("transient", () => {
              releaseAdd = null;
              exitAddMode();
            });
          }
          state.draft = prefill;
          addToggle.classList.add("active");
          addToggle.setAttribute("aria-pressed", "true");
          renderRail();
          renderDetail();
          const input = detail.querySelector("#ghtk-upstream-input");
          input?.focus({ preventScroll: true });
          input?.select();
        };
        function exitAddMode(render = true) {
          if (!state.addMode) return;
          const hadFocus = !!detail && detail.contains(document.activeElement);
          state.addMode = false;
          addToggle.classList.remove("active");
          addToggle.setAttribute("aria-pressed", "false");
          const release = releaseAdd;
          releaseAdd = null;
          release?.();
          if (!render) return;
          renderRail();
          renderDetail();
          if (hadFocus) addToggle.focus({ preventScroll: true });
        }
        function renderDetail() {
          if (!detail) return;
          if (isPopoverOpen()) {
            state.dirty = true;
            return;
          }
          state.dirty = false;
          if (state.addMode) {
            renderAddView();
            return;
          }
          const list = loadBindings();
          if (!list.length) {
            detail.innerHTML = `
            <div class="ghtk-blank">
              <div>还没有绑定任何上游</div>
              <button class="ghtk-btn primary" type="button" data-act="add-upstream">添加上游</button>
            </div>`;
            return;
          }
          let b = findSelected(list);
          if (!b) {
            pickInitial();
            b = findSelected(list);
          }
          if (!b) return;
          const full = fullOf(b);
          const key = keyOf(full);
          const downs = b.downstreams || [];
          const about = state.about.get(key);
          const last = state.lastCommit.get(key);
          const userPrefix = currentUser ? keyOf(currentUser) + "/" : "";
          const myForkBound = !!userPrefix && downs.some((d) => keyOf(d).startsWith(userPrefix));
          const busy = state.bindingKey === key;
          const rows = downs.map((d) => {
            const mine = !!userPrefix && keyOf(d).startsWith(userPrefix);
            const isCur = !!curKey && keyOf(d) === curKey;
            return `
              <div class="ghtk-drow">
                <span class="ghtk-drow-branch" aria-hidden="true">└</span>
                ${isCur ? `<span class="ghtk-drow-pin" title="当前仓库">${ICON.pin}</span>` : ""}
                <a class="ghtk-drow-name" href="https://github.com/${escapeHtml(d)}" data-ghtk-nav title="${escapeHtml(d)}">${escapeHtml(d)}</a>
                ${mine ? '<span class="ghtk-chip">我的 Fork</span>' : ""}
                <button class="ghtk-icon-btn ghtk-drow-rm" type="button" data-act="remove-down" data-down="${escapeHtml(d)}"
                  title="移除下游" aria-label="移除下游 ${escapeHtml(d)}">${ICON.x}</button>
              </div>`;
          }).join("");
          const emptyCta = currentUser ? `<button class="ghtk-empty-cta" type="button" data-act="bind-fork"${busy ? ' aria-busy="true"' : ""}>
               <span>还没有下游</span><strong>${busy ? "检测中…" : "检测我的 Fork"}</strong>
             </button>` : `<button class="ghtk-empty-cta" type="button" data-act="add-down">
               <span>还没有下游</span><strong>添加下游</strong>
             </button>`;
          const foot = currentUser && downs.length && !myForkBound ? `<div class="ghtk-detail-foot">
                 <button class="ghtk-btn primary block" type="button" data-act="bind-fork"${busy ? ' aria-busy="true"' : ""}>
                   ${busy ? '<span class="ghtk-spinner" aria-hidden="true"></span>检测中…' : "绑定我的 Fork"}
                 </button>
               </div>` : "";
          const when = last || about?.updatedAt || null;
          const subParts = [`${downs.length} 个下游`];
          if (when) subParts.push(`${relativeTime(when)}更新`);
          if (!currentUser) subParts.push("未登录");
          const subTip = when ? `${last ? "最后提交" : "最近推送"} ${formatDate(when)}` : "";
          detail.innerHTML = `
          <div class="ghtk-detail-head">
            <div class="ghtk-detail-title-row">
              <a class="ghtk-detail-title" href="https://github.com/${escapeHtml(full)}" data-ghtk-nav
                title="打开上游 ${escapeHtml(full)}">${escapeHtml(full)}</a>
              <button class="ghtk-icon-btn" type="button" data-act="copy" title="复制上游链接" aria-label="复制上游链接">${ICON.copy}</button>
              <button class="ghtk-icon-btn" type="button" data-act="more" title="更多操作" aria-label="更多操作"
                aria-haspopup="menu" aria-expanded="false">${ICON.kebab}</button>
            </div>
            <div class="ghtk-detail-sub"${subTip ? ` title="${escapeHtml(subTip)}"` : ""}>${escapeHtml(subParts.join(" · "))}</div>
          </div>
          ${renderAbout(about)}
          <div class="ghtk-detail-body">
            <div class="ghtk-sec-label">下游</div>
            ${downs.length ? rows : emptyCta}
          </div>
          ${foot}
        `;
          fitTopics(detail);
          loadFor(b);
        }
        if (typeof ResizeObserver !== "undefined") {
          new ResizeObserver(() => {
            if (detail.clientWidth) fitTopics(detail);
          }).observe(detail);
        }
        const loadFor = (b) => {
          const key = keyOf(fullOf(b));
          if (state.requested.has(key)) return;
          state.requested.add(key);
          loadRepoAbout(b.owner, b.repo, (data) => {
            state.about.set(key, data);
            if (state.selected === key && !state.addMode) renderDetail();
          });
          loadLastCommit(b.owner, b.repo, (date) => {
            state.lastCommit.set(key, date);
            if (state.selected === key && !state.addMode) renderDetail();
          });
        };
        function renderAddView() {
          if (!detail) return;
          const prev = detail.querySelector("#ghtk-upstream-input");
          const hadFocus = !!prev && document.activeElement === prev;
          const selStart = prev?.selectionStart ?? null;
          const selEnd = prev?.selectionEnd ?? null;
          const list = loadBindings();
          const d = state.detection;
          let extra = "";
          let detectPrimary = false;
          if (d.state === "pending") {
            extra = '<div class="ghtk-note">正在检测当前仓库…</div>';
          } else if (d.state === "fork") {
            const up = list.find((x) => keyOf(fullOf(x)) === keyOf(d.upstream));
            const already = !!up && (up.downstreams || []).some((x) => keyOf(x) === curKey);
            if (already) {
              extra = `<div class="ghtk-note">当前仓库已是 ${escapeHtml(d.upstream)} 的下游</div>`;
            } else {
              detectPrimary = true;
              extra = `
              <div class="ghtk-detect">
                <div class="ghtk-detect-label">当前仓库的上游</div>
                <div class="ghtk-detect-name" title="${escapeHtml(d.upstream)}">${escapeHtml(d.upstream)}</div>
                <div class="ghtk-btn-row">
                  <button class="ghtk-btn primary" type="button" data-act="bind-current">绑定为下游</button>
                  <a class="ghtk-btn" href="https://github.com/${escapeHtml(d.upstream)}" data-ghtk-nav>打开</a>
                </div>
              </div>`;
            }
          } else if (d.state === "failed") {
            extra = '<div class="ghtk-note">没能获取当前仓库信息</div>';
          } else if (currentRepo) {
            extra = '<div class="ghtk-note">当前仓库不是 Fork，没有上游</div>';
          }
          detail.innerHTML = `
          <div class="ghtk-addview">
            <div class="ghtk-addview-head">
              <div class="ghtk-addview-title">添加上游</div>
              <div class="ghtk-detail-sub">输入 owner/repo 或粘贴仓库链接</div>
            </div>
            <div class="ghtk-addview-body">
              <div class="ghtk-field">
                <label class="ghtk-field-label" for="ghtk-upstream-input">仓库</label>
                <div class="ghtk-field-row">
                  <input class="ghtk-input" type="text" id="ghtk-upstream-input" placeholder="owner/repo"
                    value="${escapeHtml(state.draft)}" autocomplete="off" spellcheck="false" />
                  <button class="ghtk-btn${detectPrimary ? "" : " primary"}" type="button" data-act="submit-upstream">添加</button>
                </div>
              </div>
              ${extra}
            </div>
            <div class="ghtk-detail-foot">
              <div class="ghtk-btn-row">
                <button class="ghtk-btn" type="button" data-act="cancel-add">取消</button>
              </div>
            </div>
          </div>
        `;
          if (hadFocus) {
            const input = detail.querySelector("#ghtk-upstream-input");
            if (input) {
              input.focus({ preventScroll: true });
              if (selStart !== null && selEnd !== null) input.setSelectionRange(selStart, selEnd);
            }
          }
        }
        const addDownstream = (upKey, down) => {
          const list = loadBindings();
          const b = list.find((x) => keyOf(fullOf(x)) === upKey);
          if (!b) return "missing";
          b.downstreams = b.downstreams || [];
          if (b.downstreams.some((d) => keyOf(d) === keyOf(down))) return "exists";
          b.downstreams.push(down);
          saveBindings(list);
          return "added";
        };
        const reportAdd = (r) => {
          renderRail();
          renderDetail();
          ctx.ui.toast(r === "added" ? "已绑定" : r === "exists" ? "已存在" : "上游已删除");
        };
        const promptAddDownstream = async (upKey, opts = {}) => {
          const val = await Modal.show({
            title: opts.title || "添加下游",
            content: opts.content || "",
            showInput: true,
            inputValue: opts.value ?? "",
            placeholder: "owner/repo 或链接",
            confirmText: "绑定"
          });
          if (val === null || val === false) return;
          const p = parseRepo(String(val));
          if (!p) {
            ctx.ui.toast("格式错误");
            return;
          }
          reportAdd(addDownstream(upKey, `${p.owner}/${p.repo}`));
        };
        const bindMyFork = async (b) => {
          const upKey = keyOf(fullOf(b));
          if (!currentUser) {
            await promptAddDownstream(upKey);
            return;
          }
          if (state.bindingKey) return;
          state.bindingKey = upKey;
          renderDetail();
          const res = await checkHasForked(currentUser, b.owner, b.repo);
          state.bindingKey = "";
          if (res.forkUrl) {
            reportAdd(addDownstream(upKey, `${currentUser}/${b.repo}`));
            return;
          }
          renderDetail();
          const reason = res.reason === "rate-limited" ? "GitHub API 暂时限流，没法自动检测。" : res.reason === "unknown" ? "自动检测失败。" : `没找到 ${escapeHtml(currentUser)}/${escapeHtml(b.repo)}。`;
          await promptAddDownstream(upKey, {
            title: "确认我的 Fork",
            content: `${reason}如果 fork 过（比如改了名字），填仓库全名即可。`,
            value: `${currentUser}/${b.repo}`
          });
        };
        const removeDownstream = async (b, down) => {
          const ok = await Modal.show({
            title: "移除下游",
            content: `从 <b>${escapeHtml(fullOf(b))}</b> 的下游中移除 <b>${escapeHtml(down)}</b>？`,
            confirmText: "移除",
            danger: true
          });
          if (!ok) return;
          const upKey = keyOf(fullOf(b));
          const list = loadBindings();
          const target = list.find((x) => keyOf(fullOf(x)) === upKey);
          if (!target) return;
          target.downstreams = (target.downstreams || []).filter((d) => keyOf(d) !== keyOf(down));
          saveBindings(list);
          renderRail();
          renderDetail();
          ctx.ui.toast("已移除");
        };
        const removeBinding = async (b) => {
          const full = fullOf(b);
          const ok = await Modal.show({
            title: "删除绑定",
            content: `删除上游 <b>${escapeHtml(full)}</b> 及其全部下游记录？`,
            confirmText: "删除",
            danger: true
          });
          if (!ok) return;
          saveBindings(loadBindings().filter((x) => keyOf(fullOf(x)) !== keyOf(full)));
          pickInitial();
          renderRail();
          renderDetail();
          ctx.ui.toast("已删除");
        };
        const openMore = (anchor, b) => {
          showMenu(anchor, [
            { label: "添加其他下游…", onSelect: () => void promptAddDownstream(keyOf(fullOf(b))) },
            { label: "删除绑定", danger: true, onSelect: () => void removeBinding(b) }
          ]);
        };
        const openAbout = (anchor, b) => {
          const key = keyOf(fullOf(b));
          const about = state.about.get(key);
          if (!about) return;
          const last = state.lastCommit.get(key);
          showAboutPopover({
            about,
            anchor,
            extraMeta: [
              ["最近推送", about.updatedAt ? `${formatDate(about.updatedAt)}（${relativeTime(about.updatedAt)}）` : "—"],
              ["最后提交", last ? `${formatDate(last)}（${relativeTime(last)}）` : "—"]
            ],
            onClose: () => {
              if (state.dirty) renderDetail();
            }
          });
        };
        const submitUpstream = () => {
          const input = detail.querySelector("#ghtk-upstream-input");
          const p = parseRepo(input ? input.value : state.draft);
          if (!p) {
            ctx.ui.toast("格式错误");
            input?.focus();
            return;
          }
          const list = loadBindings();
          const key = keyOf(`${p.owner}/${p.repo}`);
          if (list.some((b) => keyOf(fullOf(b)) === key)) {
            ctx.ui.toast("已存在");
          } else {
            list.push({ owner: p.owner, repo: p.repo, downstreams: [], createdAt: Date.now() });
            saveBindings(list);
            ctx.ui.toast("已添加");
          }
          setSelected(key);
          state.draft = "";
          exitAddMode();
        };
        const bindCurrentAsDownstream = async () => {
          const d = await detectionPromise;
          if (d.state !== "fork" || !currentRepo) return;
          const list = loadBindings();
          const upKey = keyOf(d.upstream);
          let up = list.find((x) => keyOf(fullOf(x)) === upKey);
          if (!up) {
            const [owner, repo] = d.upstream.split("/");
            up = { owner, repo, downstreams: [], createdAt: Date.now() };
            list.push(up);
          }
          up.downstreams = up.downstreams || [];
          if (!up.downstreams.some((x) => keyOf(x) === curKey)) up.downstreams.push(currentRepo);
          saveBindings(list);
          setSelected(upKey);
          if (state.addMode) exitAddMode(false);
          renderRail();
          renderDetail();
          ctx.ui.toast("已绑定");
        };
        detail.addEventListener("click", (e) => {
          const el = e.target.closest("[data-act]");
          if (!el || !detail.contains(el)) return;
          const b = findSelected();
          switch (el.dataset.act) {
            case "add-upstream":
              enterAddMode("");
              break;
            case "copy":
              if (b) copy(`https://github.com/${fullOf(b)}`);
              break;
            case "more":
              if (b) openMore(el, b);
              break;
            case "about":
              if (b) openAbout(el, b);
              break;
            case "bind-fork":
              if (b) void bindMyFork(b);
              break;
            case "add-down":
              if (b) void promptAddDownstream(keyOf(fullOf(b)));
              break;
            case "remove-down":
              if (b && el.dataset.down) void removeDownstream(b, el.dataset.down);
              break;
            case "submit-upstream":
              submitUpstream();
              break;
            case "bind-current":
              void bindCurrentAsDownstream();
              break;
            case "cancel-add":
              exitAddMode();
              break;
          }
        });
        detail.addEventListener("keydown", (e) => {
          const t = e.target;
          if (t.id === "ghtk-upstream-input" && e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            submitUpstream();
          }
        });
        detail.addEventListener("input", (e) => {
          const t = e.target;
          if (t.id === "ghtk-upstream-input") state.draft = t.value;
        });
        curBtn.addEventListener("click", async () => {
          const d = await detectionPromise;
          if (d.state === "fork") {
            await bindCurrentAsDownstream();
            return;
          }
          enterAddMode(currentRepo);
        });
        addToggle.addEventListener("click", () => {
          if (state.addMode) exitAddMode();
          else enterAddMode("");
        });
        searchInput.value = viewMemory.query;
        searchInput.addEventListener("input", () => {
          viewMemory.query = searchInput.value;
          renderRail();
        });
        pickInitial();
        renderRail();
        renderDetail();
        if (currentRepo) {
          void detectionPromise.then((d) => {
            state.detection = d;
            if (!root.isConnected) return;
            renderRail();
            if (state.addMode) renderDetail();
          });
        }
      }
    }
  };
  const ACCEL_BASE_KEY = "accel-base-url";
  const EGO_IDENTITY_KEY = "ego-identity";
  const EGO_PROTOCOL_KEY = "ego-protocol";
  const DEFAULT_ACCEL_BASE = "https://github.akams.cn/";
  const URL_RE = /^https?:\/\/[^\s"'<>]+$/i;
  function getAccelBase() {
    const v = String(GM_getValue(ACCEL_BASE_KEY, DEFAULT_ACCEL_BASE) || "").trim();
    return URL_RE.test(v) ? v : DEFAULT_ACCEL_BASE;
  }
  function getProtocol() {
    return GM_getValue(EGO_PROTOCOL_KEY, "ssh") === "https" ? "https" : "ssh";
  }
  function getIdentity() {
    return String(GM_getValue(EGO_IDENTITY_KEY, "") || "").trim();
  }
  function cloneUrl(owner, repo, protocol) {
    return protocol === "ssh" ? `git@github.com:${owner}/${repo}.git` : `https://github.com/${owner}/${repo}.git`;
  }
  function buildCloneCommand(owner, repo, identity, protocol) {
    const id = identity.trim();
    const url = cloneUrl(owner, repo, protocol);
    return id ? `ego clone ${id} ${url}` : `git clone ${url}`;
  }
  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }
  function accelUrlOf(owner, repo) {
    return `${getAccelBase()}?url=${encodeURIComponent(`https://github.com/${owner}/${repo}`)}`;
  }
  function hintHtml(hasIdentity) {
    return hasIdentity ? "· 身份名需与本机 <code>ego users</code> 一致<br>· 复制后在本机终端执行，脚本无法直接运行命令" : "· 留空用 git clone，填 ego 身份名后改用 ego clone<br>· 复制后在本机终端执行，脚本无法直接运行命令";
  }
  const AccelPlugin = {
    id: "github-accel",
    name: "GitHub 加速 (akams)",
    version: "1.1.0",
    description: "使用加速地址打开仓库，支持自定义加速服务地址",
    matches() {
      return true;
    },
    async onEnable() {
    },
    onDisable() {
    },
    panelTab: {
      id: "accel",
      label: "加速",
      render() {
        return `<div class="ghtk-scroll-area"><div class="ghtk-accel" id="ghtk-accel"></div></div>`;
      },
      mount(ctx, root) {
        const box = root.querySelector("#ghtk-accel");
        if (!box) return;
        renderAccel(ctx, box, false);
        bindAccel(ctx, box);
      }
    }
  };
  function renderAccel(ctx, box, settingsOpen) {
    const base = getAccelBase();
    const settings = `
    <details class="ghtk-settings"${settingsOpen ? " open" : ""}>
      <summary>加速服务<span class="ghtk-settings-value">${escapeHtml(hostOf(base))}</span>${ICON.chevron}</summary>
      <div class="ghtk-settings-body">
        <label class="ghtk-field-label" for="ghtk-accel-base">加速地址（默认 ${escapeHtml(DEFAULT_ACCEL_BASE)}）</label>
        <div class="ghtk-field-row">
          <input class="ghtk-input" type="text" id="ghtk-accel-base" value="${escapeHtml(base)}"
            placeholder="${escapeHtml(DEFAULT_ACCEL_BASE)}" autocomplete="off" spellcheck="false" />
          <button class="ghtk-btn" type="button" data-act="save-base">保存</button>
        </div>
      </div>
    </details>`;
    const { owner, repo } = ctx.page;
    if (!owner || !repo) {
      box.innerHTML = `<div class="ghtk-blank">进入仓库页面后可用</div>${settings}`;
      return;
    }
    const accelUrl = accelUrlOf(owner, repo);
    const identity = getIdentity();
    const protocol = getProtocol();
    box.innerHTML = `
    <section class="ghtk-accel-sec">
      <div class="ghtk-sec-head">
        <span class="ghtk-sec-title">加速访问</span>
        <span class="ghtk-sec-note" title="${escapeHtml(accelUrl)}">经 ${escapeHtml(hostOf(base))} 中转</span>
      </div>
      <div class="ghtk-btn-row">
        <a class="ghtk-btn primary" href="${escapeHtml(accelUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(accelUrl)}">加速打开</a>
        <button class="ghtk-btn" type="button" data-act="copy-accel">复制链接</button>
      </div>
    </section>
    <section class="ghtk-accel-sec">
      <div class="ghtk-sec-head">
        <span class="ghtk-sec-title">克隆命令</span>
        <div class="ghtk-seg" role="group" aria-label="克隆协议">
          <button type="button" data-proto="ssh" class="${protocol === "ssh" ? "on" : ""}" aria-pressed="${protocol === "ssh"}">SSH</button>
          <button type="button" data-proto="https" class="${protocol === "https" ? "on" : ""}" aria-pressed="${protocol === "https"}">HTTPS</button>
        </div>
      </div>
      <input class="ghtk-input" type="text" id="ghtk-ego-identity" value="${escapeHtml(identity)}"
        placeholder="ego 身份名（留空用 git）" aria-label="ego 身份名" autocomplete="off" spellcheck="false" />
      <div class="ghtk-cmd" tabindex="0" aria-label="克隆命令"><span class="ghtk-cmd-prompt">$</span><span id="ghtk-ego-cmd">${escapeHtml(
    buildCloneCommand(owner, repo, identity, protocol)
  )}</span></div>
      <div class="ghtk-btn-row">
        <button class="ghtk-btn" type="button" data-act="copy-cmd">复制命令</button>
        <button class="ghtk-btn" type="button" data-act="copy-url">复制地址</button>
      </div>
      <div class="ghtk-hint" id="ghtk-ego-hint">${hintHtml(!!identity)}</div>
    </section>
    ${settings}
  `;
  }
  function bindAccel(ctx, box) {
    const currentRepo = () => {
      const { owner, repo } = ctx.page;
      return owner && repo ? { owner, repo } : null;
    };
    const identityValue = () => box.querySelector("#ghtk-ego-identity")?.value.trim() ?? getIdentity();
    const copy = (text) => {
      void copyText(text).then((ok) => ctx.ui.toast(ok ? "已复制" : "复制失败"));
    };
    const refreshCmd = () => {
      const r = currentRepo();
      if (!r) return;
      const id = identityValue();
      const cmd = box.querySelector("#ghtk-ego-cmd");
      if (cmd) cmd.textContent = buildCloneCommand(r.owner, r.repo, id, getProtocol());
      const hint = box.querySelector("#ghtk-ego-hint");
      if (hint) hint.innerHTML = hintHtml(!!id);
    };
    const saveBase = () => {
      const input = box.querySelector("#ghtk-accel-base");
      let val = (input?.value || "").trim() || DEFAULT_ACCEL_BASE;
      if (!URL_RE.test(val)) {
        ctx.ui.toast("地址无效");
        input?.focus();
        return;
      }
      if (!val.endsWith("/")) val += "/";
      GM_setValue(ACCEL_BASE_KEY, val);
      renderAccel(ctx, box, true);
      ctx.ui.toast("已保存");
    };
    box.addEventListener("click", (e) => {
      const t = e.target;
      const proto = t.closest("[data-proto]");
      if (proto) {
        const p = proto.dataset.proto === "https" ? "https" : "ssh";
        GM_setValue(EGO_PROTOCOL_KEY, p);
        box.querySelectorAll("[data-proto]").forEach((b) => {
          const on = b === proto;
          b.classList.toggle("on", on);
          b.setAttribute("aria-pressed", String(on));
        });
        refreshCmd();
        return;
      }
      const act = t.closest("[data-act]")?.dataset.act;
      if (act === "save-base") {
        saveBase();
        return;
      }
      const r = currentRepo();
      if (!r) return;
      if (act === "copy-accel") copy(accelUrlOf(r.owner, r.repo));
      else if (act === "copy-cmd") copy(buildCloneCommand(r.owner, r.repo, identityValue(), getProtocol()));
      else if (act === "copy-url") copy(cloneUrl(r.owner, r.repo, getProtocol()));
    });
    box.addEventListener("input", (e) => {
      const t = e.target;
      if (t.id !== "ghtk-ego-identity") return;
      GM_setValue(EGO_IDENTITY_KEY, t.value);
      refreshCmd();
    });
    box.addEventListener("keydown", (e) => {
      const t = e.target;
      if (t.id === "ghtk-accel-base" && e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        saveBase();
      }
    });
  }
  const builtinPlugins = [UpstreamBindPlugin, AccelPlugin];
  const DEFAULT_ENABLED = ["upstream-bind", "github-accel"];
  const TOOLKIT_VERSION = "2.9.0";
  const TAB_KEY = "panel-tab";
  const eventBus = new EventBus();
  const dom = new DOMHelper();
  const ui = new UIManager();
  const router = new PageRouter(eventBus);
  const pluginManager = new PluginManager({ eventBus, dom, ui, router });
  builtinPlugins.forEach((p) => pluginManager.register(p));
  let enabledList = GM_getValue("enabled-plugins", DEFAULT_ENABLED);
  router.start();
  (async () => {
    for (const id of enabledList) {
      await pluginManager.enable(id);
    }
  })();
  const rerenderIfOpen = () => {
    if (ui.panel) renderPanel();
  };
  eventBus.on("page:change", (page) => {
    pluginManager.onPageChange(page);
    if (ui.panel) whenIdle(rerenderIfOpen);
  });
  function renderPanel() {
    try {
      const page = router.current;
      const pluginTabs = pluginManager.getAll().filter((p) => pluginManager.isEnabled(p.id) && p.panelTab);
      const ids = [...pluginTabs.map((p) => p.panelTab.id), "plugins"];
      const saved = String(GM_getValue(TAB_KEY, "") || "");
      const activeId = ids.includes(saved) ? saved : ids[0];
      const tabBtn = (id, label) => {
        const on = id === activeId;
        return `<button class="ghtk-tab${on ? " active" : ""}" type="button" role="tab" id="ghtk-tab-${id}"
        data-tab="${id}" aria-controls="ghtk-tabpanel-${id}" aria-selected="${on}" tabindex="${on ? "0" : "-1"}">${escapeHtml(label)}</button>`;
      };
      const tabPanel = (id, inner = "") => {
        const on = id === activeId;
        return `<div class="ghtk-tab-content${on ? " active" : ""}" role="tabpanel" id="ghtk-tabpanel-${id}"
        aria-labelledby="ghtk-tab-${id}" data-content="${id}">${inner}</div>`;
      };
      const html = `
      <div class="ghtk-tabs" role="tablist" aria-label="功能">
        ${pluginTabs.map((p) => tabBtn(p.panelTab.id, p.panelTab.label)).join("")}
        ${tabBtn("plugins", "插件")}
      </div>
      ${pluginTabs.map((p) => tabPanel(p.panelTab.id)).join("")}
      ${tabPanel("plugins", '<div class="ghtk-scroll-area"><div class="ghtk-plugins" id="ghtk-plugins-list"></div></div>')}
    `;
      ui.showPanel(html, "GitHub Toolkit");
      const panel = ui.panel;
      if (!panel) return;
      const tabs = Array.from(panel.querySelectorAll(".ghtk-tab"));
      const activate = (tab, focus = false) => {
        const id = tab.dataset.tab;
        tabs.forEach((t) => {
          const on = t === tab;
          t.classList.toggle("active", on);
          t.setAttribute("aria-selected", String(on));
          t.tabIndex = on ? 0 : -1;
        });
        panel.querySelectorAll(".ghtk-tab-content").forEach((c) => {
          c.classList.toggle("active", c.dataset.content === id);
        });
        GM_setValue(TAB_KEY, id);
        if (focus) tab.focus();
      };
      tabs.forEach((tab, i) => {
        tab.addEventListener("click", () => activate(tab));
        tab.addEventListener("keydown", (e) => {
          let next;
          if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
          else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
          else if (e.key === "Home") next = 0;
          else if (e.key === "End") next = tabs.length - 1;
          else return;
          e.preventDefault();
          activate(tabs[next], true);
        });
      });
      for (const p of pluginTabs) {
        const tab = p.panelTab;
        const root = panel.querySelector(`.ghtk-tab-content[data-content="${tab.id}"]`);
        if (!root) continue;
        const ctx = pluginManager.getContext(p.id) ?? {
          eventBus,
          storage: { get: (k, d) => GM_getValue(k, d), set: (k, v) => GM_setValue(k, v) },
          ui,
          dom,
          page,
          log: Logger
        };
        root.innerHTML = tab.render(ctx);
        tab.mount?.(ctx, root);
      }
      renderPluginsList(panel);
    } catch (err) {
      Logger.error("renderPanel 失败:", err);
      ui.toast("面板渲染失败");
    }
  }
  function renderPluginsList(panel) {
    const container = panel.querySelector("#ghtk-plugins-list");
    if (!container) return;
    container.innerHTML = pluginManager.getAll().map((p) => {
      const on = pluginManager.isEnabled(p.id);
      const nameId = `ghtk-plugin-name-${p.id}`;
      return `
          <div class="ghtk-plugin-item">
            <div class="ghtk-plugin-text">
              <div class="ghtk-plugin-name" id="${escapeHtml(nameId)}">${escapeHtml(p.name)}</div>
              <div class="ghtk-plugin-desc">${escapeHtml(p.description || "")}</div>
            </div>
            <button class="ghtk-switch${on ? " on" : ""}" type="button" role="switch" aria-checked="${on}"
              aria-labelledby="${escapeHtml(nameId)}" data-id="${escapeHtml(p.id)}" title="${on ? "点击禁用" : "点击启用"}">
              <span class="ghtk-switch-knob"></span>
            </button>
          </div>`;
    }).join("") + `<div class="ghtk-plugins-foot">GitHub Toolkit v${TOOLKIT_VERSION}</div>`;
    container.querySelectorAll(".ghtk-switch[data-id]").forEach((sw) => {
      sw.addEventListener("click", async () => {
        const id = sw.dataset.id;
        const turningOn = !sw.classList.contains("on");
        if (turningOn) {
          await pluginManager.enable(id);
          if (!enabledList.includes(id)) enabledList.push(id);
        } else {
          await pluginManager.disable(id);
          enabledList = enabledList.filter((x) => x !== id);
        }
        GM_setValue("enabled-plugins", enabledList);
        ui.toast(turningOn ? "已启用" : "已禁用");
        setTimeout(() => {
          renderPanel();
          ui.panel?.querySelector(`.ghtk-switch[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
        }, 150);
      });
    });
  }
  ui.onFabToggle = () => {
    if (ui.panel) ui.hidePanel();
    else renderPanel();
  };
  ui.onCloudClick = () => {
    if (!openCloudPanel()) ui.toast("云端组件未加载");
  };
  GM_registerMenuCommand("打开 GitHub Toolkit 面板", renderPanel);
  function ensureFab() {
    if (!document.getElementById("ghtk-root")?.querySelector(".ghtk-fab")) {
      ui.createFab();
    }
  }
  function init() {
    if (!document.body) {
      setTimeout(init, 100);
      return;
    }
    ui.createFab();
    bindSoftNav();
    ["turbo:load", "turbo:render", "pjax:end", "soft-nav:end"].forEach((evt) => {
      document.addEventListener(evt, ensureFab);
    });
    Logger.log(`GitHub Toolkit v${TOOLKIT_VERSION} 已启动`);
  }
  init();

})();