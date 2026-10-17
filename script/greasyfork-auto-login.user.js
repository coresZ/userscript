// ==UserScript==
// @name              GreasyFork 自动登录
// @name:en           GreasyFork Auto Login
// @namespace         GreasyFork
// @version            1.3.3
// @author             cores
// @description        自动登录（账号/密码/2FA）+ 设置面板；支持粘贴/上传二维码图片与 otpauth 链接；兼容 iOS Userscripts
// @description:en     Auto login + panel; paste/upload QR image or otpauth URI; iOS Userscripts compatible
// @license            GPL-3.0-only
// @match              *://greasyfork.org/*
// @match              *://sleazyfork.org/*
// @match              *://cn-greasyfork.org/*
// @require            https://fastly.jsdelivr.net/npm/otpauth@9.5.2/dist/otpauth.umd.min.js
// @require            https://fastly.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js
// @grant              GM_getValue
// @grant              GM_setValue
// @grant              GM_deleteValue
// @grant              GM_registerMenuCommand
// @grant              GM.getValue
// @grant              GM.setValue
// @grant              GM.deleteValue
// @grant              GM.registerMenuCommand
// @run-at             document-idle
// @downloadURL https://update.greasyfork.org/scripts/599434/GreasyFork%20%E8%87%AA%E5%8A%A8%E7%99%BB%E5%BD%95.user.js
// @updateURL https://update.greasyfork.org/scripts/599434/GreasyFork%20%E8%87%AA%E5%8A%A8%E7%99%BB%E5%BD%95.meta.js
// ==/UserScript==

