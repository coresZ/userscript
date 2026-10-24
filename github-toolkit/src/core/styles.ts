/**
 * GitHub Toolkit 样式表。
 *
 * 隔离策略（避免与 GitHub 自身或其它用户脚本的样式互相污染）：
 * 1. 所有类名统一 `ghtk-` 前缀；
 * 2. 尺寸变量定义在 `#ghtk-root` 作用域内，不写 `:root`，不污染全局；
 * 3. 样式表带唯一 id，注入后校验存在性，被页面移除时自动补回；
 * 4. 根容器做最小化 reset，抵御 GitHub 全局样式（按钮/输入框/链接）的侵入；
 * 5. 关键属性带 `!important`，防止被页面样式覆盖。
 */
const STYLE_ID = 'ghtk-style-v1';
const ROOT_ID = 'ghtk-root';

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

/** 注入样式表（幂等 + 自愈：被页面移除后自动补回） */
export function injectGlobalStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);

  // 观察 head，防止 GitHub 软导航或其它脚本清掉我们的样式
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
