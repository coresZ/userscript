# MODIFICATIONS.md

本文件按目录分节，记录各子项目的修改规则、验证基线与变更历史。执行修改前先读本文件，修改后必须回填。

---

## github-toolkit

### 规则

#### 构建与版本
- Vite + vite-plugin-monkey 构建，产物在 `dist/`；改动源码后必须 `npm run build` 重新生成 `dist/github-toolkit.user.js` 与 `dist/github-toolkit.meta.js`。
- 代码类改动需递增版本号：`package.json` 的 `version` + `vite.config.ts` 的 `userscript.version` + `src/main.ts` 的 `TOOLKIT_VERSION`（三处保持一致），再构建同步 `dist/`。
- 油猴权限统一在 `vite.config.ts` 的 `userscript.grant` / `userscript.connect` 维护，插件内不再单独写 `// @grant`。
- **禁止用 PowerShell 的 `Set-Content` / `Out-File` 改源码**：本环境 PowerShell 5.1 默认按 ANSI 写回，会把中文注释变成乱码并吞掉换行。改文件一律用编辑工具。改完用 `node -e "console.log((require('fs').readFileSync(f,'utf8').match(/\uFFFD/g)||[]).length)"` 校验替换字符数（应为 0）。

#### 样式与隔离（强制）
- **所有 UI 类名必须 `ghtk-` 前缀，所有 id 必须 `ghtk-` 前缀**，禁止裸类名，避免与 GitHub 或其它脚本冲突。
- **禁止写 `:root` 变量**。尺寸 token（`--ghtk-ctl-h` / `--ghtk-ctl-radius` / `--ghtk-ctl-font` / `--ghtk-ctl-gap` / `--ghtk-icon`）只能定义在 `#ghtk-root` 作用域内。
- **所有 DOM 必须挂在 `#ghtk-root` 容器下**（`getRoot()` 返回，`display: contents` 不产生布局影响），禁止直接 `document.body.appendChild`。
- 样式表必须通过 `injectGlobalStyles()` 注入，带固定 id（`ghtk-style-v1`）并自带 `MutationObserver` 自愈；新增样式一律写进 `src/core/styles.ts` 的 CSS 字符串，禁止在插件里散写 `<style>`。
- 新增 UI 元素必须能承受 GitHub 全局样式侵入：依赖 `#ghtk-root *` 的 reset 段，关键属性带 `!important`。

#### 控件尺寸（强制，禁止破例）
- 所有可交互控件统一：**高度 30px、圆角 6px、字号 12px**，变量引用 `var(--ghtk-ctl-*)`，**禁止硬编码** 28/32/34px 等数值。
- 按钮类：`.ghtk-btn`（`min-width: 76px`，同排用 `.ghtk-btn-row` 等宽 `flex: 1`）；图标按钮 `.ghtk-icon-btn`（30×30，图标 14px）。
- 输入框类：`.ghtk-search input` / `.ghtk-field input` / `.ghtk-modal-input` 同为 30px 高。

#### 交互与视觉（强制）
- **主操作按钮（蓝色实心 `.ghtk-btn.primary`）一屏最多一个，位置必须固定**。当前设计中它固定在右栏详情底部（`.ghtk-detail-foot`），禁止新增同层级的蓝色实心按钮，禁止在不同卡片/行内各自放一个。
- **危险操作必须二次确认，且必须用自家 `Modal` 组件**（`danger: true`，确认按钮红色实心 `.ghtk-btn.danger-solid`），禁止用 `window.confirm` / `alert`。
- **弹窗必须跟随面板**：`Modal.show()` 自动读取 `.ghtk-panel` 的 `getBoundingClientRect()` 把遮罩定位到面板区域内（`.in-panel`），遮罩只覆盖面板、不全屏压暗；面板尺寸变化（resize）时跟随。
- **站内链接必须走软导航**：链接加 `data-ghtk-nav` 属性，由 `src/core/navigate.ts` 的 `bindSoftNav()` 统一拦截改走 `Turbo.visit()`，禁止给站内链接加 `target="_blank"`。目的：页面切换时脚本不重载、面板保持打开。
- **面板状态在软导航后必须保持**：`page:change` 时若 `ui.panel` 存在则重新渲染；FAB 在 `turbo:load` / `turbo:render` / `pjax:end` / `soft-nav:end` 后补回（Turbo 替换 body 会冲掉它）。
- **悬浮球可拖拽**：拖动阈值 4px（低于此视为点击），位置持久化到 `GM_setValue('fab-position')`，拖动后不触发点击，自动约束在视口内；面板贴着悬浮球展开（优先上方，空间不足翻到下方）。

#### 文案（强制）
- **尽可能少的文字，但必要的说明文字不得删除**。判断标准：删掉后用户无法理解该控件/区域的含义，即为必要。
- 纯解释性、可从上下文推断的文字改为 `title` 提示；状态性文字（已绑定/未绑定/检测失败等）保留但压到最短。
- 按钮文案用动词最短形式（如「绑定」「打开」「添加」「保存」「复制」），含义不足时用 `title` 补全。
- Toast 文案不超过 6 个字（如「已复制」「已保存」「已绑定 x」「格式错误」）。