(async function () {
  "use strict";

  /* =========================================================
   * 0. GM_* 运行时查找 + 内存缓存 + localStorage 兜底
   * 与「小米定位记录归档」同一套 gmApi 探测方式
   *
   * iOS Userscripts 只提供 GM.getValue / GM.setValue（异步 Promise），
   * 不提供同步 GM_getValue / GM_setValue。
   *   读：memCache → GM_getValue(桌面同步) → localStorage
   *   写：memCache + GM_setValue + GM.setValue + localStorage 全写
   *   启动时 await hydrateGM() 把已有值读进 memCache
   * ======================================================= */

  function gmApi(name) {
    try {
      if (name === "GM_getValue" && typeof GM_getValue === "function") return GM_getValue;
      if (name === "GM_setValue" && typeof GM_setValue === "function") return GM_setValue;
      if (name === "GM_deleteValue" && typeof GM_deleteValue === "function") return GM_deleteValue;
      if (name === "GM_addStyle" && typeof GM_addStyle === "function") return GM_addStyle;
      if (name === "GM_registerMenuCommand" && typeof GM_registerMenuCommand === "function")
        return GM_registerMenuCommand;
      if (name === "GM_xmlhttpRequest" && typeof GM_xmlhttpRequest === "function") return GM_xmlhttpRequest;
      if (name === "GM_listValues" && typeof GM_listValues === "function") return GM_listValues;
    } catch (_) {}

    const short =
      name.indexOf("GM_") === 0 ? name.slice(3, 4).toLowerCase() + name.slice(4) : name;
    try {
      if (typeof GM !== "undefined" && GM) {
        if (typeof GM[short] === "function") return GM[short].bind(GM);
        if (typeof GM[name] === "function") return GM[name].bind(GM);
      }
    } catch (_) {}

    const bags = [];
    try {
      if (typeof globalThis !== "undefined") bags.push(globalThis);
    } catch (_) {}
    try {
      if (typeof window !== "undefined") bags.push(window);
    } catch (_) {}
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow) bags.push(unsafeWindow);
    } catch (_) {}
    for (let i = 0; i < bags.length; i++) {
      const bag = bags[i];
      if (!bag) continue;
      try {
        if (typeof bag[name] === "function") return bag[name];
      } catch (_) {}
      try {
        if (typeof bag[short] === "function") return bag[short].bind(bag);
      } catch (_) {}
    }

    try {
      // eslint-disable-next-line no-eval
      const f = eval(name);
      if (typeof f === "function") return f;
    } catch (_) {}

    return null;
  }

  const LS_PREFIX = "gf_autologin_";
  const memCache = Object.create(null);

  const KEYS = {
    user: "user",
    pwd: "pwd",
    secret: "secret",
    enabled: "autoLogin",
  };

  const DEFAULTS = {
    [KEYS.enabled]: true,
    [KEYS.user]: "",
    [KEYS.pwd]: "",
    [KEYS.secret]: "",
  };

  // 裸标识符同步 API（桌面 Tampermonkey）
  function gmGetSync() {
    try {
      if (typeof GM_getValue === "function") return GM_getValue;
    } catch (_) {}
    return null;
  }
  function gmSetSync() {
    try {
      if (typeof GM_setValue === "function") return GM_setValue;
    } catch (_) {}
    return null;
  }
  function gmDelSync() {
    try {
      if (typeof GM_deleteValue === "function") return GM_deleteValue;
    } catch (_) {}
    return null;
  }
  // GM 对象异步 API（iOS Userscripts）
  function gmGetAsync() {
    try {
      if (typeof GM !== "undefined" && GM && typeof GM.getValue === "function")
        return GM.getValue.bind(GM);
    } catch (_) {}
    return null;
  }
  function gmSetAsync() {
    try {
      if (typeof GM !== "undefined" && GM && typeof GM.setValue === "function")
        return GM.setValue.bind(GM);
    } catch (_) {}
    return null;
  }
  function gmDelAsync() {
    try {
      if (typeof GM !== "undefined" && GM && typeof GM.deleteValue === "function")
        return GM.deleteValue.bind(GM);
    } catch (_) {}
    return null;
  }

  function lsGet(key) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      if (raw === null) return undefined;
      return JSON.parse(raw);
    } catch (_) {
      return undefined;
    }
  }
  function lsSet(key, value) {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    } catch (_) {}
  }
  function lsDel(key) {
    try {
      localStorage.removeItem(LS_PREFIX + key);
    } catch (_) {}
  }

  const gm = {
    getValue(key, def) {
      if (key in memCache) return memCache[key];
      const syncFn = gmGetSync();
      if (syncFn) {
        try {
          const v = syncFn(key, undefined);
          // 拒绝 Promise（误把异步返回当值）
          if (v !== undefined && !(v && typeof v.then === "function")) {
            memCache[key] = v;
            return v;
          }
        } catch (_) {}
      }
      const ls = lsGet(key);
      if (ls !== undefined) {
        memCache[key] = ls;
        return ls;
      }
      return def;
    },
    setValue(key, value) {
      memCache[key] = value;
      const syncFn = gmSetSync();
      if (syncFn) {
        try {
          const r = syncFn(key, value);
          if (r && typeof r.then === "function") r.catch(() => {});
        } catch (_) {}
      }
      const asyncFn = gmSetAsync();
      if (asyncFn) {
        try {
          const r = asyncFn(key, value);
          if (r && typeof r.then === "function") r.catch(() => {});
        } catch (_) {}
      }
      lsSet(key, value);
    },
    deleteValue(key) {
      delete memCache[key];
      const syncFn = gmDelSync();
      if (syncFn) {
        try {
          const r = syncFn(key);
          if (r && typeof r.then === "function") r.catch(() => {});
        } catch (_) {}
      }
      const asyncFn = gmDelAsync();
      if (asyncFn) {
        try {
          const r = asyncFn(key);
          if (r && typeof r.then === "function") r.catch(() => {});
        } catch (_) {}
      }
      lsDel(key);
    },
    addStyle(css) {
      const fn = gmApi("GM_addStyle");
      if (fn) {
        try {
          return fn(css);
        } catch (_) {}
      }
      try {
        const s = document.createElement("style");
        s.type = "text/css";
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
        return s;
      } catch (_) {
        return null;
      }
    },
    registerMenuCommand(label, fn) {
      const r = gmApi("GM_registerMenuCommand");
      if (!r) return null;
      try {
        return r(label, fn);
      } catch (_) {
        return null;
      }
    },
  };

  try {
    console.log("[GF AutoLogin] boot", {
      href: location.href,
      hasGetSync: !!gmGetSync(),
      hasSetSync: !!gmSetSync(),
      hasGetAsync: !!gmGetAsync(),
      hasSetAsync: !!gmSetAsync(),
      hasMenu: !!gmApi("GM_registerMenuCommand"),
      hasStyle: !!gmApi("GM_addStyle"),
    });
  } catch (_) {}

  async function hydrateGM(keys) {
    const readAsync = gmGetAsync();
    const readSync = gmGetSync();
    for (const k of keys) {
      if (k in memCache) continue;
      let v;
      try {
        if (readSync) {
          v = readSync(k, undefined);
          if (v && typeof v.then === "function") v = await v;
        } else if (readAsync) {
          const r = readAsync(k, undefined);
          v = r && typeof r.then === "function" ? await r : r;
        }
      } catch (_) {}
      if (v === undefined || v === null) v = lsGet(k);
      if (v !== undefined && v !== null) memCache[k] = v;
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(LS_PREFIX)) continue;
        const realKey = k.slice(LS_PREFIX.length);
        if (realKey in memCache) continue;
        const v = lsGet(realKey);
        if (v !== undefined) memCache[realKey] = v;
      }
    } catch (_) {}
    try {
      console.log("[GF AutoLogin] hydrate", { keys: Object.keys(memCache).length });
    } catch (_) {}
  }

  await hydrateGM([KEYS.user, KEYS.pwd, KEYS.secret, KEYS.enabled]);

  function get(key) {
    const def = DEFAULTS[key] !== undefined ? DEFAULTS[key] : "";
    const v = gm.getValue(key, def);
    return v === undefined || v === null ? def : v;
  }
  function set(key, value) {
    gm.setValue(key, value);
  }
  function isNull(v) {
    return v === null || v === undefined || String(v).trim() === "";
  }

  /**
   * 从纯 Secret / otpauth:// URI / 含 secret= 的文本中提取 Base32 密钥
   * 二维码扫出来通常是：otpauth://totp/GreasyFork:you@mail?secret=XXXX&issuer=...
   */
  function normalizeSecret(raw) {
    let s = String(raw || "").trim();
    if (!s) return "";
    // 完整 otpauth 链接
    if (/^otpauth:\/\//i.test(s)) {
      try {
        const u = new URL(s);
        const sec = u.searchParams.get("secret");
        if (sec) s = sec;
      } catch (_) {
        const m = s.match(/[?&]secret=([A-Za-z2-7=]+)/i);
        if (m) s = m[1];
      }
    } else if (/secret\s*=/i.test(s)) {
      const m = s.match(/secret\s*=\s*([A-Za-z2-7=]+)/i);
      if (m) s = m[1];
    }
    return s.replace(/\s+/g, "").toUpperCase();
  }

  function decodeQrFromImageFile(file) {
    return new Promise((resolve, reject) => {
      if (typeof jsQR !== "function") {
        reject(new Error("jsQR 未加载"));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const maxSide = 1200;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxSide || h > maxSide) {
            const scale = maxSide / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth",
          });
          URL.revokeObjectURL(url);
          if (code && code.data) resolve(code.data);
          else reject(new Error("未识别到二维码，请换更清晰的截图"));
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片加载失败"));
      };
      img.src = url;
    });
  }

  /* ============================================================
   * UI：Toast + 浮动入口 + 设置面板（移动端可用）
   * ============================================================ */
  const STYLE_ID = "gf-autologin-style";
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
#gf-al-fab {
  position: fixed;
  right: 14px;
  bottom: max(18px, env(safe-area-inset-bottom, 0px) + 14px);
  z-index: 2147483646;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  color: #fff;
  background: linear-gradient(135deg, #670000, #a10);
  box-shadow: 0 8px 24px rgba(103,0,0,.45);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;
}
#gf-al-fab:active { transform: scale(.94); }

