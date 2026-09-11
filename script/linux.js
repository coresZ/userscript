// ==UserScript==
// @name         LINUX DO 截图分享
// @namespace    https://linux.do/
// @version      3.8
// @description  离屏克隆；附件原位保留站点图标，完整链接放底部额外说明
// @author       Cores
// @match        https://linux.do/t/*
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* ===================== UI 样式 ===================== */
  GM_addStyle(`
    .ld-ss-btn{
      position:fixed;bottom:120px;right:24px;z-index:99999;
      width:52px;height:52px;border-radius:50%;border:none;
      background:#0088CC;color:#fff;cursor:pointer;
      box-shadow:0 4px 16px rgba(0,136,204,.4);
      display:flex;align-items:center;justify-content:center;
      transition:transform .2s,box-shadow .2s;user-select:none;
    }
    .ld-ss-btn:hover{transform:scale(1.08);box-shadow:0 6px 24px rgba(0,136,204,.55)}
    .ld-ss-btn:active{transform:scale(.92)}
    .ld-ss-btn svg{width:28px;height:28px;fill:currentColor}

    .ld-ss-menu{
      position:fixed;bottom:180px;right:24px;z-index:99998;
      min-width:180px;padding:8px 0;display:none;flex-direction:column;
      background:var(--secondary,#fff);border:1px solid var(--primary-low,#e9e9e9);
      border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.25);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    }
    .ld-ss-menu.show{display:flex}
    .ld-ss-menu .item{
      display:flex;align-items:center;gap:10px;padding:10px 18px;
      border:none;background:transparent;cursor:pointer;text-align:left;
      font-size:14px;font-weight:500;color:var(--primary,#222);
    }
    .ld-ss-menu .item:hover{background:var(--tertiary-low,#e2f0f9)}
    .ld-ss-menu .item .ic{width:24px;text-align:center;font-size:18px}
    .ld-ss-menu .item .lb{flex:1}
    .ld-ss-menu .item .sc{font-size:11px;color:var(--primary-medium,#888);font-weight:400}
    .ld-ss-menu .div{height:1px;margin:4px 12px;background:var(--primary-low,#e9e9e9)}

    .ld-ss-mask{
      position:fixed;inset:0;z-index:999999;display:none;
      align-items:center;justify-content:center;padding:20px;
      background:rgba(0,0,0,.6);backdrop-filter:blur(4px);
    }
    .ld-ss-mask.show{display:flex}
    .ld-ss-modal{
      width:800px;max-width:92vw;max-height:92vh;display:flex;flex-direction:column;
      background:var(--secondary,#fff);border:1px solid var(--primary-low,#e9e9e9);
      border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5);
    }
    .ld-ss-modal .hd{
      display:flex;align-items:center;justify-content:space-between;
      padding:16px 24px;border-bottom:1px solid var(--primary-low,#e9e9e9);
    }
    .ld-ss-modal .hd h3{margin:0;font-size:18px;color:var(--primary,#222)}
    .ld-ss-modal .hd .x{
      width:32px;height:32px;border:none;border-radius:50%;cursor:pointer;
      background:var(--primary-low,#e9e9e9);color:var(--primary,#222);font-size:18px;
    }
    .ld-ss-modal .bd{
      flex:1;min-height:200px;max-height:60vh;overflow:auto;padding:16px 24px;
      /* 不要用 align-items:center：长图会被垂直居中，看起来像从中间截的 */
      display:block;text-align:center;
      background:var(--secondary-very-low,#f8f8f8);
    }
    .ld-ss-modal .bd img{
      display:block;margin:0 auto;
      max-width:100%;height:auto;max-height:none;
      border-radius:8px;object-fit:contain;
      box-shadow:0 2px 8px rgba(0,0,0,.1);cursor:zoom-in;
    }
    .ld-ss-modal .ft{
      display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:10px;
      padding:14px 24px;border-top:1px solid var(--primary-low,#e9e9e9);
    }
    .ld-ss-modal .ft .info{flex:1;min-width:100px;font-size:13px;color:var(--primary-medium,#666)}
    .ld-ss-modal .ft .btn{
      padding:8px 18px;border:none;border-radius:8px;cursor:pointer;
      font-size:14px;font-weight:500;display:inline-flex;align-items:center;gap:6px;
    }
    .ld-ss-modal .ft .p{background:#0088CC;color:#fff}
    .ld-ss-modal .ft .s{background:#2b8c4a;color:#fff}
    .ld-ss-modal .ft .g{background:var(--primary-low,#e9e9e9);color:var(--primary,#222)}

    .ld-ss-toast{
      position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      z-index:9999999;padding:10px 22px;border-radius:10px;
      background:rgba(0,0,0,.78);color:#fff;font-size:14px;font-weight:500;
      pointer-events:none;opacity:0;transition:opacity .3s;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    }

    @media (max-width:600px){
      .ld-ss-btn{bottom:90px;right:16px;width:46px;height:46px}
      .ld-ss-menu{bottom:144px;right:16px}
      .ld-ss-modal{max-width:98vw;max-height:98vh}
      .ld-ss-modal .bd{max-height:50vh}
      .ld-ss-modal .ft{flex-direction:column;align-items:stretch}
    }
  `);

  const ICO = {
    cam: '<svg viewBox="0 0 24 24"><path d="M4 4h3l2-2h6l2 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>',
    dl: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v-2H5v2zm7-18v12.17l3.59-3.58L17 12l-5 5-5-5 1.41-1.41L12 14.17V2z"/></svg>',
    cp: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
  };

  /* ===================== 工具 ===================== */
  function toast(msg, ms = 2200) {
    document.querySelectorAll('.ld-ss-toast').forEach((n) => n.remove());
    const el = document.createElement('div');
    el.className = 'ld-ss-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, ms);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function isOurUi(el) {
    return !!(el && el.closest && el.closest('.ld-ss-btn, .ld-ss-menu, .ld-ss-mask, .ld-ss-toast, .ld-ss-work'));
  }

  /* ===================== 展开折叠 ===================== */
  function expandAll(root) {
    root.querySelectorAll('details').forEach((d) => {
      d.open = true;
      d.setAttribute('open', '');
    });
    root.querySelectorAll('.spoiler').forEach((el) => {
      el.classList.add('spoiled');
      el.style.filter = 'none';
      el.style.background = 'transparent';
    });
  }

  /* ===================== 核心：样式扁平化克隆 ===================== */

  /** 需要内联的关键样式（避免复制全部 300+ 属性导致过慢/过大） */
  const STYLE_KEYS = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'float', 'clear',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'box-sizing', 'overflow', 'overflow-x', 'overflow-y',
    'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
    'border-radius', 'border-collapse', 'border-spacing',
    'outline', 'outline-offset',
    'background', 'background-color', 'background-image', 'background-size',
    'background-position', 'background-repeat', 'background-clip',
    'color', 'opacity', 'visibility',
    'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
    'line-height', 'letter-spacing', 'word-spacing', 'white-space', 'word-break',
    'overflow-wrap', 'text-align', 'text-decoration', 'text-decoration-color',
    'text-decoration-line', 'text-decoration-style', 'text-transform',
    'text-indent', 'text-shadow', 'vertical-align', 'direction', 'unicode-bidi',
    'list-style', 'list-style-type', 'list-style-position', 'list-style-image',
    'table-layout', 'caption-side', 'empty-cells',
    'flex', 'flex-direction', 'flex-wrap', 'flex-flow', 'flex-grow', 'flex-shrink',
    'flex-basis', 'justify-content', 'align-items', 'align-content', 'align-self',
    'order', 'gap', 'row-gap', 'column-gap',
    'grid', 'grid-template', 'grid-template-columns', 'grid-template-rows',
    'grid-template-areas', 'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow',
    'grid-column', 'grid-row', 'grid-area',
    'transform', 'transform-origin', 'perspective',
    'box-shadow', 'filter', 'backdrop-filter', 'mix-blend-mode', 'isolation',
    'object-fit', 'object-position',
    'cursor', 'pointer-events', 'user-select',
    'z-index', 'content', 'quotes',
    'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
    'stroke-linejoin', 'stop-color', 'stop-opacity',
    'clip-path', 'mask', 'mask-image',
    'column-count', 'column-width', 'column-gap', 'column-rule',
    'writing-mode', 'text-orientation',
  ];

  /** 现代颜色函数 → 用 canvas 强制解析成 rgba() */
  const _colorCanvas = document.createElement('canvas');
  _colorCanvas.width = _colorCanvas.height = 1;
  const _colorCtx = _colorCanvas.getContext('2d', { willReadFrequently: true });
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function toSafeColor(value) {
    if (!value || value === 'none' || value === 'transparent') return value;
    if (/^(?:#|rgb|hsl|currentcolor|inherit|initial|unset|revert)/i.test(value.trim())) {
      // 仍可能是 color-mix / 嵌套，再过一遍
      if (!/(?:color-mix|color\(|oklch|oklab|hwb|(?:^|[^a-z-])lab\(|(?:^|[^a-z-])lch\()/i.test(value)) {
        return value;
      }
    }
    try {
      _colorCtx.clearRect(0, 0, 1, 1);
      _colorCtx.fillStyle = '#000';
      _colorCtx.fillStyle = value;
      _colorCtx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = _colorCtx.getImageData(0, 0, 1, 1).data;
      if (a === 0) return 'rgba(0,0,0,0)';
      if (a === 255) return `rgb(${r},${g},${b})`;
      return `rgba(${r},${g},${b},${+(a / 255).toFixed(3)})`;
    } catch (_) {
      return '#888888';
    }
  }

  function sanitizeStyleValue(prop, value) {
    if (!value || value === 'none') return value;
    // 含现代颜色的属性值统一处理
    if (/(?:color-mix|color\(|oklch|oklab|hwb|(?:^|[^a-z-])lab\(|(?:^|[^a-z-])lch\()/i.test(value)) {
      // 纯颜色属性
      if (/color|fill|stroke|flood|lighting|stop-color|caret|outline-color|column-rule-color|text-decoration-color|border-.*color|background-color/i.test(prop)) {
        return toSafeColor(value);
      }
      // 阴影 / 渐变等：尝试整体解析失败则丢弃
      if (/shadow/i.test(prop)) return 'none';
      if (/background-image|background$/i.test(prop) && /gradient|url\(/i.test(value)) {
        // 渐变里的现代色很难拆，退回纯色背景由 background-color 承担
        return 'none';
      }
      if (/border/i.test(prop)) {
        // border: 1px solid oklch(...) → 尽量保住宽度
        const w = value.match(/(\d+(?:\.\d+)?(?:px|em|rem)?)/);
        return w ? `${w[1]} solid #ccc` : 'none';
      }
      return toSafeColor(value);
    }
    return value;
  }

  function copyComputedStyle(src, dst) {
    const cs = window.getComputedStyle(src);
    for (let i = 0; i < STYLE_KEYS.length; i++) {
      const prop = STYLE_KEYS[i];
      let val = cs.getPropertyValue(prop);
      if (!val) continue;
      val = sanitizeStyleValue(prop, val);
      try {
        dst.style.setProperty(prop, val);
      } catch (_) { /* ignore invalid */ }
    }

    // 强制安全色（浏览器 getComputedStyle 多数已是 rgb，双保险）
    const colorProps = [
      'color', 'background-color',
      'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
      'outline-color', 'text-decoration-color', 'caret-color', 'column-rule-color',
      'fill', 'stroke', 'stop-color',
    ];
    for (const p of colorProps) {
      const v = cs.getPropertyValue(p);
      if (v) dst.style.setProperty(p, toSafeColor(v));
    }
  }

  function shouldSkipNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = node.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'NOSCRIPT' || tag === 'META') return true;
    if (isOurUi(node)) return true;
    const cs = window.getComputedStyle(node);
    if (cs.display === 'none') return true;
    return false;
  }

  // Preserve the original component identity when rebuilding the capture DOM.
  // Some Linux DO widgets keep visible content in class-dependent markup or
  // pseudo-elements, so computed styles alone are not sufficient.
  function copyCaptureAttributes(src, dst) {
    if (!src || !dst || !src.attributes) return;
    for (const attr of Array.from(src.attributes)) {
      const name = attr.name;
      if (name === 'style' || name === 'id' || name === 'class') continue;
      if (name === 'hidden' || name === 'inert' || name === 'autofocus') continue;
      if (/^(?:data-|aria-|role$|title$|type$|name$|value$|placeholder$|alt$|tabindex$|lang$)/i.test(name)) {
        try { dst.setAttribute(name, attr.value); } catch (_) { /* ignore */ }
      }
    }
    const classValue = src.getAttribute?.('class');
    if (classValue) dst.setAttribute('class', classValue);
  }

  function appendPseudoContent(src, dst, pseudo, atEnd) {
    try {
      const cs = window.getComputedStyle(src, pseudo);
      const content = cs && cs.content;
      if (!content || content === 'none' || content === 'normal' || content === '""' || content === "''") return;
      if (/^url\(/i.test(content) || /^(?:open|close)-quote$/i.test(content)) return;
      const text = content.replace(/^['"]|['"]$/g, '');
      if (!text || text.length >= 160) return;
      const span = document.createElement('span');
      span.textContent = text;
      span.style.cssText = 'display:inline;';
      if (cs.color) span.style.color = toSafeColor(cs.color);
      if (atEnd) dst.appendChild(span);
      else dst.insertBefore(span, dst.firstChild);
    } catch (_) { /* ignore */ }
  }

  // DButton labels can be supplied by a component/slot and may not survive a
  // manual child-node clone. Keep the visible button label as a last-resort
  // fallback so the button does not become an empty bordered rectangle.
  function appendButtonTextFallback(src, dst) {
    const isButton = src && (
      src.tagName === 'BUTTON' ||
      src.getAttribute?.('role') === 'button' ||
      src.classList?.contains('d-button')
    );
    if (!isButton || !dst) return;
    const sourceText = (src.innerText || src.textContent || '').replace(/\s+/g, ' ').trim();
    const clonedText = (dst.textContent || '').replace(/\s+/g, ' ').trim();
    if (!sourceText || clonedText) return;

    const label = src.querySelector?.('.d-button-label, [data-label]') || src;
    const span = document.createElement('span');
    copyComputedStyle(label, span);
    span.textContent = sourceText;
    span.style.setProperty('display', 'inline');
    span.style.setProperty('width', 'auto');
    span.style.setProperty('height', 'auto');
    span.style.setProperty('margin', '0');
    span.style.setProperty('padding', '0');
    span.style.setProperty('position', 'static');
    span.style.setProperty('transform', 'none');
    span.style.setProperty('visibility', 'visible');
    span.style.setProperty('opacity', '1');
    dst.appendChild(span);
  }

  const FILE_EXT_RE = /\.(zip|rar|7z|tar|gz|tgz|bz2|xz|7zip|iso|dmg|exe|msi|apk|ipa|pdf|doc|docx|xls|xlsx|ppt|pptx|csv|json|xml|txt|md|log|bin|dat|pkg|deb|rpm|wasm|whl|jar|war)(?:\.[a-z0-9]+)?$/i;
  const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)(\?|#|$)/i;

  function isImageUrl(url) {
    return !!(url && IMAGE_EXT_RE.test(url));
  }

  function looksLikeFileName(text) {
    const t = (text || '').trim();
    if (!t || t.length > 240) return false;
    return FILE_EXT_RE.test(t) || /\.(zip|rar|7z|tar|gz|tgz)(\.|$)/i.test(t);
  }

  function parseSizeText(text) {
    const m = (text || '').match(/\(?\s*([\d.]+\s*[KMGT]?B)\s*\)?/i);
    return m ? m[1].replace(/\s+/g, ' ') : '';
  }

  function toAbsoluteUrl(href) {
    if (!href) return '';
    if (/^(javascript:|data:|#)/i.test(href)) return '';
    try {
      return new URL(href, location.href).href;
    } catch (_) {
      return href;
    }
  }

  function extractAttachmentInfo(el) {
    if (!el || el.nodeType !== 1) return null;
    const a = el.tagName === 'A' ? el : el.querySelector?.('a[href]');
    const rawHref = (a && (a.getAttribute('href') || a.href)) || '';
    const href = toAbsoluteUrl(rawHref || (a && a.href) || '');
    if (href && isImageUrl(href)) return null;

    let name = '';
    if (a) name = (a.getAttribute('download') || a.textContent || '').replace(/\s+/g, ' ').trim();
    if (!name) name = (el.textContent || '').replace(/\s+/g, ' ').trim();
    name = name.replace(/\s*\(?\s*[\d.]+\s*[KMGT]?B\s*\)?\s*$/i, '').trim();

    let size = '';
    const sizeEl =
      el.querySelector?.('.filesize, .file-size, .attachment-size') ||
      (a && a.nextElementSibling) ||
      el.nextElementSibling;
    if (sizeEl) size = parseSizeText(sizeEl.textContent || '');
    if (!size) size = parseSizeText(el.textContent || '');

    const isAttachClass = !!(
      el.classList?.contains('attachment') ||
      a?.classList?.contains('attachment') ||
      el.closest?.('a.attachment, .attachment, .file-attachment, .cooked-attachment')
    );
    const isUpload = /\/uploads\/|\/download|upload:\/\//i.test(href || rawHref);
    if (!isAttachClass && !isUpload && !looksLikeFileName(name) && !looksLikeFileName(href || rawHref)) {
      return null;
    }
    if (isImageUrl(name) || isImageUrl(href)) return null;
    if (!name && href) {
      try { name = decodeURIComponent(href.split('/').pop().split('?')[0]); } catch (_) { name = href; }
    }
    if (!name) return null;
    return { name, size, href: href || toAbsoluteUrl(a && a.href) || '' };
  }

  /** 附件收集袋（完整链接放到截图底部额外区域） */
  let _attachBag = [];

  function pushAttachment(info) {
    if (!info || !info.name) return;
    const key = (info.href || '') + '|' + info.name;
    if (_attachBag.some((x) => (x.href || '') + '|' + x.name === key)) return;
    _attachBag.push(info);
  }

  function isFileAttachmentAnchor(el) {
    if (!el || el.tagName !== 'A') return false;
    const info = extractAttachmentInfo(el);
    if (!info) return false;
    if (isImageUrl(info.href) || isImageUrl(info.name)) return false;
    return !!(
      el.classList.contains('attachment') ||
      looksLikeFileName(info.name) ||
      looksLikeFileName(info.href) ||
      /\/uploads\/|\/download/i.test(info.href || '')
    );
  }

  /** 把 Discourse <use href="#id"> 精灵图标内联成可独立渲染的 SVG */
  function inlineSvgUses(svg) {
    if (!svg) return svg;
    const uses = svg.querySelectorAll('use');
    uses.forEach((use) => {
      const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
      if (!href) return;
      let id = href;
      if (id.includes('#')) id = id.split('#').pop();
      id = id.replace(/^#/, '');
      if (!id) return;
      const symbol =
        document.getElementById(id) ||
        document.querySelector('symbol[id="' + id + '"], svg[id="' + id + '"]');
      if (!symbol) return;
      try {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        // 复制 symbol 内容
        Array.from(symbol.childNodes).forEach((n) => {
          g.appendChild(n.cloneNode(true));
        });
        const vb = symbol.getAttribute('viewBox');
        if (vb && !svg.getAttribute('viewBox')) svg.setAttribute('viewBox', vb);
        use.parentNode.replaceChild(g, use);
      } catch (_) { /* ignore */ }
    });
    return svg;
  }

  function styleIconEl(el, size, color) {
    if (!el) return el;
    if (el.tagName === 'SVG' || el instanceof SVGElement) {
      el.setAttribute('width', String(size));
      el.setAttribute('height', String(size));
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText =
        'display:inline-block;width:' + size + 'px;height:' + size + 'px;' +
        'margin-right:5px;vertical-align:-2px;flex-shrink:0;overflow:visible;' +
        (color ? 'fill:' + color + ';color:' + color + ';' : '');
      // 子 path 也着色
      if (color) {
        el.querySelectorAll('path, circle, rect, polygon').forEach((p) => {
          if (!p.getAttribute('fill') || p.getAttribute('fill') === 'currentColor') {
            p.setAttribute('fill', color);
          }
        });
      }
    } else {
      el.style.cssText =
        'display:inline-block;width:' + size + 'px;height:' + size + 'px;' +
        'margin-right:5px;vertical-align:-2px;object-fit:contain;flex-shrink:0;';
    }
    return el;
  }

  /** 从附件链接提取站点自带图标（SVG / img / ::before），强制 14px 不放大 */
  function captureAttachmentIcon(anchor) {
    if (!anchor) return null;
    const size = 14;
    let color = '#0088CC';
    try {
      color = toSafeColor(getComputedStyle(anchor).color) || color;
    } catch (_) { /* ignore */ }

    // 1) 自身或内部 svg（Discourse: a.attachment > svg.d-icon-paperclip）
    const svg =
      (anchor.tagName === 'SVG' ? anchor : null) ||
      anchor.querySelector?.('svg') ||
      anchor.closest?.('a')?.querySelector?.('svg');
    if (svg) {
      try {
        const clone = inlineSvgUses(svg.cloneNode(true));
        if (!clone.getAttribute('viewBox') && svg.getAttribute('viewBox')) {
          clone.setAttribute('viewBox', svg.getAttribute('viewBox'));
        }
        // 常见 fa 图标默认 viewBox
        if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', '0 0 512 512');
        return styleIconEl(clone, size, color);
      } catch (_) { /* fallthrough */ }
    }

    // 2) img
    const img = anchor.querySelector?.('img');
    if (img && (img.currentSrc || img.src)) {
      const el = document.createElement('img');
      el.src = img.currentSrc || img.src;
      el.alt = '';
      return styleIconEl(el, size, null);
    }

    // 3) ::before / ::after 背景或 mask（部分主题）
    const targets = [anchor];
    if (anchor.firstElementChild) targets.push(anchor.firstElementChild);
    for (const t of targets) {
      for (const pseudo of ['::before', '::after']) {
        try {
          const cs = getComputedStyle(t, pseudo);
          const bg = cs.backgroundImage || '';
          const mask = cs.webkitMaskImage || cs.maskImage || '';
          const urlMatch = (bg + '|' + mask).match(/url\(["']?([^"')]+)["']?\)/i);
          if (urlMatch && urlMatch[1] && urlMatch[1] !== 'none') {
            const u = urlMatch[1].replace(/"/g, '');
            if (mask && mask !== 'none') {
              const wrap = document.createElement('span');
              wrap.style.cssText =
                'display:inline-block;width:' + size + 'px;height:' + size + 'px;' +
                'margin-right:5px;vertical-align:-2px;' +
                'background-color:' + color + ';' +
                '-webkit-mask-image:url("' + u + '");mask-image:url("' + u + '");' +
                '-webkit-mask-size:contain;mask-size:contain;' +
                '-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;' +
                '-webkit-mask-position:center;mask-position:center;';
              return wrap;
            }
            const el = document.createElement('img');
            el.src = u;
            el.alt = '';
            return styleIconEl(el, size, null);
          }
          const content = cs.content || '';
          const cUrl = content.match(/url\(["']?([^"')]+)["']?\)/i);
          if (cUrl && cUrl[1]) {
            const el = document.createElement('img');
            el.src = cUrl[1];
            el.alt = '';
            return styleIconEl(el, size, null);
          }
        } catch (_) { /* ignore */ }
      }
    }

    // 4) 页面里全局 paperclip 符号（无节点时兜底画一个同款路径过重，略过）
    const sprite = document.querySelector(
      'symbol#paperclip, symbol[id*="paperclip"], svg#paperclip, use[href*="paperclip"]'
    );
    if (sprite) {
      const svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgRoot.setAttribute('viewBox', sprite.getAttribute('viewBox') || '0 0 512 512');
      if (sprite.tagName === 'SYMBOL' || sprite.tagName === 'SVG') {
        Array.from(sprite.childNodes).forEach((n) => svgRoot.appendChild(n.cloneNode(true)));
      } else if (sprite.tagName === 'USE') {
        const id = (sprite.getAttribute('href') || sprite.getAttribute('xlink:href') || '').split('#').pop();
        const sym = id && document.getElementById(id);
        if (sym) Array.from(sym.childNodes).forEach((n) => svgRoot.appendChild(n.cloneNode(true)));
      }
      if (svgRoot.childNodes.length) return styleIconEl(svgRoot, size, color);
    }

    return null;
  }

  /** 图一：原位紧凑附件行（站点原图标 + 文件名 + 大小） */
  function renderAttachmentLikeDiscourse(info, anchor) {
    const row = document.createElement('span');
    row.setAttribute('data-ld-attach-row', '1');
    row.style.cssText = [
      'display:inline',
      'font-size:15px',
      'line-height:1.6',
      'vertical-align:baseline',
      'white-space:normal',
      'word-break:break-all',
    ].join(';');

    const icon = captureAttachmentIcon(anchor);
    if (icon) {
      row.appendChild(icon);
    }

    const name = document.createElement('span');
    name.textContent = info.name;
    // 尽量贴近原链接颜色
    let linkColor = '#0088CC';
    try {
      if (anchor) linkColor = toSafeColor(getComputedStyle(anchor).color) || linkColor;
    } catch (_) { /* ignore */ }
    name.style.cssText = [
      'display:inline',
      'color:' + linkColor,
      'text-decoration:underline',
      'font-weight:500',
      'cursor:default',
    ].join(';');

    row.appendChild(name);

    if (info.size) {
      const sizeEl = document.createElement('span');
      sizeEl.textContent = ' (' + info.size + ')';
      sizeEl.style.cssText = 'display:inline;color:#666;margin-left:2px;font-size:14px;';
      row.appendChild(sizeEl);
    }
    return row;
  }

  /** 底部额外区域：完整下载链接说明 */
  function buildAttachmentLinkNotes(items) {
    if (!items || !items.length) return null;
    const box = document.createElement('div');
    box.setAttribute('data-ld-attach-notes', '1');
    box.style.cssText = [
      'display:block',
      'margin:16px 0 4px',
      'padding:12px 14px',
      'border:1px dashed #90caf9',
      'border-radius:10px',
      'background:#f5faff',
      'color:#334155',
      'font-size:12px',
      'line-height:1.55',
      'text-align:left',
      'box-sizing:border-box',
      'width:100%',
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:600;margin-bottom:8px;color:#0f172a;font-size:13px;';
    title.textContent = '📎 附件链接说明（额外补充，便于复制）';
    box.appendChild(title);

    items.forEach((it, idx) => {
      const block = document.createElement('div');
      block.style.cssText = 'margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid #e3f2fd;';
      if (idx === items.length - 1) {
        block.style.marginBottom = '0';
        block.style.paddingBottom = '0';
        block.style.borderBottom = 'none';
      }
      const head = document.createElement('div');
      head.style.cssText = 'color:#0f172a;margin-bottom:3px;word-break:break-all;';
      head.textContent = `${idx + 1}. ${it.name}` + (it.size ? `（${it.size}）` : '');
      const url = document.createElement('div');
      url.style.cssText =
        'color:#0369a1;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all;';
      url.textContent = it.href || '(无链接)';
      block.appendChild(head);
      block.appendChild(url);
      box.appendChild(block);
    });
    return box;
  }

  /** 深克隆节点，并把计算样式全部写成安全内联样式 */
  function cloneWithFlatStyles(src) {
    if (src.nodeType === 3) {
      return document.createTextNode(src.nodeValue);
    }
    if (src.nodeType === 8) {
      return document.createComment(src.nodeValue);
    }
    if (src.nodeType !== 1) return null;
    if (shouldSkipNode(src)) return null;

    const tag = src.tagName;

    // 附件：原位用站点图标+文件名（图一），完整 URL 记入底部说明
    if (isFileAttachmentAnchor(src)) {
      const info = extractAttachmentInfo(src);
      if (info) {
        pushAttachment(info);
        return renderAttachmentLikeDiscourse(info, src);
      }
    }

    // 跳过附件旁的重复 filesize（已并入图一行）
    if (
      (src.classList?.contains('filesize') || src.classList?.contains('file-size')) &&
      src.previousElementSibling &&
      isFileAttachmentAnchor(src.previousElementSibling)
    ) {
      return null;
    }

    // 附件小图标由附件专用逻辑绘制；普通按钮 SVG 必须保留，否则回复、
    // 热门回复、总结等按钮会只剩空白边框。
    if (tag === 'SVG' || src instanceof SVGElement) {
      const r = src.getBoundingClientRect();
      const isAttachmentIcon = src.closest?.('a.attachment, .attachment') ||
        /paperclip/i.test(src.getAttribute('class') || src.className?.baseVal || '');
      if (isAttachmentIcon && r.width > 0 && r.width <= 28 && r.height <= 28) return null;
    }

    // canvas → 转图片
    if (tag === 'CANVAS') {
      try {
        const img = document.createElement('img');
        img.src = src.toDataURL();
        copyComputedStyle(src, img);
        img.style.width = src.offsetWidth + 'px';
        img.style.height = src.offsetHeight + 'px';
        return img;
      } catch (_) {
        return null;
      }
    }

    const dst = src instanceof SVGElement
      ? document.createElementNS(SVG_NS, tag.toLowerCase())
      : document.createElement(tag === 'BODY' ? 'DIV' : tag);

    if (src.id) dst.id = 'ld-' + src.id;
    copyCaptureAttributes(src, dst);
    if (tag === 'A') {
      const abs = toAbsoluteUrl(src.getAttribute('href') || src.href || '');
      if (abs) dst.setAttribute('href', abs);
      else dst.setAttribute('href', 'javascript:void(0)');
    }
    if (tag === 'IMG') {
      // 回形针等 data:image/svg 小图标 → 跳过，避免放大成图二
      const imgSrc = src.currentSrc || src.src || '';
      if (/^data:image\/svg/i.test(imgSrc) || src.closest?.('a.attachment')) {
        const r = src.getBoundingClientRect();
        if (r.width <= 32 && r.height <= 32) return null;
      }
      dst.setAttribute('src', imgSrc);
      dst.setAttribute('alt', src.alt || '');
      dst.setAttribute('crossorigin', 'anonymous');
      if (src.naturalWidth) {
        dst.style.width = (src.width || src.naturalWidth) + 'px';
        dst.style.height = (src.height || src.naturalHeight) + 'px';
      }
    }
    if (tag === 'VIDEO') {
      try {
        const c = document.createElement('canvas');
        c.width = src.videoWidth || src.clientWidth;
        c.height = src.videoHeight || src.clientHeight;
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
        const img = document.createElement('img');
        img.src = c.toDataURL('image/png');
        copyComputedStyle(src, img);
        return img;
      } catch (_) {
        const ph = document.createElement('div');
        copyComputedStyle(src, ph);
        ph.textContent = '[video]';
        return ph;
      }
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      dst.setAttribute('value', src.value || '');
      if (tag === 'TEXTAREA') dst.textContent = src.value || '';
    }
    if (tag === 'DETAILS') {
      dst.setAttribute('open', '');
    }

    if (src instanceof SVGElement) {
      for (const attr of src.attributes) {
        if (attr.name === 'style' || attr.name === 'class') continue;
        try { dst.setAttribute(attr.name, attr.value); } catch (_) {}
      }
    }

    copyComputedStyle(src, dst);

    // 不要给 SVG/小图标强制大尺寸
    const rect = src.getBoundingClientRect();
    if (tag !== 'SVG' && !(src instanceof SVGElement) && rect.width > 0 && rect.width < 4000) {
      // 块级/有明确宽度的容器才锁宽，避免把 inline 附件撑乱
      const cs = getComputedStyle(src);
      if (cs.display && cs.display !== 'inline' && cs.display !== 'inline-block' || rect.width > 40) {
        if (cs.display !== 'inline') {
          dst.style.setProperty('width', rect.width + 'px');
        }
      }
    }
    if (rect.height > 0 && (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'IFRAME')) {
      if (rect.width > 32 || rect.height > 32) {
        dst.style.setProperty('height', rect.height + 'px');
      }
    }

    const children = src.childNodes;
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      // 跳过附件链接后的纯尺寸文本，避免 “ (165.1 KB)” 重复
      if (node.nodeType === 3) {
        const prev = node.previousSibling;
        const prevEl = prev && prev.nodeType === 1 ? prev : (prev && prev.previousSibling);
        const attachPrev =
          (prev && prev.nodeType === 1 && isFileAttachmentAnchor(prev)) ||
          (prevEl && prevEl.nodeType === 1 && isFileAttachmentAnchor(prevEl));
        if (attachPrev && /^\s*\(?\s*[\d.]+\s*[KMGT]?B\s*\)?\s*$/i.test(node.nodeValue || '')) {
          continue;
        }
      }
      const child = cloneWithFlatStyles(node);
      if (child) dst.appendChild(child);
    }

    if (src instanceof SVGElement && tag === 'SVG') {
      // DButton icons commonly use <svg><use href="#icon-..."></use></svg>.
      // Inline the referenced symbol while it is still available in the
      // original document instead of relying on the detached clone document.
      inlineSvgUses(dst);
    }

    appendButtonTextFallback(src, dst);

    // 伪元素：跳过 url(svg) / 空 content，避免回形针 SVG 被当文本或大图
    if (!src.classList?.contains('attachment') && tag !== 'A') {
      appendPseudoContent(src, dst, '::before', false);
      appendPseudoContent(src, dst, '::after', true);
    }

    return dst;
  }

  function cloneNodeForCapture(src) {
    _attachBag = [];
    // 预收集附件（含未走到 a 节点的情况）
    try {
      src.querySelectorAll?.('a.attachment, a[href*="/uploads/"]').forEach((a) => {
        if (isFileAttachmentAnchor(a)) {
          const info = extractAttachmentInfo(a);
          if (info) pushAttachment(info);
        }
      });
    } catch (_) { /* ignore */ }

    const cloned = cloneWithFlatStyles(src);
    if (!cloned) {
      _attachBag = [];
      return null;
    }

    const notes = buildAttachmentLinkNotes(_attachBag.slice());
    _attachBag = [];
    if (notes && cloned.nodeType === 1) {
      cloned.appendChild(notes);
    } else if (notes) {
      const wrap = document.createElement('div');
      wrap.appendChild(cloned);
      wrap.appendChild(notes);
      return wrap;
    }
    return cloned;
  }

  /** 创建离屏工作台（无外部样式表，仅内联） */
  function createWorkbench(width) {
    const box = document.createElement('div');
    box.className = 'ld-ss-work';
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = [
      'position:fixed',
      'left:-100000px',
      'top:0',
      'width:' + width + 'px',
      'margin:0',
      'padding:0',
      'background:#ffffff',
      'overflow:visible',
      'pointer-events:none',
      'z-index:-1',
      'opacity:1',
    ].join(';');
    document.body.appendChild(box);
    return box;
  }

  /** 把一组元素拼进工作台并截图 */
  async function renderNodes(nodes, opts = {}) {
    const list = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean);
    if (!list.length) throw new Error('没有可截图的内容');

    // 宽度取最大
    let width = opts.width || 0;
    if (!width) {
      for (const n of list) {
        width = Math.max(width, Math.ceil(n.getBoundingClientRect().width) || n.scrollWidth || 0);
      }
    }
    width = Math.max(width, 320);
    width = Math.min(width, 2400);

    expandAll(document);

    const work = createWorkbench(width);
    const root = document.createElement('div');
    root.style.cssText = [
      'display:block',
      'width:' + width + 'px',
      'margin:0',
      'padding:16px',
      'box-sizing:border-box',
      'background:' + (opts.background || resolvePageBg()),
      'color:#222',
      'font-family:' + (getComputedStyle(document.body).fontFamily || 'sans-serif'),
    ].join(';');

    for (const n of list) {
      const cloned = cloneNodeForCapture(n);
      if (!cloned) continue;
      if (cloned.style) {
        cloned.style.setProperty('max-width', '100%');
        cloned.style.setProperty('position', 'relative');
        cloned.style.setProperty('left', 'auto');
        cloned.style.setProperty('top', 'auto');
        cloned.style.setProperty('right', 'auto');
        cloned.style.setProperty('bottom', 'auto');
        cloned.style.setProperty('transform', 'none');
        cloned.style.setProperty('margin-left', '0');
        cloned.style.setProperty('margin-right', '0');
      }
      root.appendChild(cloned);
    }

    work.appendChild(root);

    // 等图片加载
    await waitImages(root);
    await sleep(50);

    // 限制超长内容
    let scale = opts.scale || Math.min(window.devicePixelRatio || 1, 2);
    const h = root.scrollHeight;
    const w = root.scrollWidth;
    const MAX_H = 14000;
    const MAX_W = 4000;
    if (h * scale > MAX_H) scale = Math.max(0.35, MAX_H / h);
    if (w * scale > MAX_W) scale = Math.max(0.35, Math.min(scale, MAX_W / w));
    if (scale < 0.95) toast(`📐 内容较长，清晰度 scale=${scale.toFixed(2)}`, 2500);

    if (typeof html2canvas !== 'function') {
      work.remove();
      throw new Error('html2canvas 未加载');
    }

    let canvas;
    try {
      canvas = await html2canvas(root, {
        scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        // null = 透明底，圆角外侧才不会带白边
        backgroundColor: null,
        width: root.scrollWidth,
        height: root.scrollHeight,
        windowWidth: root.scrollWidth,
        windowHeight: root.scrollHeight,
        // 关键：克隆文档里干掉所有样式表，只靠我们写好的内联样式
        onclone(doc) {
          doc.querySelectorAll('style, link[rel="stylesheet"], link[rel="preload"][as="style"]').forEach((el) => el.remove());
          // 再扫一遍内联 style，清掉残留现代色
          doc.querySelectorAll('[style]').forEach((el) => {
            const s = el.getAttribute('style');
            if (s && /oklch|oklab|color-mix|color\(|\blab\(|\blch\(|hwb\(/i.test(s)) {
              el.setAttribute('style', s
                .replace(/oklch\([^)]*\)/gi, '#888')
                .replace(/oklab\([^)]*\)/gi, '#888')
                .replace(/color-mix\([^)]*\)/gi, 'transparent')
                .replace(/color\([^)]*\)/gi, '#888')
                .replace(/(?:^|[^a-z-])lab\([^)]*\)/gi, '#888')
                .replace(/(?:^|[^a-z-])lch\([^)]*\)/gi, '#888')
                .replace(/hwb\([^)]*\)/gi, '#888'));
            }
          });
        },
      });
    } finally {
      work.remove();
    }

    // 四角圆角（外侧透明 PNG）
    return roundCanvas(canvas, (opts.radius ?? 16) * scale);
  }

  /** 给 canvas 四角做圆角裁剪，外侧透明 */
  function roundCanvas(src, radiusPx) {
    if (!src || !radiusPx || radiusPx <= 0) return src;
    const w = src.width;
    const h = src.height;
    const rr = Math.max(4, Math.min(Math.round(radiusPx), Math.floor(Math.min(w, h) / 2)));

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(0, 0, w, h, rr);
    } else {
      ctx.moveTo(rr, 0);
      ctx.arcTo(w, 0, w, h, rr);
      ctx.arcTo(w, h, 0, h, rr);
      ctx.arcTo(0, h, 0, 0, rr);
      ctx.arcTo(0, 0, w, 0, rr);
      ctx.closePath();
    }
    ctx.clip();
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    return out;
  }

  function resolvePageBg() {
    const b = getComputedStyle(document.body).backgroundColor;
    if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') return toSafeColor(b);
    const h = getComputedStyle(document.documentElement).backgroundColor;
    if (h && h !== 'rgba(0, 0, 0, 0)' && h !== 'transparent') return toSafeColor(h);
    return '#ffffff';
  }

  function waitImages(root, timeout = 8000) {
    const imgs = Array.from(root.querySelectorAll('img'));
    if (!imgs.length) return Promise.resolve();
    return Promise.race([
      Promise.all(imgs.map((img) => {
        if (img.complete && img.naturalWidth) return Promise.resolve();
        return new Promise((res) => {
          const done = () => res();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        });
      })),
      sleep(timeout),
    ]);
  }

  /* ===================== 视口截图（整页裁切） ===================== */
  async function renderViewport() {
    expandAll(document);
    // 视口：克隆 body 可见区域用整页渲染后裁切太重
    // 改为：取 main-outlet 中与视口相交的 posts + 标题
    const outlet = document.querySelector('#main-outlet') || document.body;
    const top = window.scrollY;
    const bottom = top + window.innerHeight;
    const candidates = [];

    const title = document.querySelector('#topic-title, .fancy-title, .topic-title');
    if (title) {
      const r = title.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) candidates.push(title);
    }

    outlet.querySelectorAll('article, .topic-post, #post_1, .post').forEach((el) => {
      if (isOurUi(el)) return;
      const r = el.getBoundingClientRect();
      const y1 = r.top + window.scrollY;
      const y2 = r.bottom + window.scrollY;
      if (y2 > top && y1 < bottom && r.height > 20) candidates.push(el);
    });

    // These controls are rendered outside the post stream on some Linux DO
    // layouts, so they would otherwise be omitted from viewport captures.
    getSpecialCaptureNodes().forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) candidates.push(el);
    });

    if (!candidates.length) {
      // 回退：截 main-outlet 当前可见宽度的一块
      return renderNodes([outlet], {
        width: Math.min(outlet.clientWidth || window.innerWidth, 1200),
        background: resolvePageBg(),
      });
    }

    // 去重（子元素已在父内则跳过）
    const filtered = candidates.filter((el, i, arr) => {
      return !arr.some((other, j) => j !== i && other.contains(el));
    });

    return renderNodes(filtered, {
      width: Math.min(window.innerWidth - 40, 1100),
      background: resolvePageBg(),
    });
  }

  /* ===================== 模式选择 ===================== */
  function getMainNodes() {
    const nodes = [];
    const title =
      document.querySelector('#topic-title') ||
      document.querySelector('.title-wrapper') ||
      document.querySelector('.fancy-title') ||
      document.querySelector('h1');
    if (title) nodes.push(title);

    const post =
      document.querySelector('#post_1') ||
      document.querySelector('article#post_1') ||
      document.querySelector('.topic-post:first-of-type') ||
      document.querySelector('article[id^="post_"]');
    if (post) nodes.push(post);

    return addSpecialCaptureNodes(nodes);
  }

  function getSpecialCaptureNodes() {
    const nodes = [];
    const seen = new Set();
    document.querySelectorAll(
      '.solved-shared-issue-row, .summarization-button, .ai-summarization-button, [class*="summarization-button"]'
    ).forEach((el) => {
      if (seen.has(el) || isOurUi(el)) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return;
      seen.add(el);
      nodes.push(el);
    });
    return nodes;
  }

  function addSpecialCaptureNodes(nodes) {
    const result = (nodes || []).filter(Boolean).slice();
    for (const special of getSpecialCaptureNodes()) {
      // If the selected root already contains the component, the root clone
      // keeps it in its original position.
      if (result.some((node) => node === special || node.contains?.(special))) continue;
      result.push(special);
    }
    return result;
  }

  function getAllNodes() {
    const outlet = document.querySelector('#main-outlet');
    if (outlet) {
      // 尽量只拿话题主体，去掉侧栏
      const topic = outlet.querySelector('.topic-area, #topic, .posts-wrapper, .post-stream') || outlet;
      return addSpecialCaptureNodes([topic]);
    }
    return addSpecialCaptureNodes([document.body]);
  }

  /* ===================== 预览 / 下载 / 复制 ===================== */
  function showPreview(dataUrl, title) {
    const mask = document.createElement('div');
    mask.className = 'ld-ss-mask show';
    mask.innerHTML = `
      <div class="ld-ss-modal">
        <div class="hd">
          <h3>📸 截图预览 <span style="font-weight:400;font-size:14px;opacity:.7">${title}</span></h3>
          <button class="x" type="button" data-c>✕</button>
        </div>
        <div class="bd"><img alt="preview" src="${dataUrl}"></div>
        <div class="ft">
          <span class="info">PNG · 点击图片放大</span>
          <button class="btn s" type="button" data-d>${ICO.dl} 下载</button>
          <button class="btn p" type="button" data-y>${ICO.cp} 复制</button>
          <button class="btn g" type="button" data-c>关闭</button>
        </div>
      </div>`;
    document.body.appendChild(mask);

    const close = () => mask.remove();
    mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
    mask.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', close));

    const img = mask.querySelector('img');
    const bd = mask.querySelector('.bd');
    // 打开时滚到顶部，避免长图从中间看
    requestAnimationFrame(() => { if (bd) bd.scrollTop = 0; });
    img.addEventListener('click', () => {
      const zoomed = img.dataset.zoom === '1';
      if (zoomed) {
        img.dataset.zoom = '0';
        img.style.maxWidth = '100%';
        img.style.cursor = 'zoom-in';
      } else {
        img.dataset.zoom = '1';
        img.style.maxWidth = 'none';
        img.style.cursor = 'zoom-out';
      }
      if (bd) bd.scrollTop = 0;
    });

    mask.querySelector('[data-d]').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `linuxdo-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('✅ 已下载');
    });

    mask.querySelector('[data-y]').addEventListener('click', async () => {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        toast('✅ 已复制到剪贴板');
      } catch (e1) {
        try {
          GM_setClipboard(dataUrl, 'text');
          toast('✅ 已复制 Base64');
        } catch (e2) {
          toast('❌ 复制失败，请下载');
        }
      }
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  /* ===================== 入口 ===================== */
  let busy = false;

  async function capture(mode) {
    if (busy) return;
    busy = true;
    const names = { main: '主楼', all: '全部回复', viewport: '当前视口' };
    try {
      toast('⏳ 正在渲染截图…', 10000);
      let canvas;
      if (mode === 'main') {
        const nodes = getMainNodes();
        if (!nodes.length) throw new Error('未找到主楼');
        canvas = await renderNodes(nodes, { background: resolvePageBg() });
      } else if (mode === 'all') {
        canvas = await renderNodes(getAllNodes(), { background: resolvePageBg() });
      } else if (mode === 'viewport') {
        canvas = await renderViewport();
      } else {
        throw new Error('未知模式');
      }
      const url = canvas.toDataURL('image/png');
      showPreview(url, names[mode] || '截图');
    } catch (err) {
      console.error('[ld-ss]', err);
      toast('❌ 截图失败: ' + (err && err.message ? err.message : err));
    } finally {
      busy = false;
    }
  }

  function initUI() {
    if (document.querySelector('.ld-ss-btn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ld-ss-btn';
    btn.title = '截图分享 (Alt+S)';
    btn.innerHTML = ICO.cam;
    document.body.appendChild(btn);

    const menu = document.createElement('div');
    menu.className = 'ld-ss-menu';
    menu.innerHTML = `
      <button class="item" type="button" data-m="main"><span class="ic">📄</span><span class="lb">截取主楼</span><span class="sc">Alt+1</span></button>
      <button class="item" type="button" data-m="all"><span class="ic">📚</span><span class="lb">截取全部回复</span><span class="sc">Alt+2</span></button>
      <div class="div"></div>
      <button class="item" type="button" data-m="viewport"><span class="ic">👁️</span><span class="lb">截取当前视口</span><span class="sc">Alt+3</span></button>
    `;
    document.body.appendChild(menu);

    let open = false;
    const toggle = () => {
      open = !open;
      menu.classList.toggle('show', open);
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });
    document.addEventListener('click', () => {
      open = false;
      menu.classList.remove('show');
    });
    menu.querySelectorAll('[data-m]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        open = false;
        menu.classList.remove('show');
        capture(el.getAttribute('data-m'));
      });
    });

    document.addEventListener('keydown', (e) => {
      if (!e.altKey) return;
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        toggle();
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        e.preventDefault();
        open = false;
        menu.classList.remove('show');
        capture({ 1: 'main', 2: 'all', 3: 'viewport' }[e.key]);
      }
    });
  }

  function boot() {
    if (document.querySelector('#main-outlet, #post_1, .post-stream')) {
      initUI();
      return;
    }
    const mo = new MutationObserver(() => {
      if (document.querySelector('#main-outlet, #post_1, .post-stream')) {
        mo.disconnect();
        initUI();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      mo.disconnect();
      if (!document.querySelector('.ld-ss-btn')) initUI();
    }, 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  console.log('[ld-ss] LINUX DO 截图分享 v3.6 已加载');
})();