#### 布局与溢出（强制）
- 面板内所有新增区块必须考虑溢出：文本用 `-webkit-line-clamp` 或 `text-overflow: ellipsis` 截断，长内容区自身滚动，**禁止撑破面板或挤压相邻区域**。
- 新增区块若参与纵向 flex 布局，必须明确 `flex-shrink`，必要时设 `max-height` + `overflow-y: auto`（参考 `.ghtk-about` 的 `max-height: 42%`）。
- 可展开的长内容必须提供「展开 / 收起」入口（参考 `.ghtk-about-more`）。

#### 数据与安全
- 所有注入到 `innerHTML` 的仓库名、描述、topics 等外部数据必须经 `escapeHtml()` 转义。
- API 调用统一走 `src/core/github-api.ts`，带内存缓存（`fetchRepoAbout` / `fetchRepoInfo` / `checkHasForked` 均为 10 分钟 TTL），禁止在插件内直连 `GM_xmlhttpRequest`。

#### 架构约定
- 插件通过 `panelTab`（`{ id, label, render, mount }`）贡献面板 Tab，主程序只负责组装。新增插件在 `src/plugins/index.ts` 注册。
- 插件运行时依赖只能来自注入的 `PluginContext`（`eventBus` / `storage` / `ui` / `dom` / `page` / `log`），禁止跨插件直接引用。

#### 验证基线
- `npm run build`（内含 `tsc --noEmit`）必须通过。
- 涉及 UI 改动的，构建后检查 `dist/github-toolkit.user.js` 中确认关键字符串/css 落地。
- 提交前确认工作区无乱码（替换字符数为 0）。

### 修改记录

#### 修复入口与 Fork 按钮无法同批出现（1.4.1 → 1.5.0）

- **现象**：「图标先出现一次 → 消失 → 按钮再出来」，且两个按钮「一个一个崩出来」。
- **根因（两个独立缺陷叠加）**：
  1. **两个按钮是两条互不相关的注入路径**：`main.ts` 的顶栏入口**立即** `appendChild`（无任何等待），而 Fork 插件要等 `waitForStableTarget` 判定 header 稳定（约 750ms）才插入。于是先出现的入口被 React 重渲染吞掉，随后 Fork 按钮才补上——这就是「出现 → 消失 → 再出现」。
  2. **两次独立的 DOM 写入 = 两次绘制**：即使都等到稳定，两条路径各写各的，浏览器会分帧绘制，视觉上就是「一个一个崩出来」。另外 Fork 数据来自异步 API，天然比入口晚，必然分两批。
- **修改内容**：
  - 新增 `src/core/header-host.ts`——**统一投放调度器**，把「等稳定」和「插进去」收敛成单点：
    - 使用方只 `registerHeaderSlot({ id, selector, isReady, mount, wrapperTag, wrapperClass })` 登记，不再自己碰 DOM。
    - 全站共享**一次**稳定判定（同一节点连续 3 次命中 + 子树无 `childList` 变动，200ms 轮询）。
    - 稳定后再 `SETTLE_QUIET_MS`(300ms) 静置，并**等待所有槽位 `isReady()` 为真**（上限 `READY_TIMEOUT_MS`=4s），确保异步取数的槽位不会晚一批。
    - `flush()` 在**同一个同步执行块**内插完所有缺失槽位 → 浏览器只绘制一帧。
    - 共享**一个** `MutationObserver` 自愈守卫（400ms 去抖），复活时同样走 `run()` 整批重插；带 `REINJECT_MAX`/`REINJECT_WINDOW_MS` 防死循环，`runToken` 让导航后的在途任务失效。
    - 导出 `armHeaderHost` / `rearmHeaderHost` / `disarmHeaderHost` / `requestFlush` / `placeInAnchor` / `registerHeaderSlot` / `unregisterHeaderSlot`。
  - `go-to-my-fork.ts` 重写注入路径：
    - 删除 `waitForStableTarget`、`startGuard`、`guardObs`/`guardTimer`/`guardKey`/`guardBusy`/`seq` 守卫群、`injectButton`、`findTarget`、`FALLBACK_CSS` 等一整组自绘调度代码。
    - `activate()` 只做「算数据 → 登记槽位 → `requestFlush()`」。
    - 槽位带 `isReady: () => !!menuTarget`，让调度器等 API 返回后再一起插。
    - 同一仓库且按钮已在位时**只更新菜单数据、不动 DOM**（消除同页重复插入的闪）。
    - 切到自己的仓库 / 未 Fork / 无 owner·repo 时 `dropSlot()`（先 `closeMenu()` 再删 DOM）。
    - 菜单内容改为点击时读取 `menuTarget`（而非闭包捕获的旧值），修掉跨仓库导航后菜单仍指向旧 fork 的隐患。
  - `main.ts`：入口改为登记 `entrySlot`（`wrapperTag: 'li'`），与 Fork 按钮共享同一调度器；删除原有的 `ensureEntry` 与 500ms `MutationObserver` 自愈（已由调度器统一承担）；删除重复注册的 `page:change` 监听与重复的启动日志；`page:change` 时 `rearmHeaderHost()` + `routeEntry()`。
  - `findHeaderSlot` 保持在 `native-button.ts` 作为锚点解析器传入 `armHeaderHost`。
