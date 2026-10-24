# GitHub Toolkit

高内聚、低耦合的 GitHub 模块化油猴脚本（Tampermonkey / Violentmonkey）。

构建产物为单个 `.user.js` 文件，可直接安装。

## 技术栈

| 层级 | 选型 | 说明 |
|------|------|------|
| 语言 | TypeScript | 类型安全，插件契约清晰 |
| 构建 | Vite 6 | 极速开发与打包 |
| 油猴适配 | vite-plugin-monkey | 自动生成 UserScript 头、HMR、按需 grant |
| 运行时 | 原生 DOM + Class | 无 React/Vue，产物小、无依赖冲突 |
| 架构 | 核心平台 + 插件 | EventBus 通信，生命周期管理 |

## 功能插件

- **跳转到我的 Fork** — 别人仓库页自动检测已 Fork，在仓库操作区注入一个与原生一致的 fork 图标下拉入口

> 说明：v1.3.0 起移除了「代码复制按钮」「仓库快捷信息」「复制标题+链接」三个插件（GitHub 原生已提供同类能力），仅保留 Fork 跳转。

## 入口与界面

- 仓库页：仓库头操作区里的原生图标按钮（sliders octicon），点击展开设置面板
- 非仓库页：顶栏用户区同一图标
- 兜底：Tampermonkey 菜单「打开 GitHub Toolkit 面板」
- Fork 入口为纯图标下拉（避免文字撑破按钮），菜单含「打开我的 Fork」与「对比上游变更」
- 所有浮层（面板、下拉）共用 `position.ts` 的锚定规则：右对齐触发按钮、下方展开，空间不足自动翻上/贴边；移动端面板贴底全宽；`Esc` 或点击外部关闭
- 面板与 Fork 菜单互斥，不会同时出现
- 所有页面内按钮均由 `src/core/native-button.ts` 整颗克隆页面真实按钮生成，与 GitHub 原生外观保持一致

## 开发

```bash
# 安装依赖
npm install

# 开发模式（浏览器安装临时脚本后 HMR）
npm run dev

# 构建生产脚本
npm run build
```

构建完成后产物位于：

```
dist/github-toolkit.user.js
```

直接把该文件拖到 Tampermonkey 安装，或复制内容新建脚本。

## 项目结构

```
github-toolkit/
├── src/
│   ├── main.ts              # 入口，组装核心 + 注册插件
│   ├── types.ts             # Plugin / PageContext 契约
│   ├── core/                # 平台层（与业务无关）
│   │   ├── event-bus.ts
│   │   ├── storage.ts
│   │   ├── router.ts
│   │   ├── dom-helper.ts
│   │   ├── ui-manager.ts
│   │   ├── native-button.ts     # 克隆原生按钮，保证 1:1 外观
│   │   ├── dropdown.ts          # 原生风格下拉菜单
│   │   ├── position.ts          # 浮层锚定定位（面板/下拉共用）
│   │   ├── plugin-manager.ts
│   │   └── logger.ts
│   └── plugins/             # 业务插件（高内聚）
│       ├── index.ts
│       └── go-to-my-fork.ts
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## 新增插件

1. 在 `src/plugins/` 新建文件，实现 `Plugin` 接口
2. 在 `src/plugins/index.ts` 的 `builtinPlugins` 数组中注册
3. 如需默认开启，加入 `DEFAULT_ENABLED`

插件只通过 `PluginContext` 与核心交互，禁止互相直接调用。

## License

MIT
