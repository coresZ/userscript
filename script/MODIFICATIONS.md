# MODIFICATIONS.md — script 目录

## 规则

- 本目录为油猴脚本仓库，每个 `.user.js` / `.js` 文件独立生效，改动仅针对单文件，无需递增目录级版本号（脚本内 `@version` 由功能变更时手动维护）。
- 新增/删除脚本后同步更新 `readme.md` 的脚本清单表。

## 修改记录

### greasyfork-auto-login.user.js · 已登录时隐藏悬浮入口（v1.3.2 → v1.3.3）

- **功能**：登录成功后不再显示右下角 `#gf-al-fab`（🔑 悬浮按钮）；未登录页面保持原样，作为配置/登录入口。
- **修改内容**：
  - 新增 `removeFab()`：按 id 移除悬浮按钮（带 `parentNode` 判空）。
  - `ensureFab()` 开头改为先判断 `isLoggedIn()`：已登录则 `removeFab()` 后直接返回，不再注入样式与按钮；未登录才注入 `#gf-al-fab`。
  - `autoLogin()` 命中登录成功分支时立即 `removeFab()`，覆盖「登录成功但尚未 reload」的 1 秒窗口。
  - 已登录状态下仍可通过油猴菜单「⚙ 打开设置面板」修改账号/密码/Secret（`registerMenuCommand` 不受影响）。
  - `@version` 同步为 `1.3.3`。
- **验证**：`node --check` 通过；jsdom 夹具 11 条断言全部通过（未登录：FAB 存在/挂载在 `documentElement`/样式注入含 `#gf-al-fab` 规则/注册 2 个菜单；已登录：FAB 不存在/菜单仍注册/菜单可打开面板/关闭面板后 FAB 仍不出现），临时测试目录已删除。
- **涉及文件与位置**：`greasyfork-auto-login.user.js`（元数据 `@version`；`removeFab`、`ensureFab`；`autoLogin` 登录成功分支）

### xShare.user.js · 分享菜单新增「打开链接」（v6.11 → v6.12）

- **功能**：在 X 原生「分享」下拉菜单里，于前两项之后追加第三项 `打开链接`，在新窗口（新标签页）打开该帖子的永久链接。
- **修改内容**：
  - 新增图标 `ICONS.openLink`（外链箭头）；新增常量 `SHARE_LINK_LABEL` / `SHARE_LINK_TIP`。
  - 新增 `openTweetLink(article)`：复用 `extractTweetData(article).link` 取规范化永久链接（已排除引用推文与媒体链接），失败时退回当前 `location`；以 `window.open(url, '_blank', 'noopener,noreferrer')` 打开并置空 `opener`。
  - `buildShareMenuItem` 增加 `immediate` 参数：`window.open` 必须在用户手势内同步调用，故该项跳过原有的 60ms 延时，避免被浏览器当弹窗拦截；卡片/视频两项仍保持延时调用。
  - `@version` 与面板版本徽标同步为 `6.12`。
- **验证**：`node --check` 通过；jsdom 夹具 19 条断言全部通过（新增：同步调用 `window.open`、URL 为帖子永久链接、`_blank`+`noopener`、三项图标互不相同），临时测试目录已删除。
- **涉及文件与位置**：`xShare.user.js`（`ICONS`；分享菜单集成区块的常量、`openTweetLink`、`buildShareMenuItem`、`injectShareMenuItems`；`@version` 与面板徽标）

### xShare.user.js · 入口整合进 X 原生分享菜单（v6.10 → v6.11）

- **功能**：把原来插在推文动作栏（点赞/转发那一行）的两个圆形图标按钮，改为注入 X 原生「分享」下拉菜单，作为两个菜单项；两项文案按要求各改为 4 个字。
- **修改内容**：
  - 新增「分享」菜单集成逻辑：捕获阶段监听分享按钮点击 → 记住所属推文（菜单是 portal，脱离 `article`）→ 菜单出现后克隆一个原生 `[role="menuitem"]` 并替换图标/文案，保证深浅色主题样式与 X 一致；支持 React 重渲染后自动补回，且通过「分享帖子 via…」文案识别，不会误注入「更多 ⋯」菜单。
  - 菜单项文案：`生成卡片`（原「生成推文 / 文章分享卡片」）、`视频下载`（原「解析提取真实视频链接并下载」）；原长描述保留为 `title` 悬浮提示。
  - 移除动作栏注入（`injectButtons`、`processed`、`.sc-action-wrap`、`.sc-gen-btn` 及相关样式）。
  - 文章页悬浮按钮同步改名：`生成文章卡片` → `文章卡片`（位置与独立性不变）。
  - 新增 `.sc-menu-item` / `.sc-menu-item-fallback` 样式；`@version` 与面板版本徽标同步为 `6.11`。
- **验证**：`node --check` 通过；用 jsdom 夹具跑了 16 条断言（菜单项注入、4 字文案、`<a>` 转 `div`、图标/文案替换、点击回调带上正确推文、重渲染补回、无关菜单不注入）全部通过，临时测试目录已删除。
- **涉及文件与位置**：`xShare.user.js`（元数据 `@version`/`@description`；`injectArticleFab`；`injectButtons` 所在区块整体替换为分享菜单集成；`GM_addStyle` 中的按钮样式；文件末尾初始化与 `MutationObserver`）

### 文档 · README 生成（2026-09-11）

- **功能**：为 script 目录生成说明文档。
- **修改内容**：扫描目录内 7 个文件，依据各脚本 UserScript 元数据块（@name/@version/@match/@description）整理出脚本清单、用处说明、使用方式与文件命名约定。
- **涉及文件与位置**：
  - `readme.md`（新建）
  - `MODIFICATIONS.md`（新建，本文件）
