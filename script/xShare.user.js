// ==UserScript==
// @name         X 推文一键生成分享卡片（自定义文件名 + 统一图标风格 + 极简视觉重构）
// @namespace    http://tampermonkey.net/
// @version      4.5
// @description  普通推文 t.co 短链自动还原为原始完整网址（后台跟随跳转，卡片显示完整 https:// 链接）
// @author       You
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @connect      pbs.twimg.com
// @connect      ton.twimg.com
// @connect      video.twimg.com
// @connect      t.co
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';
    const processed = new WeakSet();
    const STORAGE_KEY_WIDTH = 'sc_custom_card_width';
    const STORAGE_KEY_SHOW_PLAY = 'sc_show_play_button';
    const STORAGE_KEY_FILENAME_PREFIX = 'sc_filename_custom_prefix';
    let activePanel = null;
    const tcoCache = new Map(); // t.co 短链 -> 原始完整 URL

    function getStoredWidth() {
        const saved = localStorage.getItem(STORAGE_KEY_WIDTH);
        return saved ? parseInt(saved, 10) : 400;
    }
    function setStoredWidth(width) {
        localStorage.setItem(STORAGE_KEY_WIDTH, String(width));
    }
    function getStoredShowPlay() {
        const saved = localStorage.getItem(STORAGE_KEY_SHOW_PLAY);
        return saved === null ? true : saved === 'true';
    }
    function setStoredShowPlay(value) {
        localStorage.setItem(STORAGE_KEY_SHOW_PLAY, String(value));
    }

    const ICONS = {
        cardSparkle: `<svg class="sc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="3"/><path d="M7 9h4"/><path d="M7 13h8"/><path d="m19 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/></svg>`,
        close: `<svg class="sc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        refresh: `<svg class="sc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
        download: `<svg class="sc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
        copy: `<svg class="sc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
        image: `<svg class="sc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
        video: `<svg class="sc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`,
        quote: `<svg class="sc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>`,
        spinner: `<svg class="sc-icon sc-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-linecap="round"/></svg>`,
        play: `<svg class="sc-play-icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
        verified: `<svg class="sc-verified" viewBox="0 0 22 22" aria-label="已认证用户"><g><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.136 2.136 5.37-5.37 1.293 1.302-6.663 6.662z" fill="#1d9bf0"></path></g></svg>`,
        chevronDown: `<svg class="sc-icon sc-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>`,
        chevronRight: `<svg class="sc-icon sc-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>`
    };

    function getRichTextContent(container) {
        if (!container) return '';
        let html = '';
        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                html += escapeHtml(node.textContent);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'A') {
                    const linkText = node.textContent.trim();
                    const href = node.getAttribute('href');
                    if (linkText) {
                        html += `<span class="sc-link" data-href="${escapeHtml(href || '')}">${escapeHtml(linkText)}</span>`;
                    } else {
                        html += `<span class="sc-link">${escapeHtml(href || '')}</span>`;
                    }
                } else {
                    for (const child of node.childNodes) {
                        walk(child);
                    }
                }
            }
        }
        for (const child of container.childNodes) {
            walk(child);
        }
        return html;
    }

    function getPlainTextContent(container) {
        if (!container) return '';
        let text = '';
        function walk(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'A') {
                    text += node.textContent;
                } else {
                    for (const child of node.childNodes) {
                        walk(child);
                    }
                }
            }
        }
        for (const child of container.childNodes) {
            walk(child);
        }
        return text.trim();
    }

    function findQuoteRoot(article) {
        let quote = article.querySelector('[data-testid="quoteTweet"]');
        if (quote) return quote;
        const userNames = article.querySelectorAll('[data-testid="User-Name"]');
        if (userNames.length > 1) {
            let candidate = userNames[1];
            while (candidate && candidate !== article) {
                if (candidate.hasAttribute('role') && candidate.getAttribute('role') === 'link') {
                    return candidate;
                }
                const style = getComputedStyle(candidate);
                if (parseFloat(style.borderTopWidth) > 0 || parseFloat(style.borderWidth) > 0) {
                    return candidate;
                }
                candidate = candidate.parentElement;
            }
        }
        return null;
    }

    // ===== X Articles 长文支持（x.com/<user>/status/<id> 形式的文章页）=====
    // 真实 DOM（已按线上页面核对）：
    //   容器   article[data-testid="twitterArticleReadView"]
    //   标题   [data-testid="twitter-article-title"]
    //   正文   [data-testid="twitterArticleRichTextView"] 内的 Draft.js 块 div.longform-unstyled[data-block]
    //   空段落 只有 <br data-text="true">；封面是 readView 内第一张 [data-testid="tweetPhoto"] img
    function extractArticleRich(root) {
        const blocks = [];
        if (!root) return blocks;
        const rich = root.querySelector('[data-testid="longformRichTextComponent"]') || root;
        const paraEls = rich.querySelectorAll('.longform-unstyled, div[data-block="true"]');
        const seen = new WeakSet();
        paraEls.forEach(el => {
            if (seen.has(el)) return;
            seen.add(el);
            if (el.parentElement && el.parentElement.closest('.longform-unstyled')) return; // 跳过嵌套容器
            const text = (el.innerText || '').replace(/\u00a0/g, ' ').trim();
            const brOnly = !el.querySelector('span[data-text="true"]') && el.querySelector('br');
            if (!text) {
                if (brOnly) blocks.push({ type: 'spacer' });
                return;
            }
            blocks.push({ type: 'text', html: getRichTextContent(el) });
        });
        // 兜底：Draft 块不可用时退回整块纯文本分段
        if (!blocks.length) {
            const text = (rich.innerText || '').trim();
            text.split(/\n{2,}/).forEach(seg => { if (seg.trim()) blocks.push({ type: 'text', html: escapeHtml(seg.trim()).replace(/\n/g, '<br>') }); });
        }
        return blocks;
    }

    function extractArticleData(article) {
        const data = extractTweetData(article);

        const readView = article.querySelector('[data-testid="twitterArticleReadView"], [data-testid="articleViewer"]');
        const titleEl = article.querySelector('[data-testid="twitter-article-title"]') ||
            article.querySelector('[data-testid="articleTitle"]');
        const richView = article.querySelector('[data-testid="twitterArticleRichTextView"], [data-testid="articleRichContent"], [data-testid="longformRichTextComponent"]');

        if (readView || titleEl || richView) {
            data.isArticle = true;
            data.articleTitle = titleEl ? titleEl.innerText.trim() : '';

            // 封面 = readView 内第一张媒体图；其余图片追加到正文块之后
            const photos = readView
                ? [...readView.querySelectorAll('[data-testid="tweetPhoto"] img, img[src*="/media/"]')]
                : [];
            let cover = '';
            const extraImgs = [];
            const seenSrc = new Set();
            photos.forEach(img => {
                const raw = img.currentSrc || img.getAttribute('src') || '';
                const src = raw.replace(/name=\w+/, 'name=large');
                if (!src || seenSrc.has(src)) return;
                seenSrc.add(src);
                if (!cover) cover = src;
                else extraImgs.push(src);
            });
            if (!cover && data.images.length) cover = data.images[0];
            data.articleCover = cover;

            data.articleBlocks = extractArticleRich(richView);
            extraImgs.forEach(src => data.articleBlocks.push({ type: 'image', src }));

            // 长文不重复渲染普通图片/视频网格（封面已在文章块内）
            data.images = [];
            data.videos = [];
        }
        return data;
    }

    function injectButtons() {
        document.querySelectorAll('article[data-testid="tweet"]').forEach(article => {
            if (processed.has(article) || article.querySelector('.sc-gen-btn')) return;
            processed.add(article);
            const actionBar = article.querySelector('[role="group"]');
            if (!actionBar) return;
            const btn = document.createElement('div');
            btn.className = 'sc-gen-btn';
            btn.innerHTML = ICONS.cardSparkle;
            btn.title = '生成推文分享卡片';
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                openCardFromArticle(article);
            });
            actionBar.appendChild(btn);
        });
    }

    function extractTweetData(article) {
        const quoteRoot = findQuoteRoot(article);
        const isInsideQuote = el => !!(quoteRoot && el && quoteRoot.contains(el));

        let name = '', handle = '';
        const allUserEls = article.querySelectorAll('[data-testid="User-Name"]');
        let mainUserEl = null;
        for (const el of allUserEls) {
            if (!isInsideQuote(el)) {
                mainUserEl = el;
                break;
            }
        }
        if (mainUserEl) {
            const texts = [...mainUserEl.querySelectorAll('span')].map(s => s.textContent.trim()).filter(Boolean);
            texts.forEach(t => {
                if (t.startsWith('@') && !handle) handle = t;
                else if (!name && !t.includes('·') && t.length < 40 && !t.startsWith('@')) name = t;
            });
        }

        let mainTextEl = null;
        for (const t of article.querySelectorAll('[data-testid="tweetText"]')) {
            if (!isInsideQuote(t)) {
                mainTextEl = t;
                break;
            }
        }
        const contentHtml = mainTextEl ? getRichTextContent(mainTextEl) : '';
        const contentPlain = mainTextEl ? getPlainTextContent(mainTextEl) : '';

        let avatar = '';
        for (const img of article.querySelectorAll('img[src*="profile_images"]')) {
            if (!isInsideQuote(img)) {
                avatar = img.src.replace('_normal', '_400x400').replace('_bigger', '_400x400');
                break;
            }
        }

        const timeEl = article.querySelector('time');
        const time = timeEl ? (timeEl.textContent.trim() || '') : '';
        let views = '';
        const analytics = article.querySelector('a[href*="/analytics"] span');
        if (analytics) views = analytics.textContent.trim() + '次查看';

        const images = [];
        const addImg = (src, el) => {
            if (!src || images.includes(src) || isInsideQuote(el)) return;
            src = src.replace(/name=\w+/, 'name=large').replace(/&name=\w+/, '&name=large');
            images.push(src);
        };
        article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => addImg(img.src, img));
        if (!images.length) {
            article.querySelectorAll('img[src*="pbs.twimg.com/media"]').forEach(img => addImg(img.src, img));
        }

        const videos = [];
        const addVideo = (src, el) => {
            if (!src || videos.includes(src) || images.includes(src) || isInsideQuote(el)) return;
            videos.push(src);
        };
        article.querySelectorAll('video[poster]').forEach(v => addVideo(v.poster, v));
        article.querySelectorAll('[data-testid="videoPlayer"] img, [data-testid="videoComponent"] img').forEach(img => addVideo(img.src, img));
        article.querySelectorAll('[data-testid="videoPlayer"] div[style*="background"]').forEach(div => {
            const m = div.style.backgroundImage?.match(/url\(["']?(https[^"')]+)/);
            if (m) addVideo(m[1], div);
        });

        let quoted = null;
        if (quoteRoot) {
            let qName = '', qHandle = '', qAvatar = '';
            const qUserEl = quoteRoot.querySelector('[data-testid="User-Name"]');
            if (qUserEl) {
                [...qUserEl.querySelectorAll('span')].forEach(s => {
                    const t = s.textContent.trim();
                    if (t.startsWith('@')) qHandle = t;
                    else if (!qName && !t.includes('·') && t.length < 40) qName = t;
                });
                const qImg = quoteRoot.querySelector('img[src*="profile_images"]');
                if (qImg) qAvatar = qImg.src.replace('_normal', '_400x400').replace('_bigger', '_400x400');
            }
            const qTextEl = quoteRoot.querySelector('[data-testid="tweetText"]');
            const qContent = qTextEl ? qTextEl.innerText.trim() : '';
            const qImages = [];
            quoteRoot.querySelectorAll('[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com/media"], img[src*="media"]').forEach(img => {
                if (img.src && !qImages.includes(img.src)) {
                    qImages.push(img.src.replace(/name=\w+/, 'name=small'));
                }
            });
            quoteRoot.querySelectorAll('video[poster]').forEach(v => {
                if (v.poster && !qImages.includes(v.poster)) {
                    qImages.push(v.poster);
                }
            });
            if (qContent || qImages.length || qName) {
                quoted = { name: qName, handle: qHandle, avatar: qAvatar, content: qContent, images: qImages };
            }
        }

        const linkEl = article.querySelector('a[href*="/status/"]');
        const link = linkEl ? 'https://x.com' + linkEl.getAttribute('href').split('?')[0] : location.href;

        return { name, handle, contentHtml, contentPlain, avatar, time, views, images, videos, quoted, link };
    }

    function generateDefaultFilename(data) {
        const handleClean = (data.handle || '').replace(/^@/, '').trim();
        const nameClean = (data.name || '').replace(/[\\/:*?"<>|\s]/g, '_').slice(0, 15);
        const author = handleClean || nameClean || 'post';

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const timeStamp = `${year}${month}${day}_${hour}${min}`;

        return `x_${author}_${timeStamp}`;
    }

    function openCardFromArticle(article) {
        showPanel(extractArticleData(article));
    }

    function showPanel(data) {
        const old = document.getElementById('share-card-panel');
        if (old) old.remove();

        const defaultWidth = getStoredWidth();
        const defaultShowPlay = getStoredShowPlay();
        const defaultFilename = generateDefaultFilename(data);

        const panel = document.createElement('div');
        panel.id = 'share-card-panel';
        panel.innerHTML = `
            <div class="scp-header">
                <div class="scp-title">
                    <span class="scp-title-icon">${ICONS.cardSparkle}</span>
                    <span>推文分享卡片生成器</span>
                    <span class="scp-version-badge">v4.1</span>
                </div>
                <button id="scp-close" title="关闭窗口">${ICONS.close}</button>
            </div>
            <div class="scp-body">
                <div class="scp-form">
                    <div class="scp-control-group">
                        <div class="scp-label-row">
                            <label>卡片宽度</label>
                            <span id="scp-width-display" class="scp-badge">${defaultWidth}px</span>
                        </div>
                        <input type="range" id="scp-width-slider" min="320" max="720" step="10" value="${defaultWidth}">
                        <div class="scp-width-presets">
                            <button type="button" class="scp-chip-btn" data-w="360">360 窄屏</button>
                            <button type="button" class="scp-chip-btn" data-w="420">420 标准</button>
                            <button type="button" class="scp-chip-btn" data-w="500">500 经典</button>
                            <button type="button" class="scp-chip-btn" data-w="600">600 宽卡</button>
                        </div>
                    </div>

                    <div class="scp-control-group" style="margin-top: 8px;">
                        <label style="display:flex; align-items:center; gap:6px; font-weight:600; font-size:13px; color:#0f1419; cursor:pointer;">
                            <input type="checkbox" id="scp-show-playbtn" ${defaultShowPlay ? 'checked' : ''}> 显示视频播放按钮
                        </label>
                    </div>

                    <!-- X Articles 长文标题 -->
                    <div id="scp-article-title-group" class="scp-control-group" style="margin-top: 8px; display: none;">
                        <div class="scp-label-row">
                            <label>文章标题</label>
                            <button type="button" id="scp-article-reset" class="scp-link-action" title="重新从推文读取文章标题">重新读取</button>
                        </div>
                        <input type="text" id="scp-article-title" placeholder="文章标题" style="margin-top: 6px;">
                    </div>

                    <!-- 自定义下载图片名称输入组 -->
                    <div class="scp-control-group" style="margin-top: 8px;">
                        <div class="scp-label-row">
                            <label>导出文件名 (.png)</label>
                            <button type="button" id="scp-filename-reset" class="scp-link-action" title="重置为默认命名">重置默认</button>
                        </div>
                        <div class="scp-filename-wrap">
                            <input type="text" id="scp-filename" placeholder="例如: x_post_card" style="margin: 0; padding-right: 48px;">
                            <span class="scp-ext-badge">.png</span>
                        </div>
                    </div>

                    <div class="scp-row-2">
                        <div>
                            <label>昵称</label>
                            <input type="text" id="scp-name">
                        </div>
                        <div>
                            <label>Handle</label>
                            <input type="text" id="scp-handle">
                        </div>
                    </div>
                    <label>头像 URL</label>
                    <input type="text" id="scp-avatar">
                    <label>正文内容</label>
                    <textarea id="scp-content" rows="5" placeholder="输入或编辑推文正文..."></textarea>
                    <div class="scp-row-2">
                        <div>
                            <label>发布时间</label>
                            <input type="text" id="scp-time">
                        </div>
                        <div>
                            <label>阅读量</label>
                            <input type="text" id="scp-views">
                        </div>
                    </div>
                    <div class="scp-stats">
                        ${data.isArticle ? `<div class="scp-stat-chip">${ICONS.cardSparkle}<span>文章 ${data.articleBlocks ? data.articleBlocks.length : 0} 段</span></div>` : ''}
                        <div class="scp-stat-chip">${ICONS.image}<span>图片 ${data.images.length}</span></div>
                        <div class="scp-stat-chip">${ICONS.video}<span>视频 ${data.videos.length}</span></div>
                        <div class="scp-stat-chip">${ICONS.quote}<span>引用 ${data.quoted ? '有' : '无'}</span></div>
                    </div>
                    <div class="scp-actions">
                        <button id="scp-download" class="primary">
                            ${ICONS.download}
                            <span>下载卡片图片</span>
                        </button>
                        <button id="scp-copy" class="secondary">
                            ${ICONS.copy}
                            <span>复制图片</span>
                        </button>
                        <button id="scp-preview" class="secondary">
                            ${ICONS.refresh}
                            <span>刷新预览</span>
                        </button>
                    </div>
                </div>
                <div class="scp-preview-wrap">
                    <div id="scp-card-wrapper" style="width: ${defaultWidth}px;">
                        <div id="scp-card" class="share-card"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('scp-name').value = data.name || '';
        document.getElementById('scp-handle').value = data.handle || '';
        document.getElementById('scp-avatar').value = data.avatar || '';
        document.getElementById('scp-content').value = data.contentPlain || '';
        document.getElementById('scp-time').value = data.time || '';
        document.getElementById('scp-views').value = data.views || '';
        document.getElementById('scp-filename').value = defaultFilename;

        panel._data = {
            ...data,
            originalContentHtml: data.contentHtml,
            originalContentPlain: data.contentPlain
        };

        // X Articles 长文：标题输入组显隐 + 重置
        const articleGroup = document.getElementById('scp-article-title-group');
        const articleTitleInput = document.getElementById('scp-article-title');
        if (data.isArticle) {
            articleGroup.style.display = '';
            articleTitleInput.value = data.articleTitle || '';
        } else {
            articleGroup.style.display = 'none';
            articleTitleInput.value = '';
        }
        document.getElementById('scp-article-reset').onclick = () => {
            articleTitleInput.value = (panel._data && panel._data.articleTitle) || '';
            showToast('已恢复文章标题', 'info');
        };

        // 文件名重置操作
        document.getElementById('scp-filename-reset').onclick = () => {
            const currentData = {
                name: document.getElementById('scp-name').value,
                handle: document.getElementById('scp-handle').value
            };
            document.getElementById('scp-filename').value = generateDefaultFilename(currentData);
            showToast('已重置导出文件名', 'info');
        };

        // 宽度控制
        const slider = document.getElementById('scp-width-slider');
        const display = document.getElementById('scp-width-display');
        const wrapper = document.getElementById('scp-card-wrapper');
        function applyWidth(width) {
            const w = Math.min(Math.max(parseInt(width, 10) || 400, 300), 800);
            slider.value = w;
            display.textContent = `${w}px`;
            wrapper.style.width = `${w}px`;
            setStoredWidth(w);
            document.querySelectorAll('.scp-chip-btn').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.w, 10) === w);
            });
        }
        slider.addEventListener('input', (e) => applyWidth(e.target.value));
        document.querySelectorAll('.scp-chip-btn').forEach(btn => {
            btn.addEventListener('click', () => applyWidth(btn.dataset.w));
        });
        applyWidth(defaultWidth);

        // 播放按钮开关记忆
        const playCheckbox = document.getElementById('scp-show-playbtn');
        playCheckbox.addEventListener('change', () => {
            setStoredShowPlay(playCheckbox.checked);
            renderCard(panel._data);
        });

        // 操作按钮事件
        document.getElementById('scp-close').onclick = () => { panel.remove(); activePanel = null; };
        document.getElementById('scp-preview').onclick = () => renderCard(panel._data);
        document.getElementById('scp-download').onclick = () => exportCard(false);
        document.getElementById('scp-copy').onclick = () => exportCard(true);

        renderCard(panel._data);

        // 后台还原 t.co 短链；解析完成后若有变化，同步输入框并重渲染
        resolveTcoLinksForPanel(panel._data).then(changed => {
            if (changed && document.getElementById('share-card-panel') === panel) {
                const contentInput = document.getElementById('scp-content');
                if (contentInput && normalizeInput(contentInput.value) === normalizeInput(panel._data.originalContentPlain)) {
                    contentInput.value = panel._data.originalContentPlain;
                }
                renderCard(panel._data);
            }
        });
    }

    function normalizeInput(s) {
        return (s || '').trim().replace(/\r\n/g, '\n');
    }

    function renderCard(data) {
        const name = document.getElementById('scp-name').value;
        const handle = document.getElementById('scp-handle').value;
        const avatar = document.getElementById('scp-avatar').value;
        const currentContent = document.getElementById('scp-content').value;
        const time = document.getElementById('scp-time').value;
        const views = document.getElementById('scp-views').value;
        const showPlay = document.getElementById('scp-show-playbtn').checked;
        const articleTitleInput = document.getElementById('scp-article-title');
        const articleTitle = data.isArticle && articleTitleInput ? articleTitleInput.value.trim() : '';
        if (data.isArticle && activePanel && activePanel._data) activePanel._data.articleTitle = articleTitle;

        const normalize = s => s.trim().replace(/\r\n/g, '\n');
        const isUnmodified = normalize(currentContent) === normalize(data.originalContentPlain);
        let contentHtml;
        if (isUnmodified) {
            contentHtml = data.originalContentHtml;
        } else {
            contentHtml = escapeHtml(currentContent).replace(/\n/g, '<br>');
        }

        let mediaHtml = '';
        if (data.images?.length) {
            if (data.images.length === 1) {
                mediaHtml += `<div class="sc-media single"><img src="${data.images[0]}" crossorigin="anonymous" referrerpolicy="no-referrer"></div>`;
            } else {
                const n = Math.min(data.images.length, 4);
                mediaHtml += `<div class="sc-media grid grid-${n}">
                    ${data.images.slice(0, 4).map(src => `<img src="${src}" crossorigin="anonymous" referrerpolicy="no-referrer">`).join('')}
                </div>`;
            }
        }
        if (data.videos?.length) {
            data.videos.forEach(src => {
                let videoHtml = `<div class="sc-media video"><img src="${src}" crossorigin="anonymous" referrerpolicy="no-referrer">`;
                if (showPlay) {
                    videoHtml += `<div class="play-btn">${ICONS.play}</div>`;
                }
                videoHtml += `</div>`;
                mediaHtml += videoHtml;
            });
        }

        // X Articles 长文：封面 + 富文本正文块渲染
        let articleHtml = '';
        if (data.isArticle) {
            let body = '';
            if (data.articleBlocks?.length) {
                data.articleBlocks.forEach(b => {
                    if (b.type === 'heading') body += `<div class="sc-art-h">${b.html}</div>`;
                    else if (b.type === 'subheading') body += `<div class="sc-art-h2">${b.html}</div>`;
                    else if (b.type === 'text') body += `<div class="sc-art-p">${b.html}</div>`;
                    else if (b.type === 'list') body += `<${b.ordered ? 'ol' : 'ul'} class="sc-art-${b.ordered ? 'ol' : 'ul'}">${b.items.map(it => `<li class="sc-art-li">${it}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`;
                    else if (b.type === 'quote') body += `<blockquote class="sc-art-blockquote">${b.html}</blockquote>`;
                    else if (b.type === 'code') body += `<pre class="sc-art-pre">${escapeHtml(b.text)}</pre>`;
                    else if (b.type === 'image') body += `<img class="sc-art-img" src="${b.src}" crossorigin="anonymous" referrerpolicy="no-referrer">`;
                    else if (b.type === 'spacer') body += `<div class="sc-art-spacer"></div>`;
                });
            } else if (data.contentPlain) {
                body = data.contentPlain.split(/\n{2,}/).map(seg => `<div class="sc-art-p">${escapeHtml(seg.trim()).replace(/\n/g, '<br>')}</div>`).join('');
            } else {
                body = `<div class="sc-art-p" style="color:#536471;">（未能提取到文章正文，可在左侧文本框粘贴内容后刷新预览）</div>`;
            }
            const coverHtml = data.articleCover ? `<img class="sc-art-cover" src="${data.articleCover}" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
            articleHtml = `<div class="sc-article">${coverHtml}<div class="sc-art-body">${articleTitle ? `<h2 class="sc-art-title">${escapeHtml(articleTitle)}</h2>` : ''}${body}</div></div>`;
        }

        let quoteHtml = '';
        if (data.quoted && (data.quoted.content || data.quoted.images?.length)) {
            const q = data.quoted;
            let qImg = '';
            if (q.images?.length) {
                qImg = `<div class="q-media"><img src="${q.images[0]}" crossorigin="anonymous" referrerpolicy="no-referrer"></div>`;
            }
            const qAvatarHtml = q.avatar ? `<img class="q-avatar" src="${q.avatar}" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : '';
            quoteHtml = `
                <div class="sc-quote">
                    <div class="q-header">
                        ${qAvatarHtml}
                        <div class="q-user">
                            <strong>${escapeHtml(q.name)}</strong>
                            <span>${escapeHtml(q.handle)}</span>
                        </div>
                    </div>
                    ${q.content ? `<div class="q-content">${escapeHtml(q.content).replace(/\n/g, '<br>')}</div>` : ''}
                    ${qImg}
                </div>`;
        }

        document.getElementById('scp-card').innerHTML = `
            <div class="sc-header">
                <img class="sc-avatar" src="${avatar}" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="this.style.background='#cfd9de'">
                <div class="sc-user">
                    <div class="sc-name">
                        <span>${escapeHtml(name)}</span>
                        ${ICONS.verified}
                    </div>
                    <div class="sc-handle">${escapeHtml(handle)}</div>
                </div>
                <button class="sc-follow">关注</button>
            </div>
            <div class="sc-content">${contentHtml}</div>
            ${articleHtml}
            ${mediaHtml}
            ${quoteHtml}
            <div class="sc-meta">${escapeHtml(time)}${views ? ' · ' + escapeHtml(views) : ''}</div>
            <div class="sc-footer">
                <span class="sc-footer-link">相关话题 ${ICONS.chevronDown}</span>
                <span class="sc-footer-link">查看引用推文 ${ICONS.chevronRight}</span>
            </div>
        `;
    }

    async function exportCard(copy = false) {
        const wrapper = document.getElementById('scp-card-wrapper');
        if (!wrapper) return;
        const downloadBtn = document.getElementById('scp-download');
        const copyBtn = document.getElementById('scp-copy');
        const targetBtn = copy ? copyBtn : downloadBtn;
        const originalHtml = targetBtn.innerHTML;

        const filenameInput = document.getElementById('scp-filename');
        const customName = filenameInput ? filenameInput.value.trim() : '';

        try {
            targetBtn.innerHTML = `${ICONS.spinner}<span>${copy ? '正在生成...' : '正在导出...'}</span>`;
            targetBtn.disabled = true;
            const imgs = wrapper.querySelectorAll('img');
            await Promise.all([...imgs].map(img => {
                if (img.complete && img.naturalWidth) return Promise.resolve();
                return new Promise(resolve => {
                    img.onload = img.onerror = resolve;
                    setTimeout(resolve, 5000);
                });
            }));
            const canvas = await html2canvas(wrapper, {
                backgroundColor: null,
                scale: window.devicePixelRatio && window.devicePixelRatio > 1 ? window.devicePixelRatio : 2,
                useCORS: true,
                allowTaint: false,
                logging: false,
                imageTimeout: 12000,
                onclone: doc => {
                    const w = doc.getElementById('scp-card-wrapper');
                    if (w) {
                        w.style.borderRadius = '16px';
                        w.style.overflow = 'hidden';
                        w.style.background = '#ffffff';
                    }
                }
            });
            if (copy) {
                canvas.toBlob(async blob => {
                    try {
                        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                        showToast('已成功复制卡片至剪贴板！', 'success');
                    } catch {
                        download(canvas, customName);
                        showToast('复制失败，已自动转为下载图片', 'info');
                    }
                });
            } else {
                download(canvas, customName);
                showToast('已开始下载推文分享卡片！', 'success');
            }
        } catch (e) {
            console.error('Export card failed:', e);
            showToast('生成失败，请稍后刷新重试', 'error');
        } finally {
            targetBtn.innerHTML = originalHtml;
            targetBtn.disabled = false;
        }
    }

    function download(canvas, customName) {
        let filename = (customName || '').trim();
        if (!filename) {
            filename = `x-card-${Date.now()}`;
        }
        // 过滤操作系统保留的非法文件名字符
        filename = filename.replace(/[\\/:*?"<>|]/g, '_');
        if (!filename.toLowerCase().endsWith('.png')) {
            filename += '.png';
        }
        const a = document.createElement('a');
        a.download = filename;
        a.href = canvas.toDataURL('image/png');
        a.click();
    }

    // 普通推文里的外链被 X 改写成 https://t.co/xxxx，原始 URL 不在 DOM 中。
    // 通过 GM_xmlhttpRequest 跟随 302 拿 finalUrl 还原（带缓存）。
    function resolveTcoLink(url) {
        return new Promise(resolve => {
            const clean = (url || '').trim();
            if (!clean || !/^https:\/\/t\.co\//i.test(clean)) { resolve(clean); return; }
            if (tcoCache.has(clean)) { resolve(tcoCache.get(clean)); return; }
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(clean); return; }
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: clean,
                    timeout: 8000,
                    anonymous: true,
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkResolver/1.0)' },
                    onload: r => {
                        const finalUrl = (r.finalUrl || '').trim();
                        // 只接受真正的跳转结果；t.co 未跳转时 finalUrl 可能还是 t.co 自身
                        const resolved = finalUrl && !/^https:\/\/t\.co\//i.test(finalUrl) ? finalUrl : clean;
                        tcoCache.set(clean, resolved);
                        resolve(resolved);
                    },
                    onerror: () => resolve(clean),
                    ontimeout: () => resolve(clean)
                });
            } catch { resolve(clean); }
        });
    }

    // 面板数据里的所有 t.co 短链并发还原；有变化返回 true（调用方据此重渲染）
    async function resolveTcoLinksForPanel(data) {
        if (!data) return false;
        const urls = new Set();
        const attrRe = /data-href="(https:\/\/t\.co\/[^"]+)"/g;
        let m;
        const html = data.originalContentHtml || '';
        while ((m = attrRe.exec(html))) urls.add(m[1]);
        const current = document.getElementById('scp-content');
        const text = current ? current.value : '';
        (text.match(/https:\/\/t\.co\/[A-Za-z0-9]+/g) || []).forEach(u => urls.add(u));
        if (!urls.size) return false;
        await Promise.all([...urls].map(u => resolveTcoLink(u)));
        const rewriteHtml = h => (h || '').replace(/(<span class="sc-link"[^>]*data-href=")(https:\/\/t\.co\/[^"]+)("[^>]*>)([\s\S]*?)(<\/span>)/g,
            (full, pre, href, mid, txt, close) => {
                const real = tcoCache.get(href) || href;
                return `${pre}${escapeHtml(real)}${mid}${escapeHtml(real)}${close}`;
            });
        data.originalContentHtml = rewriteHtml(data.originalContentHtml);
        data.originalContentPlain = (data.originalContentPlain || '').replace(/https:\/\/t\.co\/[A-Za-z0-9]+/g, s => tcoCache.get(s) || s);
        return true;
    }

    function showToast(message, type = 'info') {
        let toast = document.getElementById('scp-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'scp-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.className = `scp-toast show scp-toast-${type}`;
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.className = 'scp-toast';
        }, 2600);
    }

    function escapeHtml(s) {
        if (!s) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    GM_addStyle(`
        .sc-icon {
            width: 15px;
            height: 15px;
            display: inline-block;
            flex-shrink: 0;
            vertical-align: -0.125em;
            stroke-width: 2;
        }
        .sc-icon-xs {
            width: 12px;
            height: 12px;
            vertical-align: middle;
        }
        .sc-spin {
            animation: sc-spin-anim 0.8s linear infinite;
        }
        @keyframes sc-spin-anim {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        .sc-gen-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            cursor: pointer;
            color: #536471;
            margin-left: 2px;
            transition: color .15s ease, background-color .15s ease, transform .1s ease;
            user-select: none;
        }
        .sc-gen-btn .sc-icon {
            width: 17px;
            height: 17px;
        }
        .sc-gen-btn:hover {
            color: #1d9bf0;
            background-color: rgba(29, 155, 240, 0.1);
            transform: scale(1.05);
        }
        #share-card-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 980px;
            max-width: 96vw;
            max-height: 92vh;
            background: #ffffff;
            border-radius: 18px;
            border: 1px solid rgba(0, 0, 0, 0.08);
            box-shadow: 0 25px 60px -15px rgba(15, 20, 25, 0.35);
            z-index: 999999;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            animation: scp-fade-in .2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes scp-fade-in {
            from { opacity: 0; transform: translate(-50%, -48%) scale(0.98); }
            to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        .scp-header {
            background: #0f1419;
            color: #ffffff;
            padding: 12px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            user-select: none;
        }
        .scp-title {
            display: flex;
            align-items: center;
            gap: 9px;
            font-weight: 700;
            font-size: 14.5px;
            letter-spacing: -0.2px;
        }
        .scp-title-icon {
            display: inline-flex;
            align-items: center;
            color: #1d9bf0;
        }
        .scp-title-icon .sc-icon {
            width: 18px;
            height: 18px;
        }
        .scp-version-badge {
            font-size: 11px;
            font-weight: 600;
            color: #8b98a5;
            background: rgba(255, 255, 255, 0.1);
            padding: 1px 6px;
            border-radius: 999px;
        }
        #scp-close {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: none;
            border: none;
            color: #eff3f4;
            padding: 6px;
            cursor: pointer;
            border-radius: 50%;
            transition: all .15s ease;
        }
        #scp-close .sc-icon {
            width: 17px;
            height: 17px;
        }
        #scp-close:hover {
            background: rgba(255, 255, 255, 0.12);
            color: #ffffff;
        }
        .scp-body {
            display: flex;
            flex: 1;
            overflow: hidden;
        }
        .scp-form {
            width: 350px;
            padding: 18px 20px;
            overflow-y: auto;
            border-right: 1px solid #eff3f4;
            background: #f7f9f9;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
        }
        .scp-form > * {
            flex-shrink: 0;
        }
        .scp-row-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            flex-shrink: 0;
        }
        .scp-row-2 > div {
            min-width: 0;
        }
        .scp-form::-webkit-scrollbar {
            width: 6px;
        }
        .scp-form::-webkit-scrollbar-thumb {
            background: #cfd9de;
            border-radius: 3px;
        }
        .scp-control-group {
            background: #ffffff;
            border: 1px solid #e1e8ed;
            border-radius: 12px;
            padding: 12px 14px;
            margin-bottom: 12px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        }
        .scp-label-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }
        .scp-label-row label {
            margin: 0 !important;
            font-size: 12.5px;
            font-weight: 700;
            color: #0f1419;
        }
        .scp-link-action {
            background: none;
            border: none;
            padding: 0;
            font-size: 11.5px;
            font-weight: 600;
            color: #1d9bf0;
            cursor: pointer;
            transition: color .15s ease;
        }
        .scp-link-action:hover {
            color: #0c7abf;
            text-decoration: underline;
        }
        .scp-filename-wrap {
            position: relative;
            display: flex;
            align-items: center;
            margin-top: 6px;
        }
        .scp-ext-badge {
            position: absolute;
            right: 10px;
            font-size: 12px;
            font-weight: 600;
            color: #8b98a5;
            user-select: none;
            pointer-events: none;
        }
        .scp-badge {
            background: #0f1419;
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 999px;
            font-variant-numeric: tabular-nums;
        }
        #scp-width-slider {
            width: 100%;
            height: 5px;
            border-radius: 3px;
            background: #e1e8ed;
            outline: none;
            -webkit-appearance: none;
            cursor: pointer;
            margin: 10px 0;
        }
        #scp-width-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #1d9bf0;
            cursor: pointer;
            border: 2px solid #ffffff;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
            transition: transform .1s ease;
        }
        #scp-width-slider::-webkit-slider-thumb:hover {
            transform: scale(1.15);
        }
        .scp-width-presets {
            display: flex;
            gap: 6px;
        }
        .scp-chip-btn {
            flex: 1;
            padding: 4px 0;
            border: 1px solid #cfd9de;
            border-radius: 6px;
            background: #ffffff;
            font-size: 11px;
            font-weight: 600;
            color: #536471;
            cursor: pointer;
            transition: all .15s ease;
            text-align: center;
        }
        .scp-chip-btn:hover {
            background: #eff3f4;
            color: #0f1419;
            border-color: #bcc6cc;
        }
        .scp-chip-btn.active {
            background: #0f1419;
            color: #ffffff;
            border-color: #0f1419;
        }
        .scp-form label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            color: #536471;
            margin: 8px 0 3px;
        }
        .scp-form input[type="text"],
        .scp-form textarea {
            width: 100%;
            padding: 7px 11px;
            border: 1px solid #cfd9de;
            border-radius: 8px;
            font-size: 13px;
            box-sizing: border-box;
            background: #ffffff;
            color: #0f1419;
            transition: border-color .15s ease, box-shadow .15s ease;
            font-family: inherit;
        }
        .scp-form input[type="text"]:focus,
        .scp-form textarea:focus {
            outline: none;
            border-color: #1d9bf0;
            box-shadow: 0 0 0 3px rgba(29, 155, 240, 0.15);
        }
        .scp-form textarea {
            resize: vertical;
            line-height: 1.45;
            min-height: 110px;
            height: 110px;
            flex-shrink: 0;
        }
        .scp-stats {
            display: flex;
            gap: 6px;
            margin: 12px 0 6px;
        }
        .scp-stat-chip {
            flex: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 5px 6px;
            font-size: 11.5px;
            font-weight: 600;
            color: #536471;
            background: #ffffff;
            border: 1px solid #e1e8ed;
            border-radius: 8px;
        }
        .scp-stat-chip .sc-icon {
            color: #8b98a5;
        }
        .scp-actions {
            margin-top: 14px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .scp-actions button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 9px 12px;
            border: 1px solid transparent;
            border-radius: 999px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 700;
            transition: all .15s ease;
            user-select: none;
        }
        .scp-actions button:disabled {
            opacity: 0.65;
            cursor: not-allowed;
        }
        .scp-actions button.primary {
            grid-column: span 2;
            background: #0f1419;
            color: #ffffff;
        }
        .scp-actions button.primary:hover:not(:disabled) {
            background: #272c30;
        }
        .scp-actions button.secondary {
            background: #ffffff;
            color: #0f1419;
            border-color: #cfd9de;
        }
        .scp-actions button.secondary:hover:not(:disabled) {
            background: #eff3f4;
        }
        .scp-preview-wrap {
            flex: 1;
            padding: 32px;
            overflow: auto;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            background: #f0f3f4;
        }
        #scp-card-wrapper {
            transition: width .15s ease;
            border-radius: 16px;
            overflow: hidden;
            background: #ffffff;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            flex-shrink: 0;
        }
        .share-card {
            width: 100%;
            background: #ffffff;
            padding: 16px 20px;
            font-size: 15px;
            line-height: 1.5;
            color: #0f1419;
            box-sizing: border-box;
        }
        .sc-header {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
            gap: 10px;
            min-width: 0;
        }
        .sc-avatar {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            object-fit: cover;
            background: #cfd9de;
            flex-shrink: 0;
        }
        .sc-user {
            flex: 1;
            min-width: 0;
            overflow: hidden;
        }
        .sc-name {
            font-weight: 700;
            font-size: 15px;
            display: flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .sc-name span:first-child {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .sc-verified {
            width: 17px;
            height: 17px;
            display: inline-block;
            flex-shrink: 0;
            vertical-align: middle;
        }
        .sc-handle {
            font-size: 13.5px;
            color: #536471;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .sc-follow {
            background: #0f1419;
            color: #ffffff;
            border: none;
            border-radius: 999px;
            padding: 6px 15px;
            font-size: 13px;
            font-weight: 700;
            flex-shrink: 0;
            white-space: nowrap;
        }
        .sc-content {
            white-space: pre-wrap;
            word-break: break-word;
            margin-bottom: 12px;
            font-size: 15px;
            line-height: 1.45;
            color: #0f1419;
        }
        .sc-link {
            color: #1d9bf0;
            text-decoration: none;
            cursor: default;
        }

        /* ===== X Articles 长文卡片样式（完整展开，不截断不滚动）===== */
        .sc-article {
            border: 1px solid #eff3f4;
            border-radius: 16px;
            background: #f7f9f9;
            margin-bottom: 12px;
        }
        .sc-art-cover {
            width: 100%;
            height: auto;
            display: block;
        }
        .sc-art-body {
            padding: 14px 16px;
            font-size: 14px;
            line-height: 1.7;
            color: #0f1419;
        }
        .sc-art-title {
            font-size: 19px;
            font-weight: 800;
            line-height: 1.3;
            color: #0f1419;
            margin: 0 0 12px;
        }
        .sc-art-h {
            font-size: 16.5px;
            font-weight: 700;
            margin: 14px 0 6px;
        }
        .sc-art-h2 {
            font-size: 15px;
            font-weight: 700;
            margin: 12px 0 5px;
        }
        .sc-art-p {
            margin: 0 0 10px;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .sc-art-p:last-child { margin-bottom: 0; }
        .sc-art-img {
            width: 100%;
            border-radius: 10px;
            display: block;
            margin: 4px 0 12px;
        }
        .sc-art-ul, .sc-art-ol {
            margin: 0 0 10px;
            padding-left: 22px;
        }
        .sc-art-li { margin-bottom: 4px; }
        .sc-art-blockquote {
            margin: 0 0 10px;
            padding: 2px 0 2px 12px;
            border-left: 3px solid #cfd9de;
            color: #3b4a54;
        }
        .sc-art-pre {
            background: #0f1419;
            color: #f7f9f9;
            border-radius: 10px;
            padding: 10px 12px;
            font-size: 12.5px;
            overflow-x: auto;
            white-space: pre;
            margin: 0 0 10px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        .sc-art-spacer { height: 6px; }

        .sc-media {
            margin-bottom: 12px;
            border-radius: 14px;
            overflow: hidden;
            position: relative;
            background: transparent;
        }
        .sc-media.single img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto;
        }
        .sc-media.video img {
            width: 100%;
            height: auto;
            display: block;
        }
        .sc-media.grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
        }
        .sc-media.grid img {
            width: 100%;
            height: auto;
            display: block;
        }
        .sc-media.video .play-btn {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 54px;
            height: 54px;
            background: rgba(15, 20, 25, 0.72);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            backdrop-filter: blur(8px);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        }
        .sc-play-icon {
            width: 22px;
            height: 22px;
            margin-left: 2px;
        }

        .sc-quote {
            border: 1px solid #cfd9de;
            border-radius: 12px;
            padding: 12px;
            margin-bottom: 12px;
            background: #ffffff;
        }
        .q-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
        }
        .q-avatar {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            object-fit: cover;
            flex-shrink: 0;
            background: #cfd9de;
        }
        .q-user {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            gap: 4px 6px;
            font-size: 13px;
        }
        .q-user strong { color: #0f1419; }
        .q-user span { color: #536471; }
        .q-content {
            font-size: 14px;
            line-height: 1.4;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .q-media {
            margin-top: 8px;
            border-radius: 8px;
            overflow: hidden;
        }
        .q-media img {
            width: 100%;
            max-height: 160px;
            object-fit: cover;
            display: block;
        }
        .sc-meta {
            font-size: 13px;
            color: #536471;
            margin-bottom: 12px;
        }
        .sc-footer {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            color: #536471;
            border-top: 1px solid #eff3f4;
            padding-top: 12px;
        }
        .sc-footer-link {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            color: #536471;
        }
        .scp-toast {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(50px);
            background: rgba(15, 20, 25, 0.92);
            backdrop-filter: blur(8px);
            color: #ffffff;
            padding: 9px 20px;
            border-radius: 999px;
            font-size: 13.5px;
            font-weight: 600;
            z-index: 1000000;
            opacity: 0;
            pointer-events: none;
            transition: all .25s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.25);
        }
        .scp-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
        .scp-toast-success { background: #00ba7c; color: #ffffff; }
        .scp-toast-error { background: #f4212e; color: #ffffff; }
        .scp-toast-info { background: #1d9bf0; color: #ffffff; }
    `);

    injectButtons();
    new MutationObserver(injectButtons).observe(document.body, { childList: true, subtree: true });
})();