- **验证**：`npx tsc --noEmit` 退出码 0；`npm run build` 成功（`dist/github-toolkit.user.js` 43.23 kB，`@version 1.5.0`）。jsdom 夹具用 15ms 状态签名采样（`E`=入口 / `F`=Fork）共 16 条断言全部通过（临时目录已删除、`jsdom` 已 `--no-save` 卸载）：
  - 首屏（API 快）：`frames=[--@33ms, EF@809ms]` —— 从无到有两个元素**同帧**出现，无 `E-` 中间态。
  - 慢 API（1.2s）+ 期间 header 重渲染 2 次：`frames=[--@19ms, EF@1935ms]` —— 仍然同帧。
  - header 整块替换后自愈：`frames=[--@29ms, EF@1152ms]` —— 同批回来，无单元素中间态，无重复。
  - 未 Fork：只留入口；切到自己仓库：Fork 按钮移除；`title` 中文未乱码。
- **涉及文件与位置**：`src/core/header-host.ts`（新增）、`src/plugins/go-to-my-fork.ts`（重写注入路径）、`src/main.ts`（入口改槽位、删除重复自愈与重复监听）、`package.json`、`vite.config.ts`、`dist/*`
- **副作用修复**：本次用 PowerShell `Set-Content` 批量改版本号，导致 `src/main.ts` 与 `vite.config.ts` 的中文注释被写成 ANSI 乱码并吞掉换行（`tsc` 报 `TS1490 File appears to be binary`）。两个文件已按逻辑完整重写，并用 Node 校验 `\uFFFD` 计数为 0。该坑已写入上方「规则」。

#### v2.5.x 全面重写：C 版双栏主从 + 样式隔离 + 软导航（1.5.0 → 2.5.3）

> 旧版（`go-to-my-fork` 插件、顶栏按钮注入、header-host 调度器）全部删除，按用户提供的新版脚本重新实现。

- **架构**：保留事件总线 / 路由 / 插件管理器骨架；新增 `core/styles.ts`（隔离样式表）、`core/modal.ts`、`core/github-api.ts`、`core/navigate.ts`、`core/ui-manager.ts`（FAB + 面板 + Toast）。插件：`upstream-bind`（上下游绑定）、`github-accel`（加速访问）。插件通过 `panelTab` 契约贡献面板 Tab。
- **删除模块**：`core/dropdown.ts`、`core/header-host.ts`、`core/native-button.ts`、`core/position.ts`、`plugins/go-to-my-fork.ts`。
- **面板布局（经三版视觉稿对比后选定 C 版）**：左栏 152px 纯导航（上游名 + 下游数量，零按钮，选中态浅蓝底 + 2px 蓝竖条）；右栏主从详情（标题/标签/上下游用户 → about → 下游列表 → 底部固定操作区）。
- **样式隔离**：类名/id 全部 `ghtk-` 前缀；尺寸 token 收进 `#ghtk-root` 作用域（不再写 `:root`）；样式表带 id `ghtk-style-v1` + `MutationObserver` 自愈；所有 UI 挂 `#ghtk-root`（`display: contents`）；`#ghtk-root *` 做最小 reset 抵御 GitHub 全局样式。
- **可拖拽悬浮球**：Pointer Events，4px 阈值区分点击/拖拽，位置持久化 `GM.setValue('fab-position')`，视口约束，面板贴球展开。
- **软导航**：站内链接加 `data-ghtk-nav`，`bindSoftNav()` 拦截走 `Turbo.visit()`；`page:change` 时面板重建保持打开；FAB 在 turbo 事件后补回。
- **上游 about 区块**：`fetchRepoAbout()` 拉 description/language/stars/forks/license/homepage/topics，10 分钟缓存；简介 3 行截断可展开，topics 限高，区块 `max-height: 42%` 自身滚动。
- **交互细节**：删除下游/删除绑定均为二次确认（自家 Modal，`danger: true`）；确认弹窗遮罩贴合面板区域（`.in-panel`），不全屏压暗。
- **用户展示区分**：详情头部拆为「上游所有者」与「当前用户」两项，避免同名混淆；左栏当前仓库相关项加蓝点标记，默认选中优先级 = 当前仓库是上游 > 当前仓库是下游 > 第一条。
- **版本**：`package.json` / `vite.config.ts` / `TOOLKIT_VERSION` 三处同步至 2.5.3。
- **git**：根 `.gitignore` 与子目录 `.gitignore` 均移除 `dist/`，构建产物纳入版本控制。

