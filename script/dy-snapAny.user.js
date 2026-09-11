// ==UserScript==
// @name         SnapAny 视频/音频下载增强版
// @namespace    https://snapany.com/
// @version      2.7.0
// @description  下载增强：多线程 Range 分片并发下载（带真实百分比进度），自动回退 GM_download/单线程/直链；多分辨率增强、大文件超限降级、iOS 分享流程；视频/音频链接一键复制
// @author       cores
// @match        https://snapany.com/zh/*
// @match        https://www.snapany.com/zh/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_download
// @connect      *
// @run-at       document-idle
// @license      MIT
// ==/UserScript==
(function () {
    'use strict';

    // =========================================================================
    // 配置
    // =========================================================================
    const CONFIG = {
        DEBUG: false,
        SCAN_INTERVAL: 1500,
        DOWNLOAD_TIMEOUT: 300000,                       // 单次网络请求超时（5 分钟，大文件预留余量）
        GM_DL_TIMEOUT: 60000,                           // GM_download 无回调看门狗：超时视为“已交给下载管理器”
        MULTI_THREAD: true,                             // 多线程分片下载开关（服务端需支持 Range）
        MULTI_THREAD_COUNT: 4,                          // 并发连接数（浏览器单域名并发通常约 6，4 较稳）
        MULTI_THREAD_MIN: 512 * 1024,                   // 小于该字节数不值得分片，走单线快路径
        MAX_MULTI_BYTES: {                              // 多线程需整文件内存拼接，单次上限（超限走 GM_download 流式）
            mobile: 400 * 1024 * 1024,
            desktop: 800 * 1024 * 1024
        },
        MAX_IOS_SHARE_SIZE: 300 * 1024 * 1024,          // iOS 内存内可安全处理的上限（Safari 分享对超大 Blob 易失败）
        MAX_BLOB_SIZE: {                                // 无 GM_download 时“内存拉取整文件”的上限
            mobile: 600 * 1024 * 1024,
            desktop: 1200 * 1024 * 1024
        },
        MARK: 'data-snapany-download-enhanced',
        PROCESSED: 'data-snapany-processed',
        VIDEO_TEXT: '▶️ 下载视频',
        AUDIO_TEXT: '🎵 下载音频',
        TOAST: true
    };

    // =========================================================================
    // 基础工具
    // =========================================================================
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    function log(...args) {
        if (CONFIG.DEBUG) console.log('[SnapAny DL]', ...args);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function isIOS() {
        return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isAndroid() {
        return /Android/i.test(navigator.userAgent);
    }

    function isMobile() {
        return isIOS() || isAndroid();
    }

    function safeFileName(name, fallback = 'snapany_media') {
        let value = String(name || fallback)
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, ' ')
            .trim();
        if (!value) value = fallback;
        return value.slice(0, 120);
    }

    function getExtension(url, type = '') {
        const text = String(url || '').toLowerCase();
        if (type.includes('audio') || /\.(mp3|m4a|aac|wav|ogg|opus|flac)(?:[?#]|$)/i.test(text)) {
            if (/\.m4a(?:[?#]|$)/i.test(text)) return '.m4a';
            if (/\.aac(?:[?#]|$)/i.test(text)) return '.aac';
            if (/\.wav(?:[?#]|$)/i.test(text)) return '.wav';
            if (/\.ogg(?:[?#]|$)/i.test(text)) return '.ogg';
            if (/\.opus(?:[?#]|$)/i.test(text)) return '.opus';
            if (/\.flac(?:[?#]|$)/i.test(text)) return '.flac';
            return '.mp3';
        }
        if (/\.webm(?:[?#]|$)/i.test(text)) return '.webm';
        if (/\.mov(?:[?#]|$)/i.test(text)) return '.mov';
        return '.mp4';
    }

    // 从 Content-Length / Content-Range 头解析总大小（字节）
    function parseContentLength(headerText) {
        const m = /content-length\s*:\s*(\d+)/i.exec(String(headerText || ''));
        return m ? parseInt(m[1], 10) : 0;
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) return '';
        if (bytes < 1024) return bytes + ' B';
        const units = ['KB', 'MB', 'GB', 'TB'];
        let value = bytes;
        let i = -1;
        do { value /= 1024; i++; } while (value >= 1024 && i < units.length - 1);
        return value.toFixed(value >= 100 ? 0 : 1) + ' ' + units[i];
    }

    // 按文件名扩展名猜测 MIME（iOS File / 分享兜底用）
    function guessMimeFromName(filename, fallback) {
        const map = {
            '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
            '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
            '.flac': 'audio/flac', '.webm': 'video/webm', '.mov': 'video/quicktime',
            '.mp4': 'video/mp4', '.m4v': 'video/x-m4v'
        };
        const ext = '.' + String(filename || '').split('.').pop().toLowerCase();
        return map[ext] || fallback || 'video/mp4';
    }

    // 当前环境下允许“内存拉取整文件”的上限
    function getBlobLimit() {
        if (isIOS()) return CONFIG.MAX_IOS_SHARE_SIZE;
        return isMobile() ? CONFIG.MAX_BLOB_SIZE.mobile : CONFIG.MAX_BLOB_SIZE.desktop;
    }

    // 超过内存下载上限的专用错误（带预估大小）
    function tooLargeError(size) {
        const err = new Error('TOO_LARGE');
        err.name = 'TooLargeError';
        err.tooLarge = true;
        err.size = size || 0;
        return err;
    }

    // 获取页面标题（优先结果卡片里的描述文字）
    function getPageTitle(container) {
        if (container) {
            const candidates = $$('p, h1, h2, h3, div, span', container);
            for (const el of candidates) {
                const text = (el.innerText || el.textContent || '').trim();
                if (
                    text.length > 8 &&
                    text.length < 120 &&
                    !/下载|download|分辨率|清晰度|封面|音频|视频|提取|保存|客户端|更多/i.test(text) &&
                    !el.closest('a, button')
                ) {
                    return text;
                }
            }
        }

        const pageTitle = document.title || '';
        if (pageTitle && pageTitle.length > 5) {
            return pageTitle
                .replace(/[-_|].*SnapAny.*/i, '')
                .replace(/TikTok.*下载.*/i, '')
                .trim();
        }

        return 'snapany_video';
    }

    function getFilename(url, type, element, qualityName = '') {
        let name = '';

        const container = element ? (element.closest('[class*="result"], [class*="card"], [class*="media"]') || element.parentElement) : null;
        name = getPageTitle(container);

        if (!name || name.length < 4) {
            if (element) {
                name = element.getAttribute('download') || element.getAttribute('data-filename') || '';
            }
            if (!name && element) {
                const parent = element.parentElement;
                if (parent) {
                    const text = parent.innerText || '';
                    const lines = text.split(/\n+/).map(v => v.trim()).filter(Boolean);
                    for (const line of lines) {
                        if (line.length > 4 && line.length < 100 && !/下载|保存|video|audio|download|分辨率/i.test(line)) {
                            name = line;
                            break;
                        }
                    }
                }
            }
        }

        if (!name || name.length < 3) {
            try {
                const u = new URL(url);
                const last = u.pathname.split('/').pop();
                if (last && last.includes('.')) name = decodeURIComponent(last);
            } catch (_) {}
        }

        name = safeFileName(
            name.replace(/\.(mp4|m4v|mov|webm|mp3|m4a|aac|wav|ogg|opus|flac)$/i, ''),
            type === 'audio' ? 'snapany_audio' : 'snapany_video'
        );

        if (qualityName) {
            const q = safeFileName(qualityName.replace(/\(mp4\)|\(webm\)/gi, '').trim(), '');
            if (q) name = `${name}_${q}`;
        }

        return name + getExtension(url, type);
    }

    // =========================================================================
    // Toast
    // =========================================================================
    let toastTimer = null;
    function ensureToastStyle() {
        if ($('#snapany-dl-toast-style')) return;
        const style = document.createElement('style');
        style.id = 'snapany-dl-toast-style';
        style.textContent = `
            #snapany-dl-toast {
                position: fixed; left: 50%; bottom: 24px;
                transform: translate(-50%, 20px); opacity: 0;
                pointer-events: none; z-index: 2147483647;
                max-width: min(90vw, 420px); padding: 10px 16px;
                border-radius: 10px; background: rgba(25, 25, 30, .94);
                color: #fff; font-size: 13px; line-height: 1.5;
                box-shadow: 0 8px 30px rgba(0,0,0,.25);
                backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                transition: opacity .2s ease, transform .2s ease;
            }
            #snapany-dl-toast.show { opacity: 1; transform: translate(-50%, 0); }
            #snapany-dl-toast.error { background: rgba(150, 35, 35, .94); }
            #snapany-dl-toast.success { background: rgba(25, 120, 85, .94); }
        `;
        document.head.appendChild(style);
    }

    function showToast(message, type = '') {
        if (!CONFIG.TOAST) return;
        ensureToastStyle();
        let toast = $('#snapany-dl-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'snapany-dl-toast';
            document.body.appendChild(toast);
        }
        clearTimeout(toastTimer);
        toast.className = '';
        if (type) toast.classList.add(type);
        toast.textContent = message;
        requestAnimationFrame(() => toast.classList.add('show'));
        toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
    }

    // =========================================================================
    // 下载进度条
    // =========================================================================
    let progressStyleChecked = false;
    let progressToken = 0;

    function ensureProgressStyle() {
        if (progressStyleChecked || $('#snapany-dl-progress-style')) return;
        progressStyleChecked = true;
        const style = document.createElement('style');
        style.id = 'snapany-dl-progress-style';
        style.textContent = `
            #snapany-dl-progress {
                position: fixed; left: 50%; bottom: 76px;
                transform: translateX(-50%);
                z-index: 2147483646;
                width: min(86vw, 420px);
                background: rgba(20, 22, 28, .92); color: #fff;
                border-radius: 12px; padding: 10px 14px;
                font-size: 12px; line-height: 1.4;
                box-shadow: 0 10px 34px rgba(0,0,0,.3);
                backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            }
            #snapany-dl-progress[hidden] { display: none; }
            #snapany-dl-progress .dlp-label { margin-bottom: 6px; word-break: break-all; }
            #snapany-dl-progress .dlp-track {
                height: 6px; background: rgba(255,255,255,.16);
                border-radius: 99px; overflow: hidden;
            }
            #snapany-dl-progress .dlp-fill {
                height: 100%; width: 0;
                background: linear-gradient(90deg, #3b82f6, #22d3ee);
                border-radius: 99px;
                transition: width .25s ease;
            }
            #snapany-dl-progress.indeterminate .dlp-fill {
                width: 30% !important;
                animation: snapany-dlp-slide 1.15s infinite linear;
            }
            @keyframes snapany-dlp-slide {
                0% { margin-left: -30%; }
                100% { margin-left: 100%; }
            }
        `;
        document.head.appendChild(style);
    }

    function getProgressEl() {
        ensureProgressStyle();
        let el = document.getElementById('snapany-dl-progress');
        if (!el) {
            el = document.createElement('div');
            el.id = 'snapany-dl-progress';
            el.hidden = true;
            el.innerHTML = '<div class="dlp-label"></div><div class="dlp-track"><div class="dlp-fill"></div></div>';
            document.body.appendChild(el);
        }
        return el;
    }

    // 返回一个进度控制器；多次下载共享同一 UI，token 让过期回调自动失效
    function createProgress(label) {
        const el = getProgressEl();
        const token = ++progressToken;
        const labelEl = el.querySelector('.dlp-label');
        const fillEl = el.querySelector('.dlp-fill');

        el.classList.remove('indeterminate');
        el.hidden = false;
        labelEl.textContent = label || '下载中';
        fillEl.style.width = '0';

        function update(loaded, total) {
            if (token !== progressToken) return;
            const loadedBytes = Number(loaded) || 0;
            const totalBytes = Number(total) || 0;
            let text = (label || '下载中') + ' · ' + formatBytes(loadedBytes);
            if (totalBytes > 0) {
                const pct = Math.min(100, Math.max(0, Math.round((loadedBytes / totalBytes) * 100)));
                text += ' / ' + formatBytes(totalBytes) + ' (' + pct + '%)';
                el.classList.remove('indeterminate');
                fillEl.style.width = pct + '%';
            } else {
                el.classList.add('indeterminate');
            }
            labelEl.textContent = text;
        }

        function hide(delay) {
            const ms = Number(delay) || 0;
            setTimeout(() => {
                if (token !== progressToken) return;
                el.classList.remove('indeterminate');
                fillEl.style.width = '0';
                el.hidden = true;
            }, ms);
        }

        return { update, hide };
    }

    // =========================================================================
    // URL 判断
    // =========================================================================
    function isProbablyVideo(url) {
        if (!url) return false;
        const text = String(url).toLowerCase();
        return /\.(mp4|m4v|mov|webm)(?:[?#]|$)/i.test(text) || /video/i.test(text);
    }

    function isProbablyAudio(url) {
        if (!url) return false;
        const text = String(url).toLowerCase();
        return /\.(mp3|m4a|aac|wav|ogg|opus|flac)(?:[?#]|$)/i.test(text) ||
            /audio|music|playurl|musicurl/i.test(text);
    }

    function isMediaUrl(url) {
        return isProbablyVideo(url) || isProbablyAudio(url);
    }

    // 路径中带媒体扩展名的“直链”（去掉 query/hash 后判断）
    function hasMediaExtension(url) {
        if (!url) return false;
        const path = String(url).toLowerCase().split(/[?#]/)[0];
        return /\.(mp4|m4v|mov|webm|mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(path);
    }

    // 该 URL 是否为“更像网页”的链接（保守排除，见 findVideoUrl/findAudioUrl）
    function isWebPageUrl(url) {
        try {
            const u = new URL(url, location.href);
            const path = (u.pathname || '').toLowerCase();
            const query = (u.search || '').toLowerCase();
            // 明确的网页扩展名
            if (/\.(?:html?|php|asp|jsp)(?:[?#]|$)/i.test(url)) return true;
            // 社交平台“用户主页/视频详情页”形态，如 tiktok.com/@user/video/123（非媒体文件）
            if (/^https?:\/\/(?:www\.)?tiktok\.com\/@/i.test(url) && /\/video\//i.test(path)) return true;
            // 与本站同源的语言前缀子页路由（/zh|en|.../*）默认视为页面；
            // 除非路径/参数带明显的媒体或下载特征，才当作文件端点放行
            if (u.origin === location.origin && /^\/(?:zh|en|es|fr|de|ja|ko|pt|ru|ar|hi|id|th|vi)\//i.test(path)) {
                const mediaish = /(?:^|\/)(?:download|file|media|video|stream|play)\b/.test(path) ||
                    /[?&](?:format|type|ext|media|video|audio|file)=/.test(query);
                return !mediaish;
            }
        } catch (_) {}
        return false;
    }

    // 该 URL 是否为图片（封面/缩略图等）：
    // 部分平台的封面 query 里带着 aweme_video/biz_tag 字样，会误中“video 关键词”，需要先排除
    function isProbablyImage(url) {
        if (!url) return false;
        const t = String(url).toLowerCase();
        if (/\.(?:jpe?g|png|gif|webp|avif|bmp|heic|heif)(?:[?#]|$)/i.test(t)) return true;
        return /[?&](?:mime_type|contenttype|format|ctype)=(?:image|jpeg|png|webp)/i.test(t) ||
            /(?:^|[?&])sc=cover/i.test(t) ||
            /(?:^|[?&])biz_tag=image/i.test(t);
    }

    // =========================================================================
    // 从元素获取媒体 URL
    // =========================================================================
    function getUrlFromElement(el) {
        if (!el) return '';
        const attrs = [
            'href', 'src', 'data-url', 'data-src', 'data-download',
            'data-download-url', 'data-video', 'data-video-url',
            'data-audio', 'data-audio-url', 'data-original', 'data-href'
        ];
        for (const attr of attrs) {
            const value = el.getAttribute(attr);
            if (value && /^https?:\/\//i.test(value) && isMediaUrl(value)) {
                return value;
            }
        }
        if (el.dataset) {
            for (const key of Object.keys(el.dataset)) {
                const value = el.dataset[key];
                if (value && /^https?:\/\//i.test(value) && isMediaUrl(value)) {
                    return value;
                }
            }
        }
        return '';
    }

    // =========================================================================
    // 查找视频 / 音频 URL
    // =========================================================================
    function findVideoUrl(container) {
        if (!container) return '';
        const videos = $$('video', container);
        for (const video of videos) {
            const sources = [video.currentSrc, video.src, video.getAttribute('src')];
            for (const url of sources) {
                if (url && /^https?:\/\//i.test(url)) return url;
            }
            const source = $('source[src]', video);
            if (source && source.src) return source.src;
        }
        const links = $$('a[href]', container);
        for (const link of links) {
            if (link.hasAttribute(CONFIG.MARK)) continue;
            const url = link.href;
            if (!url || !/^https?:\/\//i.test(url)) continue;
            // 无扩展名的真实媒体直链很常见（如 CDN 签名地址），不能只认 .mp4。
            // 判定条件：媒体扩展名 / URL 含 video 语义 / download 声明 / 链接文字带媒体提示，
            // 排除明显是网页的链接与封面图链接（封面 query 常带 aweme_video 等字眼）
            const text = (link.innerText || link.textContent || '').trim();
            if (!isProbablyImage(url) &&
                (hasMediaExtension(url) || isProbablyVideo(url) || link.hasAttribute('download') ||
                 /(?:视频|mp4|原画|超清|高清|1080|720|480)/i.test(text)) && !isWebPageUrl(url)) return url;
        }
        const elements = $$('[data-video-url], [data-video], [data-download-url], [data-url]', container);
        for (const el of elements) {
            const url = getUrlFromElement(el);
            if (url && isProbablyVideo(url)) return url;
        }
        return '';
    }

    function findAudioUrl(container) {
        if (!container) return '';
        const audios = $$('audio', container);
        for (const audio of audios) {
            const sources = [audio.currentSrc, audio.src, audio.getAttribute('src')];
            for (const url of sources) {
                if (url && /^https?:\/\//i.test(url)) return url;
            }
            const source = $('source[src]', audio);
            if (source && source.src) return source.src;
        }
        const links = $$('a[href]', container);
        for (const link of links) {
            if (link.hasAttribute(CONFIG.MARK)) continue;
            const url = link.href;
            if (!url || !/^https?:\/\//i.test(url)) continue;
            // 同上：音频链接同样可能是无扩展名直链；图片链接一律跳过
            const text = (link.innerText || link.textContent || '').trim();
            if (!isProbablyImage(url) &&
                (hasMediaExtension(url) || isProbablyAudio(url) || link.hasAttribute('download') ||
                 /(?:音频|音乐|mp3|m4a|wav|flac)/i.test(text)) && !isWebPageUrl(url)) return url;
        }
        const elements = $$('[data-audio-url], [data-audio], [data-download-url], [data-url]', container);
        for (const el of elements) {
            const url = getUrlFromElement(el);
            if (url && isProbablyAudio(url)) return url;
        }
        return '';
    }

    // =========================================================================
    // 找到结果容器
    // =========================================================================
    function findResultContainers() {
        const candidates = new Set();
        const selectors = [
            '[class*="result"]', '[class*="Result"]',
            '[class*="download"]', '[class*="Download"]',
            '[class*="media"]', '[class*="Media"]',
            '[class*="video"]', '[class*="Video"]',
            '[class*="audio"]', '[class*="Audio"]',
            '.rounded-lg.border-dashed',
            '[class*="border-dashed"]'
        ];
        for (const selector of selectors) {
            $$(selector).forEach(el => {
                if (el instanceof HTMLElement) candidates.add(el);
            });
        }
        $$('a[href], button').forEach(el => {
            const text = (el.innerText || el.textContent || '').trim();
            if (/下载|download/i.test(text)) {
                let node = el;
                for (let i = 0; i < 6 && node; i++) {
                    if (node instanceof HTMLElement) candidates.add(node);
                    node = node.parentElement;
                }
            }
        });
        return Array.from(candidates);
    }

    function findMediaContainer(element) {
        if (!element) return null;
        let node = element;
        for (let i = 0; i < 8 && node; i++) {
            const hasVideo = node.querySelector('video') || findVideoUrl(node);
            const hasAudio = node.querySelector('audio') || findAudioUrl(node);
            const hasDownload = $$('a,button', node).some(el => {
                const text = el.innerText || el.textContent || '';
                return /下载|download/i.test(text);
            });
            if ((hasVideo || hasAudio) && hasDownload) return node;
            node = node.parentElement;
        }
        return element.parentElement || element;
    }

    // =========================================================================
    // 找原始下载按钮
    // =========================================================================
    function findOriginalDownloadButton(container, type) {
        if (!container) return null;
        const elements = $$('a, button', container);
        const matches = [];
        for (const el of elements) {
            if (el.hasAttribute(CONFIG.MARK) || el.dataset.snapanyEnhanced === '1') continue;
            const text = (el.innerText || el.textContent || '').trim();
            const href = el.getAttribute('href') || '';

            // 只以“真正的下载按钮”为锚（避免把分辨率/质量链接当原按钮）
            if (!/下载|download/i.test(text)) continue;
            // 封面/图片按钮与音视频无关
            if (/封面|cover|图片|photo|缩略图|thumbnail/i.test(text)) continue;

            // 类型互斥：视频增强按钮不能以“下载音频/下载音乐”为原按钮，反之亦然，
            // 防止原按钮带 MARK 被跳过后退化到另一媒体的按钮上
            const isAudioText = /音频|音乐|mp3|m4a|wav|aac|ogg|flac/i.test(text);
            const isVideoText = /视频|mp4|原画|超清|高清|1080|720|480|360|240|webm/i.test(text);
            if (type === 'video' && isAudioText && !isVideoText) continue;
            if (type === 'audio' && isVideoText && !isAudioText) continue;

            const score =
                (/下载|download/i.test(text) ? 10 : 0) +
                (/video|视频/i.test(text) && type === 'video' ? 8 : 0) +
                (/audio|音频|音乐/i.test(text) && type === 'audio' ? 8 : 0) +
                (/https?:\/\//i.test(href) ? 5 : 0);
            if (score > 0) matches.push({ el, score });
        }
        matches.sort((a, b) => b.score - a.score);
        return matches.length ? matches[0].el : null;
    }

    // =========================================================================
    // 复制按钮样式（并做移动端友好覆盖）
    // =========================================================================
    function copyButtonStyle(source, target) {
        if (!source || !target) return;
        const computed = getComputedStyle(source);
        const props = [
            'display', 'font-family', 'font-size', 'font-weight', 'line-height',
            'letter-spacing', 'text-align', 'text-decoration', 'color',
            'background', 'background-color', 'background-image',
            'border', 'border-width', 'border-style', 'border-color',
            'border-radius', 'box-shadow', 'align-items', 'justify-content',
            'gap', 'vertical-align', 'cursor', 'transition', 'padding'
        ];
        for (const prop of props) {
            try {
                target.style.setProperty(prop, computed.getPropertyValue(prop), 'important');
            } catch (_) {}
        }
        target.className = source.className || '';
        target.setAttribute(CONFIG.MARK, '1');
        target.dataset.snapanyEnhanced = '1';
        target.onclick = null;

        // 统一按钮尺寸与间距，避免复制过来的 width/height 在移动端出问题
        target.style.setProperty('width', 'auto', 'important');
        target.style.setProperty('min-width', 'auto', 'important');
        target.style.setProperty('max-width', 'none', 'important');
        target.style.setProperty('height', 'auto', 'important');
        target.style.setProperty('flex', '0 0 auto', 'important');
        target.style.setProperty('white-space', 'nowrap', 'important');
        target.style.setProperty('margin', '0', 'important');
    }

    // =========================================================================
    // 插入主按钮
    // =========================================================================
    function insertButtonLikeOriginal(originalButton, newButton) {
        if (!originalButton || !newButton) return;
        copyButtonStyle(originalButton, newButton);
        originalButton.insertAdjacentElement('afterend', newButton);
        newButton.style.setProperty('margin-left', '8px', 'important');
    }

    // =========================================================================
    // 创建主增强按钮
    // =========================================================================
    // 全页级去重：同一解析结果会被多个层级容器反复扫描（按钮外层 div、flex 容器、整卡、虚线框…），
    // 仅靠“容器内查询”会漏判跨容器重复，这里按 URL+类型 全局登记，并校验按钮是否仍在 DOM 中
    // （按钮已随 SPA 重渲染消失时允许重建，避免清理不掉的“幽灵去重”）
    const createdMainButtons = new Map();

    function isCreatedButtonAlive(btn) {
        return !!(btn && btn.isConnected && document.documentElement.contains(btn));
    }

    // 下载中锁：附带超长看门狗，避免下载回调缺失时按钮被永久锁死（表现为“点击没反应”）
    function lockDownloading(btn) {
        btn.dataset.downloading = '1';
        clearTimeout(btn.__dlUnlock);
        btn.__dlUnlock = setTimeout(() => { btn.dataset.downloading = '0'; }, 600000);
    }

    function unlockDownloading(btn) {
        clearTimeout(btn.__dlUnlock);
        btn.dataset.downloading = '0';
    }

    function createDownloadButton(originalButton, type, url, container) {
        if (!url) return null;
        if (container && container.querySelector(`[${CONFIG.MARK}="1"][data-media-type="${type}"]`)) {
            return null;
        }
        const dupKey = 'main:' + type + ':' + url;
        if (isCreatedButtonAlive(createdMainButtons.get(dupKey))) {
            return null;
        }

        const btn = document.createElement(
            originalButton && originalButton.tagName.toLowerCase() === 'a' ? 'a' : 'button'
        );
        if (btn.tagName === 'A') btn.href = url;
        else btn.type = 'button';

        btn.textContent = type === 'audio' ? CONFIG.AUDIO_TEXT : CONFIG.VIDEO_TEXT;
        btn.dataset.mediaUrl = url;
        btn.dataset.mediaType = type;
        btn.setAttribute(CONFIG.MARK, '1');
        btn.dataset.snapanyEnhanced = '1';
        btn.title = type === 'audio' ? '下载音频' : '下载视频';

        if (originalButton) copyButtonStyle(originalButton, btn);

        btn.addEventListener('click', async function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (btn.dataset.downloading === '1') return;
            lockDownloading(btn);
            try {
                await downloadMedia({ url, type, button: btn, originalButton });
            } finally {
                unlockDownloading(btn);
            }
        }, true);

        createdMainButtons.set(dupKey, btn);
        insertButtonLikeOriginal(originalButton, btn);
        return btn;
    }

    // =========================================================================
    // 复制链接小图标（紧跟对应的主增强按钮）
    // =========================================================================
    const COPY_ICON_SVG =
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="9" y="9" width="12" height="12" rx="2" ry="2"></rect>' +
        '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

    // 剪贴板写入：优先 Clipboard API（需安全上下文），失败回退 execCommand
    async function copyTextToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) {
            log('clipboard API failed:', e);
        }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            try { ta.setSelectionRange(0, ta.value.length); } catch (_) {}
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (e) {
            log('execCommand copy failed:', e);
            return false;
        }
    }

    function createCopyButton(anchorButton, type, url) {
        if (!anchorButton || !url) return null;
        const dupKey = 'copy:' + type + ':' + url;
        if (isCreatedButtonAlive(createdMainButtons.get(dupKey))) return null;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = COPY_ICON_SVG;
        btn.dataset.mediaUrl = url;
        btn.dataset.mediaType = 'copy-' + type;
        btn.setAttribute(CONFIG.MARK, '1');
        btn.dataset.snapanyEnhanced = '1';
        btn.title = type === 'audio' ? '复制音频链接' : '复制视频链接';
        btn.setAttribute('aria-label', btn.title);

        btn.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
            'width:34px',
            'height:34px',
            'padding:0',
            'margin:0 0 0 6px',
            'border:1px solid rgba(127,127,127,.4)',
            'border-radius:8px',
            'background:rgba(127,127,127,.12)',
            'color:inherit',
            'cursor:pointer',
            'flex:0 0 auto',
            'vertical-align:middle',
            'box-sizing:border-box',
            'opacity:.85',
            'transition:transform .1s ease, background .15s ease, opacity .15s ease'
        ].join(' !important;') + ' !important;';

        btn.addEventListener('mouseenter', () => {
            btn.style.setProperty('background', 'rgba(127,127,127,.22)', 'important');
            btn.style.setProperty('opacity', '1', 'important');
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.setProperty('background', 'rgba(127,127,127,.12)', 'important');
            btn.style.setProperty('opacity', '.85', 'important');
            btn.style.setProperty('transform', 'scale(1)', 'important');
        });
        btn.addEventListener('mousedown', () => btn.style.setProperty('transform', 'scale(.92)', 'important'));
        btn.addEventListener('mouseup', () => btn.style.setProperty('transform', 'scale(1)', 'important'));

        btn.addEventListener('click', async function (event) {
            event.preventDefault();
            event.stopPropagation();
            const ok = await copyTextToClipboard(url);
            if (ok) {
                showToast(type === 'audio' ? '已复制音频链接' : '已复制视频链接', 'success');
            } else {
                showToast('复制失败，请手动复制', 'error');
            }
        }, true);

        createdMainButtons.set(dupKey, btn);
        anchorButton.insertAdjacentElement('afterend', btn);
        return btn;
    }

    // =========================================================================
    // 处理多分辨率（修复间距 + 移动端）
    // =========================================================================
    function processMultiResolutionOptions(container) {
        if (!container) return;
        if (container.hasAttribute(CONFIG.PROCESSED)) return;

        // 精确找带 dashed 边框的多分辨率容器
        let multiResBox = null;

        const dashedBoxes = $$('.rounded-lg.border-dashed, [class*="border-dashed"]', container);
        for (const box of dashedBoxes) {
            const text = (box.innerText || box.textContent || '').trim();
            if (/更多视频分辨率|更多分辨率|分辨率下载选项|原画|4K|2K|1080/i.test(text)) {
                multiResBox = box;
                break;
            }
        }

        if (!multiResBox) {
            multiResBox = Array.from(container.querySelectorAll('*')).find(el => {
                const text = (el.innerText || el.textContent || '').trim();
                return /更多视频分辨率|更多分辨率|分辨率下载选项/i.test(text);
            });
        }

        if (!multiResBox) return;

        // 已经存在增强行就标记并退出
        if (multiResBox.querySelector(`[${CONFIG.MARK}="1"][data-snapany-row="1"]`)) {
            container.setAttribute(CONFIG.PROCESSED, '1');
            return;
        }

        // 收集清晰度按钮
        const qualityBtns = $$('a, button', multiResBox).filter(el => {
            if (el.hasAttribute(CONFIG.MARK) || el.dataset.snapanyEnhanced === '1') return false;
            const text = (el.innerText || el.textContent || '').trim();
            return /原画|4K|2K|1080p?|720p?|480p?|360p?|240p?|mp4|webm/i.test(text) && text.length < 50;
        });

        if (qualityBtns.length === 0) return;

        // ========== 增强行样式（重点修复间距 + 移动端） ==========
        const enhancedRow = document.createElement('div');
        enhancedRow.style.cssText = `
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 10px !important;
            margin-top: 14px !important;
            padding-top: 12px !important;
            border-top: 1px dashed rgba(59, 130, 246, 0.35) !important;
            width: 100% !important;
            box-sizing: border-box !important;
            justify-content: flex-start !important;
            align-items: center !important;
        `;
        enhancedRow.setAttribute(CONFIG.MARK, '1');
        enhancedRow.dataset.snapanyEnhanced = '1';
        enhancedRow.dataset.snapanyRow = '1';

        qualityBtns.forEach(originalBtn => {
            let url = originalBtn.href || getUrlFromElement(originalBtn) || '';
            if (!url || !/^https?:\/\//i.test(url)) return;

            let qualityName = (originalBtn.innerText || originalBtn.textContent || '').trim()
                .replace(/\(mp4\)|\(webm\)|下载|↓|⬇|⬇️|▶|▶️|\b(?:mp4|webm|mp3|m4a|aac|wav|ogg|flac|mov)\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim() || '视频';

            // 与主按钮同一套全页级去重：同一清晰度地址在多个容器里被扫到时只建一次
            const dupKey = 'res:' + qualityName + ':' + url;
            if (isCreatedButtonAlive(createdMainButtons.get(dupKey))) return;

            const btn = document.createElement(
                originalBtn.tagName.toLowerCase() === 'a' ? 'a' : 'button'
            );
            if (btn.tagName === 'A') btn.href = url;
            else btn.type = 'button';

            btn.textContent = `▶️ ${qualityName}`;
            btn.title = `强制下载 ${qualityName}`;
            btn.dataset.mediaUrl = url;
            btn.dataset.mediaType = 'resolution';
            btn.dataset.qualityName = qualityName;
            btn.setAttribute(CONFIG.MARK, '1');
            btn.dataset.snapanyEnhanced = '1';

            // 复制样式后强制覆盖，保证移动端正常
            copyButtonStyle(originalBtn, btn);

            // 额外强制样式，防止间距和换行问题
            btn.style.setProperty('margin', '0', 'important');
            btn.style.setProperty('flex', '0 0 auto', 'important');
            btn.style.setProperty('white-space', 'nowrap', 'important');
            btn.style.setProperty('min-height', '36px', 'important');

            createdMainButtons.set(dupKey, btn);

            btn.addEventListener('click', async function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (btn.dataset.downloading === '1') return;
                lockDownloading(btn);
                try {
                    await downloadMedia({
                        url,
                        type: 'video',
                        button: btn,
                        originalButton: originalBtn,
                        qualityName: qualityName
                    });
                } finally {
                    unlockDownloading(btn);
                }
            }, true);

            enhancedRow.appendChild(btn);
        });

        if (enhancedRow.children.length > 0) {
            // 插入到 dashed 框内部末尾
            multiResBox.appendChild(enhancedRow);
        }

        // 标记已处理
        container.setAttribute(CONFIG.PROCESSED, '1');
        multiResBox.setAttribute(CONFIG.PROCESSED, '1');
    }

    // =========================================================================
    // 下载相关函数
    // =========================================================================
    function nativeBrowserDownload(url, filename) {
        return new Promise(resolve => {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.target = '_blank';   // 跨域 download 属性可能被忽略：至少新标签打开，避免当前结果页被导航走
            a.rel = 'noopener noreferrer';
            a.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
            document.body.appendChild(a);
            try { a.click(); } catch (e) { log('native download click error', e); }
            setTimeout(() => { try { a.remove(); } catch (_) {} }, 3000);
            resolve();
        });
    }

    // Blob 落地下载：统一处理对象 URL 生命周期，60 秒后再回收，避免大文件下载被提前打断
    function clickBlobDownload(blob, filename) {
        return new Promise(resolve => {
            try {
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = filename;
                a.rel = 'noopener';
                a.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    try { a.remove(); } catch (_) {}
                    try { URL.revokeObjectURL(blobUrl); } catch (_) {}
                }, 60000);
                resolve(true);
            } catch (e) {
                log('Blob download failed:', e);
                resolve(false);
            }
        });
    }

    // 轻量探测：无扩展名的 URL 先用 HEAD 看 Content-Type，
    // 确认不是网页后再走 GM_download（避免把 HTML 存成 .mp4）。失败一律放行。
    function probeHtml(url) {
        return new Promise(resolve => {
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(false); return; }
            let done = false;
            const timer = setTimeout(() => { if (!done) { done = true; resolve(false); } }, 8000);
            const finish = (isHtml) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(isHtml);
            };
            try {
                GM_xmlhttpRequest({
                    method: 'HEAD',
                    url,
                    anonymous: false,
                    timeout: 8000,
                    onload: r => {
                        const m = /content-type\s*:\s*([^;\r\n]+)/i.exec(String((r && r.responseHeaders) || ''));
                        const type = m ? m[1].trim().toLowerCase() : '';
                        finish(/text\/html/i.test(type));
                    },
                    onerror: () => finish(false),
                    onabort: () => finish(false),
                    ontimeout: () => finish(false)
                });
            } catch (e) {
                finish(false);
            }
        });
    }

    // GM_xmlhttpRequest 拉取整文件（支持进度回调 + 超限提前中止，避免大文件拉满内存才报错）
    function gmFetchBlob(url, { maxBytes = 0, onProgress = null } = {}) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('GM_xmlhttpRequest 不可用'));
                return;
            }
            let finished = false;
            let request = null;

            const timer = setTimeout(() => {
                if (finished) return;
                finished = true;
                reject(new Error('下载超时'));
            }, CONFIG.DOWNLOAD_TIMEOUT);

            const fail = (err) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                reject(err);
            };

            // 已知总大小即超过上限：立刻中止，不再浪费带宽/内存
            const checkTooLarge = (size) => {
                if (maxBytes > 0 && size > maxBytes) {
                    const err = tooLargeError(size);
                    try { if (request && typeof request.abort === 'function') request.abort(); } catch (_) {}
                    fail(err);
                    return true;
                }
                return false;
            };

            try {
                request = GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: 'blob',
                    timeout: CONFIG.DOWNLOAD_TIMEOUT,
                    anonymous: false,
                    headers: { 'Accept': 'video/mp4,video/*,audio/*,*/*;q=0.8' },
                    onprogress: response => {
                        if (finished) return;
                        const loaded = (response && typeof response.loaded === 'number') ? response.loaded : 0;
                        const headerTotal = parseContentLength(response && response.responseHeaders);
                        const total = (response && typeof response.total === 'number' && response.total > 0)
                            ? response.total : headerTotal;
                        if (checkTooLarge(total)) return;
                        if (onProgress) onProgress(loaded, total);
                    },
                    onload: response => {
                        if (finished) return;
                        const blob = response && response.response;
                        if (!(response.status >= 200 && response.status < 400) || !blob) {
                            fail(new Error('HTTP ' + response.status));
                            return;
                        }
                        // 服务端未提供 Content-Length 时的兜底校验
                        if (checkTooLarge(blob.size || 0)) return;
                        finished = true;
                        clearTimeout(timer);
                        resolve(blob);
                    },
                    onerror: () => fail(new Error('网络请求失败')),
                    onabort: () => fail(new Error('下载已中止')),
                    ontimeout: () => fail(new Error('请求超时'))
                });
            } catch (e) {
                clearTimeout(timer);
                if (!finished) {
                    finished = true;
                    reject(e);
                }
            }
        });
    }

    // fetch 拉取整文件（GM XHR 不可用时的降级；支持流式进度与超限中止）
    async function fetchBlob(url, { maxBytes = 0, onProgress = null } = {}) {
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'omit',
            mode: 'cors',
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const total = parseContentLength(response.headers.get('content-length') || '');
        if (maxBytes > 0 && total > maxBytes) throw tooLargeError(total);

        if (response.body && typeof response.body.getReader === 'function') {
            const reader = response.body.getReader();
            const chunks = [];
            let loaded = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                loaded += value ? value.byteLength : 0;
                if (onProgress) onProgress(loaded, total);
                if (maxBytes > 0 && loaded > maxBytes) {
                    try { await reader.cancel(); } catch (_) {}
                    throw tooLargeError(loaded);
                }
                chunks.push(value);
            }
            return new Blob(chunks, { type: response.headers.get('content-type') || '' });
        }
        // 不支持流式读取的环境：整体取回（仅最终上报）
        const blob = await response.blob();
        if (maxBytes > 0 && blob.size > maxBytes) throw tooLargeError(blob.size);
        if (onProgress) onProgress(blob.size || 0, total || blob.size);
        return blob;
    }

    // 多线程分片下载的总内存上限（移动端更保守）
    function getMultiLimit() {
        return isMobile() ? CONFIG.MAX_MULTI_BYTES.mobile : CONFIG.MAX_MULTI_BYTES.desktop;
    }

    // 轻量 HEAD：探测 Content-Type / Content-Length / Accept-Ranges（失败返回 null）
    function gmHead(url) {
        return new Promise(resolve => {
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(null); return; }
            let done = false;
            const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 8000);
            const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
            try {
                GM_xmlhttpRequest({
                    method: 'HEAD',
                    url,
                    anonymous: false,
                    timeout: 8000,
                    onload: r => {
                        const lower = String((r && r.responseHeaders) || '').toLowerCase();
                        const get = (k) => {
                            const m = new RegExp(k + '\\s*:\\s*([^\\r\\n]+)', 'i').exec(lower);
                            return m ? m[1].trim() : '';
                        };
                        finish({
                            status: r && r.status,
                            contentType: get('content-type'),
                            contentLength: parseInt(get('content-length'), 10) || 0,
                            acceptRanges: get('accept-ranges')
                        });
                    },
                    onerror: () => finish(null),
                    onabort: () => finish(null),
                    ontimeout: () => finish(null)
                });
            } catch (e) {
                finish(null);
            }
        });
    }

    // 拉取一个 Range 分片（arraybuffer）。服务端忽略 Range 返回 200 整文件时抛 RangeUnsupported
    function gmFetchRange(url, start, end) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('GM_xmlhttpRequest 不可用'));
                return;
            }
            let finished = false;
            const timer = setTimeout(() => {
                if (!finished) { finished = true; reject(new Error('分片请求超时')); }
            }, CONFIG.DOWNLOAD_TIMEOUT);
            const fail = (err) => {
                if (!finished) { finished = true; clearTimeout(timer); reject(err); }
            };
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: 'arraybuffer',
                    timeout: CONFIG.DOWNLOAD_TIMEOUT,
                    anonymous: false,
                    headers: {
                        'Range': 'bytes=' + start + '-' + end,
                        'Accept': 'video/mp4,video/*,audio/*,*/*;q=0.8'
                    },
                    onload: r => {
                        if (finished) return;
                        if (!(r.status >= 200 && r.status < 400) || !r.response) {
                            fail(new Error('分片 HTTP ' + r.status));
                            return;
                        }
                        if (start > 0 && r.status === 200) {
                            const err = new Error('RANGE_UNSUPPORTED');
                            err.name = 'RangeUnsupported';
                            fail(err);
                            return;
                        }
                        finished = true;
                        clearTimeout(timer);
                        resolve(r.response);
                    },
                    onerror: () => fail(new Error('分片网络错误')),
                    onabort: () => fail(new Error('分片已中止')),
                    ontimeout: () => fail(new Error('分片请求超时'))
                });
            } catch (e) {
                clearTimeout(timer);
                if (!finished) { finished = true; reject(e); }
            }
        });
    }

    // 多线程 Range 分片并发下载 → 拼成 Blob（需服务端支持 Range；不支持/失败抛错由调用方回退）
    async function multiThreadFetchBlob(url, total, { threads = 4, onProgress = null } = {}) {
        const unsupported = () => {
            const e = new Error('RANGE_UNSUPPORTED');
            e.name = 'RangeUnsupported';
            return e;
        };
        if (!total || total <= 0) throw unsupported();

        const t = Math.max(1, Math.min(threads, 8));
        const chunkSize = Math.ceil(total / t);
        const ranges = [];
        for (let i = 0; i < t; i++) {
            const start = i * chunkSize;
            const end = i === t - 1 ? total - 1 : Math.min(total - 1, (i + 1) * chunkSize - 1);
            if (start > end) break;
            ranges.push({ start, end, expected: end - start + 1 });
        }

        const loadedPer = new Array(ranges.length).fill(0);
        const parts = new Array(ranges.length);
        let cursor = 0;

        const runWorker = async () => {
            for (;;) {
                const idx = cursor++;
                if (idx >= ranges.length) return;
                const range = ranges[idx];
                let lastErr = null;
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        const buf = await gmFetchRange(url, range.start, range.end);
                        if (buf && buf.byteLength >= range.expected - 1) {
                            parts[idx] = buf;
                            loadedPer[idx] = range.expected;
                            const done = loadedPer.reduce((a, b) => a + b, 0);
                            if (onProgress) onProgress(Math.min(done, total), total);
                            lastErr = null;
                            break;
                        }
                        lastErr = new Error('分片数据不完整');
                    } catch (e) {
                        lastErr = e;
                    }
                }
                if (lastErr) throw lastErr;
            }
        };

        const n = Math.min(t, ranges.length);
        const workers = [];
        for (let i = 0; i < n; i++) workers.push(runWorker());
        await Promise.all(workers);

        const allOk = parts.every((p, i) => p && p.byteLength >= ranges[i].expected - 1);
        if (!allOk) throw unsupported();
        return new Blob(parts, { type: '' });
    }

    async function iosDownload(url, filename, button) {
        showToast('正在准备文件…');
        const progress = createProgress('正在下载文件');
        let blob = null;
        let sizeError = null;

        try {
            blob = await gmFetchBlob(url, {
                maxBytes: CONFIG.MAX_IOS_SHARE_SIZE,
                onProgress: (loaded, total) => progress.update(loaded, total)
            });
        } catch (gmError) {
            log('GM XHR failed:', gmError);
            if (gmError && gmError.tooLarge) {
                sizeError = gmError;
            } else {
                try {
                    blob = await fetchBlob(url, {
                        maxBytes: CONFIG.MAX_IOS_SHARE_SIZE,
                        onProgress: (loaded, total) => progress.update(loaded, total)
                    });
                } catch (fetchError) {
                    log('fetch failed:', fetchError);
                    if (fetchError && fetchError.tooLarge) sizeError = fetchError;
                }
            }
        }

        if (sizeError) {
            progress.hide();
            showToast(`文件约 ${formatBytes(sizeError.size)}，超出 iOS 内存处理上限，请长按原下载按钮保存或改用电脑`, 'error');
            if (button) { button.href = url; button.removeAttribute('download'); }
            return false;
        }
        if (!blob) {
            progress.hide();
            showToast('无法直接获取文件，请尝试长按原下载按钮', 'error');
            if (button) { button.href = url; button.removeAttribute('download'); }
            return false;
        }
        if (/^text\/html/i.test(blob.type || '')) {
            progress.hide();
            showToast('链接返回的是网页而非媒体文件', 'error');
            return false;
        }
        if (blob.size > CONFIG.MAX_IOS_SHARE_SIZE) {
            progress.hide();
            showToast(`文件约 ${formatBytes(blob.size)}，超出 iOS 内存处理上限，请长按原下载按钮保存或改用电脑`, 'error');
            if (button) { button.href = url; button.removeAttribute('download'); }
            return false;
        }

        let file;
        try {
            file = new File([blob], filename, { type: blob.type || guessMimeFromName(filename) });
        } catch (e) {
            log('File creation failed:', e);
            progress.hide();
            showToast('无法生成 iOS 文件', 'error');
            return false;
        }

        const finish = (ok, msg) => {
            progress.hide(ok ? 600 : 0);
            if (msg) showToast(msg, ok ? 'success' : 'error');
        };

        // 首选系统分享（用户可在分享面板里选择“存储到文件”）
        if (navigator.share && navigator.canShare) {
            let canShare = false;
            try {
                canShare = navigator.canShare({ files: [file] });
            } catch (_) {
                canShare = false;
            }
            if (canShare) {
                try {
                    showToast('文件已准备好，正在打开 iOS 保存菜单…');
                    await navigator.share({ files: [file] });
                    finish(true, '文件已交给 iOS 处理');
                    return true;
                } catch (error) {
                    if (error && error.name === 'AbortError') {
                        finish(false, '已取消保存');
                        return false;
                    }
                    if (error && error.name === 'NotAllowedError') {
                        // 大文件下载耗时过长导致“用户激活”过期，系统拒绝自动弹分享
                        finish(false, '下载耗时过长被系统限制自动保存，请再点一次按钮');
                        return false;
                    }
                    log('navigator.share failed:', error);
                }
            }
        }

        // 不支持 share 的旧版 iOS：退化为 Blob 点击（可能不生效，如实提示，不再假报成功）
        const okLegacy = await clickBlobDownload(blob, filename);
        if (okLegacy) {
            finish(true, '已尝试调用 iOS 下载，如未出现请长按原下载按钮');
            return true;
        }
        finish(false, '当前 iOS 浏览器不支持直接保存，请长按原下载按钮');
        if (button) { button.href = url; button.removeAttribute('download'); }
        return false;
    }

    function gmDownloadFile(url, filename) {
        return new Promise((resolve, reject) => {
            if (typeof GM_download !== 'function') {
                reject(new Error('GM_download not available'));
                return;
            }
            let settled = false;
            const done = (fn, arg) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn(arg);
            };
            // 大文件下载管理器可能长时间不回调：若超时仍无回调，视为“已交给下载管理器”，
            // 避免按钮与流程被永久挂起（调用方据此给出提示而不是干等/重复内存下载）
            const timer = setTimeout(() => {
                done(reject, new Error('GM_DL_TIMEOUT'));
            }, CONFIG.GM_DL_TIMEOUT);
            try {
                GM_download({
                    url: url,
                    name: filename,
                    onload: () => done(resolve, true),
                    onerror: (err) => done(reject, err || new Error('GM_download failed')),
                    ontimeout: () => done(reject, new Error('GM_download timeout'))
                });
            } catch (e) {
                done(reject, e);
            }
        });
    }

    async function downloadMedia({ url, type, button, originalButton, qualityName = '' }) {
        if (!url) {
            showToast('没有找到媒体地址', 'error');
            return;
        }

        const qName = qualityName || (button && button.dataset.qualityName) || '';

        // 按 URL 实际特征纠偏类型（防按钮标签与内容不符：如标着“下载视频”实为音频地址）
        let realType = type;
        if (qualityName) {
            realType = 'video';
        } else {
            const soundsVideo = isProbablyVideo(url);
            const soundsAudio = isProbablyAudio(url);
            if (realType === 'video' && soundsAudio && !soundsVideo) realType = 'audio';
            else if (realType === 'audio' && soundsVideo && !soundsAudio) realType = 'video';
        }
        const filename = getFilename(url, realType, originalButton || button, qName);
        log('download:', realType, url, filename, 'quality:', qName);

        // 无扩展名的 URL 可能是媒体直链，也可能是网页：先 HEAD 探测，
        // 确认是网页就直接提示（HEAD 失败/不支持则放行，交给后续 HTML 类型检查兜底）
        if (!hasMediaExtension(url)) {
            const isHtml = await probeHtml(url);
            if (isHtml) {
                showToast('链接返回的是网页而非媒体文件', 'error');
                return;
            }
        }

        // ② iOS：先按 iOS 专用流程处理（分享面板保存；不参与多线程/GM 快路径）
        if (isIOS()) {
            await iosDownload(url, filename, button);
            return;
        }

        // ③ 多线程 Range 分片并发下载（下载工具同款提速）。
        //    前提：服务端支持 Range（HEAD Accept-Ranges: bytes）、文件大小在多线程内存上限内；
        //    任何不支持/失败都自动回退，不会比原流程更差，且 GM 拉取能给出真实百分比进度
        let blob = null;
        if (CONFIG.MULTI_THREAD && typeof GM_xmlhttpRequest === 'function') {
            const info = await gmHead(url);
            const multiLimit = getMultiLimit();
            const canRange = info && info.status >= 200 && info.status < 300 &&
                /bytes/i.test(info.acceptRanges || '') &&
                info.contentLength >= CONFIG.MULTI_THREAD_MIN &&
                info.contentLength <= multiLimit &&
                !/^text\/html/i.test(info.contentType || '');
            if (canRange) {
                const mtUi = createProgress('多线程下载中');
                try {
                    blob = await multiThreadFetchBlob(url, info.contentLength, {
                        threads: CONFIG.MULTI_THREAD_COUNT,
                        onProgress: (loaded, total) => mtUi.update(loaded, total)
                    });
                    mtUi.hide(400);
                } catch (mtError) {
                    blob = null;
                    mtUi.hide();
                    if (!(mtError && (mtError.name === 'RangeUnsupported' || mtError.tooLarge))) {
                        console.warn('[SnapAny DL] 多线程分片失败，已回退：', (mtError && mtError.message) || mtError);
                    }
                }
            }
        }

        if (blob) {
            if (/^text\/html/i.test(blob.type || '')) {
                showToast('链接返回的是网页而非媒体文件', 'error');
                return;
            }
            const okMt = await clickBlobDownload(blob, filename);
            if (okMt) {
                showToast('多线程下载完成', 'success');
                return;
            }
            console.warn('[SnapAny DL] Blob 点击被拦截，回退后续下载链');
            blob = null;
        }

        // ④ GM_download 流式下载：下载管理器落盘，天然支持大文件、不占页面内存。
        //    无百分比回调 → 显示“不确定态”状态条（大文件长时间无回调不至于像没反应）
        if (typeof GM_download === 'function') {
            const gmUi = createProgress('已提交下载任务');
            gmUi.update(0, 0);
            try {
                showToast('已提交下载，请查看浏览器下载列表…');
                await gmDownloadFile(url, filename);
                gmUi.hide(600);
                showToast('下载已开始', 'success');
                return;
            } catch (e) {
                gmUi.hide();
                if (e && e.message === 'GM_DL_TIMEOUT') {
                    console.warn('[SnapAny DL] GM_download 长时间无回调，可能仍在下载管理器中运行');
                    showToast('已交给浏览器下载管理器（若 60 秒后下载列表仍无任务，可再点一次）', 'success');
                    return;
                }
                console.warn('[SnapAny DL] GM_download 失败：', (e && e.message) || e);
                log('GM_download failed:', e);
            }
        }

        // ⑤ 单线程内存下载（带进度与超限快速失败）
        const progress = createProgress(realType === 'audio' ? '正在下载音频' : '正在下载视频');
        const report = (loaded, total) => progress.update(loaded, total);
        const maxBytes = getBlobLimit();

        const fallbackDirect = async (size) => {
            progress.hide();
            showToast(`文件约 ${formatBytes(size)}，超过浏览器内存下载上限，已改用浏览器直接下载`, 'error');
            await nativeBrowserDownload(url, filename);
        };

        let singleBlob = null;
        try {
            singleBlob = await gmFetchBlob(url, { maxBytes, onProgress: report });
        } catch (gmError) {
            log('GM XHR failed:', gmError);
            if (gmError && gmError.tooLarge) {
                await fallbackDirect(gmError.size);
                return;
            }
            try {
                singleBlob = await fetchBlob(url, { maxBytes, onProgress: report });
            } catch (fetchError) {
                log('fetch failed:', fetchError);
                if (fetchError && fetchError.tooLarge) {
                    await fallbackDirect(fetchError.size);
                    return;
                }
                progress.hide();
                console.warn('[SnapAny DL] 内存下载失败，已改用浏览器直链（可能是网络/CDN 限制）');
                await nativeBrowserDownload(url, filename);
                showToast('下载失败（多为网络/CDN 限制），已在新标签页打开原链接：请在新页面另存或长按保存', 'error');
                return;
            }
        }

        if (!singleBlob) {
            progress.hide();
            console.warn('[SnapAny DL] 未能取得文件内容，已改用浏览器直链');
            await nativeBrowserDownload(url, filename);
            showToast('未能直接取得文件（多为网络/CDN 限制），已在新标签页打开原链接：请另存或长按保存', 'error');
            return;
        }
        if (/^text\/html/i.test(singleBlob.type || '')) {
            progress.hide();
            showToast('链接返回的是网页而非媒体文件', 'error');
            return;
        }
        if (maxBytes > 0 && singleBlob.size > maxBytes) {
            await fallbackDirect(singleBlob.size);
            return;
        }

        const okSingle = await clickBlobDownload(singleBlob, filename);
        progress.hide(okSingle ? 600 : 0);
        if (okSingle) {
            showToast('下载已开始', 'success');
        } else {
            console.warn('[SnapAny DL] Blob 点击失败，已改用浏览器直链');
            showToast('内存下载被浏览器拦截，已改用浏览器直链：请在新标签页另存或长按保存', 'error');
            await nativeBrowserDownload(url, filename);
        }
    }

    // =========================================================================
    // 处理单个容器
    // =========================================================================
    function processContainer(container) {
        if (!container) return;
        if (container.hasAttribute(CONFIG.PROCESSED)) return;

        if (container.children.length === 0 && !(container.innerText || '').trim()) return;

        // 主视频按钮
        const videoUrl = findVideoUrl(container);
        if (videoUrl && !container.querySelector(`[${CONFIG.MARK}="1"][data-media-type="video"]`)) {
            const original = findOriginalDownloadButton(container, 'video');
            if (original) {
                const enhanced = createDownloadButton(original, 'video', videoUrl, container);
                const anchor = enhanced ||
                    container.querySelector(`[${CONFIG.MARK}="1"][data-media-type="video"]`);
                if (anchor && !container.querySelector(`[${CONFIG.MARK}="1"][data-media-type="copy-video"]`)) {
                    createCopyButton(anchor, 'video', videoUrl);
                }
            }
        }

        // 主音频按钮
        const audioUrl = findAudioUrl(container);
        if (audioUrl && !container.querySelector(`[${CONFIG.MARK}="1"][data-media-type="audio"]`)) {
            const original = findOriginalDownloadButton(container, 'audio');
            if (original) {
                const enhanced = createDownloadButton(original, 'audio', audioUrl, container);
                const anchor = enhanced ||
                    container.querySelector(`[${CONFIG.MARK}="1"][data-media-type="audio"]`);
                if (anchor && !container.querySelector(`[${CONFIG.MARK}="1"][data-media-type="copy-audio"]`)) {
                    createCopyButton(anchor, 'audio', audioUrl);
                }
            }
        }

        // 多分辨率
        processMultiResolutionOptions(container);

        if (container.querySelector(`[${CONFIG.MARK}="1"]`)) {
            container.setAttribute(CONFIG.PROCESSED, '1');
        }
    }

    // =========================================================================
    // 智能扫描
    // =========================================================================
    let scanTimer = null;
    let isScanning = false;
    let domDirty = true;   // DOM 是否发生变化：只有变化后才做全页扫描，避免无谓开销

    function scanPage() {
        if (isScanning) return;
        isScanning = true;
        domDirty = false;

        try {
            const containers = findResultContainers();
            log('containers:', containers.length);

            for (const candidate of containers) {
                const container = findMediaContainer(candidate);
                if (container) processContainer(container);
            }

            $$('video, audio').forEach(media => {
                const container = findMediaContainer(media);
                if (container) processContainer(container);
            });

            $$('a, button').forEach(el => {
                if (el.hasAttribute(CONFIG.MARK)) return;
                const text = (el.innerText || el.textContent || '').trim();
                if (!/下载|download/i.test(text)) return;
                const container = findMediaContainer(el);
                if (container) processContainer(container);
            });
        } finally {
            isScanning = false;
        }
    }

    function scheduleScan() {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(scanPage, 350);
    }

    function startObserver() {
        const observer = new MutationObserver(mutations => {
            let useful = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1 &&
                            (node.hasAttribute?.(CONFIG.MARK) ||
                             node.querySelector?.(`[${CONFIG.MARK}="1"]`))) {
                            continue;
                        }
                        useful = true;
                        break;
                    }
                }
                if (mutation.type === 'attributes') useful = true;
                if (useful) break;
            }
            if (useful) {
                domDirty = true;
                scheduleScan();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href', 'src', 'data-url', 'data-video', 'data-video-url', 'data-audio', 'data-audio-url']
        });
        return observer;
    }

    // =========================================================================
    // 初始化
    // =========================================================================
    async function init() {
        log('SnapAny downloader enhanced v2.7.0');
        await sleep(700);
        scanPage();
        startObserver();

        // 兜底轮询：仅在 DOM 有变化时才执行，避免重复整页扫描
        setInterval(() => { if (domDirty) scanPage(); }, CONFIG.SCAN_INTERVAL);

        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                log('URL changed:', lastUrl);
                $$(`[${CONFIG.PROCESSED}]`).forEach(el => el.removeAttribute(CONFIG.PROCESSED));
                setTimeout(scanPage, 900);
            }
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();