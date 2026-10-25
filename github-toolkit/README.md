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

- **上下游仓库绑定** — 自动检测当前仓库上游，维护「上游 → 下游 fork」绑定关系；左栏导航 + 右栏详情，支持一键绑定、手动绑定、打开/复制上游、移除下游
- **GitHub 加速** — 用自定义加速服务地址打开当前仓库，支持自定义服务地址

## 入口与界面

- 右下角可拖拽悬浮球（位置持久化），点击开关面板
- 兜底：油猴菜单「打开 GitHub Toolkit 面板」
- 面板为 400×560 双栏布局：左栏上游导航（选中项浅蓝底 + 蓝竖条），右栏详情（about / 下游列表 / 底部固定操作区）
- 蓝色主按钮全屏唯一，固定在右栏底部
- 站内链接走 Turbo 软导航，页面切换时面板保持打开
- 删除类操作均二次确认，确认弹窗贴合面板区域显示

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
dist/github-toolkit.meta.js
```

直接把该文件拖到 Tampermonkey 安装，或复制内容新建脚本。

## 项目结构

```
github-toolkit/
├── src/
│   ├── main.ts              # 入口，组装核心 + 注册插件 + 面板渲染
│   ├── types.ts             # Plugin / PluginContext / PanelTab 契约
│   ├── globals.d.ts         # GM_* 类型声明
│   ├── core/                # 平台层（与业务无关）
│   │   ├── event-bus.ts
│   │   ├── storage.ts
│   │   ├── router.ts
│   │   ├── dom-helper.ts
│   │   ├── logger.ts
│   │   ├── styles.ts            # 隔离样式表（#ghtk-root 作用域 + 自愈）
│   │   ├── ui-manager.ts        # 悬浮球（可拖拽）+ 面板 + Toast
│   │   ├── modal.ts             # 轻量确认/输入弹窗（跟随面板）
│   │   ├── navigate.ts          # Turbo 软导航
│   │   ├── github-api.ts        # 用户识别 / 仓库信息 / about / fork 检测
│   │   └── plugin-manager.ts
│   └── plugins/             # 业务插件（高内聚）
│       ├── index.ts
│       ├── upstream-bind.ts     # 上下游绑定（C 版双栏主从）
│       └── github-accel.ts      # 加速访问
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## 新增插件

1. 在 `src/plugins/` 新建文件，实现 `Plugin` 接口
2. 如需面板 Tab，提供 `panelTab: { id, label, render, mount }`
3. 在 `src/plugins/index.ts` 的 `builtinPlugins` 数组中注册
4. 如需默认开启，加入 `DEFAULT_ENABLED`

插件只通过 `PluginContext` 与核心交互，禁止互相直接调用。

## 开发约定

**修改代码前必读仓库根目录的 [`MODIFICATIONS.md`](../MODIFICATIONS.md)**，其中「规则」一节是强制约束，涵盖：样式隔离、控件尺寸、交互与视觉、文案、布局溢出、数据安全、架构约定、验证基线。修改后必须回填修改记录。

## License

MIT