#### Fork 入口改为下拉菜单，修复按钮文字溢出（1.4.0 → 1.4.1）

- **问题**：`label: '我的 Fork'` 在克隆出的 `Button--small` 里比原生 “Fork” 宽，且 `Button--small` 未设 `white-space: nowrap` 时会被容器压成两行/溢出，视觉上文字超出按钮范围。
- **修改内容**：
  - Fork 按钮改为 **iconOnly 下拉触发**：只显示 fork octicon（`title="我的 Fork"` + `aria-label`），彻底消除文字溢出；点击展开菜单而非直接跳转。
  - 新增 `src/core/dropdown.ts`：轻量下拉菜单，挂在 `body` 上 fixed 定位（避免被仓库头的 `overflow`/`transform` 裁切）；表头显示 `我的 Fork · <user>/<repo>`；菜单项支持图标 + 标题 + 描述、链接或回调；配色全部走 GitHub 主题变量。
    - 交互：点击切换、`Esc` 关闭并把焦点还给触发按钮、`↑`/`↓` 循环移动焦点、`Tab` 关闭、点击外部关闭、`resize`/`scroll` 跟随重定位；`aria-expanded` / `aria-haspopup="menu"` / `role="menu"` / `role="menuitem"` 齐备。
  - 新增 `src/core/position.ts`：抽出 `placeAnchored()`，面板与下拉共用同一套「右对齐锚点 → 下方 gap → 空间不足翻上 → 视口 clamp」规则。
  - Fork 菜单项：`打开我的 Fork`（指向我的 fork）、`对比上游变更`（指向上游 `/compare`）。
  - `removeButtons()` 会先 `closeMenu()`——菜单在 body 上，按钮被移除时必须一并收起，否则会留下孤儿浮层。
  - 与设置面板互斥：打开面板时 `closeMenu()`，打开 Fork 菜单时 `ui.hidePanel()`。
  - 插件版本 1.3.1 → 1.4.1（`main.ts` 的 `TOOLKIT_VERSION` 同步为 1.4.1），项目版本 1.4.0 → 1.4.1。
- **验证**：`npx tsc --noEmit` 退出码 0；`npm run build` 成功（`dist/github-toolkit.user.js` 44.70 kB，`@version 1.4.1`）。两轮 jsdom 夹具共 34 条断言全部通过（临时目录已删除、`jsdom` 已 `--no-save` 卸载）：
  - Fork 下拉 24 条：按钮文本为空（不再溢出）、`title` 正确、是 `<button>` 且无 `href`、保留原生 `Button` class + `Button--iconOnly`；菜单挂在 body、表头含 `me/r`、2 个菜单项且 href 正确、右对齐（`left=920px`）、下方 6px（`top=138px`）；`Esc` 关闭并复位 `aria-expanded`；toggle 收起；点外部关闭；下方空间不足翻上（`top=514px`）；`onDisable` 后按钮与菜单都清除。
  - 入口与面板 10 条：入口在 header 内、无浮动球、面板右对齐（`left=860px`）、下方 8px（`top=140px`）、插件列表与版本号正常、`Esc` 关闭；面板与 Fork 菜单**不同时存在**（互斥生效）。
- **涉及文件与位置**：`src/core/dropdown.ts`（新增）、`src/core/position.ts`（新增）、`src/core/ui-manager.ts`（`place()` 改用 `placeAnchored`）、`src/plugins/go-to-my-fork.ts`（`injectButton` 改下拉、`removeButtons` 收起菜单、`version`/`description`）、`src/main.ts`（`openPanel` 互斥、`TOOLKIT_VERSION`）、`package.json`、`vite.config.ts`、`dist/*`
- **已知取舍**：入口变为纯图标后，新用户可能不知道它是干什么的——靠 `title`/`aria-label` 悬停提示补偿。若你希望保留文字，可把 `label` 加回来但必须同时给按钮补 `white-space: nowrap`，代价是宽度大于原生 Fork 按钮。

#### 按钮 1:1 原生 + 移除浮动球 + 面板定位重做（1.3.1 → 1.4.0）