#gf-al-mask {
  position: fixed; inset: 0;
  z-index: 2147483646;
  background: rgba(15,23,42,.55);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 12px;
  padding-bottom: max(12px, env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}
@media (min-width: 560px) {
  #gf-al-mask { align-items: center; }
}

#gf-al-panel {
  width: min(420px, 100%);
  max-height: min(92vh, 100%);
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 16px;
  border: 1px solid rgba(148,163,184,.22);
  box-shadow: 0 24px 60px rgba(0,0,0,.45);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.45;
  /* 滚动条：无轨道背景，仅细滑块 */
  scrollbar-width: thin;
  scrollbar-color: rgba(148,163,184,.35) transparent;
}
#gf-al-panel::-webkit-scrollbar {
  width: 4px;
  height: 4px;
  background: transparent;
}
#gf-al-panel::-webkit-scrollbar-track,
#gf-al-panel::-webkit-scrollbar-track-piece,
#gf-al-panel::-webkit-scrollbar-corner {
  background: transparent !important;
  border: none;
  box-shadow: none;
}
#gf-al-panel::-webkit-scrollbar-thumb {
  background: rgba(148,163,184,.35);
  border-radius: 4px;
  border: none;
  background-clip: padding-box;
}
#gf-al-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(148,163,184,.5);
}
#gf-al-panel * { box-sizing: border-box; }
#gf-al-panel .hd {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 12px 14px 8px;
  border-bottom: 1px solid rgba(148,163,184,.15);
  background: #0f172a;
}
#gf-al-panel .hd h3 { margin: 0; font-size: 15px; font-weight: 700; }
#gf-al-panel .hd .close {
  border: none; background: transparent; color: #94a3b8;
  font-size: 22px; line-height: 1; cursor: pointer; padding: 4px 8px;
  -webkit-tap-highlight-color: transparent;
}
#gf-al-panel .bd { padding: 8px 14px 14px; }
#gf-al-panel label {
  display: block; font-size: 12px; color: #94a3b8; margin: 8px 0 4px;
}
#gf-al-panel label[for="gf-al-user"] { margin-top: 2px; }
#gf-al-panel input[type="text"],
#gf-al-panel input[type="password"],
#gf-al-panel input[type="email"] {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(148,163,184,.28);
  background: rgba(2,6,23,.55);
  color: #f1f5f9;
  font-size: 15px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}
