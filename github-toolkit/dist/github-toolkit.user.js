// ==UserScript==
// @name         GitHub Toolkit
// @namespace    github-toolkit
// @version      2.5.2
// @author       Cores
// @description  高内聚低耦合的 GitHub 模块化工具台（图标操作 + 复制上游链接）
// @license      MIT
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @match        https://github.com/*
// @match        https://gist.github.com/*
// @connect      api.github.com
// @grant        GM_addStyle
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
  const CSS = `
  /* ===== 尺寸 token：作用域限定在 #ghtk-root 内，不污染页面 ===== */
  #ghtk-root {
    --ghtk-ctl-h: 30px;        /* 控件统一高度：按钮 / 输入框 / 图标按钮 */
    --ghtk-ctl-radius: 6px;    /* 控件统一圆角 */
    --ghtk-ctl-font: 12px;     /* 控件统一字号 */
    --ghtk-ctl-gap: 8px;       /* 控件间距 */
    --ghtk-icon: 14px;         /* 图标统一尺寸 */
  }

  /* ===== 根容器 reset：抵御 GitHub 全局样式侵入 ===== */
  #ghtk-root,
  #ghtk-root * {
    box-sizing: border-box !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif !important;
    -webkit-font-smoothing: antialiased !important;
    letter-spacing: normal !important;
    text-transform: none !important;
    text-shadow: none !important;
    float: none !important;
    outline: none !important;
  }
  #ghtk-root button,
  #ghtk-root input {
    margin: 0 !important;
    font-size: var(--ghtk-ctl-font) !important;
    line-height: 1 !important;
    vertical-align: middle !important;
    appearance: none !important;
    -webkit-appearance: none !important;
  }
  #ghtk-root a { text-decoration: none !important; }
  #ghtk-root svg {
    display: block !important;
    flex-shrink: 0 !important;
  }
  #ghtk-root ::-webkit-scrollbar { width: 6px !important; height: 6px !important; }
  #ghtk-root ::-webkit-scrollbar-thumb {
    background: var(--borderColor-default, #d0d7de) !important;
    border-radius: 3px !important;
  }
  #ghtk-root ::-webkit-scrollbar-track { background: transparent !important; }

  .ghtk-fab {
    position: fixed !important;
    right: 20px !important;
    bottom: 24px !important;
    width: 48px !important;
    height: 48px !important;
    border-radius: 50% !important;
    background: #24292f !important;
    color: #fff !important;
    border: none !important;
    box-shadow: 0 4px 16px rgba(0,0,0,.28) !important;
    cursor: grab !important;
    z-index: 2147483646 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: transform .15s ease, box-shadow .15s ease !important;
    padding: 0 !important;
    margin: 0 !important;
    touch-action: none !important;
    user-select: none !important;
    -webkit-user-select: none !important;
  }
  .ghtk-fab:hover {
    transform: scale(1.08) !important;
    box-shadow: 0 6px 20px rgba(0,0,0,.35) !important;
  }
  .ghtk-fab.dragging {
    cursor: grabbing !important;
    transform: scale(1.04) !important;
    transition: none !important;
    box-shadow: 0 8px 24px rgba(0,0,0,.4) !important;
  }
  .ghtk-fab svg {
    width: 22px !important;
    height: 22px !important;
    fill: currentColor !important;
    pointer-events: none !important;
  }

    .ghtk-panel {
      position: fixed !important;
      width: 400px !important;
      height: 560px !important;
      max-height: 80vh !important;
      background: var(--bgColor-default, #ffffff) !important;
      border: 1px solid var(--borderColor-default, #d0d7de) !important;
      border-radius: 14px !important;
      box-shadow: 0 12px 40px rgba(31,35,40,.2) !important;
      z-index: 2147483647 !important;
      font-size: 13px !important;
      color: var(--fgColor-default, #1f2328) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Noto Sans, Helvetica, Arial, sans-serif !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      animation: ghtk-in .15s ease-out !important;
    }
    @keyframes ghtk-in {
      from { opacity: 0; transform: translateY(8px) scale(.98); }
      to   { opacity: 1; transform: none; }
    }

    .ghtk-panel header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 0 12px 0 16px !important;
      height: 44px !important;
      border-bottom: 1px solid var(--borderColor-muted, #d8dee4) !important;
      cursor: move !important;
      user-select: none !important;
      background: var(--bgColor-muted, #f6f8fa) !important;
      flex-shrink: 0 !important;
    }
    .ghtk-panel header .title {
      font-weight: 600 !important;
      font-size: 13px !important;
      color: var(--fgColor-muted, #59636e) !important;
    }
    .ghtk-panel .close-btn {
      width: var(--ghtk-ctl-h) !important;
      height: var(--ghtk-ctl-h) !important;
      border: none !important;
      background: none !important;
      border-radius: var(--ghtk-ctl-radius) !important;
      cursor: pointer !important;
      color: var(--fgColor-muted, #59636e) !important;
      font-size: 15px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    .ghtk-panel .close-btn:hover {
      background: var(--bgColor-neutral-muted, #818b981f) !important;
      color: var(--fgColor-default, #1f2328) !important;
    }

    .ghtk-tabs {
      display: flex !important;
      border-bottom: 1px solid var(--borderColor-muted, #d8dee4) !important;
      background: var(--bgColor-default, #fff) !important;
      flex-shrink: 0 !important;
      padding: 0 8px !important;
    }
    .ghtk-tab {
      flex: 1 !important;
      height: 36px !important;
      padding: 0 8px !important;
      text-align: center !important;
      font-size: var(--ghtk-ctl-font) !important;
      font-weight: 500 !important;
      color: var(--fgColor-muted, #59636e) !important;
      cursor: pointer !important;
      border: none !important;
      background: none !important;
      border-bottom: 2px solid transparent !important;
      transition: color .15s, border-color .15s !important;
    }
    .ghtk-tab:hover { color: var(--fgColor-default, #1f2328) !important; }
    .ghtk-tab.active {
      color: #0969da !important;
      border-bottom-color: #0969da !important;
      font-weight: 600 !important;
    }

    .ghtk-panel .body {
      padding: 0 !important;
      overflow: hidden !important;
      flex: 1 !important;
      display: flex !important;
      flex-direction: column !important;
      min-height: 0 !important;
    }
    .ghtk-tab-content {
      display: none !important;
      flex-direction: column !important;
      height: 100% !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }
    .ghtk-tab-content.active { display: flex !important; }

    /* ===== 工具栏：搜索框 + 图标按钮 ===== */
    .ghtk-toolbar {
      display: flex !important;
      align-items: center !important;
      gap: var(--ghtk-ctl-gap) !important;
      padding: 8px 12px !important;
      border-bottom: 1px solid var(--borderColor-muted, #d8dee4) !important;
      background: var(--bgColor-default, #fff) !important;
      flex-shrink: 0 !important;
    }
    .ghtk-search {
      flex: 1 !important;
      min-width: 0 !important;
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      height: var(--ghtk-ctl-h) !important;
      padding: 0 10px !important;
      border: 1px solid var(--borderColor-default, #d0d7de) !important;
      border-radius: var(--ghtk-ctl-radius) !important;
      background: var(--bgColor-muted, #f6f8fa) !important;
      box-sizing: border-box !important;
    }
    .ghtk-search:focus-within {
      border-color: #0969da !important;
      background: var(--bgColor-default, #fff) !important;
    }
    .ghtk-search svg {
      width: 13px !important;
      height: 13px !important;
      flex-shrink: 0 !important;
      color: var(--fgColor-muted, #59636e) !important;
    }
    .ghtk-search input {
      flex: 1 !important;
      min-width: 0 !important;
      height: 100% !important;
      border: none !important;
      outline: none !important;
      background: none !important;
      font-size: var(--ghtk-ctl-font) !important;
      color: var(--fgColor-default, #1f2328) !important;
      padding: 0 !important;
    }
    .ghtk-search input::placeholder {
      color: var(--fgColor-muted, #59636e) !important;
    }
    .ghtk-toolbar-btn {
      flex-shrink: 0 !important;
      width: var(--ghtk-ctl-h) !important;
      height: var(--ghtk-ctl-h) !important;
      border: 1px solid var(--borderColor-default, #d0d7de) !important;
      border-radius: var(--ghtk-ctl-radius) !important;
      background: var(--bgColor-muted, #f6f8fa) !important;
      color: var(--fgColor-default, #1f2328) !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    }
    .ghtk-toolbar-btn:hover { background: var(--bgColor-neutral-muted, #818b981f) !important; }
    .ghtk-toolbar-btn svg {
      width: var(--ghtk-icon) !important;
      height: var(--ghtk-icon) !important;
      fill: currentColor !important;
    }
    .ghtk-toolbar-btn.active {
      background: #0969da !important;
      border-color: #0969da !important;
      color: #fff !important;
    }

    /* ===== 主从布局：左栏上游列表 + 右栏详情 ===== */
    .ghtk-split {
      flex: 1 !important;
      display: flex !important;
      min-height: 0 !important;
    }
    .ghtk-rail {
      width: 152px !important;
      flex-shrink: 0 !important;
      border-right: 1px solid var(--borderColor-muted, #d8dee4) !important;
      background: var(--bgColor-muted, #f6f8fa) !important;
      display: flex !important;
      flex-direction: column !important;
      min-height: 0 !important;
    }
    .ghtk-rail-head {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 6px !important;
      padding: 10px 12px 6px !important;
      font-size: 10px !important;
      font-weight: 600 !important;
      color: var(--fgColor-muted, #59636e) !important;
      letter-spacing: .5px !important;
      text-transform: uppercase !important;
      flex-shrink: 0 !important;
    }
    .ghtk-rail-state {
      font-size: 10px !important;
      font-weight: 500 !important;
      letter-spacing: 0 !important;
      text-transform: none !important;
      color: var(--fgColor-muted, #59636e) !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    .ghtk-rail-list {
      flex: 1 !important;
      overflow-y: auto !important;
      padding: 0 6px 8px !important;
      min-height: 0 !important;
    }
    .ghtk-rail-list::-webkit-scrollbar { width: 6px !important; }
    .ghtk-rail-list::-webkit-scrollbar-thumb {
      background: var(--borderColor-default, #d0d7de) !important;
      border-radius: 3px !important;
    }
    .ghtk-rail-item {
      position: relative !important;
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      height: 32px !important;
      padding: 0 8px !important;
      border-radius: 5px !important;
      font-size: 12px !important;
      color: var(--fgColor-default, #1f2328) !important;
      cursor: pointer !important;
    }
    .ghtk-rail-item:hover { background: var(--bgColor-neutral-muted, #818b981f) !important; }
    .ghtk-rail-item.active {
      background: #fff !important;
      color: #0550ae !important;
      font-weight: 600 !important;
      box-shadow: 0 1px 3px rgba(31,35,40,.08) !important;
    }
    .ghtk-rail-item.active::before {
      content: "" !important;
      position: absolute !important;
      left: 0 !important;
      top: 6px !important;
      bottom: 6px !important;
      width: 2px !important;
      border-radius: 2px !important;
      background: #0969da !important;
    }
    .ghtk-rail-name {
      flex: 1 !important;
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    .ghtk-rail-n {
      flex-shrink: 0 !important;
      font-size: 10px !important;
      color: var(--fgColor-muted, #59636e) !important;
      font-variant-numeric: tabular-nums !important;
    }
    .ghtk-rail-item.active .ghtk-rail-n { color: #0550ae !important; }
    /* 与当前页面相关的绑定（当前仓库即其上游，或是其下游） */
    .ghtk-rail-dot {
      flex-shrink: 0 !important;
      width: 5px !important;
      height: 5px !important;
      border-radius: 50% !important;
      background: #0969da !important;
    }
    .ghtk-rail-item.related:not(.active) .ghtk-rail-name { color: #0550ae !important; }
    .ghtk-rail-empty {
      padding: 16px 8px !important;
      text-align: center !important;
      font-size: 11px !important;
      color: var(--fgColor-muted, #59636e) !important;
      line-height: 1.5 !important;
    }

    .ghtk-detail {
      flex: 1 !important;
      display: flex !important;
      flex-direction: column !important;
      min-width: 0 !important;
      min-height: 0 !important;
    }
    .ghtk-detail-head {
      padding: 12px 14px 10px !important;
      border-bottom: 1px solid var(--borderColor-muted, #d8dee4) !important;
      flex-shrink: 0 !important;
    }
    .ghtk-detail-title {
      display: flex !important;
      align-items: center !important;
      gap: 7px !important;
      margin-bottom: 5px !important;
    }
    .ghtk-detail-title .name {
      font-size: 14px !important;
      font-weight: 600 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    .ghtk-chip {
      flex-shrink: 0 !important;
      font-size: 9.5px !important;
      font-weight: 600 !important;
      color: #0550ae !important;
      background: #ddf4ff !important;
      border: 1px solid #b6e3ff !important;
      border-radius: 20px !important;
      padding: 1px 6px !important;
      line-height: 1.6 !important;
    }
    .ghtk-detail-sub {
      font-size: 10.5px !important;
      color: var(--fgColor-muted, #59636e) !important;
      line-height: 1.6 !important;
    }
    .ghtk-detail-sub b { color: var(--fgColor-default, #1f2328) !important; font-weight: 600 !important; }
    .ghtk-detail-sub code {
      font-family: ui-monospace, SFMono-Regular, monospace !important;
      font-size: 10px !important;
      background: #afb8c133 !important;
      padding: 1px 4px !important;
      border-radius: 3px !important;
    }
    .ghtk-detail-body {
      flex: 1 !important;
      overflow-y: auto !important;
      padding: 10px 14px !important;
      min-height: 0 !important;
    }
    .ghtk-detail-body::-webkit-scrollbar { width: 6px !important; }
    .ghtk-detail-body::-webkit-scrollbar-thumb {
      background: var(--borderColor-default, #d0d7de) !important;
      border-radius: 3px !important;
    }
    .ghtk-sec-label {
      font-size: 10px !important;
      font-weight: 600 !important;
      color: var(--fgColor-muted, #59636e) !important;
      letter-spacing: .5px !important;
      text-transform: uppercase !important;
      margin-bottom: 4px !important;
    }
    .ghtk-drow {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      height: var(--ghtk-ctl-h) !important;
      font-size: 11.5px !important;
      color: var(--fgColor-muted, #59636e) !important;
      border-radius: 5px !important;
      padding: 0 4px !important;
    }
    .ghtk-drow:hover { background: var(--bgColor-muted, #f6f8fa) !important; }
    .ghtk-drow-dash { color: var(--fgColor-muted, #59636e) !important; flex-shrink: 0 !important; }
    .ghtk-drow a {
      flex: 1 !important;
      min-width: 0 !important;
      color: #0969da !important;
      text-decoration: none !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    .ghtk-drow a:hover { text-decoration: underline !important; }
    .ghtk-drow-rm { opacity: 0 !important; }
    .ghtk-drow:hover .ghtk-drow-rm { opacity: 1 !important; }
    .ghtk-drow-rm:hover { color: #cf222e !important; background: #ffebe9 !important; }
    .ghtk-dempty {
      padding: 16px 12px !important;
      border: 1px dashed var(--borderColor-default, #d0d7de) !important;
      border-radius: 8px !important;
      text-align: center !important;
      font-size: 11px !important;
      color: var(--fgColor-muted, #59636e) !important;
    }
    .ghtk-detail-foot {
      border-top: 1px solid var(--borderColor-muted, #d8dee4) !important;
      padding: 10px 14px !important;
      flex-shrink: 0 !important;
    }
    .ghtk-foot-main { display: flex !important; gap: var(--ghtk-ctl-gap) !important; }
    .ghtk-foot-main .ghtk-btn.primary { flex: 1 !important; }
    .ghtk-foot-icons {
      display: flex !important;
      align-items: center !important;
      gap: 2px !important;
      margin-top: 8px !important;
      padding-top: 8px !important;
      border-top: 1px solid var(--borderColor-muted, #d8dee4) !important;
    }
    .ghtk-foot-spacer { flex: 1 !important; }
    .ghtk-detail-empty {
      flex: 1 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 10px !important;
      font-size: 12px !important;
      color: var(--fgColor-muted, #59636e) !important;
    }

    /* ===== 添加上游视图 ===== */
    .ghtk-addview {
      flex: 1 !important;
      display: flex !important;
      flex-direction: column !important;
      min-width: 0 !important;
      min-height: 0 !important;
    }
    .ghtk-addview-head {
      padding: 12px 14px 10px !important;
      border-bottom: 1px solid var(--borderColor-muted, #d8dee4) !important;
      flex-shrink: 0 !important;
    }
    .ghtk-addview-title {
      font-size: 14px !important;
      font-weight: 600 !important;
      margin-bottom: 3px !important;
    }
    .ghtk-addview-sub {
      font-size: 10.5px !important;
      color: var(--fgColor-muted, #59636e) !important;
    }
    .ghtk-addview-body {
      flex: 1 !important;
      padding: 14px !important;
      min-height: 0 !important;
      overflow-y: auto !important;
    }
    .ghtk-field-label {
      display: block !important;
      font-size: 10.5px !important;
      font-weight: 600 !important;
      color: var(--fgColor-muted, #59636e) !important;
      margin-bottom: 5px !important;
    }
    .ghtk-field { display: flex !important; gap: var(--ghtk-ctl-gap) !important; }
    .ghtk-field input {
      flex: 1 !important;
      min-width: 0 !important;
      height: var(--ghtk-ctl-h) !important;
      padding: 0 10px !important;
      border: 1px solid var(--borderColor-default, #d0d7de) !important;
      border-radius: var(--ghtk-ctl-radius) !important;
      font-size: var(--ghtk-ctl-font) !important;
      font-family: inherit !important;
      color: var(--fgColor-default, #1f2328) !important;
      background: var(--bgColor-default, #fff) !important;
      box-sizing: border-box !important;
    }
    .ghtk-field input:focus {
      outline: 2px solid #0969da !important;
      outline-offset: -1px !important;
    }
    .ghtk-hint {
      font-size: 10px !important;
      color: var(--fgColor-muted, #59636e) !important;
      margin-top: 6px !important;
      line-height: 1.6 !important;
    }
    .ghtk-note {
      margin-top: 12px !important;
      font-size: 11px !important;
      color: var(--fgColor-muted, #59636e) !important;
      line-height: 1.6 !important;
    }
    .ghtk-detect {
      margin-top: 14px !important;
      padding: 9px 10px !important;
      border: 1px solid #54aeff !important;
      background: #ddf4ff !important;
      border-radius: 8px !important;
    }
    .ghtk-detect-label {
      font-size: 10px !important;
      color: #0550ae !important;
      font-weight: 600 !important;
      margin-bottom: 2px !important;
    }
    .ghtk-detect-repo {
      font-size: 12px !important;
      font-weight: 600 !important;
      margin-bottom: 8px !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    .ghtk-detect-actions { display: flex !important; gap: 6px !important; }
    .ghtk-detect-actions .ghtk-btn.primary { flex: 1 !important; }
    .ghtk-addview-foot {
      border-top: 1px solid var(--borderColor-muted, #d8dee4) !important;
      padding: 10px 14px !important;
      display: flex !important;
      gap: var(--ghtk-ctl-gap) !important;
      justify-content: flex-end !important;
      flex-shrink: 0 !important;
    }

    .ghtk-form-row {
      display: flex !important;
      gap: var(--ghtk-ctl-gap) !important;
    }
    .ghtk-form-row input {
      flex: 1 !important;
      min-width: 0 !important;
      height: var(--ghtk-ctl-h) !important;
      padding: 0 10px !important;
      border: 1px solid var(--borderColor-default, #d0d7de) !important;
      border-radius: var(--ghtk-ctl-radius) !important;
      font-size: var(--ghtk-ctl-font) !important;
      background: var(--bgColor-default, #fff) !important;
      color: var(--fgColor-default, #1f2328) !important;
      box-sizing: border-box !important;
    }
    .ghtk-form-row input:focus {
      outline: 2px solid #0969da !important;
      outline-offset: -1px !important;
    }

    .ghtk-scroll-area {
      flex: 1 !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      padding: 12px 16px 16px !important;
    }
    .ghtk-scroll-area::-webkit-scrollbar { width: 6px !important; }
    .ghtk-scroll-area::-webkit-scrollbar-thumb {
      background: var(--borderColor-default, #d0d7de) !important;
      border-radius: 3px !important;
    }

    .ghtk-icon-btn {
      width: var(--ghtk-ctl-h) !important;
      height: var(--ghtk-ctl-h) !important;
      border: none !important;
      background: none !important;
      border-radius: var(--ghtk-ctl-radius) !important;
      color: var(--fgColor-muted, #59636e) !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      transition: background .12s, color .12s !important;
    }
    .ghtk-icon-btn:hover {
      background: var(--bgColor-neutral-muted, #818b981f) !important;
      color: var(--fgColor-default, #1f2328) !important;
    }
    .ghtk-icon-btn.danger:hover {
      background: #ffebe9 !important;
      color: #cf222e !important;
    }
    .ghtk-icon-btn svg {
      width: var(--ghtk-icon) !important;
      height: var(--ghtk-icon) !important;
      fill: currentColor !important;
    }

    .ghtk-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      height: var(--ghtk-ctl-h) !important;
      padding: 0 12px !important;
      border-radius: var(--ghtk-ctl-radius) !important;
      border: 1px solid var(--borderColor-default, #d0d7de) !important;
      background: var(--bgColor-muted, #f6f8fa) !important;
      color: var(--fgColor-default, #1f2328) !important;
      font-size: var(--ghtk-ctl-font) !important;
      font-weight: 500 !important;
      font-family: inherit !important;
      cursor: pointer !important;
      text-decoration: none !important;
      white-space: nowrap !important;
      box-sizing: border-box !important;
      line-height: 1 !important;
      min-width: 76px !important;
    }
    .ghtk-btn:hover { background: var(--bgColor-neutral-muted, #818b981f) !important; }
    .ghtk-btn:disabled { opacity: 0.5 !important; cursor: not-allowed !important; }
    .ghtk-btn.primary {
      background: #0969da !important;
      color: #fff !important;
      border-color: #0969da !important;
    }
    .ghtk-btn.primary:hover { background: #0860ca !important; }
    .ghtk-btn.success {
      background: #1a7f37 !important;
      color: #fff !important;
      border-color: #1a7f37 !important;
    }
    .ghtk-btn.success:hover { background: #176f31 !important; }
    .ghtk-btn.danger {
      color: #cf222e !important;
      border-color: #ffcecb !important;
      background: #fff !important;
    }
    .ghtk-btn.danger:hover { background: #ffebe9 !important; }

    /* 同排按钮等宽 */
    .ghtk-btn-row {
      display: flex !important;
      gap: var(--ghtk-ctl-gap) !important;
    }
    .ghtk-btn-row .ghtk-btn { flex: 1 !important; }

    .ghtk-plugin-item {
      display: flex !important;
      justify-content: space-between !important;
      align-items: flex-start !important;
      gap: 12px !important;
      padding: 12px 0 !important;
      border-bottom: 1px solid var(--borderColor-muted, #d8dee4) !important;
    }
    .ghtk-plugin-item:last-child { border-bottom: none !important; }
    .ghtk-plugin-item .desc {
      font-size: 11px !important;
      color: var(--fgColor-muted, #59636e) !important;
      margin-top: 3px !important;
      line-height: 1.4 !important;
    }

    .ghtk-modal-mask {
      position: fixed !important;
      inset: 0 !important;
      background: rgba(0,0,0,.45) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      animation: ghtk-fade .15s ease !important;
    }
    @keyframes ghtk-fade {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .ghtk-modal {
      width: 340px !important;
      max-width: 90vw !important;
      background: var(--bgColor-default, #fff) !important;
      border-radius: 12px !important;
      box-shadow: 0 16px 48px rgba(0,0,0,.25) !important;
      overflow: hidden !important;
      animation: ghtk-scale .15s ease !important;
    }
    @keyframes ghtk-scale {
      from { opacity: 0; transform: scale(.95); }
      to { opacity: 1; transform: none; }
    }
    .ghtk-modal-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 14px 16px !important;
      border-bottom: 1px solid var(--borderColor-muted, #d8dee4) !important;
    }
    .ghtk-modal-title {
      font-weight: 600 !important;
      font-size: 14px !important;
    }
    .ghtk-modal-close {
      width: var(--ghtk-ctl-h) !important;
      height: var(--ghtk-ctl-h) !important;
      border: none !important;
      background: none !important;
      border-radius: var(--ghtk-ctl-radius) !important;
      cursor: pointer !important;
      color: var(--fgColor-muted, #59636e) !important;
      font-size: 15px !important;
    }
    .ghtk-modal-close:hover {
      background: var(--bgColor-neutral-muted, #818b981f) !important;
    }
    .ghtk-modal-body { padding: 16px !important; }
    .ghtk-modal-content {
      font-size: 13px !important;
      line-height: 1.5 !important;
      margin-bottom: 12px !important;
      color: var(--fgColor-default, #1f2328) !important;
    }
    .ghtk-modal-input {
      width: 100% !important;
      height: var(--ghtk-ctl-h) !important;
      padding: 0 10px !important;
      border: 1px solid var(--borderColor-default, #d0d7de) !important;
      border-radius: var(--ghtk-ctl-radius) !important;
      font-size: var(--ghtk-ctl-font) !important;
      box-sizing: border-box !important;
      background: var(--bgColor-default, #fff) !important;
      color: var(--fgColor-default, #1f2328) !important;
    }
    .ghtk-modal-input:focus {
      outline: 2px solid #0969da !important;
      outline-offset: -1px !important;
    }
    .ghtk-modal-footer {
      display: flex !important;
      justify-content: flex-end !important;
      gap: var(--ghtk-ctl-gap) !important;
      padding: 12px 16px !important;
      border-top: 1px solid var(--borderColor-muted, #d8dee4) !important;
      background: var(--bgColor-muted, #f6f8fa) !important;
    }
    .ghtk-modal-footer .ghtk-btn { min-width: 76px !important; }

    .ghtk-toast {
      position: fixed !important;
      left: 50% !important;
      bottom: 28px !important;
      transform: translateX(-50%) translateY(10px) !important;
      padding: 8px 16px !important;
      border-radius: 8px !important;
      background: #24292f !important;
      color: #fff !important;
      font-size: 13px !important;
      z-index: 2147483647 !important;
      opacity: 0 !important;
      transition: opacity .2s, transform .2s !important;
      pointer-events: none !important;
      max-width: 80vw !important;
      text-align: center !important;
    }
    .ghtk-toast.show {
      opacity: 1 !important;
      transform: translateX(-50%) translateY(0) !important;
    }

    .ghtk-empty {
      font-size: 12px !important;
      color: var(--fgColor-muted, #59636e) !important;
      padding: 20px 0 !important;
      text-align: center !important;
      line-height: 1.5 !important;
    }

    .ghtk-accel-setting {
      padding: 12px 16px !important;
      border-bottom: 1px solid var(--borderColor-muted, #d8dee4) !important;
    }
    .ghtk-accel-setting label {
      font-size: 12px !important;
      color: var(--fgColor-muted, #59636e) !important;
      display: block !important;
      margin-bottom: 6px !important;
    }

    @media (max-width: 480px) {
      .ghtk-panel {
        left: 8px !important;
        right: 8px !important;
        width: auto !important;
        height: 70vh !important;
        bottom: 80px !important;
        top: auto !important;
      }
    }
`;
  function injectGlobalStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
    if (!observerStarted) {
      observerStarted = true;
      const ensure = () => {
        if (!document.getElementById(STYLE_ID)) {
          const s = document.createElement("style");
          s.id = STYLE_ID;
          s.textContent = CSS;
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
  const FAB_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M15 2.75a.75.75 0 0 1-.75.75h-4a.75.75 0 0 1 0-1.5h4a.75.75 0 0 1 .75.75Zm-8.5.75v1.25a.75.75 0 0 0 1.5 0v-4a.75.75 0 0 0-1.5 0V2H1.75a.75.75 0 0 0 0 1.5H6.5Zm1.25 5.5a.75.75 0 0 0 0-1.5h-6a.75.75 0 0 0 0 1.5h6ZM15 8a.75.75 0 0 1-.75.75H11.5V10a.75.75 0 1 1-1.5 0V6a.75.75 0 0 1 1.5 0v1.25h2.75A.75.75 0 0 1 15 8Zm-9 5.25v-2a.75.75 0 0 0-1.5 0v1.25H1.75a.75.75 0 1 0 0 1.5H4.5v1.25a.75.75 0 0 0 1.5 0v-2Zm9 2v-2.25a.75.75 0 0 0-1.5 0V15h-4a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 .75-.75v-1.5Z"/></svg>`;
  const FAB_POS_KEY = "fab-position";
  const FAB_SIZE = 48;
  const FAB_MARGIN = 8;
  const DRAG_THRESHOLD = 4;
  class UIManager {
    panel = null;
    fab = null;
    fabPos = null;
    suppressClick = false;
    /** 由主程序注入：点击悬浮球时切换面板 */
    onFabToggle = () => {
    };
    createFab() {
      if (this.fab && document.body.contains(this.fab)) return;
      injectGlobalStyles();
      document.querySelectorAll(".ghtk-fab").forEach((el) => el.remove());
      this.fab = document.createElement("button");
      this.fab.className = "ghtk-fab";
      this.fab.type = "button";
      this.fab.title = "GitHub Toolkit（可拖动）";
      this.fab.setAttribute("aria-label", "GitHub Toolkit");
      this.fab.innerHTML = FAB_ICON;
      this.fab.addEventListener(
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
      getRoot().appendChild(this.fab);
      this.restoreFabPosition();
      this.enableFabDrag();
      window.addEventListener("resize", () => this.clampFabPosition(), { passive: true });
    }
    /** 读取并应用上次拖拽的位置 */
    restoreFabPosition() {
      const saved = GM_getValue(FAB_POS_KEY, null);
      if (saved && typeof saved.left === "number" && typeof saved.top === "number") {
        this.applyFabPosition(saved);
      }
    }
    applyFabPosition(pos) {
      if (!this.fab) return;
      const clamped = this.clamp(pos);
      this.fabPos = clamped;
      this.fab.style.left = clamped.left + "px";
      this.fab.style.top = clamped.top + "px";
      this.fab.style.right = "auto";
      this.fab.style.bottom = "auto";
    }
    clamp(pos) {
      const maxLeft = Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN);
      const maxTop = Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN);
      return {
        left: Math.min(Math.max(FAB_MARGIN, pos.left), maxLeft),
        top: Math.min(Math.max(FAB_MARGIN, pos.top), maxTop)
      };
    }
    /** 视口变化后把悬浮球拉回可见区域 */
    clampFabPosition() {
      if (!this.fabPos || !this.fab) return;
      const next = this.clamp(this.fabPos);
      if (next.left !== this.fabPos.left || next.top !== this.fabPos.top) {
        this.applyFabPosition(next);
      }
    }
    enableFabDrag() {
      const fab = this.fab;
      if (!fab) return;
      fab.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const rect = fab.getBoundingClientRect();
        const start = {
          x: e.clientX,
          y: e.clientY,
          left: rect.left,
          top: rect.top
        };
        let dragging = false;
        try {
          fab.setPointerCapture(e.pointerId);
        } catch {
        }
        const onMove = (ev) => {
          const dx = ev.clientX - start.x;
          const dy = ev.clientY - start.y;
          if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          dragging = true;
          fab.classList.add("dragging");
          this.applyFabPosition({ left: start.left + dx, top: start.top + dy });
        };
        const onUp = (ev) => {
          fab.removeEventListener("pointermove", onMove);
          fab.removeEventListener("pointerup", onUp);
          fab.removeEventListener("pointercancel", onUp);
          fab.classList.remove("dragging");
          try {
            fab.releasePointerCapture(ev.pointerId);
          } catch {
          }
          if (dragging) {
            this.suppressClick = true;
            if (this.fabPos) {
              GM_setValue(FAB_POS_KEY, this.fabPos);
              if (this.panel) this.placePanelNearFab();
            }
          }
        };
        fab.addEventListener("pointermove", onMove);
        fab.addEventListener("pointerup", onUp);
        fab.addEventListener("pointercancel", onUp);
      });
    }
    /** 面板贴着悬浮球展开，空间不足时自动翻到另一侧 */
    placePanelNearFab() {
      if (!this.panel || !this.fab) return;
      const rect = this.fab.getBoundingClientRect();
      const pw = this.panel.offsetWidth || 400;
      const ph = this.panel.offsetHeight || 560;
      const gap = 12;
      const margin = 8;
      let left = rect.left;
      if (left + pw > window.innerWidth - margin) left = rect.right - pw;
      left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - pw - margin));
      let top = rect.top - ph - gap;
      if (top < margin) top = rect.bottom + gap;
      if (top + ph > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - ph - margin);
      }
      this.panel.style.left = left + "px";
      this.panel.style.top = top + "px";
      this.panel.style.right = "auto";
      this.panel.style.bottom = "auto";
    }
    showPanel(contentHtml, title = "GitHub Toolkit") {
      injectGlobalStyles();
      this.hidePanel();
      this.panel = document.createElement("div");
      this.panel.className = "ghtk-panel";
      this.panel.innerHTML = `
      <header>
        <span class="title">${title}</span>
        <button class="close-btn" type="button" title="关闭">✕</button>
      </header>
      <div class="body">${contentHtml || ""}</div>
    `;
      this.panel.style.right = "20px";
      this.panel.style.bottom = "84px";
      this.panel.style.left = "auto";
      this.panel.style.top = "auto";
      getRoot().appendChild(this.panel);
      this.placePanelNearFab();
      this.panel.querySelector(".close-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        this.hidePanel();
      });
      this.enableDrag(this.panel.querySelector("header"));
      document.addEventListener("keydown", this.onEsc);
    }
    onEsc = (e) => {
      if (e.key === "Escape") this.hidePanel();
    };
    hidePanel() {
      if (!this.panel) return;
      this.panel.remove();
      this.panel = null;
      document.removeEventListener("keydown", this.onEsc);
    }
    enableDrag(handle) {
      if (!handle || !this.panel) return;
      handle.addEventListener("mousedown", (ev) => {
        const e = ev;
        if (e.button !== 0 || !this.panel) return;
        const rect = this.panel.getBoundingClientRect();
        const dragState = {
          startX: e.clientX,
          startY: e.clientY,
          origLeft: rect.left,
          origTop: rect.top
        };
        this.panel.style.right = "auto";
        this.panel.style.bottom = "auto";
        this.panel.style.left = rect.left + "px";
        this.panel.style.top = rect.top + "px";
        const onMove = (ev2) => {
          if (!this.panel) return;
          const dx = ev2.clientX - dragState.startX;
          const dy = ev2.clientY - dragState.startY;
          this.panel.style.left = Math.max(8, dragState.origLeft + dx) + "px";
          this.panel.style.top = Math.max(8, dragState.origTop + dy) + "px";
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }
    toast(msg, duration = 2200) {
      injectGlobalStyles();
      const t = document.createElement("div");
      t.className = "ghtk-toast";
      t.textContent = msg;
      getRoot().appendChild(t);
      requestAnimationFrame(() => t.classList.add("show"));
      setTimeout(() => {
        t.classList.remove("show");
        setTimeout(() => t.remove(), 280);
      }, duration);
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
  const Modal = {
    show({
      title = "提示",
      content = "",
      showInput = false,
      inputValue = "",
      placeholder = "",
      confirmText = "确定",
      cancelText = "取消"
    } = {}) {
      return new Promise((resolve) => {
        document.querySelectorAll(".ghtk-modal-mask").forEach((el) => el.remove());
        const mask = document.createElement("div");
        mask.className = "ghtk-modal-mask";
        mask.innerHTML = `
        <div class="ghtk-modal">
          <div class="ghtk-modal-header">
            <span class="ghtk-modal-title">${title}</span>
            <button class="ghtk-modal-close" type="button">✕</button>
          </div>
          <div class="ghtk-modal-body">
            ${content ? `<div class="ghtk-modal-content">${content}</div>` : ""}
            ${showInput ? `<input class="ghtk-modal-input" type="text" value="${inputValue.replace(/"/g, "&quot;")}" placeholder="${placeholder}" />` : ""}
          </div>
          <div class="ghtk-modal-footer">
            <button class="ghtk-btn" data-action="cancel" type="button">${cancelText}</button>
            <button class="ghtk-btn primary" data-action="confirm" type="button">${confirmText}</button>
          </div>
        </div>
      `;
        getRoot().appendChild(mask);
        injectGlobalStyles();
        const input = mask.querySelector(".ghtk-modal-input");
        if (input) {
          setTimeout(() => {
            input.focus();
            input.select();
          }, 50);
        }
        const close = (result) => {
          mask.remove();
          document.removeEventListener("keydown", onKey);
          resolve(result);
        };
        mask.querySelector(".ghtk-modal-close").addEventListener("click", () => close(null));
        mask.querySelector('[data-action="cancel"]').addEventListener("click", () => close(null));
        mask.querySelector('[data-action="confirm"]').addEventListener("click", () => {
          close(showInput ? input ? input.value.trim() : "" : true);
        });
        mask.addEventListener("click", (e) => {
          if (e.target === mask) close(null);
        });
        const onKey = (e) => {
          if (e.key === "Escape") close(null);
          if (e.key === "Enter" && showInput) close(input ? input.value.trim() : "");
        };
        document.addEventListener("keydown", onKey);
      });
    }
  };
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
  function checkHasForked(currentUser, owner, repo) {
    const forkUrl = `https://github.com/${currentUser}/${repo}`;
    const cacheKey = `${currentUser}/${owner}/${repo}`.toLowerCase();
    const cached = forkCache.get(cacheKey);
    if (cached && Date.now() - cached.at < FORK_CACHE_TTL) {
      return Promise.resolve(cached.url);
    }
    return new Promise((resolve) => {
      const done = (url) => {
        forkCache.set(cacheKey, { url, at: Date.now() });
        resolve(url);
      };
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url: `https://api.github.com/repos/${currentUser}/${repo}`,
          headers: API_HEADERS,
          onload: (res) => {
            if (res.status !== 200) {
              done(null);
              return;
            }
            try {
              const data = JSON.parse(res.responseText);
              const isForkOfThis = data.fork && data.parent?.full_name?.toLowerCase() === `${owner}/${repo}`.toLowerCase();
              done(data.fork || isForkOfThis ? forkUrl : null);
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
  const BIND_STORAGE_KEY = "upstream-downstream-bindings";
  function loadBindings() {
    return GM_getValue(BIND_STORAGE_KEY, []);
  }
  function saveBindings(list) {
    GM_setValue(BIND_STORAGE_KEY, list);
  }
  const ICONS = {
    search: `<svg viewBox="0 0 16 16"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/></svg>`,
    plus: `<svg viewBox="0 0 16 16"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg>`,
    copy: `<svg viewBox="0 0 16 16"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25ZM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>`,
    del: `<svg viewBox="0 0 16 16"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>`
  };
  const UpstreamBindPlugin = {
    id: "upstream-bind",
    name: "上游/下游仓库绑定",
    version: "2.5.0",
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
          <div class="ghtk-search">
            ${ICONS.search}
            <input type="text" id="ghtk-search-input" placeholder="搜索绑定" autocomplete="off" spellcheck="false" />
          </div>
          <button class="ghtk-toolbar-btn" id="ghtk-add-toggle" type="button" title="添加上游">${ICONS.plus}</button>
        </div>
        <div class="ghtk-split">
          <div class="ghtk-rail">
            <div class="ghtk-rail-head">
              <span>上游</span>
              <span class="ghtk-rail-state" id="ghtk-rail-state"></span>
            </div>
            <div class="ghtk-rail-list" id="ghtk-rail-list"></div>
          </div>
          <div class="ghtk-detail" id="ghtk-detail"></div>
        </div>
      `;
      },
      mount(ctx, root) {
        const state = {
          selected: -1,
          addMode: false,
          query: "",
          status: { text: "" },
          draft: ""
        };
        const railList = root.querySelector("#ghtk-rail-list");
        const railState = root.querySelector("#ghtk-rail-state");
        const detail = root.querySelector("#ghtk-detail");
        const addToggle = root.querySelector("#ghtk-add-toggle");
        const searchInput = root.querySelector("#ghtk-search-input");
        if (!railList || !detail || !railState) return;
        const currentUser = getCurrentUser(ctx.dom);
        const page = ctx.page;
        const currentRepo = page.owner && page.repo ? `${page.owner}/${page.repo}` : "";
        const isUpstreamOfCurrent = (b) => !!currentRepo && `${b.owner}/${b.repo}`.toLowerCase() === currentRepo.toLowerCase();
        const isDownstreamOfCurrent = (b) => !!currentRepo && (b.downstreams || []).some((d) => d.toLowerCase() === currentRepo.toLowerCase());
        const pickDefault = () => {
          const list = loadBindings();
          let idx = list.findIndex(isUpstreamOfCurrent);
          if (idx < 0) idx = list.findIndex(isDownstreamOfCurrent);
          state.selected = idx >= 0 ? idx : list.length ? 0 : -1;
        };
        const renderStatus = () => {
          railState.textContent = state.status.text;
          railState.style.color = state.status.color || "";
        };
        const renderRail = () => {
          const list = loadBindings();
          const q = state.query.trim().toLowerCase();
          const rows = list.map((b, idx) => ({ b, idx })).filter(({ b }) => !q || `${b.owner}/${b.repo}`.toLowerCase().includes(q));
          if (!list.length) {
            railList.innerHTML = `<div class="ghtk-rail-empty">暂无绑定<br>点上方 + 添加</div>`;
            return;
          }
          if (!rows.length) {
            railList.innerHTML = `<div class="ghtk-rail-empty">无匹配</div>`;
            return;
          }
          railList.innerHTML = rows.map(({ b, idx }) => {
            const hitUp = isUpstreamOfCurrent(b);
            const hitDown = isDownstreamOfCurrent(b);
            const related = hitUp || hitDown;
            const cls = [
              "ghtk-rail-item",
              idx === state.selected && !state.addMode ? "active" : "",
              related ? "related" : ""
            ].filter(Boolean).join(" ");
            const tip = related ? hitUp ? "当前仓库即此上游" : "当前仓库是它的下游" : `${b.owner}/${b.repo}`;
            return `
            <div class="${cls}" data-idx="${idx}" title="${tip}">
              <span class="ghtk-rail-name">${b.owner}/${b.repo}</span>
              ${related ? '<span class="ghtk-rail-dot" title="与当前页面相关"></span>' : ""}
              <span class="ghtk-rail-n">${(b.downstreams || []).length}</span>
            </div>
          `;
          }).join("");
          railList.querySelectorAll(".ghtk-rail-item").forEach((el) => {
            el.addEventListener("click", () => {
              state.selected = +el.dataset.idx;
              state.addMode = false;
              addToggle?.classList.remove("active");
              renderRail();
              renderDetail();
            });
          });
        };
        const renderDetail = () => {
          const list = loadBindings();
          if (state.addMode) {
            renderAddView(list);
            return;
          }
          if (!list.length) {
            detail.innerHTML = `
            <div class="ghtk-detail-empty">
              <div>暂无绑定</div>
              <button class="ghtk-btn primary" id="ghtk-empty-add" type="button">添加上游</button>
            </div>
          `;
            detail.querySelector("#ghtk-empty-add")?.addEventListener("click", () => enterAddMode());
            return;
          }
          const b = list[state.selected];
          if (!b) {
            state.selected = 0;
            renderDetail();
            return;
          }
          const downs = b.downstreams || [];
          const full = `${b.owner}/${b.repo}`;
          const rows = downs.length ? downs.map(
            (d) => `
            <div class="ghtk-drow">
              <span class="ghtk-drow-dash">└</span>
              <a href="https://github.com/${d}" target="_blank" title="${d}">${d}</a>
              <button class="ghtk-icon-btn ghtk-drow-rm" data-remove="${d}" type="button" title="移除">${ICONS.del}</button>
            </div>
          `
          ).join("") : `<div class="ghtk-dempty">无下游</div>`;
          detail.innerHTML = `
          <div class="ghtk-detail-head">
            <div class="ghtk-detail-title">
              <span class="name" title="${full}">${full}</span>
              ${isUpstreamOfCurrent(b) ? '<span class="ghtk-chip">当前仓库</span>' : isDownstreamOfCurrent(b) ? '<span class="ghtk-chip">我的 Fork</span>' : ""}
            </div>
            <div class="ghtk-detail-sub">
              <span>页面 <b><code>${page.type}</code></b></span>
              ${currentUser ? `<span>用户 <b>${currentUser}</b></span>` : '<span style="color:#cf222e">未登录</span>'}
            </div>
          </div>

          <div class="ghtk-detail-body">
            <div class="ghtk-sec-label">下游 · ${downs.length}</div>
            ${rows}
          </div>

          <div class="ghtk-detail-foot">
            <div class="ghtk-foot-main">
              <button class="ghtk-btn primary" id="ghtk-auto-bind" type="button">绑定下游</button>
              <a class="ghtk-btn" href="https://github.com/${full}" target="_blank">打开上游</a>
            </div>
            <div class="ghtk-foot-icons">
              <button class="ghtk-icon-btn" id="ghtk-manual-bind" type="button" title="手动绑定下游">${ICONS.plus}</button>
              <button class="ghtk-icon-btn" id="ghtk-copy-up" type="button" title="复制上游链接">${ICONS.copy}</button>
              <div class="ghtk-foot-spacer"></div>
              <button class="ghtk-icon-btn danger" id="ghtk-remove-up" type="button" title="删除绑定">${ICONS.del}</button>
            </div>
          </div>
        `;
          detail.querySelectorAll("[data-remove]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const down = btn.dataset.remove;
              const latest = loadBindings();
              if (!latest[state.selected]) return;
              latest[state.selected].downstreams = (latest[state.selected].downstreams || []).filter(
                (x) => x !== down
              );
              saveBindings(latest);
              renderRail();
              renderDetail();
              ctx.ui.toast("已移除");
            });
          });
          detail.querySelector("#ghtk-auto-bind")?.addEventListener("click", async () => {
            if (!currentUser) {
              ctx.ui.toast("未登录");
              return;
            }
            const target = loadBindings()[state.selected];
            if (!target) return;
            ctx.ui.toast("正在检测…");
            const forkUrl = await checkHasForked(currentUser, target.owner, target.repo);
            const latest = loadBindings();
            const cur = latest[state.selected];
            if (!cur) return;
            if (forkUrl) {
              const down = `${currentUser}/${cur.repo}`;
              cur.downstreams = cur.downstreams || [];
              if (!cur.downstreams.includes(down)) {
                cur.downstreams.push(down);
                saveBindings(latest);
                renderRail();
                renderDetail();
                ctx.ui.toast("已绑定 " + down);
              } else {
                ctx.ui.toast("已存在");
              }
            } else {
              ctx.ui.toast("未检测到 Fork");
            }
          });
          detail.querySelector("#ghtk-manual-bind")?.addEventListener("click", async () => {
            const val = await Modal.show({
              title: "绑定下游",
              showInput: true,
              inputValue: currentUser ? `${currentUser}/` : "",
              placeholder: "owner/repo",
              confirmText: "绑定"
            });
            if (!val) return;
            const cleaned = String(val).trim().replace(/^https?:\/\/github\.com\//i, "");
            if (!cleaned.includes("/")) {
              ctx.ui.toast("格式错误");
              return;
            }
            const latest = loadBindings();
            const cur = latest[state.selected];
            if (!cur) return;
            cur.downstreams = cur.downstreams || [];
            if (!cur.downstreams.includes(cleaned)) {
              cur.downstreams.push(cleaned);
              saveBindings(latest);
              renderRail();
              renderDetail();
              ctx.ui.toast("已绑定 " + cleaned);
            } else {
              ctx.ui.toast("已存在");
            }
          });
          detail.querySelector("#ghtk-copy-up")?.addEventListener("click", () => {
            navigator.clipboard.writeText(`https://github.com/${full}`).then(() => ctx.ui.toast("已复制")).catch(() => ctx.ui.toast("复制失败"));
          });
          detail.querySelector("#ghtk-remove-up")?.addEventListener("click", async () => {
            const ok = await Modal.show({
              title: "删除",
              content: `删除 <b>${full}</b>？`,
              confirmText: "删除",
              cancelText: "取消"
            });
            if (!ok) return;
            const latest = loadBindings();
            latest.splice(state.selected, 1);
            saveBindings(latest);
            pickDefault();
            renderRail();
            renderDetail();
            ctx.ui.toast("已删除");
          });
        };
        const enterAddMode = () => {
          state.addMode = true;
          state.draft = "";
          addToggle?.classList.add("active");
          renderRail();
          renderDetail();
        };
        const exitAddMode = () => {
          state.addMode = false;
          addToggle?.classList.remove("active");
          renderRail();
          renderDetail();
        };
        const renderAddView = (list) => {
          const st = state.status;
          const detected = st.fullName && st.owner && st.repo;
          const alreadyBound = detected && st.bound;
          detail.innerHTML = `
          <div class="ghtk-addview">
            <div class="ghtk-addview-head">
              <div class="ghtk-addview-title">添加上游</div>
              <div class="ghtk-addview-sub">owner/repo 或完整链接</div>
            </div>
            <div class="ghtk-addview-body">
              <label class="ghtk-field-label" for="ghtk-upstream-input">仓库</label>
              <div class="ghtk-field">
                <input type="text" id="ghtk-upstream-input" placeholder="owner/repo" value="${state.draft.replace(/"/g, "&quot;")}" />
                <button class="ghtk-btn primary" id="ghtk-add-upstream" type="button">添加</button>
              </div>
              <div class="ghtk-hint">也支持粘贴 https://github.com/owner/repo</div>
              ${detected && !alreadyBound ? `
                <div class="ghtk-detect">
                  <div class="ghtk-detect-label">检测到当前仓库上游</div>
                  <div class="ghtk-detect-repo" title="${st.fullName}">${st.fullName}</div>
                  <div class="ghtk-detect-actions">
                    <button class="ghtk-btn primary" id="ghtk-oneclick-bind" type="button">绑定为下游</button>
                    <a class="ghtk-btn" href="https://github.com/${st.fullName}" target="_blank">打开</a>
                  </div>
                </div>
              ` : detected && alreadyBound ? `<div class="ghtk-note">当前仓库已绑定上游 ${st.fullName}</div>` : st.text === "检测失败" ? `<div class="ghtk-note">无法获取仓库信息</div>` : st.text === "无上游" ? `<div class="ghtk-note">当前仓库不是 Fork，没有上游</div>` : ""}
              ${list.length === 0 ? "" : ""}
            </div>
            <div class="ghtk-addview-foot">
              <button class="ghtk-btn" id="ghtk-add-cancel" type="button">取消</button>
            </div>
          </div>
        `;
          const input = detail.querySelector("#ghtk-upstream-input");
          input?.focus();
          detail.querySelector("#ghtk-add-cancel")?.addEventListener("click", () => exitAddMode());
          const submit = () => {
            const val = (input?.value || "").trim().replace(/^https?:\/\/github\.com\//i, "");
            if (!val || !val.includes("/")) {
              ctx.ui.toast("格式错误");
              return;
            }
            const [owner, repo] = val.split("/");
            if (!owner || !repo) {
              ctx.ui.toast("格式错误");
              return;
            }
            const latest = loadBindings();
            const key = `${owner}/${repo}`.toLowerCase();
            if (latest.some((b) => `${b.owner}/${b.repo}`.toLowerCase() === key)) {
              ctx.ui.toast("已存在");
              return;
            }
            latest.push({ owner, repo, downstreams: [], createdAt: Date.now() });
            saveBindings(latest);
            state.selected = latest.length - 1;
            state.addMode = false;
            addToggle?.classList.remove("active");
            renderRail();
            renderDetail();
            ctx.ui.toast("已添加 " + owner + "/" + repo);
          };
          detail.querySelector("#ghtk-add-upstream")?.addEventListener("click", submit);
          input?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") submit();
          });
          detail.querySelector("#ghtk-oneclick-bind")?.addEventListener("click", () => {
            if (!st.owner || !st.repo || !st.fullName) return;
            const latest = loadBindings();
            let binding = latest.find(
              (x) => x.owner.toLowerCase() === st.owner.toLowerCase() && x.repo.toLowerCase() === st.repo.toLowerCase()
            );
            if (!binding) {
              binding = { owner: st.owner, repo: st.repo, downstreams: [], createdAt: Date.now() };
              latest.push(binding);
            }
            binding.downstreams = binding.downstreams || [];
            if (currentRepo && !binding.downstreams.includes(currentRepo)) {
              binding.downstreams.push(currentRepo);
            }
            saveBindings(latest);
            state.selected = latest.indexOf(binding);
            state.addMode = false;
            state.status = { ...st, bound: true };
            addToggle?.classList.remove("active");
            renderStatus();
            renderRail();
            renderDetail();
            ctx.ui.toast("已绑定 " + (currentRepo || st.fullName));
          });
        };
        searchInput?.addEventListener("input", () => {
          state.query = searchInput.value;
          renderRail();
        });
        addToggle?.addEventListener("click", () => {
          if (state.addMode) exitAddMode();
          else enterAddMode();
        });
        pickDefault();
        renderStatus();
        renderRail();
        renderDetail();
        if (page.owner && page.repo) {
          state.status = { text: "检测中…" };
          renderStatus();
          detectUpstream(page).then((st) => {
            state.status = st;
            renderStatus();
            if (state.addMode) renderDetail();
          });
        }
      }
    }
  };
  async function detectUpstream(page, currentUser) {
    const owner = page.owner;
    const repo = page.repo;
    const info = await fetchRepoInfo(owner, repo);
    if (!info) return { text: "检测失败", color: "#cf222e" };
    const upstream = info.parent || info.source;
    if (!info.fork || !upstream) return { text: "无上游" };
    const currentFull = `${owner}/${repo}`;
    const bindings = loadBindings();
    const bound = bindings.some(
      (b) => b.owner.toLowerCase() === upstream.owner.toLowerCase() && b.repo.toLowerCase() === upstream.repo.toLowerCase() && (b.downstreams || []).includes(currentFull)
    );
    return {
      text: bound ? "已绑定" : "未绑定",
      color: bound ? "#1a7f37" : void 0,
      fullName: upstream.full_name,
      owner: upstream.owner,
      repo: upstream.repo,
      bound
    };
  }
  const ACCEL_BASE_KEY = "accel-base-url";
  const DEFAULT_ACCEL_BASE = "https://github.akams.cn/";
  function getAccelBase() {
    return GM_getValue(ACCEL_BASE_KEY, DEFAULT_ACCEL_BASE);
  }
  function setAccelBase(url) {
    GM_setValue(ACCEL_BASE_KEY, url);
  }
  const AccelPlugin = {
    id: "github-accel",
    name: "GitHub 加速 (akams)",
    version: "1.0.2",
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
        const accelBase = getAccelBase();
        return `
        <div class="ghtk-accel-setting">
          <label>加速地址（默认 ${DEFAULT_ACCEL_BASE}）</label>
          <div class="ghtk-form-row">
            <input type="text" id="ghtk-accel-base" value="${accelBase}" placeholder="${DEFAULT_ACCEL_BASE}" />
            <button class="ghtk-btn primary" id="ghtk-save-accel" type="button">保存</button>
          </div>
        </div>
        <div class="ghtk-scroll-area" style="padding-top:12px;">
          <div id="ghtk-accel-actions"></div>
        </div>
      `;
      },
      mount(ctx) {
        renderAccelActions(ctx);
        document.getElementById("ghtk-save-accel")?.addEventListener("click", () => {
          const input = document.getElementById("ghtk-accel-base");
          let val = (input?.value || "").trim();
          if (!val) val = DEFAULT_ACCEL_BASE;
          if (!val.endsWith("/")) val += "/";
          setAccelBase(val);
          ctx.ui.toast("已保存");
          renderAccelActions(ctx);
        });
      }
    }
  };
  function renderAccelActions(ctx) {
    const container = document.getElementById("ghtk-accel-actions");
    if (!container) return;
    const page = ctx.page;
    const base = getAccelBase();
    if (!page.owner || !page.repo) {
      container.innerHTML = `<div class="ghtk-empty">进入仓库后可用</div>`;
      return;
    }
    const repoUrl = `https://github.com/${page.owner}/${page.repo}`;
    const accelUrl = `${base}?url=${encodeURIComponent(repoUrl)}`;
    container.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-size:12px;color:var(--fgColor-muted);margin-bottom:6px;">当前仓库加速地址</div>
      <div style="font-size:12px;word-break:break-all;margin-bottom:8px;padding:8px;background:var(--bgColor-muted);border-radius:6px;">
        ${accelUrl}
      </div>
      <div class="ghtk-btn-row">
        <a class="ghtk-btn primary" href="${accelUrl}" target="_blank">加速打开</a>
        <button class="ghtk-btn" id="ghtk-copy-accel" type="button">复制</button>
      </div>
    </div>
  `;
    document.getElementById("ghtk-copy-accel")?.addEventListener("click", () => {
      const url = `${getAccelBase()}?url=${encodeURIComponent(repoUrl)}`;
      navigator.clipboard.writeText(url).then(() => ctx.ui.toast("已复制")).catch(() => ctx.ui.toast("复制失败"));
    });
  }
  const builtinPlugins = [UpstreamBindPlugin, AccelPlugin];
  const DEFAULT_ENABLED = ["upstream-bind", "github-accel"];
  const TOOLKIT_VERSION = "2.5.2";
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
  eventBus.on("page:change", (page) => {
    pluginManager.onPageChange(page);
  });
  function renderPanel() {
    try {
      const page = router.current;
      const pluginTabs = pluginManager.getAll().filter((p) => pluginManager.isEnabled(p.id) && p.panelTab);
      const tabsHtml = pluginTabs.map((p) => `<button class="ghtk-tab" data-tab="${p.panelTab.id}" type="button">${p.panelTab.label}</button>`).join("") + `<button class="ghtk-tab" data-tab="plugins" type="button">插件</button>`;
      const defaultTab = pluginTabs[0]?.panelTab?.id ?? "plugins";
      const contentsHtml = pluginTabs.map(
        (p) => `
        <div class="ghtk-tab-content ${p.panelTab.id === defaultTab ? "active" : ""}" data-content="${p.panelTab.id}">
        </div>
      `
      ).join("");
      const contentHtml = `
      <div class="ghtk-tabs">${tabsHtml}</div>
      ${contentsHtml}
      <div class="ghtk-tab-content ${defaultTab === "plugins" ? "active" : ""}" data-content="plugins">
        <div class="ghtk-scroll-area" id="ghtk-plugins-list" style="padding-top:16px;"></div>
      </div>
    `;
      ui.showPanel(contentHtml, `GitHub Toolkit v${TOOLKIT_VERSION}`);
      document.querySelectorAll(".ghtk-tab").forEach((tab) => {
        if (tab.dataset.tab === defaultTab) tab.classList.add("active");
        tab.addEventListener("click", () => {
          const name = tab.dataset.tab;
          document.querySelectorAll(".ghtk-tab").forEach((t) => t.classList.remove("active"));
          document.querySelectorAll(".ghtk-tab-content").forEach((c) => c.classList.remove("active"));
          tab.classList.add("active");
          document.querySelector(`.ghtk-tab-content[data-content="${name}"]`)?.classList.add("active");
        });
      });
      for (const p of pluginTabs) {
        const tab = p.panelTab;
        const root = document.querySelector(`.ghtk-tab-content[data-content="${tab.id}"]`);
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
      renderPluginsList();
    } catch (err) {
      Logger.error("renderPanel 失败:", err);
      ui.toast("面板渲染失败");
    }
  }
  function renderPluginsList() {
    const container = document.getElementById("ghtk-plugins-list");
    if (!container) return;
    const plugins = pluginManager.getAll();
    container.innerHTML = plugins.map((p) => {
      const checked = pluginManager.isEnabled(p.id) ? "checked" : "";
      return `
        <div class="ghtk-plugin-item">
          <div style="min-width:0;">
            <strong style="font-size:13px;">${p.name}</strong>
            <div class="desc">${p.description || ""}</div>
          </div>
          <label style="flex-shrink:0;">
            <input type="checkbox" data-id="${p.id}" ${checked} style="width:18px;height:18px;cursor:pointer;">
          </label>
        </div>
      `;
    }).join("");
    container.querySelectorAll("input[type=checkbox][data-id]").forEach((input) => {
      input.addEventListener("change", async (e) => {
        const target = e.target;
        const id = target.dataset.id;
        if (target.checked) {
          await pluginManager.enable(id);
          if (!enabledList.includes(id)) enabledList.push(id);
        } else {
          await pluginManager.disable(id);
          enabledList = enabledList.filter((x) => x !== id);
        }
        GM_setValue("enabled-plugins", enabledList);
        ui.toast(target.checked ? "已启用" : "已禁用");
        setTimeout(renderPanel, 150);
      });
    });
  }
  ui.onFabToggle = () => {
    if (ui.panel) {
      ui.hidePanel();
    } else {
      renderPanel();
    }
  };
  GM_registerMenuCommand("打开 GitHub Toolkit 面板", renderPanel);
  function init() {
    if (!document.body) {
      setTimeout(init, 100);
      return;
    }
    ui.createFab();
    Logger.log(`GitHub Toolkit v${TOOLKIT_VERSION} 已启动（图标操作 + 复制链接）`);
  }
  init();

})();