- **问题一**：Fork 按钮与原生仍有差异（高度、内边距、图标间距）。根因是之前只复制 class 名再自己拼 `<svg>+<span>`，缺 Primer 的 `Button-content` / `Button-visual` / `Button-label` 三层结构——尺寸与间距全挂在这三层上。
- **问题二**：右下角固定浮动球（52px 圆形 + emoji + 绿色实底）与 GitHub 视觉语言不符，且常驻遮挡内容。
- **修改内容**：
  - 新增 `src/core/native-button.ts`：`createNativeButton()` **整颗 `cloneNode(true)`** 克隆页面上真实按钮，然后做最小化清洗与改字——
    - `sanitize()` 递归剥掉 `id` / `data-*` / `aria-labelledby` / `disabled` 等身份属性（避免与 GitHub 自身逻辑冲突）；`href` 也先剥再按需重设。
    - `stripTemplateNoise()` 移除模板自身的 `.Button-count` / `.Counter` / `.social-count` / `.dropdown-caret` / `details`。
    - `setLabel()` 优先改写 `[class*="Button-label"]`；旧版 `btn` 无该层时保留图标、在 svg 后追加文本节点。
    - `dropLabel()` 对 iconOnly 模式删除 label，并用 `TreeWalker` 清掉所有裸文本节点（旧版 `btn` 文字直接挂在 `<a>` 上，只删 `Button-label` 会残留）。
    - `replaceIcon()` 替换模板自带 octicon；标签语义按需在 `<a>` / `<button>` 间切换，`<button>` 自动补 `type="button"`。
    - iconOnly 时自动补 `Button--iconOnly`（新 UI）或 `btn-octicon`（旧 UI），并写 `aria-label`。
    - 导出 `findHeaderSlot()` 统一仓库头插入点（`repo-header-actions` / `.pagehead-actions` / `#repository-details-container ul` / `#repository-container-header .d-flex`）。
  - `go-to-my-fork`：`createForkButton` / `borrowNativeClassName` / `NATIVE_STYLE_SELECTORS` / `FALLBACK_BTN_CSS` / 本地 `CANDIDATES` 全部删除，改用 `createNativeButton({ label: '我的 Fork', iconHtml: FORK_ICON })`；`findTarget` 转为 `findHeaderSlot` 的薄包装。`BTN_CLASS` / `WRAP_CLASS` / 稳定等待 / 自愈守卫逻辑不变。
  - `main.ts`：**删除 FAB 及其 `setInterval` 复活定时器**。入口改为仓库头里的原生图标按钮（`TOOLS_ICON` + iconOnly），非仓库页挂到顶栏用户区；`page:change` 时重新选点，另有 500ms 去抖的 MutationObserver 自愈。油猴菜单命令保留作兜底。
  - `ui-manager.ts`：面板改为**锚定触发按钮的 popover**——右对齐触发按钮、默认在下方 8px，下方空间不足自动翻到上方，并在视口内做 `clamp`；移动端（≤544px）贴底全宽；`Esc` 关闭、点击外部关闭、再次点击同一入口收起；`resize` / `scroll` 时跟随重定位。面板样式全面改用 GitHub 主题变量（`--bgColor-default` / `--borderColor-default` / `--shadow-overlay` / `--fgColor-muted` 等），标题改为次要色小字，关闭按钮改为 28px 方形 hover 高亮。toast 从右下角改为底部居中。
  - 删除已无调用方的 `UIManager.createButton()` 及其 `gh-toolkit-btn` 样式；`PluginContext.ui` 类型同步收敛。
  - 项目与插件版本 1.3.1 → 1.4.0。
- **验证**：`npx tsc --noEmit` 退出码 0；`npm run build` 成功（`dist/github-toolkit.user.js` 36.89 kB，`@version 1.4.0`；产物中已无 `gh-toolkit-fab`）。三轮 jsdom 夹具共 54 条断言全部通过（临时目录已删除、`jsdom` 已 `--no-save` 卸载）：
  - `native-button` 26 条：Primer 模板下 class 完全一致、三层结构齐全、label 正确改写、计数徽标剥离、`data-*`/`aria-*` 清除、仅一个 svg、`<a>` 语义；旧版模板下复用 `btn btn-sm` + `btn-octicon`、文本彻底清空、图标替换为 sliders、无 `id` 残留、`<button type=button>` + `aria-label`；无模板时降级 `btn btn-sm`。
  - `go-to-my-fork` 12 条：class 与原生 Fork 按钮逐字相同、`Button-content`/`Button-visual`/`Button-label` 齐全、文案「我的 Fork」、无计数器、无 `data-testid`、href 正确、位于 `repo-header-actions` 内；header 重渲染后自愈补回且结构仍完整。
  - `main` 16 条：无 `.gh-toolkit-fab`、仓库页入口在 header、入口为原生 Button 且纯图标；面板右对齐（`left=860px` 与期望一致）、下方 8px（`top=140px`）、Esc 关闭、toggle 收起、下方空间不足翻到上方（`top=392px`）、左边界 clamp 到 12px、插件列表与版本号正常渲染。
- **涉及文件与位置**：`src/core/native-button.ts`（新增）、`src/core/ui-manager.ts`（重写面板/移除 FAB 与 createButton）、`src/main.ts`（入口重构、版本常量）、`src/plugins/go-to-my-fork.ts`（改用原生工厂、删除旧样式代码）、`src/types.ts`（`ui.showPanel` 增 anchor、移除 `createButton`）、`package.json`、`vite.config.ts`、`dist/*`
- **已知取舍**：整颗克隆依赖页面存在可克隆的原生按钮；若极端情况下取不到模板会降级为旧版 `btn btn-sm`（外观接近旧 GitHub）。克隆出的按钮会继承模板的 `Button--small` 等尺寸变体，若 GitHub 把仓库头按钮尺寸改版，我们的按钮会自动跟随，无需改代码。