#gf-al-panel input:focus {
  border-color: #f87171;
  box-shadow: 0 0 0 3px rgba(248,113,113,.2);
}
#gf-al-panel .row-switch {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 10px; padding: 6px 0;
}
#gf-al-panel .row-switch span { font-size: 14px; color: #e2e8f0; }
#gf-al-panel .switch {
  position: relative; width: 46px; height: 28px; flex-shrink: 0;
}
#gf-al-panel .switch input { opacity: 0; width: 0; height: 0; }
#gf-al-panel .switch .slider {
  position: absolute; inset: 0; border-radius: 999px;
  background: #334155; transition: .2s; cursor: pointer;
}
#gf-al-panel .switch .slider::before {
  content: ""; position: absolute;
  width: 22px; height: 22px; left: 3px; top: 3px;
  border-radius: 50%; background: #fff; transition: .2s;
}
#gf-al-panel .switch input:checked + .slider { background: #dc2626; }
#gf-al-panel .switch input:checked + .slider::before { transform: translateX(18px); }
#gf-al-panel .hint {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 11.5px;
  color: #94a3b8;
  line-height: 1.55;
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.16);
}
#gf-al-panel .hint code {
  display: inline;
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.45);
  border: 1px solid rgba(248, 113, 113, 0.28);
}
#gf-al-panel .actions {
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;
}
#gf-al-panel .btn {
  flex: 1; min-width: 96px;
  padding: 10px 12px; border-radius: 10px; border: none;
  font-size: 14px; font-weight: 600; cursor: pointer;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
#gf-al-panel .btn-primary {
  background: linear-gradient(135deg, #991b1b, #dc2626); color: #fff;
}
#gf-al-panel .btn-ghost {
  background: rgba(51, 65, 85, 0.6); color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.22);
}
#gf-al-panel .btn-danger {
  background: rgba(69, 10, 10, 0.55); color: #fecaca;
  border: 1px solid rgba(248, 113, 113, 0.28);
}
#gf-al-panel .btn:active { opacity: .88; }
#gf-al-panel .secret-tools {
  display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;
}
#gf-al-panel .btn-file {
  position: relative; overflow: hidden;
  flex: 1; min-width: 140px;
  padding: 10px 12px; border-radius: 10px;
  border: 1px dashed rgba(248, 113, 113, 0.35);
  background: rgba(69, 10, 10, 0.35); color: #fecaca;
  font-size: 13px; font-weight: 600; text-align: center;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
