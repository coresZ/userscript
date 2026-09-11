# script 目录说明

本目录存放个人使用的**油猴脚本（Tampermonkey / Violentmonkey UserScripts）**，均为浏览器前端增强类脚本，按目标站点各自独立、互不依赖。

## 脚本清单

| 文件 | 名称 / 版本 | 适用站点 | 用处 |
|---|---|---|---|
| `dy-snapAny.user.js` | SnapAny 视频/音频下载增强器 v2.7.0 | snapany.com | 在 SnapAny 解析页注入下载按钮：多线程 Range 分片并发下载（带真实百分比进度），自动回退 GM_download / 单线程直链；多分辨率增强、大文件超限降级、iOS 分享流程；视频/音频链接一键复制 |
| `dyjx.user.js` | 抖音下载 v1.0.9 | douyin.com | 为网页版抖音增加下载按钮，下载前二次确认（文件名过长自动截断），图集超过 9 张时打包 ZIP 下载（依赖 jszip） |
| `linux.js` | LINUX DO 截图分享 v3.8 | linux.do/t/* | 对 linux.do 帖子页做离屏 DOM 克隆 + html2canvas 截图，附件原位保留站点图标、完整链接放底部说明，结果写入剪贴板便于分享 |
| `meiguodizhi-autofill.user.js` | 美国地址生成器 · 通用一键填充 v1.2.0 | 任意网站 | 以 meiguodizhi.com 为数据源，悬浮球一键拉取并填充虚拟身份/地址；支持收藏管理、使用记录、白/黑名单、按站点字段映射（数据为该站声明的虚构测试数据） |
| `meiguodizhi-autofill.user.js.bak` | 同上 v1.0.0 | — | 旧版本备份，仅作回滚参考 |
| `wencai2.js` | TradingView A 股 v1.5.10 | tradingview.com（chart / watchlists / screener） | 给 TradingView 增加同花顺自选同步、问财分组导入和拼音搜索；内置轻量"完整图表"跳转按钮；依赖 preact / htm / lodash / lscache |
| `xShare.user.js` | X 推文一键生成分享卡片 v4.5 | x.com / twitter.com | 将推文渲染为极简分享卡片并截图导出：自定义文件名、统一图标风格、t.co 短链后台还原为原始完整网址（依赖 html2canvas） |

## 使用方式

1. 安装 Tampermonkey 或 Violentmonkey；
2. 新建脚本并粘贴对应 `.user.js` 内容（或拖入浏览器安装）；
3. 各脚本头部 `// ==UserScript==` 元数据块中已声明 `@match` 生效域名与 `@require` 外部依赖，首次使用需联网加载 CDN 依赖。

## 约定

- `*.user.js`：可直接安装的标准油猴脚本；
- `*.js`：同样按 UserScript 元数据块编写（`linux.js`、`wencai2.js`），安装方式相同；
- `*.bak`：历史版本备份，不用于安装。