#### go-to-my-fork · 等页面与 header 稳定后再注入，消除「出现→消失→再出现」（1.3.0 → 1.3.1）

- **现象**：进入仓库页时按钮先出现一次，随即消失，过一会儿又出现。
- **根因**：`activate()` 在首屏 React 树还没渲染完时就 `injectButton()`，插进的是临时 header；随后 React 用真实 header 整块替换，按钮被吞，`startGuard` 再补回，于是表现为两次出现。另外原守卫只比较「目标元素是否同一个节点」，无法识别 React **就地重渲染**（同一 header 节点只换 children）的情况。
- **修改内容**：
  - 新增 `waitForLoad()`：等 `load`（并兼容 `turbo:load` / `soft-nav:end`），带 8s 上限；`readyState === 'complete'` 时直接返回，软导航不额外等待。
  - 新增 `waitForStableTarget(ctx, mySeq)`：在 `load` 之后轮询（250ms）目标插入点，同时要求**两个条件**才认为稳定——① 连续 3 次命中同一个 DOM 节点（防整块替换）；② 该节点内部连续轮询没有 `childList` 变动（防就地重渲染，用临时 `MutationObserver` 监听目标子树）。超时 12s 后返回 `findTarget(ctx)` 的真实结果。
  - `activate()` 改为先 `await waitForStableTarget()` 再注入；期间若 `seq` 变化（导航）立即放弃。稳定超时才降级为 `forceFallback` 浮层。
  - `startGuard()` 的自愈补回也先 `await waitForStableTarget()`，避免补到一半又被替换造成二次闪烁；新增 `guardBusy` 串行化，防止多个 MutationObserver 回调并发补插。
  - `stopGuard()` 同步重置 `guardBusy`；守卫内所有异步路径都校验 `guardKey` / `seq`，导航后旧任务自动失效。
  - `waitForStableTarget` 里的 observer 用 `holder.obs` 对象持有（TS 会把闭包内被重新赋值的 `let obs` 收窄成 `never`，直接 `obs?.disconnect()` 编译不过）。
  - 插件版本 1.3.0 → 1.3.1，项目版本 1.3.0 → 1.3.1。
- **验证**：`npx tsc --noEmit` 退出码 0；`npm run build` 成功（`dist/github-toolkit.user.js` 28.65 kB，`@version 1.3.1`）。jsdom 夹具 10 条断言全部通过（临时目录已删除、`jsdom` 已 `--no-save` 卸载），其中用 15ms 采样记录按钮出现/消失时间线：
  - 首屏 header 整块替换 3 次：`appear=1`，时间线仅 `APPEAR@1351ms`，无 GONE。
  - header 就地重渲染 2 次（同一节点换 children）：`appear=1`，时间线仅 `APPEAR@1045ms`。
  - header 延迟 1.2s 才渲染：期间不使用兜底浮层，header 出现后插入到 `repo-header-actions` 内，首次可见时间 1807ms。
  - 插入后 header 再重渲染：仍能自愈补回。
  - 自己的仓库：不插入。
- **涉及文件与位置**：`src/plugins/go-to-my-fork.ts`（`guardBusy`、`STABLE_POLL_MS`/`STABLE_HITS`/`STABLE_TIMEOUT_MS`/`sleep`/`waitForLoad`/`waitForStableTarget`、`stopGuard`、`startGuard`、`activate`、`version`）、`package.json`、`vite.config.ts`、`dist/*`
- **已知取舍**：注入会比页面加载晚约 0.75–1s（需连续 3 次轮询确认稳定），换来的是不闪烁。若 GitHub 首屏持续渲染超过 12s，会走超时分支直接插入并退化为固定浮层。

#### 移除三个插件 + Fork 按钮改为 GitHub 原生风格（1.2.2 → 1.3.0）

