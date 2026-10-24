# WebdevComponent 接入蓝皮书

> 组件版本：**1.4.1**  
> 目标：用最少代码获得完整可用的 WebDAV 云端备份  
> 原则：**上传给文件，下载得文件**；接入方只关心数据进出，不碰网络与加密

---

## 1. 一句话接入

```js
const webdev = WebdevComponent.createWebdev({
  storage: { get, set },       // 建议提供
  exportPayload() { ... },     // 必选：上传时给数据
  importPayload(data) { ... }  // 必选：下载时吃数据
  // request 可省略（v1.4.1+ 内置 GM 适配器）
});

webdev.openPanel();                 // 打开设置面板
// 或
webdev.registerButton({ fab: true }); // 菜单 + 悬浮球
```

接入方**不必**再写：

- `request` / `GM_xmlhttpRequest` 包装
- 下载后的写库逻辑（交给 `importPayload`）
- 加密 / PUT / GET / 账号导入导出 UI

---

## 2. 权限声明（写在主脚本，不写在库里）

`webdev-component` 经 `@require` 引入时，**库头上的 `@grant` / `@connect` 不会生效**。  
权限必须写在**业务主脚本**的元数据里：

```js
// ==UserScript==
// @name         你的脚本
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand   // 若要用油猴菜单
// @connect      *                        // 或具体 WebDAV 域名
// @require      https://.../webdev-component.js
// ==/UserScript==
```

| 声明 | 谁写 | 说明 |
|------|------|------|
| `@grant GM_xmlhttpRequest` | **主脚本** | 内置请求适配器依赖它 |
| `@connect *` 或具体域名 | **主脚本** | 允许跨域访问 WebDAV |
| 库内 `@grant none` | 组件自己 | 表示不替你申请权限 |

不要把 `@grant` / `@connect` 指望写进组件库——写了也没用。

---

## 3. 适配器说明

### 3.1 storage（配置持久化）

只存服务器地址、账号、密码、文件名、是否加密、加密口令，**不存业务数据**。

```js
// localStorage
const storage = {
  get(key, def) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : def;
    } catch (e) { return def; }
  },
  set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
};

// 油猴推荐
const storage = {
  get: (k, d) => GM_getValue(k, d),
  set: (k, v) => GM_setValue(k, v)
};
```

iOS Userscripts 上若 GM 写入不可靠，可 GM + localStorage 双写（读取时优先返回含账号信息的那份）。

### 3.2 request（网络请求）— 可省略

**默认：** 不传时自动探测并使用

- `GM_xmlhttpRequest`
- `GM.xmlHttpRequest`
- `globalThis` / `unsafeWindow` / `window` 上的同名函数

**需要自己传的情况：**

- 非油猴环境（用 `fetch`）
- 自定义 header / 代理 / 重试
- 内置探测失败

接口约定：

```js
function request(opts) {
  // opts: { method, url, headers, data?, timeout?, acceptStatuses? }
  // 返回 Promise<{ status, responseText, response }>
}
```

### 3.3 exportPayload（上传时给数据）

必须返回**字符串**（通常是 JSON）：

```js
exportPayload() {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    items: myLibrary.getAll()
  });
}
```

### 3.4 importPayload（下载时吃数据）

下载成功 → 解密 → `JSON.parse` 之后调用：

```js
importPayload(data, pack) {
  // data  = 解析后的对象
  // pack  = { text, encrypted, url, data, items, imported }
  if (!data || !Array.isArray(data.items)) {
    throw new Error('备份格式不正确');
  }
  myLibrary.replaceAll(data.items);
  // 可选：返回值会并入 pack，供 onDownloaded / UI 使用
  return { items: data.items.length };
}
```

提供后，用户点「下载备份」会自动写入本地。  
不提供则只返回 pack，兼容旧接入（需在 `onDownloaded` 里自己写库）。

**迁法：** 把原来写在 `onDownloaded` 里的 merge/save **搬到** `importPayload`，不要两边都写。总代码不应变多。

---

## 4. 完整最小示例

```js
// ==UserScript==
// @name         我的库 + WebDAV 备份
// @namespace    example
// @version      1.0
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      *
// @require      https://your-cdn/webdev-component.js
// ==/UserScript==

(function () {
  'use strict';

  const myLib = {
    getAll() { return GM_getValue('my_items', []); },
    replaceAll(items) { GM_setValue('my_items', items); }
  };

  const webdev = WebdevComponent.createWebdev({
    key: 'myapp_webdav_v1',
    defaultFile: 'myapp-backup.json',
    storage: {
      get: (k, d) => GM_getValue(k, d),
      set: (k, v) => GM_setValue(k, v)
    },
    // request 省略 → 用内置 GM 适配器
    exportPayload() {
      return JSON.stringify({
        app: 'myapp',
        version: 1,
        exportedAt: new Date().toISOString(),
        items: myLib.getAll()
      });
    },
    importPayload(data) {
      if (!data || !Array.isArray(data.items)) {
        throw new Error('备份缺少 items 数组');
      }
      myLib.replaceAll(data.items);
      return { items: data.items.length };
    }
  });

  webdev.registerButton({
    fab: true,
    position: 'br',
    text: '备份',
    menuOpen: '打开云端备份设置',
    menuExport: '导出 WebDAV 账号',
    menuImport: '导入 WebDAV 账号'
  });
})();
```