#gf-al-panel .btn-file input {
  position: absolute; inset: 0; opacity: 0; cursor: pointer;
  width: 100%; height: 100%;
  font-size: 32px;
}
#gf-al-panel .btn-file:active,
#gf-al-panel .btn-file.drag-over {
  background: rgba(127, 29, 29, 0.5);
  border-color: rgba(248, 113, 113, 0.55);
}
#gf-al-panel .qr-drop {
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px dashed rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.65);
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
  line-height: 1.45;
  transition: border-color .15s, background .15s;
}
#gf-al-panel .qr-drop.drag-over {
  border-color: rgba(248, 113, 113, 0.55);
  background: rgba(69, 10, 10, 0.35);
  color: #fecaca;
}
#gf-al-panel .qr-status {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: #94a3b8;
  min-height: 1.2em;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.12);
}
#gf-al-panel .qr-status:empty { display: none; }
#gf-al-panel .qr-status.ok {
  color: #86efac;
  background: rgba(20, 83, 45, 0.35);
  border-color: rgba(74, 222, 128, 0.25);
}
#gf-al-panel .qr-status.err {
  color: #fecaca;
  background: rgba(69, 10, 10, 0.4);
  border-color: rgba(248, 113, 113, 0.28);
}

.gf-al-toast {
  position: fixed;
  left: 50%;
  bottom: max(56px, env(safe-area-inset-bottom, 0px) + 56px);
  transform: translateX(-50%);
  z-index: 2147483647;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 14px;
  color: #fff;
  max-width: min(90vw, 360px);
  text-align: center;
  box-shadow: 0 8px 24px rgba(0,0,0,.3);
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.gf-al-toast.error { background: rgba(185,28,28,.94); }
.gf-al-toast.success { background: rgba(22,163,74,.94); }
.gf-al-toast.info { background: rgba(30,41,59,.94); }
`;
    const style = gm.addStyle(css);
    if (style && style.setAttribute) style.id = STYLE_ID;
    else if (style && style.id !== undefined) style.id = STYLE_ID;
    // gm.addStyle 无返回节点时再兜底一次并打标
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement("style");
      s.id = STYLE_ID;
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    }
  }

  function toast(msg, type) {
    injectStyle();
    const el = document.createElement("div");
    el.className = "gf-al-toast " + (type || "info");
    el.textContent = msg;
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), type === "error" ? 4200 : 2600);
    return el;
  }

  let $mask = null;

  function closePanel() {
    if ($mask) {
      $mask.remove();
      $mask = null;
    }
  }

  function openPanel() {
    injectStyle();
    closePanel();

    $mask = document.createElement("div");
    $mask.id = "gf-al-mask";
    $mask.innerHTML = `
      <div id="gf-al-panel" role="dialog" aria-modal="true" aria-label="GreasyFork 自动登录设置">
        <div class="hd">
          <h3>GreasyFork 自动登录</h3>
          <button type="button" class="close" aria-label="关闭">×</button>
        </div>
        <div class="bd">
          <label for="gf-al-user">账号（邮箱）</label>
          <input id="gf-al-user" type="email" inputmode="email" autocomplete="username" placeholder="you@example.com" />

          <label for="gf-al-pwd">密码</label>
          <input id="gf-al-pwd" type="password" autocomplete="current-password" placeholder="登录密码" />

          <label for="gf-al-secret">两步验证 Secret</label>
          <input id="gf-al-secret" type="text" inputmode="text" autocomplete="one-time-code" placeholder="Base32 密钥，或粘贴 otpauth:// 链接" spellcheck="false" />
          <div class="secret-tools">
            <label class="btn-file" id="gf-al-file-label">
              📷 选择二维码图片
              <input id="gf-al-qr" type="file" accept="image/*" />
            </label>
          </div>
          <div class="qr-drop" id="gf-al-qr-drop">
            也可在此处或输入框内 <b style="color:#e2e8f0">Ctrl+V / ⌘+V 粘贴图片</b> 或拖放截图
          </div>
          <div class="qr-status" id="gf-al-qr-status"></div>

          <div class="row-switch">
            <span>启用自动登录</span>
            <label class="switch">
              <input id="gf-al-enabled" type="checkbox" />
              <span class="slider"></span>
            </label>
          </div>

          <p class="hint">
            可上传/粘贴二维码图，或把 <code>otpauth://…</code> 贴进上方（自动提取 secret）。配置仅存本机。
          </p>

          <div class="actions">
            <button type="button" class="btn btn-primary" id="gf-al-save">保存</button>
            <button type="button" class="btn btn-ghost" id="gf-al-login-now">立即登录</button>
            <button type="button" class="btn btn-danger" id="gf-al-clear">清空</button>
          </div>
        </div>
      </div>
    `;

    document.documentElement.appendChild($mask);

    const $user = $mask.querySelector("#gf-al-user");
    const $pwd = $mask.querySelector("#gf-al-pwd");
    const $secret = $mask.querySelector("#gf-al-secret");
    const $enabled = $mask.querySelector("#gf-al-enabled");
    const $qr = $mask.querySelector("#gf-al-qr");
    const $qrStatus = $mask.querySelector("#gf-al-qr-status");

    $user.value = get(KEYS.user) || "";
    $pwd.value = get(KEYS.pwd) || "";
    $secret.value = get(KEYS.secret) || "";
    $enabled.checked = !!get(KEYS.enabled);

    const $drop = $mask.querySelector("#gf-al-qr-drop");
    const $fileLabel = $mask.querySelector("#gf-al-file-label");

    const applySecretInput = (raw, source) => {
      const sec = normalizeSecret(raw);
      if (!sec) {
        $qrStatus.className = "qr-status err";
        $qrStatus.textContent = "未能解析出 Secret，请检查内容";
        return false;
      }
      $secret.value = sec;
      $qrStatus.className = "qr-status ok";
      $qrStatus.textContent =
        (source ? source + " · " : "") +
        "已提取 Secret（" +
        sec.slice(0, 4) +
        "…" +
        sec.slice(-4) +
        "）";
      return true;
    };

    const handleQrPayload = (data, source) => {
      console.info("[GF AutoLogin] QR payload:", data);
      if (!applySecretInput(data, source || "二维码识别")) {
        $qrStatus.className = "qr-status err";
        $qrStatus.textContent =
          "二维码内容不是标准 2FA（otpauth），原文：" + String(data).slice(0, 80);
        return false;
      }
      toast("已从二维码提取 Secret", "success");
      return true;
    };

    const processImageBlob = async (blob, source) => {
      if (!blob) return;
      $qrStatus.className = "qr-status";
      $qrStatus.textContent = "正在识别二维码…";
      try {
        // File 继承 Blob，decodeQrFromImageFile 可用
        const file =
          blob instanceof File
            ? blob
            : new File([blob], "paste.png", { type: blob.type || "image/png" });
        const data = await decodeQrFromImageFile(file);
        handleQrPayload(data, source || "图片识别");
      } catch (e) {
        console.error("[GF AutoLogin] QR", e);
        $qrStatus.className = "qr-status err";
        $qrStatus.textContent = (e && e.message) || "识别失败";
        toast((e && e.message) || "二维码识别失败", "error");
      }
    };

    const extractImageFromClipboard = (clipboardData) => {
      if (!clipboardData) return null;
      const items = clipboardData.items || clipboardData.files;
      if (!items) return null;
      // DataTransferItemList
      if (clipboardData.items) {
        for (let i = 0; i < clipboardData.items.length; i++) {
          const it = clipboardData.items[i];
          if (it.type && it.type.indexOf("image/") === 0) {
            return it.getAsFile();
          }
        }
      }
      // files
      if (clipboardData.files && clipboardData.files.length) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          const f = clipboardData.files[i];
          if (f.type && f.type.indexOf("image/") === 0) return f;
        }
      }
      return null;
    };

    const onPasteEvent = (e) => {
      const img = extractImageFromClipboard(e.clipboardData);
      if (img) {
        e.preventDefault();
        e.stopPropagation();
        processImageBlob(img, "粘贴图片");
        return;
      }
      // 文本：等默认粘贴完成后再解析 otpauth
      setTimeout(() => {
        const v = $secret.value;
        if (/otpauth:\/\//i.test(v) || /secret\s*=/i.test(v)) {
          applySecretInput(v, "粘贴解析");
        }
      }, 0);
    };

    // 面板内任意位置粘贴图片均可
    $mask.querySelector("#gf-al-panel").addEventListener("paste", onPasteEvent);
    $secret.addEventListener("paste", onPasteEvent);

    $secret.addEventListener("change", () => {
      const v = $secret.value;
      if (/otpauth:\/\//i.test(v) || /secret\s*=/i.test(v)) {
        applySecretInput(v, "已解析");
      }
    });

    $qr.addEventListener("change", async () => {
      const file = $qr.files && $qr.files[0];
      $qr.value = "";
      if (!file) return;
      await processImageBlob(file, "选择图片");
    });

    // 拖放图片到虚线区 / 上传按钮
    const bindDropTarget = (el) => {
      if (!el) return;
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove("drag-over");
        const f =
          extractImageFromClipboard(e.dataTransfer) ||
          (e.dataTransfer.files && e.dataTransfer.files[0]);
        if (f && f.type && f.type.indexOf("image/") === 0) {
          processImageBlob(f, "拖放图片");
        } else {
          toast("请拖放图片文件", "error");
        }
      });
    };
    bindDropTarget($drop);
    bindDropTarget($fileLabel);

    $mask.querySelector(".close").addEventListener("click", closePanel);
    $mask.addEventListener("click", (e) => {
      if (e.target === $mask) closePanel();
    });

    $mask.querySelector("#gf-al-save").addEventListener("click", () => {
      set(KEYS.user, String($user.value || "").trim());
      set(KEYS.pwd, String($pwd.value || ""));
      set(KEYS.secret, normalizeSecret($secret.value));
      set(KEYS.enabled, !!$enabled.checked);
      $secret.value = get(KEYS.secret);
      toast("已保存配置", "success");
    });

    $mask.querySelector("#gf-al-clear").addEventListener("click", () => {
      if (!window.confirm("确定清空账号 / 密码 / Secret？")) return;
      gm.deleteValue(KEYS.user);
      gm.deleteValue(KEYS.pwd);
      gm.deleteValue(KEYS.secret);
      $user.value = "";
      $pwd.value = "";
      $secret.value = "";
      $qrStatus.className = "qr-status";
      $qrStatus.textContent = "";
      toast("已清空账号信息", "success");
    });

    $mask.querySelector("#gf-al-login-now").addEventListener("click", async () => {
      set(KEYS.user, String($user.value || "").trim());
      set(KEYS.pwd, String($pwd.value || ""));
      set(KEYS.secret, normalizeSecret($secret.value));
      set(KEYS.enabled, true);
      $enabled.checked = true;
      closePanel();
      await autoLogin({ force: true });
    });

    // 移动端自动聚焦第一个空字段
    setTimeout(() => {
      if (!$user.value) $user.focus();
      else if (!$pwd.value) $pwd.focus();
    }, 200);
  }

  function removeFab() {
    const el = document.getElementById("gf-al-fab");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function ensureFab() {
    // 已登录时不需要入口（设置仍可从油猴菜单打开）
    if (isLoggedIn()) {
      removeFab();
      return;
    }
    injectStyle();
    if (document.getElementById("gf-al-fab")) return;
    const btn = document.createElement("button");
    btn.id = "gf-al-fab";
    btn.type = "button";
    btn.title = "GreasyFork 自动登录设置";
    btn.setAttribute("aria-label", "打开自动登录设置");
    btn.textContent = "🔑";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel();
    });
    document.documentElement.appendChild(btn);
  }

  /* 油猴菜单：经 gmApi 探测；移动端仍以 FAB 为主入口 */
  gm.registerMenuCommand("⚙ 打开设置面板", openPanel);
  gm.registerMenuCommand("🔑 立即尝试登录", () => autoLogin({ force: true }));

  /* ============================================================
   * 登录逻辑
   * ============================================================ */
  function localePrefix() {
    const m = location.pathname.match(/^\/([a-z]{2}(?:-[A-Z]{2})?)\b/);
    if (m) return "/" + m[1];
    const htmlLang = document.documentElement.getAttribute("lang");
    if (htmlLang) return "/" + htmlLang.replace("_", "-");
    return "/zh-CN";
  }

  function isLoggedIn() {
    return !!document.querySelector(
      ".sign-out-link a[rel=nofollow][data-method='delete'], #nav-user-info span.user-profile-link a"
    );
  }

  function needLogin() {
    return !!document.querySelector("span.sign-in-link a[rel=nofollow]");
  }

  function getOtpLib() {
    try {
      if (typeof OTPAuth !== "undefined" && OTPAuth) return OTPAuth;
    } catch (_) {}
    return window.OTPAuth || null;
  }

  let loggingIn = false;

  async function autoLogin(opts) {
    const force = opts && opts.force;
    if (loggingIn) return;
    if (!force && !get(KEYS.enabled)) return;
    if (isLoggedIn()) {
      if (force) toast("当前已登录", "info");
      return;
    }
    if (!force && !needLogin()) return;

    const user = get(KEYS.user);
    const pwd = get(KEYS.pwd);
    const secret = normalizeSecret(get(KEYS.secret));

    if (isNull(user)) {
      toast("请先打开设置填写账号", "error");
      openPanel();
      return;
    }
    if (isNull(pwd)) {
      toast("请先打开设置填写密码", "error");
      openPanel();
      return;
    }
    if (isNull(secret)) {
      toast("请先打开设置填写 2FA Secret（或上传二维码）", "error");
      openPanel();
      return;
    }

    const csrfMeta = document.querySelector("meta[name='csrf-token']");
    if (!csrfMeta || !csrfMeta.getAttribute("content")) {
      toast("获取 csrf-token 失败", "error");
      return;
    }
    const csrfToken = csrfMeta.getAttribute("content");

    let otpPwd;
    try {
      const lib = getOtpLib();
      if (!lib || !lib.TOTP) {
        toast("TOTP 库加载失败（检查 @require）", "error");
        return;
      }
      otpPwd = new lib.TOTP({ secret: secret }).generate();
    } catch (e) {
      console.error("[GF AutoLogin] TOTP", e);
      toast("生成验证码失败，请检查 Secret 是否为有效 Base32", "error");
      return;
    }

    loggingIn = true;
    const tip = toast("正在登录中…", "info");
    const prefix = localePrefix();
    const body = new URLSearchParams({
      authenticity_token: csrfToken,
      "user[email]": user,
      "user[password]": pwd,
      "user[remember_me]": "1",
      "user[otp_attempt]": otpPwd,
      commit: "登录",
    });

    try {
      const resp = await fetch(prefix + "/users/sign_in", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "text/html",
        },
        body: body.toString(),
        redirect: "follow",
      });

      if (tip && tip.remove) tip.remove();

      const text = await resp.text();
      const doc = new DOMParser().parseFromString(text, "text/html");
      const signedOut = doc.querySelectorAll(
        ".sign-out-link a[rel=nofollow][data-method='delete']"
      );

      if (
        signedOut.length ||
        document.querySelector(".sign-out-link a[rel=nofollow][data-method='delete']") ||
        (resp.ok && resp.redirected)
      ) {
        removeFab();
        toast("登录成功，1 秒后刷新", "success");
        setTimeout(() => location.reload(), 1000);
        return;
      }

      const alertEl = doc.querySelector(".width-constraint .alert, .flash, .alert");
      if (alertEl && alertEl.textContent.trim()) {
        toast(alertEl.textContent.trim(), "error");
        console.error("[GF AutoLogin] alert", alertEl.textContent);
        return;
      }

      if (resp.status >= 200 && resp.status < 400) {
        toast("登录请求已发送，尝试刷新…", "success");
        setTimeout(() => location.reload(), 800);
        return;
      }

      toast("登录失败，请检查账号/密码/验证码", "error");
      console.error("[GF AutoLogin] fail", { status: resp.status });
    } catch (e) {
      if (tip && tip.remove) tip.remove();
      console.error("[GF AutoLogin] request", e);
      toast("登录失败，请求异常", "error");
    } finally {
      loggingIn = false;
    }
  }

  /* ============================================================
   * 启动
   * ============================================================ */
  ensureFab();
  setTimeout(() => autoLogin({ force: false }), 400);
})();