- **功能**：只保留「跳转到我的 Fork」，其余三个插件删除；按钮外观从自绘蓝底改为复用 GitHub 原生按钮样式。
- **修改内容**：
  - 删除 `src/plugins/copy-code.ts`、`src/plugins/copy-title-link.ts`、`src/plugins/repo-quick-info.ts`；`src/plugins/index.ts` 的 `builtinPlugins` / `DEFAULT_ENABLED` 同步收敛为仅 `go-to-my-fork`。
  - `src/core/ui-manager.ts` 移除仅供 copy-code 使用的 `.gh-toolkit-copy-btn` 样式。
  - `go-to-my-fork` 按钮改为「借用原生 class」：新增 `NATIVE_STYLE_SELECTORS` + `borrowNativeClassName()`，按 `a[data-testid="fork-button"]` → 仓库头其他 `a`/`button` → `.pagehead-actions > li > a` → `a.btn.btn-sm` → `.Button.Button--secondary` 顺序取原生 `class`，过滤 `gh-toolkit-*` 前缀后套用到按钮上，让深浅色主题、hover、focus ring 全部由 GitHub 自身 CSS 负责。
  - 新增 `createForkButton()` 统一造按钮：始终输出 `<a>`，内容为官方 `octicon-repo-forked` + `前往我的 Fork` 文本（`fill="currentColor"` 继承文字色），去掉 emoji 与 `#1f6feb` 硬编码。
  - 找不到任何可克隆的原生按钮时降级为 `btn btn-sm` + `FALLBACK_BTN_CSS`（颜色一律走 `var(--fgColor-default)` 等主题变量，不写死）。
  - `FALLBACK_CSS`（body 固定浮层）改为只追加 `position/top/right/z-index/box-shadow`，不再覆盖颜色，浮层按钮也保持原生外观。
  - `BTN_CLASS` / `WRAP_CLASS` 保持不变，`startGuard` 自愈、`removeButtons`、`onDisable` 不受影响。
  - `main.ts` 面板标题与启动日志版本号同步为 1.3；`README.md` 插件清单与项目结构同步；项目版本 1.2.2 → 1.3.0，插件版本 1.2.0 → 1.3.0。
- **验证**：`npx tsc --noEmit` 退出码 0；`npm run build` 成功（`dist/github-toolkit.user.js` 25.87 kB，`@version 1.3.0`）；构建产物中已确认无 `copy-code` / `copy-title` / `repo-quick-info` / `gh-toolkit-copy` / `1f6feb` 残留。jsdom 夹具 17 条断言全部通过（临时目录已删除、`jsdom` 已 `--no-save` 卸载）：
  - 新 UI：复用 `Button Button--secondary Button--small`、无 `data-testid` 污染、无内联颜色、含 `octicon-repo-forked`、无 emoji、文案正确、`<a>` 指向自己的 fork、header 重渲染后仍能自动补回。
  - 旧 UI：注入到 `li.gh-toolkit-my-fork-li` 内、复用 `.btn.btn-sm`、无内联颜色。
  - 无原生按钮可克隆：降级为 `btn btn-sm`、颜色走 `var(--…)`、无硬编码蓝色。
- **涉及文件与位置**：`src/plugins/go-to-my-fork.ts`（`FALLBACK_BTN_CLASS`/`FORK_ICON`/`FALLBACK_BTN_CSS`、`NATIVE_STYLE_SELECTORS`、`borrowNativeClassName`、`createForkButton`、`injectButton`、`version`）、`src/plugins/index.ts`、`src/core/ui-manager.ts`、`src/main.ts`、`README.md`、`package.json`、`vite.config.ts`、`dist/*`
- **已知取舍**：借用原生 class 依赖 GitHub 现有 DOM；若某天 header 结构大改导致取不到 class，会自动降级到 `btn btn-sm`，此时外观接近旧版 GitHub 按钮而非当前版本。另外「前往我的 Fork」在 clone 出的 `Button` 布局里是 `<span>` 包裹，若 GitHub 调整 `Button-content` 内部结构，可能需要重新对齐 padding。

#### go-to-my-fork · 修复「显示一下按钮就消失」（1.2.1 → 1.2.2）

- **现象**：按钮出现后随即消失，控制台无报错。
- **根因**：GitHub 新版仓库头由 React/Turbo 托管，注入节点会被 header 重渲染整块替换掉；而 `PageRouter` 只在 URL 变化时触发 `page:change`，同页重渲染不会重新 `enable` 插件，因此按钮被吞掉后不会自己回来。另外 `onEnable` 在 `enable()` 里先于 `enabled.add(id)` 执行，`page:change` 的 `onPageChange` 也只在 URL 变化时才走到，跨仓库导航（A 仓库 → B 仓库）不会重算。
- **修改内容**：
  - 抽出 `activate(ctx, page)` 作为唯一入口：统一做 owner/repo 校验、自身仓库判断、`checkHasForked`，并用递增 `seq` 丢弃过期的异步结果（导航期间旧请求返回不会误插）。
  - `onEnable` 额外订阅 `page:change`（用 payload 里的 `page`，因为它比 `ctx.page` 更新——`pluginManager` 在 emit 之后才回写 `ctx.page`），实现跨仓库导航重算；`onDisable` 里解绑并 `seq += 1`。
  - 新增 `startGuard()`：`MutationObserver` 监听 body，去抖 300ms 后检查按钮是否还在；消失则用同一 URL 重插，实现「被 React 重渲染吞掉后自动补回」。
  - 防死循环：10 秒窗口内最多重插 5 次；连续 3 次失败改为固定右上角浮层（`data-fallback="forced"`），避免和 React 反复拉锯。
  - 抽出 `findTarget()` 返回 `{ target, mode }`，供注入与守卫复用；`injectButton()` 增加 `forceFallback` 参数，并给兜底按钮打 `data-fallback` 标记。
  - 兜底自愈：若首次注入时 header 尚未渲染而落到 `body` 固定浮层，后续 header 出现会自动摘掉浮层按钮并在原位重插。
  - `checkHasForked()` 增加 10 分钟内存缓存（`forkCache`），避免每次重渲染都打一次 GitHub API。
  - 按钮样式改由常量 `BASE_CSS` / `FALLBACK_CSS` 组合（原 `style.cssText +=` 在字符串拼接上容易丢分号），并补 `padding` / `border-radius` / `line-height` / `white-space`，避免贴边。
  - 移除了每次注入都弹的 `ctx.ui.toast()`（重渲染自愈会反复弹）。
  - 插件 `version` 1.1.0 → 1.2.0；项目版本 1.2.1 → 1.2.2。
