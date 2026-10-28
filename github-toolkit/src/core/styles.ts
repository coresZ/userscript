/**
 * GitHub Toolkit 样式表。
 *
 * 隔离策略（避免与 GitHub 自身或其它用户脚本的样式互相污染）：
 * 1. 所有类名统一 `ghtk-` 前缀，所有 DOM 挂在 `#ghtk-root` 下；
 * 2. token 只定义在 `#ghtk-root` 作用域内，不写 `:root`；
 * 3. 颜色一律取 GitHub Primer 主题变量（括号里是亮色兜底），亮/暗色自动跟随；
 * 4. reset 用 `:where()` 包裹，特异性为 0，组件类总能覆盖它；
 * 5. 构建时由 `important()` 给每条声明补 `!important`，压过 GitHub 全局样式；
 * 6. 样式表带唯一 id，注入后被页面移除时自动补回。
 *
 * 注意：CSS 写在模板字符串里，注释中不能出现反引号或美元符加花括号。
 */
const STYLE_ID = 'ghtk-style-v1';
const ROOT_ID = 'ghtk-root';

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

/** 给每条声明补 !important（跳过自定义属性与 @keyframes，keyframes 里的 !important 会被浏览器丢弃） */
function important(css: string): string {
  const frames: string[] = [];
  const masked = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, (m) => {
    frames.push(m);
    return '@@GHTK_FRAME_' + (frames.length - 1) + '@@';
  });
  const out = masked.replace(
    /((?:^|[{;]|\*\/)\s*)(-?[a-z][a-z-]*\s*:\s*)([^;{}]+?)(\s*)(?=[;}])/g,
    (m, pre: string, prop: string, val: string, ws: string) =>
      /!important$/.test(val) ? m : pre + prop + val + ' !important' + ws
  );
  return out.replace(/@@GHTK_FRAME_(\d+)@@/g, (_m, i: string) => frames[Number(i)]);
}

const CSS = important(CSS_SOURCE);

/** 注入样式表（幂等 + 自愈：被页面移除后自动补回） */
export function injectGlobalStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  // 观察文档，防止 GitHub 软导航或其它脚本清掉我们的样式
  if (!observerStarted) {
    observerStarted = true;
    const ensure = () => {
      if (!document.getElementById(STYLE_ID)) {
        const s = document.createElement('style');
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

/** 根容器：所有 UI 都挂在这里，样式作用域隔离 */
export function getRoot(): HTMLElement {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    // 自身不参与布局、不产生包含块，子元素各自 fixed 定位
    root.style.cssText = 'position:static;display:contents;';
    document.body.appendChild(root);
  }
  return root;
}