---

## 5. 进阶用法

### 5.1 打开面板 + 回调

```js
webdev.openPanel({
  description: '同步收藏与黑名单，不含下载记录。',
  onUploaded(r) {
    // r: { url, bytes, encrypted }
  },
  onDownloaded(pack) {
    // 有 importPayload 时：这里只做 UI 刷新，不要再 merge
    // pack.imported === true 表示已写入
  },
  onSave(settings) {
    // 账号保存后
  }
});
```

### 5.2 绑定已有按钮

```js
webdev.bindButton('#my-backup-btn');
webdev.bindButton(document.querySelector('.settings-btn'));
```

### 5.3 手动调底层 API

```js
await webdev.testConnection();
await webdev.uploadLibrary();          // 内部调 exportPayload
const pack = await webdev.downloadLibrary(); // 内部调 importPayload
console.log(pack.imported);

webdev.downloadAccountFile();
await webdev.downloadAccountFileEncrypted('口令');
await webdev.pickAndImportAccount();
```

### 5.4 覆盖底层方法

```js
const original = webdev.downloadLibrary;
webdev.downloadLibrary = async function (opts) {
  const pack = await original.call(this, opts);
  // 额外逻辑
  return pack;
};
```

---

## 6. 配置项一览

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `key` | string | `webdev_opts_v1` | 配置在 storage 中的 key |
| `defaultFile` | string | `webdev-backup.json` | 默认备份文件名 |
| `encMark` | string | `webdev-aes-gcm-v1` | 加密包识别标记 |
| `accountMark` | string | `webdev-account-v1` | 账号导出标记 |
| `legacyKeys` | string[] | `[]` | 旧配置 key，自动迁移 |
| `storage` | `{get,set}` | 空实现 | 配置持久化 |
| `request` | function | **内置 GM 适配器** | 油猴可省略 |
| `exportPayload` | function | null | 上传数据源 |
| `importPayload` | function | null | 下载数据接收器 |
| `menu` | boolean | true | 是否自动尝试注册油猴菜单 |
| `registerMenu` | function | 自动探测 | 自定义菜单注册 |

---

## 7. 加密说明

- 算法：AES-256-GCM  
- 密钥派生：PBKDF2-SHA256，120000 次迭代  
- 口令至少 4 位  
- 密文仍是合法 JSON（含 `enc` / `salt` / `iv` / `ct`）  
- 账号文件可单独加密导出：`downloadAccountFileEncrypted`

开启后上传/下载自动加解密，业务无感知。

---

## 8. 常见问题

**Q：`@grant` / `@connect` 要写在组件库里吗？**  
A：不要。写在主脚本。库经 `@require` 引入时，库头权限不会合并到主脚本。

**Q：还要自己写 `webdevRequest` 吗？**  
A：v1.4.1 起不必。删掉自写的 request，让组件用内置适配器即可。特殊需求再覆盖。

**Q：下载后提示「未配置 importPayload，数据仅返回」？**  
A：只传了 `exportPayload`。补上 `importPayload`，并把原来 `onDownloaded` 里的写库逻辑搬过去。

**Q：接了 importPayload 代码怎么更多了？**  
A：迁法不对。应是**搬家**（onDownloaded → importPayload），不是两边都留 merge。迁对后行数持平或更少。

**Q：跨域 / CORS？**  
A：主脚本加 `@grant GM_xmlhttpRequest` 与 `@connect *`（或具体域名）。

**Q：数据必须是 `{ items: [] }` 吗？**  
A：不必。组件只负责传输与解密；形状由 `importPayload` 自己解释。

**Q：想备份多份文件？**  
A：多个 `createWebdev` 实例，不同 `key` / `defaultFile`。

---

## 9. 版本演进

| 版本 | 变化 |
|------|------|
| 1.3.1 | iOS crypto 隔离修复；菜单探测增强 |
| 1.3.2 | 移动端响应式 UI、触控与 safe-area |
| 1.4.0 | `importPayload`，闭环「上传给文件 / 下载得文件」 |
| **1.4.1** | **内置默认 GM 请求适配器，`request` 可省略** |

---

## 10. 接入完成检查清单

- [ ] 主脚本声明 `@grant GM_xmlhttpRequest`（或自传 `request`）
- [ ] 主脚本声明 `@connect`（`*` 或 WebDAV 域名）
- [ ] 提供了 `storage`（或接受空实现）
- [ ] 提供了 `exportPayload`，返回合法 JSON 字符串
- [ ] 提供了 `importPayload`，能正确写入本地库
- [ ] `onDownloaded` 只做 UI，不再重复 merge（若已用 importPayload）
- [ ] 已删除自写的 `webdevRequest`（若无特殊需求）
- [ ] 测试连接成功
- [ ] 上传后远端可见文件
- [ ] 下载后本地数据正确更新
- [ ]（可选）开启加密后上传/下载正常

全部勾选即可视为接入完成。