- **验证**：`npx tsc --noEmit` 退出码 0；`npm run build` 成功（`dist/github-toolkit.user.js` 31.85 kB，`@version 1.2.2`）。jsdom 夹具两轮共 10 条断言全部通过（临时目录已删除、`jsdom` 已 `--no-save` 卸载）：
  - 第 1 轮（正常 header + API 403）：API 失败仍注入、插在 `fork-button` 之后、header 重渲染 1/2/3 次均自动补回、`onDisable` 后移除。
  - 第 2 轮（header 延迟渲染）：先 body 固定浮层兜底 → header 出现后挪回原位且不再固定定位；`page:change` 切到自己仓库后移除；再切到别的仓库后重新出现。
- **涉及文件与位置**：`src/plugins/go-to-my-fork.ts`（`BTN_CLASS`/`WRAP_CLASS`/`BASE_CSS`/`FALLBACK_CSS`/`TYPES`、`onEnable`/`onDisable`、`forkCache`+`checkHasForked`、`startGuard`/`stopGuard`/`removeButtons`/`activate`、`CANDIDATES`+`findTarget`/`injectButton`）、`package.json`、`vite.config.ts`、`dist/*`

#### go-to-my-fork · 插入位置与用户/Fork 检测加固（1.2.0 → 1.2.1）

- **功能**：GitHub 新版仓库页（`data-testid` 体系）下按钮常插不到或插到无关位置；API 限流/`@connect` 失败时按钮直接消失。本次改为优先命中新 UI 锚点、API 失败仍保留入口，并补强当前用户识别。
- **修改内容**：
  - `injectButton()`：候选选择器改为「新 UI 优先 + 旧 UI 兜底」顺序（`[data-testid="repo-header-actions"]` → `a[data-testid="fork-button"]` → Fork 所在 flex 行 → `#repo-title-component` → `.pagehead-actions` → `#repository-container-header .d-flex` → `#repository-details-container ul`）；引入 `insertMode`（`append` / `after-fork` / `prepend-ul`）区分插入方式；全部未命中时退化为 `document.body` + `position: fixed` 右上角浮层，保证入口可见。
  - `checkHasForked()`：抽出 `forkUrl` 常量；API 返回非 200、JSON 解析失败、`onerror`、`ontimeout` 以及同步抛错时统一 `resolve(forkUrl)`（仍给入口，点击 404 再处理）；仅当 API 明确返回「非 fork」才 `resolve(null)`。
  - `getCurrentUser()`：`user-login` / `octolytics-actor-login` 合并为一条 `||` 链并统一 `trim()`；新增 `[data-testid="github-avatar"][alt^="@"]` 头像兜底；新增 `a[href^="/"][data-hovercard-type="user"]` 侧栏/菜单个人主页链接兜底（排除 `settings` / `notifications` / `issues` / `pulls`）。
  - 按钮视觉由内联 SVG 改为 `🔀 前往我的 Fork` 文本 + emoji（去掉了原本路径数据有误的 SVG）。
  - 插件 `version` 1.0.0 → 1.1.0；项目版本 1.2.0 → 1.2.1。
- **验证**：`npx tsc --noEmit` 无输出（通过）；`npm run build` 成功（`dist/github-toolkit.user.js` 27.31 kB）；构建产物中已确认 `@version 1.2.1`、`@connect api.github.com`、`data-testid="repo-header-actions"`、`fork-button` 分支与「前往我的 Fork」文案存在。
- **涉及文件与位置**：`src/plugins/go-to-my-fork.ts`（`version`、`getCurrentUser`、`checkHasForked`、`injectButton`）、`package.json`（`version`）、`vite.config.ts`（`userscript.version`）、`dist/*`（构建产物）
- **已知取舍**：API 失败时按钮一律显示，可能出现「点了 404」的误报；若需严格模式，把 `checkHasForked` 中各失败分支的 `resolve(forkUrl)` 改为 `resolve(null)`。
