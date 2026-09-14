// ==UserScript==
// @name         X 推文一键生成分享卡片 & 视频深度解析助手 (多线程版)
// @namespace    http://tampermonkey.net/
// @version      6.10
// @description  自定义生成推文图片卡片，支持长文，新增视频极速无水印解析与直接强制下载本地（支持多线程并发，带真实进度）。
// @author       Assistant
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @connect      pbs.twimg.com
// @connect      ton.twimg.com
// @connect      video.twimg.com
// @connect      t.co
// @connect      api.vxtwitter.com
// @connect      api.fxtwitter.com
// @connect      *
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';


    const processed = new WeakSet();
    const STORAGE_KEY_WIDTH = 'sc_custom_card_width';
    const STORAGE_KEY_SHOW_PLAY = 'sc_show_play_button';
    let activePanel = null;
    const tcoCache = new Map();

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

    const SB_KEYS = { url: 'sc_sb_url', key: 'sc_sb_key', bucket: 'sc_sb_bucket', on: 'sc_sb_on' };
    function sbRead(k, fallback) {
        try { if (typeof GM_getValue === 'function') return GM_getValue(k, fallback); } catch (_) {}
        const v = localStorage.getItem(k);
        return v == null ? fallback : v;
    }
    function sbWrite(k, v) {
        try { if (typeof GM_setValue === 'function') GM_setValue(k, v); } catch (_) {}
        localStorage.setItem(k, v);
    }
    function getSupabaseCfg() {
        return {
            url: String(sbRead(SB_KEYS.url, '') || '').replace(/\/+$/, ''),
            key: String(sbRead(SB_KEYS.key, '') || '').trim(),
            bucket: String(sbRead(SB_KEYS.bucket, 'xshare') || 'xshare').trim() || 'xshare',
            on: sbRead(SB_KEYS.on, 'false') === 'true'
        };
    }
    function isSupabaseReady() {
        const c = getSupabaseCfg();
        return !!(c.on && c.url && c.key);
    }
    function sbRequest(method, url, { headers, body, binary } = {}) {
        return new Promise((resolve, reject) => {
            const send = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null;
            if (!send) { reject(new Error('no GM')); return; }
            send({
                method,
                url,
                headers: headers || {},
                data: body,
                binary: !!binary,
                responseType: 'text',
                onload: res => resolve(res),
                onerror: err => reject(err || new Error('net'))
            });
        });
    }
    function htmlToPlain(html) {
        const d = document.createElement('div');
        d.innerHTML = html || '';
        return (d.innerText || '').replace(/\u00a0/g, ' ').trim();
    }
    function buildCardMarkdown(data, filename) {
        if (!data) return '';
        const lines = [];
        lines.push(data.isArticle ? '# ' + (data.articleTitle || filename || 'Article') : '# X 帖子');
        lines.push('');
        if (data.name || data.handle) lines.push([(data.name || ''), (data.handle || '')].filter(Boolean).join('  '));
        if (data.time || data.views) lines.push([(data.time || ''), (data.views || '')].filter(Boolean).join(' · '));
        if (data.link) lines.push(data.link);
        lines.push('');
        if (data.isArticle) {
            (data.articleBlocks || []).forEach(b => {
                if (b.type === 'heading') lines.push('## ' + htmlToPlain(b.html), '');
                else if (b.type === 'subheading') lines.push('### ' + htmlToPlain(b.html), '');
                else if (b.type === 'text') lines.push(htmlToPlain(b.html), '');
                else if (b.type === 'quote') lines.push('> ' + htmlToPlain(b.html), '');
                else if (b.type === 'code') lines.push('```' + (b.lang || ''), b.text || '', '```', '');
                else if (b.type === 'list') (b.items || []).forEach((it, i) => lines.push((b.ordered ? (i + 1) + '. ' : '- ') + htmlToPlain(it)));
                else if (b.type === 'divider') lines.push('---', '');
                else if (b.type === 'image') lines.push(b.src ? '![](' + b.src + ')' : '', b.caption || '', '');
            });
        } else if (data.contentPlain) {
            lines.push(data.contentPlain, '');
        }
        return lines.join('\n').trim() + '\n';
    }
    function sanitizeCloudPath(name) {
        let s = String(name || 'card').replace(/\.png$/i, ''); s = s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[_\.-]+|[_\.-]+$/g, ''); return (s || 'card').slice(0, 80);
    }
    async function supabaseUpload(path, body, contentType) {
        const cfg = getSupabaseCfg();
        const url = cfg.url + '/storage/v1/object/' + encodeURIComponent(cfg.bucket) + '/' + path.split('/').map(encodeURIComponent).join('/');
        const res = await sbRequest('POST', url, {
            headers: {
                Authorization: 'Bearer ' + cfg.key,
                apikey: cfg.key,
                'Content-Type': contentType || 'application/octet-stream',
                'x-upsert': 'true'
            },
            body,
            binary: contentType && contentType.indexOf('text/') !== 0
        });
        if (res.status >= 200 && res.status < 300) return { ok: true };
        return { ok: false, error: (res.responseText || '').slice(0, 180) || ('HTTP ' + res.status) };
    }
    function cloudObjectBase(data) {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const stamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
        const time = pad(now.getHours()) + pad(now.getMinutes());
        const ref = data ? parseStatusRef(data) : null;
        const idPart = (ref && ref.id) || String(now.getTime()).slice(-10);
        return { stamp, base: 'x_' + idPart + '_' + time };
    }
    function refreshCloudButtons() {
        const row = document.getElementById('scp-cloud-actions');
        if (row) row.style.display = isSupabaseReady() ? 'contents' : 'none';
    }
    function currentCardTitle(data) {
        const el = document.getElementById('scp-article-title');
        const typed = el && el.value.trim();
        if (typed) return typed.slice(0, 180);
        if (data && data.articleTitle) return String(data.articleTitle).slice(0, 180);
        if (data && data.contentPlain) return String(data.contentPlain).replace(/\s+/g, ' ').slice(0, 80);
        return '';
    }
    function publicObjectUrl(path) {
        const cfg = getSupabaseCfg();
        return cfg.url + '/storage/v1/object/public/' + encodeURIComponent(cfg.bucket) + '/' + String(path || '').split('/').map(encodeURIComponent).join('/');
    }
    async function supabaseRest(method, pathAndQuery, jsonBody) {
        const cfg = getSupabaseCfg();
        const url = cfg.url + '/rest/v1/' + pathAndQuery.replace(/^\/+/, '');
        const headers = {
            Authorization: 'Bearer ' + cfg.key,
            apikey: cfg.key,
            'Content-Type': 'application/json',
            Prefer: method === 'POST' ? 'return=minimal' : 'count=none'
        };
        const res = await sbRequest(method, url, {
            headers,
            body: jsonBody != null ? JSON.stringify(jsonBody) : undefined
        });
        const text = res.responseText || '';
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) {}
        if (res.status >= 200 && res.status < 300) return { ok: true, data };
        const err = (data && (data.message || data.hint)) || text.slice(0, 180) || ('HTTP ' + res.status);
        if (/paused|inactive project|not found/i.test(err) || res.status === 404 || res.status === 521) {
            return { ok: false, error: '项目可能已暂停，请到 Supabase Dashboard 打开一次', status: res.status, paused: true };
        }
        return { ok: false, error: err, status: res.status };
    }
    function isMediaPostHref(href) {
        return /\/(?:photo|video|analytics)(?:\/|$)/i.test(String(href || ''));
    }
    function canonicalPostUrl(raw) {
        const s = String(raw || '').split('?')[0].split('#')[0];
        if (!s || /twimg\.com|\/media\//i.test(s)) return '';
        let m = s.match(/\/article\/(\d+)/);
        if (m) return 'https://x.com/i/article/' + m[1];
        m = s.match(/\/status(?:es)?\/(\d+)/);
        if (m) return 'https://x.com/i/status/' + m[1];
        return '';
    }
    function postSourceUrl(data) {
        const cands = [data && data.link, typeof location !== 'undefined' ? location.href : ''];
        for (const raw of cands) {
            if (isMediaPostHref(raw)) continue;
            const can = canonicalPostUrl(raw);
            if (can) return can;
        }
        for (const raw of cands) {
            const can = canonicalPostUrl(raw);
            if (can) return can;
        }
        return '';
    }
    function normalizeImageUrl(url) {
        const raw = String(url || '').trim();
        if (!raw || raw.startsWith('data:')) return '';
        try {
            const u = new URL(raw);
            if (/twimg\.com$/i.test(u.hostname) || /twimg\.com$/i.test(u.hostname.replace(/^[^.]+\./, ''))) {
                if (u.searchParams.has('name')) u.searchParams.set('name', 'orig');
            }
            return u.toString();
        } catch (_) {
            return raw;
        }
    }
    function shortHash(s) {
        let h = 2166136261;
        const str = String(s || '');
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(16);
    }
    function formatSize(n) {
        const v = Number(n) || 0;
        if (v < 1024) return v + ' B';
        if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
        return (v / 1024 / 1024).toFixed(2) + ' MB';
    }
    async function recordCardRow({ data, kind, path, size, width, height }) {
        const row = {
            title: currentCardTitle(data) || path,
            kind: kind,
            path: path,
            size: size || null,
            width: width || null,
            height: height || null,
            source_url: postSourceUrl(data) || null
        };
        const res = await supabaseRest('POST', 'cards', row);
        if (!res.ok && res.status === 404) {
            showToast('云端库表不存在，请在 SQL Editor 执行建表语句', 'info');
        }
        return res;
    }
    async function queryCards(keyword) {
        let q = 'cards?select=id,title,kind,path,size,width,height,source_url,created_at&order=created_at.desc&limit=80';
        const kw = String(keyword || '').trim();
        if (kw) {
            const safe = kw.replace(/[,.()]/g, ' ').replace(/\*/g, '');
            q += '&title=ilike.*' + encodeURIComponent(safe) + '*';
        }
        return supabaseRest('GET', q);
    }
    async function findExistingCards(data, kind) {
        const src = postSourceUrl(data);
        if (!src) return [];
        const q = 'cards?select=id,title,kind,path,created_at,source_url,size,width,height&kind=eq.' + encodeURIComponent(kind)
            + '&source_url=eq.' + encodeURIComponent(src) + '&limit=5';
        const res = await supabaseRest('GET', q);
        if (!res.ok || !Array.isArray(res.data)) return [];
        return res.data;
    }
    function confirmOverwrite(row, label) {
        return new Promise(resolve => {
            const old = document.getElementById('scp-dup-mask');
            if (old) old.remove();
            const when = String((row && row.created_at) || '').replace('T', ' ').slice(0, 16);
            const title = (row && row.title) || (row && row.path) || '';
            const mask = document.createElement('div');
            mask.id = 'scp-dup-mask';
            mask.innerHTML = `
                <div class="scp-dup-box">
                    <h4>覆盖确认</h4>
                    <div class="scp-dup-note">云端已有这份${escapeHtml(label)}，覆盖后旧文件会被替换。</div>
                    <div class="scp-dup-meta">
                        <div><span>类型</span>${escapeHtml(label)}</div>
                        <div><span>标题</span>${escapeHtml(title)}</div>
                        ${when ? '<div><span>上次</span>' + escapeHtml(when) + '</div>' : ''}
                    </div>
                    <div class="scp-dup-actions">
                        <button type="button" id="scp-dup-over">覆盖</button>
                        <button type="button" id="scp-dup-cancel">取消</button>
                    </div>
                </div>`;
            document.body.appendChild(mask);
            const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } };
            const done = v => {
                document.removeEventListener('keydown', onKey, true);
                mask.remove();
                resolve(v);
            };
            document.addEventListener('keydown', onKey, true);
            document.getElementById('scp-dup-cancel').onclick = () => done(false);
            document.getElementById('scp-dup-over').onclick = () => done(true);
            document.getElementById('scp-dup-cancel').focus();
        });
    }
    async function updateCardRow(id, fields) {
        if (!id) return { ok: false, error: 'no id' };
        return supabaseRest('PATCH', 'cards?id=eq.' + encodeURIComponent(id), fields);
    }
    function isPausedError(res) {
        const err = String((res && res.error) || '');
        return /paused|inactive|not found|521|project/i.test(err);
    }
    async function findImageBySource(sourceUrl) {
        const src = normalizeImageUrl(sourceUrl);
        if (!src) return null;
        const res = await supabaseRest('GET', 'images?select=id,source_url,path,url,size,width,height&source_url=eq.' + encodeURIComponent(src) + '&limit=1');
        if (!res.ok || !Array.isArray(res.data) || !res.data[0]) return null;
        return res.data[0];
    }
    function fetchRemoteBlob(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('no GM'));
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                onload: res => {
                    if (res.status >= 200 && res.status < 300 && res.response) resolve(res.response);
                    else reject(new Error('HTTP ' + res.status));
                },
                onerror: () => reject(new Error('net'))
            });
        });
    }
    function blobDimensions(blob) {
        return new Promise(resolve => {
            const src = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
                URL.revokeObjectURL(src);
            };
            img.onerror = () => {
                resolve({ width: 0, height: 0 });
                URL.revokeObjectURL(src);
            };
            img.src = src;
        });
    }
    function guessImageExt(url, blob) {
        const type = (blob && blob.type) || '';
        if (/jpe?g/i.test(type)) return 'jpg';
        if (/png/i.test(type)) return 'png';
        if (/webp/i.test(type)) return 'webp';
        if (/gif/i.test(type)) return 'gif';
        const m = String(url || '').match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i);
        return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
    }
    async function ensureHostedImage(sourceUrl) {
        const src = normalizeImageUrl(sourceUrl);
        if (!src) return { ok: false, error: 'empty' };
        const existed = await findImageBySource(src);
        if (existed && existed.url) return { ok: true, existed: true, url: existed.url, path: existed.path };
        let blob;
        try { blob = await fetchRemoteBlob(src); }
        catch (err) { return { ok: false, error: (err && err.message) || 'fetch', source: src }; }
        if (!blob || blob.size < 32) return { ok: false, error: 'empty blob', source: src };
        const dim = await blobDimensions(blob);
        const ext = guessImageExt(src, blob);
        const path = 'img/' + shortHash(src) + '.' + ext;
        const up = await supabaseUpload(path, blob, blob.type || 'image/jpeg');
        if (!up.ok) return { ok: false, error: up.error || 'upload', source: src };
        const publicUrl = publicObjectUrl(path);
        const row = await supabaseRest('POST', 'images', {
            source_url: src,
            path,
            url: publicUrl,
            size: blob.size,
            width: dim.width || null,
            height: dim.height || null
        });
        if (!row.ok) return { ok: true, existed: false, url: publicUrl, path, registered: false, error: row.error };
        return { ok: true, existed: false, url: publicUrl, path };
    }
    function collectSourceImages(data) {
        const out = [];
        const seen = new Set();
        const add = u => {
            const n = normalizeImageUrl(u);
            if (!n || seen.has(n)) return;
            seen.add(n);
            out.push(n);
        };
        if (!data) return out;
        add(data.articleCover);
        (data.articleBlocks || []).forEach(b => { if (b && b.type === 'image') add(b.src); });
        (data.images || []).forEach(add);
        if (data.quoted && Array.isArray(data.quoted.images)) data.quoted.images.forEach(add);
        return out;
    }
    async function resolveHostedMap(urls, onEach) {
        const map = new Map();
        let failed = 0, reused = 0, uploaded = 0;
        for (let i = 0; i < urls.length; i++) {
            if (onEach) onEach(i + 1, urls.length);
            const res = await ensureHostedImage(urls[i]);
            if (res.ok && res.url) {
                map.set(urls[i], res.url);
                if (res.existed) reused += 1;
                else uploaded += 1;
            } else {
                failed += 1;
            }
        }
        return { map, failed, reused, uploaded };
    }
    function rewriteMarkdownImages(md, map) {
        let out = String(md || '');
        map.forEach((hosted, source) => {
            if (!source || !hosted) return;
            out = out.split(source).join(hosted);
        });
        collectSourceImages({}).forEach(() => {});
        return out;
    }
    function buildHostedMarkdown(data, map) {
        const raw = buildCardMarkdown(data, currentCardTitle(data));
        let md = raw;
        map.forEach((hosted, source) => { md = md.split(source).join(hosted); });
        // leftover pbs/twimg in markdown image syntax
        md = md.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (all, alt, url) => {
            const n = normalizeImageUrl(url);
            if (map.has(n)) return '![' + alt + '](' + map.get(n) + ')';
            if (/twimg\.com|twimg\.com|pbs\.twimg/i.test(url)) return '![未备份](' + url + ')';
            return all;
        });
        return md;
    }

    function openCloudLibrary() {
        if (!isSupabaseReady()) { showToast('未启用远程备份', 'info'); return; }
        const old = document.getElementById('scp-lib-mask');
        if (old) old.remove();
        const mask = document.createElement('div');
        mask.id = 'scp-lib-mask';
        mask.innerHTML = `
            <div class="scp-sb-box scp-lib-box">
                <div class="scp-lib-head">
                    <h4>云端库</h4>
                    <button type="button" id="scp-lib-close" class="scp-lib-x">关闭</button>
                </div>
                <div class="scp-lib-search">
                    <input id="scp-lib-q" type="text" placeholder="搜索标题或帖子 ID">
                    <button type="button" id="scp-lib-go">搜索</button>
                </div>
                <div class="scp-lib-filters">
                    <button type="button" class="scp-lib-chip on" data-kind="">全部</button>
                    <button type="button" class="scp-lib-chip" data-kind="png">卡片</button>
                    <button type="button" class="scp-lib-chip" data-kind="md">Markdown</button>
                    <span class="scp-lib-gap"></span>
                    <button type="button" class="scp-lib-chip on" data-range="all">不限时间</button>
                    <button type="button" class="scp-lib-chip" data-range="7">7 天</button>
                    <button type="button" class="scp-lib-chip" data-range="1">今天</button>
                </div>
                <div class="scp-lib-listwrap">
                    <div id="scp-lib-spin" class="scp-lib-spin" hidden><span></span></div>
                    <div id="scp-lib-list" class="scp-lib-list"></div>
                </div>
                <div class="scp-lib-pager">
                    <button type="button" id="scp-lib-prev">上一页</button>
                    <span id="scp-lib-page">1</span>
                    <button type="button" id="scp-lib-next">下一页</button>
                </div>
            </div>`;
        document.body.appendChild(mask);
        mask._lib = { kind: '', range: 'all', page: 0 };
        const closeLib = () => {
            document.removeEventListener('keydown', onLibKey, true);
            mask.remove();
        };
        const onLibKey = e => { if (e.key === 'Escape') closeLib(); };
        document.addEventListener('keydown', onLibKey, true);
        mask.addEventListener('wheel', e => {
            const list = document.getElementById('scp-lib-list');
            if (!list) { e.preventDefault(); return; }
            if (!list.contains(e.target) && e.target !== list) {
                e.preventDefault();
                return;
            }
            const top = list.scrollTop <= 0 && e.deltaY < 0;
            const bot = list.scrollTop + list.clientHeight >= list.scrollHeight - 1 && e.deltaY > 0;
            if (top || bot || true) e.preventDefault();
            list.scrollTop += e.deltaY;
        }, { passive: false });
        document.getElementById('scp-lib-close').onclick = closeLib;
        const input = document.getElementById('scp-lib-q');
        const run = () => { mask._lib.page = 0; renderCloudLibrary(); };
        document.getElementById('scp-lib-go').onclick = run;
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
        input.addEventListener('input', () => {
            clearTimeout(mask._lib.timer);
            mask._lib.timer = setTimeout(run, 300);
        });
        mask.querySelectorAll('.scp-lib-chip[data-kind]').forEach(btn => {
            btn.onclick = () => {
                mask._lib.kind = btn.getAttribute('data-kind') || '';
                mask.querySelectorAll('.scp-lib-chip[data-kind]').forEach(b => b.classList.toggle('on', b === btn));
                run();
            };
        });
        mask.querySelectorAll('.scp-lib-chip[data-range]').forEach(btn => {
            btn.onclick = () => {
                mask._lib.range = btn.getAttribute('data-range') || 'all';
                mask.querySelectorAll('.scp-lib-chip[data-range]').forEach(b => b.classList.toggle('on', b === btn));
                run();
            };
        });
        document.getElementById('scp-lib-prev').onclick = () => { if (mask._lib.page > 0) { mask._lib.page -= 1; renderCloudLibrary(); } };
        document.getElementById('scp-lib-next').onclick = () => { mask._lib.page += 1; renderCloudLibrary(); };
        renderCloudLibrary();
    }
    async function renderCloudLibrary() {
        const box = document.getElementById('scp-lib-list');
        const mask = document.getElementById('scp-lib-mask');
        if (!box || !mask) return;
        const st = mask._lib || { kind: '', range: 'all', page: 0 };
        const input = document.getElementById('scp-lib-q');
        const keyword = input ? input.value.trim() : '';
        const spin = document.getElementById('scp-lib-spin');
        if (spin) spin.hidden = false;
        if (!box.innerHTML) box.innerHTML = '<div class="scp-lib-empty">加载中...</div>';
        let q = 'cards?select=id,title,kind,path,size,width,height,source_url,created_at&order=created_at.desc&limit=120';
        if (st.kind) q += '&kind=eq.' + encodeURIComponent(st.kind);
        if (st.range === '1' || st.range === '7') {
            const d = new Date();
            if (st.range === '1') d.setHours(0, 0, 0, 0);
            else d.setDate(d.getDate() - 7);
            q += '&created_at=gte.' + encodeURIComponent(d.toISOString());
        }
        if (keyword) {
            const safe = keyword.replace(/[*(),]/g, ' ').trim();
            const enc = encodeURIComponent(safe);
            q += '&or=(title.ilike.*' + enc + '*,source_url.ilike.*' + enc + '*)';
        }
        const res = await supabaseRest('GET', q);
        if (spin) spin.hidden = true;
        if (!res.ok) {
            box.innerHTML = '<div class="scp-lib-empty">' + escapeHtml(res.error || '查询失败') + '</div>';
            return;
        }
        const rows = Array.isArray(res.data) ? res.data : [];
        const groups = [];
        const index = new Map();
        rows.forEach(r => {
            const key = canonicalPostUrl(r.source_url) || r.source_url || ('id:' + r.id);
            if (!index.has(key)) {
                const g = { key, title: r.title || r.path || '', source: canonicalPostUrl(r.source_url) || '', items: [], at: r.created_at || '' };
                index.set(key, g);
                groups.push(g);
            }
            const g = index.get(key);
            g.items.push(r);
            if ((r.created_at || '') > g.at) g.at = r.created_at || '';
            if (r.title && r.title.length > (g.title || '').length) g.title = r.title;
            if (!g.source) g.source = canonicalPostUrl(r.source_url) || '';
        });
        const pageSize = 6;
        const maxPage = Math.max(0, Math.ceil(groups.length / pageSize) - 1);
        if (st.page > maxPage) st.page = maxPage;
        const slice = groups.slice(st.page * pageSize, st.page * pageSize + pageSize);
        const pageEl = document.getElementById('scp-lib-page');
        if (pageEl) pageEl.textContent = (st.page + 1) + ' / ' + (maxPage + 1);
        const prev = document.getElementById('scp-lib-prev');
        const next = document.getElementById('scp-lib-next');
        if (prev) prev.disabled = st.page <= 0;
        if (next) next.disabled = st.page >= maxPage;
        if (!slice.length) {
            box.innerHTML = '<div class="scp-lib-empty">' + (keyword ? '没有符合“' + escapeHtml(keyword) + '”的记录' : '没有记录') + '</div>';
            return;
        }
        box.innerHTML = slice.map(g => {
            const raw = String(g.at || '').replace('T', ' ');
            const whenFull = raw.slice(0, 16);
            const whenShort = whenFull.length >= 16 ? whenFull.slice(5) : whenFull;
            const src = g.source
                ? '<a class="scp-lib-src" href="' + escapeHtml(g.source) + '" target="_blank" rel="noreferrer">原帖</a>'
                : '';
            const ordered = g.items.slice().sort((a, b) => {
                const ra = a.kind === 'md' ? 0 : 1;
                const rb = b.kind === 'md' ? 0 : 1;
                return ra - rb;
            });
            const files = ordered.map(r => {
                const url = publicObjectUrl(r.path);
                const label = (r.kind === 'md' ? 'MD' : '卡片') + (r.size ? ' · ' + formatSize(r.size) : '');
                const tip = [
                    r.kind === 'md' ? 'Markdown' : '卡片图片',
                    r.size ? formatSize(r.size) : '',
                    (r.width && r.height) ? (r.width + ' × ' + r.height) : '',
                    r.path || ''
                ].filter(Boolean).join('\n');
                return '<button type="button" class="scp-lib-file" data-url="' + escapeHtml(url) + '" title="' + escapeHtml(tip) + '">'
                    + escapeHtml(label)
                    + '</button>';
            }).join('');
            return '<div class="scp-lib-group">'
                + '<div class="scp-lib-group-top">'
                + '<div class="scp-lib-title" title="' + escapeHtml(g.title) + '">' + escapeHtml(g.title) + '</div>'
                + '<div class="scp-lib-aside">' + src
                + (whenShort ? '<span class="scp-lib-when" title="' + escapeHtml(whenFull) + '">' + escapeHtml(whenShort) + '</span>' : '')
                + '</div>'
                + '</div>'
                + '<div class="scp-lib-files">' + files + '</div>'
                + '</div>';
        }).join('');
        box.querySelectorAll('.scp-lib-file').forEach(el => {
            el.onclick = async () => {
                const url = el.getAttribute('data-url');
                try { await navigator.clipboard.writeText(url); showToast('已复制链接', 'success'); }
                catch (_) { showToast(url, 'info'); }
            };
        });
    }
    async function captureCardPngBlob() {
        const wrapper = document.getElementById('scp-card-wrapper');
        if (!wrapper) throw new Error('no card');
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
        if (!canvas.width || !canvas.height) throw new Error('blank');
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob || blob.size < 1024) throw new Error('blank');
        blob._w = canvas.width;
        blob._h = canvas.height;
        return blob;
    }
    async function syncCloudImage() {
        if (!isSupabaseReady()) { showToast('未启用远程备份', 'info'); return; }
        const btn = document.getElementById('scp-cloud-img');
        const html = btn && btn.innerHTML;
        try {
            if (btn) { btn.disabled = true; btn.textContent = '同步中...'; }
            const panel = document.getElementById('share-card-panel');
            const data = panel && panel._data;
            const existing = await findExistingCards(data, 'png');
            let reuse = null;
            if (existing.length) {
                const ok = await confirmOverwrite(existing[0], '卡片');
                if (!ok) return;
                reuse = existing[0];
            }
            const blob = await captureCardPngBlob();
            const { stamp, base } = cloudObjectBase(data);
            const path = (reuse && reuse.path) || ('cards/' + stamp + '/' + base + '.png');
            const res = await supabaseUpload(path, blob, 'image/png');
            if (!res.ok) { showToast('云端未写入 ' + (res.error || ''), 'info'); return; }
            const fields = { title: currentCardTitle(data) || path, kind: 'png', path, size: blob.size, width: blob._w, height: blob._h, source_url: postSourceUrl(data) || null };
            const row = reuse ? await updateCardRow(reuse.id, fields) : await recordCardRow({ data, kind: 'png', path, size: blob.size, width: blob._w, height: blob._h });
            showToast(row.ok ? (reuse ? '卡片已覆盖 ' : '卡片已同步 ') + path : '文件已上传，目录登记失败', row.ok ? 'success' : 'info');
        } catch (err) {
            console.error(err);
            showToast(err && err.message === 'blank' ? '卡片图无效，未上传' : '同步图片失败', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = html || '同步卡片图片'; }
        }
    }
    async function syncCloudMedia() {
        if (!isSupabaseReady()) { showToast('未启用远程备份', 'info'); return; }
        const btn = document.getElementById('scp-cloud-media');
        const html = btn && btn.innerHTML;
        try {
            if (btn) { btn.disabled = true; btn.textContent = '同步中...'; }
            const panel = document.getElementById('share-card-panel');
            const urls = collectSourceImages(panel && panel._data);
            if (!urls.length) { showToast('没有可上传的配图', 'info'); return; }
            const result = await resolveHostedMap(urls, (i, n) => {
                if (btn) btn.textContent = '配图 ' + i + '/' + n;
            });
            showToast('配图 新传' + result.uploaded + ' / 已有' + result.reused + ' / 失败' + result.failed, result.failed ? 'info' : 'success');
        } catch (err) {
            console.error(err);
            showToast('同步配图失败', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = html || '同步配图'; }
        }
    }
    async function syncCloudMarkdown() {
        if (!isSupabaseReady()) { showToast('未启用远程备份', 'info'); return; }
        const btn = document.getElementById('scp-cloud-md');
        const html = btn && btn.innerHTML;
        try {
            if (btn) { btn.disabled = true; btn.textContent = '同步中...'; }
            const panel = document.getElementById('share-card-panel');
            const data = panel && panel._data;
            const existing = await findExistingCards(data, 'md');
            let reuse = null;
            if (existing.length) {
                const ok = await confirmOverwrite(existing[0], 'Markdown');
                if (!ok) return;
                reuse = existing[0];
            }
            const urls = collectSourceImages(data);
            const hosted = await resolveHostedMap(urls, (i, n) => {
                if (btn) btn.textContent = '配图 ' + i + '/' + n;
            });
            if (btn) btn.textContent = '同步中...';
            const md = buildHostedMarkdown(data, hosted.map);
            if (!md.trim()) { showToast('没有可同步的 Markdown', 'info'); return; }
            const { stamp, base } = cloudObjectBase(data);
            const path = (reuse && reuse.path) || ('cards/' + stamp + '/' + base + '.md');
            const res = await supabaseUpload(path, md, 'text/markdown; charset=utf-8');
            if (!res.ok) { showToast('云端未写入 ' + (res.error || ''), 'info'); return; }
            const bytes = new Blob([md]).size;
            const fields = { title: currentCardTitle(data) || path, kind: 'md', path, size: bytes, source_url: postSourceUrl(data) || null };
            const row = reuse ? await updateCardRow(reuse.id, fields) : await recordCardRow({ data, kind: 'md', path, size: bytes });
            const extra = hosted.failed ? '，' + hosted.failed + ' 张未备份' : '';
            showToast((row.ok ? (reuse ? 'Markdown 已覆盖' : 'Markdown 已同步') : '文件已上传，目录登记失败') + extra, row.ok && !hosted.failed ? 'success' : 'info');
        } catch (err) {
            console.error(err);
            showToast('同步 Markdown 失败', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = html || '同步 Markdown'; }
        }
    }
    function openSupabaseSettings() {
        const old = document.getElementById('scp-sb-mask');
        if (old) old.remove();
        const cfg = getSupabaseCfg();
        const mask = document.createElement('div');
        mask.id = 'scp-sb-mask';
        mask.innerHTML = `
            <div class="scp-sb-box">
                <h4>云端备份（自用）</h4>
                <p>凭证只存在本机。桶需允许 anon 上传，例如 bucket <code>xshare</code>。</p>
                <label>Project URL</label>
                <input id="scp-sb-url" type="text" placeholder="https://xxxx.supabase.co" value="${cfg.url.replace(/"/g, '&quot;')}">
                <label>anon public key</label>
                <input id="scp-sb-key" type="password" placeholder="eyJ..." value="${cfg.key.replace(/"/g, '&quot;')}">
                <label>Bucket</label>
                <input id="scp-sb-bucket" type="text" value="${cfg.bucket.replace(/"/g, '&quot;')}">
                <label class="scp-sb-check"><input id="scp-sb-on" type="checkbox" ${cfg.on ? 'checked' : ''}> 启用远程备份</label>
                <div class="scp-sb-actions">
                    <button type="button" id="scp-sb-cancel">关闭</button>
                    <button type="button" id="scp-sb-save">保存</button>
                </div>
            </div>`;
        document.body.appendChild(mask);
        mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
        mask.addEventListener('wheel', e => {
            e.preventDefault();
            const list = document.getElementById('scp-lib-list');
            if (list) list.scrollTop += e.deltaY;
        }, { passive: false });
        mask.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
        document.getElementById('scp-sb-cancel').onclick = () => mask.remove();
        document.getElementById('scp-sb-save').onclick = () => {
            sbWrite(SB_KEYS.url, document.getElementById('scp-sb-url').value.trim());
            sbWrite(SB_KEYS.key, document.getElementById('scp-sb-key').value.trim());
            sbWrite(SB_KEYS.bucket, document.getElementById('scp-sb-bucket').value.trim() || 'xshare');
            sbWrite(SB_KEYS.on, document.getElementById('scp-sb-on').checked ? 'true' : 'false');
            mask.remove();
            refreshCloudButtons();
            showToast(isSupabaseReady() ? '云端备份已开启' : '已保存（未开启或凭证不完整）', 'info');
        };
    }
    function bindHiddenSupabaseEntry(panel) {
        const badge = panel.querySelector('.scp-version-badge');
        if (!badge) return;
        let taps = 0;
        let timer = 0;
        badge.style.cursor = 'default';
        badge.addEventListener('click', e => {
            e.preventDefault();
            taps += 1;
            clearTimeout(timer);
            if (taps >= 3) {
                taps = 0;
                openSupabaseSettings();
                return;
            }
            timer = setTimeout(() => { taps = 0; }, 900);
        });
    }

    const ICONS = {
        cardSparkle: `<svg class="sc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="3"/><path d="M7 9h4"/><path d="M7 13h8"/><path d="m19 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/></svg>`,
        parseVideo: `<svg class="sc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
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
                const tag = node.tagName;
                if (tag === 'BR') {
                    html += '<br>';
                    return;
                }
                if (tag === 'A') {
                    const linkText = node.textContent.trim();
                    const href = node.getAttribute('href');
                    if (linkText) {
                        html += `<span class="sc-link" data-href="${escapeHtml(href || '')}">${escapeHtml(linkText)}</span>`;
                    } else if (href) {
                        html += `<span class="sc-link">${escapeHtml(href)}</span>`;
                    }
                    return;
                }
                const style = node.getAttribute('style') || '';
                const fw = (node.style && node.style.fontWeight) || '';
                const fs = (node.style && node.style.fontStyle) || '';
                const bold = tag === 'STRONG' || tag === 'B' || /bold/i.test(style) || fw === 'bold' || parseInt(fw, 10) >= 600;
                const italic = tag === 'EM' || tag === 'I' || /italic/i.test(style) || fs === 'italic';
                if (bold) html += '<strong>';
                if (italic) html += '<em>';
                for (const child of node.childNodes) walk(child);
                if (italic) html += '</em>';
                if (bold) html += '</strong>';
            }
        }
        for (const child of container.childNodes) walk(child);
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

    function upgradeMediaUrl(src) {
        if (!src) return '';
        return src.replace(/name=\w+/g, 'name=large').replace(/&name=\w+/g, '&name=large');
    }

    function isProfileOrUiImage(src) {
        const s = src || '';
        return /profile_images|emoji\/|hashflag|twemoji|abs\.twimg\.com\/|s\.twimg\.com\//i.test(s);
    }

    function imgBestSrc(img) {
        if (!img) return '';
        const raw = img.currentSrc || img.getAttribute('src') || '';
        if (raw && !/^data:|^blob:/i.test(raw) && !isProfileOrUiImage(raw)) return upgradeMediaUrl(raw);
        const srcset = img.getAttribute('srcset') || '';
        const parts = srcset.split(',').map(s => (s.trim().split(/\s+/)[0] || '').trim()).filter(Boolean);
        for (let i = parts.length - 1; i >= 0; i--) {
            if (/pbs\.twimg\.com|\/media\/|ton\.twimg\.com/i.test(parts[i]) && !isProfileOrUiImage(parts[i])) {
                return upgradeMediaUrl(parts[i]);
            }
        }
        return '';
    }

    function nodeMediaSrc(el) {
        if (!el) return '';
        if (el.tagName === 'IMG') return imgBestSrc(el);
        if (el.tagName === 'VIDEO') return el.poster || imgBestSrc(el.querySelector && el.querySelector('img')) || '';
        const img = el.querySelector && el.querySelector('img');
        const fromImg = imgBestSrc(img);
        if (fromImg) return fromImg;
        const bgNodes = [el, ...(el.querySelectorAll ? el.querySelectorAll('[style*="background"]') : [])];
        for (const node of bgNodes) {
            const bg = node.style && node.style.backgroundImage;
            if (!bg) continue;
            const m = bg.match(/url\(["']?(https[^"')]+)/);
            if (m && !isProfileOrUiImage(m[1])) return upgradeMediaUrl(m[1]);
        }
        return '';
    }

    function collectArticleMediaEls(scope) {
        if (!scope) return [];
        const raw = [...scope.querySelectorAll('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"], img[src*="pbs.twimg.com/media"], img[src*="/media/"], img[srcset*="pbs.twimg.com/media"], img[srcset*="/media/"]')];
        return raw.filter(el => {
            if (raw.some(other => other !== el && other.contains(el))) return false;
            if (el.closest('[data-testid="sidebarColumn"], [data-testid="sheetDialog"], nav, [role="banner"]')) return false;
            if (el.tagName === 'IMG' && isProfileOrUiImage(el.src || el.getAttribute('src') || '')) return false;
            return true;
        });
    }

    function articleHeadingType(el) {
        if (!el) return '';
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'h1') return 'heading';
        if (tag === 'h2' || tag === 'h3') return 'subheading';
        const role = el.getAttribute && el.getAttribute('role');
        if (role === 'heading') {
            const level = parseInt(el.getAttribute('aria-level') || '2', 10);
            return level <= 1 ? 'heading' : 'subheading';
        }
        const cls = (el.className && String(el.className)) || '';
        if (/header-one|articleHeading|longform-h1/i.test(cls)) return 'heading';
        if (/header-two|header-three|longform-h2/i.test(cls)) return 'subheading';
        return '';
    }

    function isArticleDivider(el) {
        if (!el) return false;
        if (el.tagName === 'HR') return true;
        const cls = (el.className && String(el.className)) || '';
        if (/divider|horizontalRule|longform-divider/i.test(cls)) return true;
        if (el.getAttribute && el.getAttribute('data-testid') === 'articleDivider') return true;
        const style = el.getAttribute && el.getAttribute('style') || '';
        if (/border-top|border-bottom/i.test(style) && !(el.innerText || '').trim()) {
            const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { height: 0 };
            if (rect.height && rect.height < 16) return true;
        }
        return false;
    }

    function isArticleQuote(el) {
        if (!el) return false;
        if (el.tagName === 'BLOCKQUOTE') return true;
        const cls = (el.className && String(el.className)) || '';
        return /blockquote|block-quote|longform-quote/i.test(cls);
    }

    function extractArticleRich(root, mediaScope) {
        const blocks = [];
        if (!root) return blocks;
        const rich = root.querySelector('[data-testid="longformRichTextComponent"], [data-testid="twitterArticleRichTextView"], [data-testid="articleRichContent"]') || root;
        const seenSrc = new Set();
        const mediaEls = collectArticleMediaEls(mediaScope || root);

        const textRaw = [...rich.querySelectorAll('[data-block="true"], .longform-unstyled, .public-DraftStyleDefault-block, h1, h2, h3, blockquote, hr, pre, code, [data-testid*="markdown" i], [data-testid*="code" i]')];
        const textEls = textRaw.filter(el => {
            if (textRaw.some(other => other !== el && el.contains(other))) return false;
            if (mediaEls.some(m => el.contains(m))) {
                const leftover = (el.innerText || '').replace(/\u00a0/g, ' ').trim();
                if (!leftover) return false;
            }
            return true;
        });

        function nodePos(el) {
            const rect = el.getBoundingClientRect();
            if (rect.height || rect.width) return { top: rect.top + window.scrollY, left: rect.left };
            let top = 0, left = 0, n = el;
            while (n) {
                top += n.offsetTop || 0;
                left += n.offsetLeft || 0;
                n = n.offsetParent;
            }
            return { top, left };
        }
        const items = [
            ...mediaEls.map(n => ({ kind: 'media', n })),
            ...textEls.map(n => ({ kind: 'text', n }))
        ].sort((a, b) => {
            const pa = nodePos(a.n), pb = nodePos(b.n);
            if (pa.top !== pb.top) return pa.top - pb.top;
            if (pa.left !== pb.left) return pa.left - pb.left;
            const r = a.n.compareDocumentPosition(b.n);
            if (r & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (r & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });

        function pushImage(src, caption) {
            if (!src || seenSrc.has(src) || isProfileOrUiImage(src)) return;
            seenSrc.add(src);
            blocks.push(caption ? { type: 'image', src, caption } : { type: 'image', src });
        }

        items.forEach(item => {
            const el = item.n;
            if (item.kind === 'media') {
                const isVideo = !!(el.matches && el.matches('[data-testid="videoPlayer"], [data-testid="videoComponent"], video'))
                    || !!el.querySelector('video, [data-testid="videoPlayer"]');
                const src = nodeMediaSrc(el);
                if (isVideo) {
                    if (src && !seenSrc.has(src)) {
                        seenSrc.add(src);
                        blocks.push({ type: 'video', src });
                    }
                    return;
                }
                const fig = el.closest('figure');
                const capEl = (fig && fig.querySelector('figcaption')) || el.querySelector('figcaption, [data-testid="articleImageCaption"]');
                const caption = capEl ? (capEl.innerText || '').trim() : '';
                pushImage(src, caption);
                return;
            }

            if (isArticleDivider(el)) {
                blocks.push({ type: 'divider' });
                return;
            }
            const heading = articleHeadingType(el);
            const text = (el.innerText || '').replace(/\u00a0/g, ' ').trim();
            const html = getRichTextContent(el);
            if (!text) {
                const brOnly = el.querySelector('br') && !el.querySelector('span[data-text="true"]');
                if (brOnly) blocks.push({ type: 'spacer' });
                return;
            }
            if (el.tagName === 'PRE' || el.tagName === 'CODE' || /markdown|code-block|CodeBlock/i.test(el.className || el.getAttribute && el.getAttribute('data-testid') || '')) {
                const codeText = (el.innerText || '').replace(/\u00a0/g, ' ').replace(/\n+$/, '');
                if (codeText) blocks.push({ type: 'code', text: codeText });
                return;
            }
            if (isArticleQuote(el)) {
                blocks.push({ type: 'quote', html });
                return;
            }
            if (heading) {
                blocks.push({ type: heading, html });
                return;
            }
            const listItem = el.tagName === 'LI' || /list-item|DraftStyleDefault-ul|DraftStyleDefault-ol/i.test(el.className || '');
            if (listItem || (el.parentElement && /UL|OL/.test(el.parentElement.tagName))) {
                const ordered = !!(el.closest('ol') || /ordered-list|DraftStyleDefault-ol/i.test(el.className || ''));
                const last = blocks[blocks.length - 1];
                if (last && last.type === 'list' && last.ordered === ordered) last.items.push(html);
                else blocks.push({ type: 'list', ordered, items: [html] });
                return;
            }
            blocks.push({ type: 'text', html });
        });

        if (!blocks.length) {
            const text = (rich.innerText || '').trim();
            text.split(/\n{2,}/).forEach(seg => {
                if (seg.trim()) blocks.push({ type: 'text', html: escapeHtml(seg.trim()).replace(/\n/g, '<br>') });
            });
        }
        return blocks;
    }

    function extractArticleData(article) {
        const data = extractTweetData(article);
        const scope = article.closest('div[data-testid="primaryColumn"]') || article;
        const readView = scope.querySelector('[data-testid="twitterArticleReadView"], [data-testid="articleViewer"], [data-testid="twitterArticleReader"]');
        const titleEl = scope.querySelector('[data-testid="twitter-article-title"], [data-testid="articleTitle"], [data-testid="twitterArticleTitle"]')
            || (readView && readView.querySelector('h1, [role="heading"]'));
        const richView = scope.querySelector('[data-testid="twitterArticleRichTextView"], [data-testid="articleRichContent"], [data-testid="longformRichTextComponent"]');

        const articleLike = !!(readView || titleEl || richView || /\/(?:i\/)?article\/\d+/.test(location.pathname));
        if (!articleLike) return data;

        data.isArticle = true;
        data.articleTitle = titleEl ? titleEl.innerText.trim() : (data.articleTitle || '');

        const coverHost = readView || scope;
        let cover = '';
        const titleTop = titleEl ? (titleEl.getBoundingClientRect().top + window.scrollY) : Infinity;
        const coverImgs = [...coverHost.querySelectorAll('[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com/media"], img[src*="/media/"]')];
        for (const img of coverImgs) {
            if (richView && richView.contains(img)) continue;
            const src = upgradeMediaUrl(img.currentSrc || img.src || '');
            if (!src || isProfileOrUiImage(src)) continue;
            const imgTop = img.getBoundingClientRect().top + window.scrollY;
            if (Number.isFinite(titleTop) && imgTop > titleTop + 8) continue;
            cover = src;
            break;
        }

        const walkRoot = richView || readView || article;
        const mediaScope = readView || scope;
        data.articleBlocks = extractArticleRich(walkRoot, mediaScope);

        const bodySrc = new Set((data.articleBlocks || []).filter(b => b.src).map(b => (b.src || '').split('?')[0]));
        if (cover && bodySrc.has(cover.split('?')[0])) cover = '';
        data.articleCover = cover;
        data._articleHost = article;

        const preview = (data.contentPlain || '').trim();
        if (!preview || /\/(?:i\/)?article\/\d+/.test(preview) || /^https?:\/\/(?:x|twitter)\.com\//i.test(preview)) {
            data.contentPlain = '';
            data.contentHtml = '';
        }

        data.images = [];
        data.videos = [];
        return data;
    }

    function findArticleContext() {
        const byReader = document.querySelector('[data-testid="twitterArticleReadView"], [data-testid="twitterArticleReader"]');
        if (byReader) {
            const tweet = byReader.closest('article[data-testid="tweet"]')
                || document.querySelector('article[data-testid="tweet"]');
            return tweet || byReader;
        }
        const titled = [...document.querySelectorAll('article[data-testid="tweet"]')].find(a =>
            a.querySelector('[data-testid="twitter-article-title"], [data-testid="longformRichTextComponent"]'));
        return titled || null;
    }

    function injectArticleFab() {
        if (!/\/(?:i\/)?article\/\d+/.test(location.pathname)
            && !document.querySelector('[data-testid="twitterArticleReadView"], [data-testid="twitter-article-title"]')) {
            const fab = document.getElementById('sc-article-fab');
            if (fab) fab.remove();
            return;
        }
        if (document.getElementById('sc-article-fab')) return;
        const fab = document.createElement('button');
        fab.id = 'sc-article-fab';
        fab.type = 'button';
        fab.title = '生成文章分享卡片';
        fab.innerHTML = `${ICONS.cardSparkle}<span>生成文章卡片</span>`;
        fab.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            const host = findArticleContext() || document.querySelector('article[data-testid="tweet"]') || document.body;
            openCardFromArticle(host);
        });
        document.body.appendChild(fab);
    }

    function injectButtons() {
        document.querySelectorAll('article[data-testid="tweet"]').forEach(article => {
            if (processed.has(article) || article.querySelector('.sc-action-wrap')) return;
            processed.add(article);
            const actionBar = article.querySelector('[role="group"]');
            if (!actionBar) return;

            const wrap = document.createElement('div');
            wrap.className = 'sc-action-wrap';
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';

            const cardBtn = document.createElement('div');
            cardBtn.className = 'sc-gen-btn';
            cardBtn.innerHTML = ICONS.cardSparkle;
            cardBtn.title = '生成推文 / 文章分享卡片';
            cardBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                openCardFromArticle(article);
            });

            const parseBtn = document.createElement('div');
            parseBtn.className = 'sc-gen-btn';
            parseBtn.innerHTML = ICONS.parseVideo;
            parseBtn.title = '解析提取真实视频链接并下载';
            parseBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                openVideoParser(article);
            });

            wrap.appendChild(cardBtn);
            wrap.appendChild(parseBtn);
            actionBar.appendChild(wrap);
        });
        injectArticleFab();
    }

    function extractTweetData(article) {
        const quoteRoot = findQuoteRoot(article);
        const isInsideQuote = el => !!(quoteRoot && el && quoteRoot.contains(el));

        let name = '', handle = '';
        const allUserEls = article.querySelectorAll('[data-testid="User-Name"]');
        let mainUserEl = null;
        for (const el of allUserEls) {
            if (!isInsideQuote(el)) { mainUserEl = el; break; }
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
            if (!isInsideQuote(t)) { mainTextEl = t; break; }
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
                if (img.src && !qImages.includes(img.src)) qImages.push(img.src.replace(/name=\w+/, 'name=small'));
            });
            quoteRoot.querySelectorAll('video[poster]').forEach(v => {
                if (v.poster && !qImages.includes(v.poster)) qImages.push(v.poster);
            });
            if (qContent || qImages.length || qName) {
                quoted = { name: qName, handle: qHandle, avatar: qAvatar, content: qContent, images: qImages };
            }
        }

        let href = '';
        const timeLink = article.querySelector('time') && article.querySelector('time').closest('a[href]');
        const hrefs = [];
        if (timeLink) hrefs.push(timeLink.getAttribute('href') || '');
        article.querySelectorAll('a[href*="/status/"], a[href*="/article/"]').forEach(a => hrefs.push(a.getAttribute('href') || ''));
        for (const h of hrefs) {
            if (!h || isMediaPostHref(h)) continue;
            if (!/\/(?:status(?:es)?|article)\/\d+/.test(h)) continue;
            href = h;
            break;
        }
        if (!href) href = location.pathname || location.href || '';
        const abs = href.startsWith('http') ? href : ('https://x.com' + (href.startsWith('/') ? href : '/' + href));
        const idm = abs.match(/\/(?:status(?:es)?|article)\/(\d+)/) || String(location.href).match(/\/(?:status(?:es)?|article)\/(\d+)/);
        const userm = abs.match(/\/([A-Za-z0-9_]+)\/(?:status(?:es)?|article)\/\d+/) || String(location.href).match(/\/([A-Za-z0-9_]+)\/(?:status(?:es)?|article)\/\d+/);
        const userPart = ((handle || '').replace(/^@/, '')) || (userm && userm[1] !== 'i' ? userm[1] : '') || 'i';
        const isArt = /\/article\//.test(abs) || /\/article\//.test(location.pathname || '');
        const link = idm
            ? ('https://x.com/' + userPart + '/' + (isArt ? 'article' : 'status') + '/' + idm[1])
            : abs.split('?')[0];

        return { name, handle, contentHtml, contentPlain, avatar, time, views, images, videos, quoted, link };
    }

    // === 核心：智能多线程下载器 ===
    function fallbackSingleThreadDownload(url, filename, btn, originalText) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'blob',
            onprogress: function(e) {
                if (e.lengthComputable) {
                    const percent = Math.floor((e.loaded / e.total) * 100);
                    btn.innerHTML = `⏳ 单线程下载中 ${percent}%`;
                } else {
                    btn.innerHTML = `⏳ 正在下载...`;
                }
            },
            onload: function(res) {
                if (res.status === 200 || res.status === 206) {
                    const blob = res.response;
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(blobUrl);
                    btn.innerHTML = '✅ 下载完成！';
                    btn.style.background = '#00ba7c';
                } else {
                    btn.innerHTML = '❌ 下载失败，请重试';
                }
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                    btn.style.background = '#1d9bf0';
                }, 3000);
            },
            onerror: function() {
                btn.innerHTML = '❌ 网络异常，下载失败';
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                }, 3000);
            }
        });
    }

    async function executeMultiThreadDownload(url, filename, btn, originalText) {
        const setProgress = (text) => { btn.innerHTML = text; };
        try {
            setProgress('⏳ 正在探测视频大小...');

            // 发起 Range 请求读取头 2 字节探测大小和分片支持
            const probeRes = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: { 'Range': 'bytes=0-1' },
                    responseType: 'arraybuffer',
                    onload: resolve,
                    onerror: reject
                });
            });

            // 状态码 206 代表支持 Range，否则退回单线程
            if (probeRes.status !== 206) {
                return fallbackSingleThreadDownload(url, filename, btn, originalText);
            }

            const match = (probeRes.responseHeaders || '').match(/content-range:\s*bytes\s*0-1\/(\d+)/i);
            if (!match) {
                return fallbackSingleThreadDownload(url, filename, btn, originalText);
            }

            const totalSize = parseInt(match[1], 10);

            // 如果视频小于 3MB，没必要切片，直接单线程下
            if (totalSize < 3 * 1024 * 1024) {
                return fallbackSingleThreadDownload(url, filename, btn, originalText);
            }

            // 固定 4 线程下载
            const threadCount = 4;
            const chunkSize = Math.ceil(totalSize / threadCount);
            const chunks = new Array(threadCount);
            const downloaded = new Array(threadCount).fill(0);

            const updateUI = () => {
                const loaded = downloaded.reduce((a, b) => a + b, 0);
                const percent = Math.floor((loaded / totalSize) * 100);
                setProgress(`🚀 多线程高速下载中 ${percent}%`);
            };

            const downloadChunk = (index) => {
                return new Promise((resolve, reject) => {
                    const start = index * chunkSize;
                    let end = start + chunkSize - 1;
                    if (index === threadCount - 1) end = totalSize - 1;

                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: url,
                        headers: { 'Range': `bytes=${start}-${end}` },
                        responseType: 'arraybuffer',
                        onprogress: (e) => {
                            if (e.lengthComputable) {
                                downloaded[index] = e.loaded;
                                updateUI();
                            }
                        },
                        onload: (res) => {
                            if (res.status === 206 || res.status === 200) {
                                chunks[index] = res.response;
                                resolve();
                            } else {
                                reject(new Error(`Status ${res.status}`));
                            }
                        },
                        onerror: reject
                    });
                });
            };

            await Promise.all(Array.from({ length: threadCount }, (_, i) => downloadChunk(i)));

            setProgress('⏳ 下载完毕，正在合并保存...');

            // 合并并下载
            const blob = new Blob(chunks, { type: 'video/mp4' });
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);

            btn.innerHTML = '✅ 下载完成！';
            btn.style.background = '#00ba7c';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.background = '#1d9bf0';
            }, 3000);

        } catch (err) {
            console.error('Multi-thread fallback', err);
            setProgress('⚠️ 多线程失败，尝试单线程安全下载...');
            setTimeout(() => {
                fallbackSingleThreadDownload(url, filename, btn, originalText);
            }, 1000);
        }
    }

    function openVideoParser(article) {
        const tweetData = extractTweetData(article);
        const currentUrl = tweetData.link || location.href;
        const statusMatch = String(currentUrl + ' ' + location.href).match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/(?:status(?:es)?|article)\/(\d+)/i);
        const idOnly = String(currentUrl + ' ' + location.href).match(/\/(?:status(?:es)?|article)\/(\d+)/);
        if (!statusMatch && !idOnly) {
            showToast('解析失败：未匹配到有效的推文ID，请确保在具体推文内操作。', 'error');
            return;
        }
        const username = (statusMatch && statusMatch[1] !== 'i' ? statusMatch[1] : '')
            || String(tweetData.handle || '').replace(/^@/, '')
            || 'i';
        const tweetId = (statusMatch && statusMatch[2]) || idOnly[1];
        const shareUrl = 'https://x.com/' + username + '/status/' + tweetId;
        showParseModal(username, tweetId, shareUrl);
    }

    function showParseModal(username, tweetId, originalUrl) {
        let overlay = document.getElementById('tm-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'tm-modal-overlay';
            overlay.innerHTML = `
                <div id="tm-modal-content">
                    <div class="tm-close" id="tm-close-btn">&times;</div>
                    <h2 class="tm-title">解析成功 🎉</h2>
                    <div id="tm-modal-body"></div>
                    <div class="tm-footer">
                        解析底层：fxtwitter / vxtwitter<br>
                        <a href="https://twitterxz.com/" target="_blank">前往 TwitterXZ 官网体验</a>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            document.getElementById('tm-close-btn').addEventListener('click', () => {
                overlay.classList.remove('active');
            });
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.classList.remove('active');
            });
        }

        const modalBody = document.getElementById('tm-modal-body');
        modalBody.innerHTML = '<div class="tm-loading">⏳ 正在深入提取真实媒体链接，请稍候...</div>';
        overlay.classList.add('active');

        const paths = [
            'https://api.fxtwitter.com/' + username + '/status/' + tweetId,
            'https://api.fxtwitter.com/i/status/' + tweetId,
            'https://api.vxtwitter.com/' + username + '/status/' + tweetId,
            'https://api.vxtwitter.com/i/status/' + tweetId
        ];
        (async () => {
            let videos = [];
            for (const apiUrl of paths) {
                try {
                    const data = await fetchJsonGM(apiUrl);
                    videos = collectApiVideos(data);
                    if (videos.length) break;
                } catch (_) {}
            }
            if (videos.length) renderVideos(videos, originalUrl, modalBody);
            else modalBody.innerHTML = '<div class="tm-loading" style="color: #f4212e;">❌ 未能提取到视频。接口不可用或帖子没有视频。</div>';
        })();
    }
    function collectApiVideos(data) {
        const out = [];
        const seen = new Set();
        const add = (url, thumb, type) => {
            if (!url || seen.has(url)) return;
            seen.add(url);
            out.push({ url, thumbnail_url: thumb || '', type: type || 'video' });
        };
        const tweet = data && data.tweet;
        const media = tweet && tweet.media;
        const list = (media && (media.all || media.videos)) || (data && data.media_extended) || [];
        list.forEach(m => {
            if (!m || (m.type && m.type !== 'video' && m.type !== 'gif')) return;
            const formats = m.formats || [];
            const mp4s = formats.filter(f => f && f.url && (f.container === 'mp4' || String(f.url).includes('.mp4')));
            const best = mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
            add((best && best.url) || m.url, m.thumbnail_url || '', m.type);
        });
        return out;
    }

    function renderVideos(videos, originalUrl, modalBody) {
        let html = '';
        videos.forEach((video) => {
            const videoUrl = video.url;
            const thumbUrl = video.thumbnail_url;
            html += `
                <div class="tm-video-card">
                    <img src="${thumbUrl}" class="tm-video-thumb" alt="视频预览封面" onerror="this.style.display='none'" />
                    <div class="tm-btn-group">
                        <button class="tm-download-btn tm-force-dl-btn" data-url="${videoUrl}" style="cursor:pointer; border:none; width: 100%; font-family: inherit;">🚀 直接高速下载到本地</button>
                        <a href="${videoUrl}" target="_blank" class="tm-link-btn">🎬 在新标签页打开视频</a>
                        <button class="tm-link-btn tm-copy-btn" data-url="${videoUrl}">🔗 复制真实的视频直链</button>
                    </div>
                </div>
            `;
        });
        html += `
            <div style="margin-top:20px; text-align:center;">
                <a href="https://twitterxz.com/parse?url=${encodeURIComponent(originalUrl)}" target="_blank" class="tm-link-btn" style="display:inline-block; padding:10px 20px; font-size:14px; background:#f3f4f6; border:none; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                    🌐 备选方案：一键传送到 TwitterXZ 网页版解析
                </a>
            </div>
        `;
        modalBody.innerHTML = html;

        // 绑定多线程直接流式下载事件
        modalBody.querySelectorAll('.tm-force-dl-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                if (this.disabled) return;
                const url = this.getAttribute('data-url');

                const match = originalUrl.match(/x\.com\/([^\/]+)\/status\/(\d+)/) || originalUrl.match(/twitter\.com\/([^\/]+)\/status\/(\d+)/);
                const username = match ? match[1] : 'unknown';
                const tweetId = match ? match[2] : Date.now();
                const filename = `x_video_${username}_${tweetId}.mp4`;

                const originalText = this.innerHTML;
                this.disabled = true;
                this.style.opacity = '0.8';
                this.style.cursor = 'not-allowed';

                // 调用多线程下载核心
                executeMultiThreadDownload(url, filename, this, originalText);
            });
        });

        // 绑定复制链接事件
        modalBody.querySelectorAll('.tm-copy-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const url = this.getAttribute('data-url');
                const tempInput = document.createElement('input');
                tempInput.style = 'position: absolute; left: -1000px; top: -1000px';
                tempInput.value = url;
                document.body.appendChild(tempInput);
                tempInput.select();
                document.execCommand('copy');
                document.body.removeChild(tempInput);

                const originalText = this.innerHTML;
                this.innerHTML = '✅ 链接复制成功！';
                this.style.background = '#e7f5eb';
                this.style.borderColor = '#34a853';
                setTimeout(() => {
                    this.innerHTML = originalText;
                    this.style.background = 'white';
                    this.style.borderColor = '#cfd9de';
                }, 2000);
                showToast('视频直链已复制到剪贴板！', 'success');
            });
        });
    }

    function sanitizeFilenamePart(s, max) {
        return String(s || '')
            .replace(/[\\/:*?"<>|]/g, '')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^[_.]+|[_.]+$/g, '')
            .slice(0, max || 40);
    }

    function generateDefaultFilename(data) {
        const now = new Date();
        const p = n => String(n).padStart(2, '0');
        const timeStamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
        const titleSrc = (data && (data.articleTitle || data.title)) || '';
        const title = (data && data.isArticle) || titleSrc
            ? sanitizeFilenamePart(titleSrc, 48)
            : '';
        if (title) return `x_${title}_${timeStamp}`;
        const handleClean = (data.handle || '').replace(/^@/, '').trim();
        const nameClean = sanitizeFilenamePart(data.name, 15);
        const author = handleClean || nameClean || 'post';
        return `x_${author}_${timeStamp}`;
    }

    function parseStatusRef(data) {
        const href = (data && data.link) || location.href;
        let m = String(href).match(/\/([A-Za-z0-9_]+)\/(?:status(?:es)?|article)\/(\d+)/);
        if (m) return { user: m[1], id: m[2] };
        m = location.pathname.match(/\/([A-Za-z0-9_]+)\/(?:status(?:es)?|article)\/(\d+)/);
        if (m) return { user: m[1], id: m[2] };
        m = String(href).match(/\/i\/article\/(\d+)/);
        if (m) return { user: 'i', id: m[1] };
        return null;
    }

    function fetchJsonGM(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('no GM'));
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                anonymous: true,
                headers: { Accept: 'application/json' },
                onload: r => {
                    try { resolve(JSON.parse(r.responseText)); }
                    catch (err) { reject(err); }
                },
                onerror: reject,
                ontimeout: reject
            });
        });
    }

    function entityValue(entry) {
        if (!entry) return null;
        return (entry.value && typeof entry.value === 'object') ? entry.value : entry;
    }

    function blocksFromMarkdownEntity(raw) {
        const src = String(raw || '').replace(/\r\n/g, '\n').trim();
        if (!src) return [];
        const m = src.match(/^```([^\n]*)\n([\s\S]*?)\n```$/);
        if (m) return [{ type: 'code', lang: String(m[1] || '').trim(), text: m[2].replace(/\n+$/, '') }];
        const m2 = src.match(/^```([^\n]*)\n([\s\S]*?)```$/);
        if (m2) return [{ type: 'code', lang: String(m2[1] || '').trim(), text: m2[2].replace(/\n+$/, '') }];
        if (/^\s*\|.+\|/m.test(src)) return [{ type: 'code', lang: 'table', text: src }];
        return [{ type: 'text', html: escapeHtml(src).replace(/\n/g, '<br>') }];
    }

    function mapArticleFromFx(article) {
        if (!article) return null;
        const title = article.title || '';
        const coverInfo = article.cover_media || {};
        const cover = (coverInfo.media_info && coverInfo.media_info.original_img_url) || coverInfo.url || article.image || '';
        const mediaById = {};
        (article.media_entities || []).forEach(m => {
            const url = (m.media_info && m.media_info.original_img_url) || m.url;
            if (m.media_id && url) mediaById[String(m.media_id)] = upgradeMediaUrl(url);
        });
        if (coverInfo.media_id && cover) mediaById[String(coverInfo.media_id)] = upgradeMediaUrl(cover);

        const content = article.content || {};
        const rawBlocks = content.blocks || [];
        const entityMap = content.entityMap || content.entity_map || content.entities || [];
        function getEntity(key) {
            if (key === undefined || key === null || key === '') return null;
            const k = String(key);
            if (Array.isArray(entityMap)) {
                const byKey = entityMap.find(e => String(e && e.key) === k);
                if (byKey) return entityValue(byKey);
                const hasKeys = entityMap.some(e => e && e.key != null && String(e.key) !== '');
                if (!hasKeys) return entityValue(entityMap[key] || entityMap[Number(k)]);
                return null;
            }
            return entityValue(entityMap[k] || entityMap[key]);
        }

        const blocks = [];
        rawBlocks.forEach(b => {
            const type = b.type || 'unstyled';
            const text = b.text || '';
            const ranges = b.inlineStyleRanges || b.inline_style_ranges || [];
            const entityRanges = b.entityRanges || b.entity_ranges || [];
            if (type === 'atomic') {
                const ent = getEntity(entityRanges[0] && entityRanges[0].key);
                const etype = ((ent && ent.type) || '').toUpperCase();
                if (etype === 'MEDIA' || etype === 'IMAGE') {
                    const items = (ent.data && (ent.data.mediaItems || ent.data.media_items)) || [];
                    const mid = items[0] && (items[0].mediaId || items[0].media_id);
                    const src = (mid && mediaById[String(mid)]) || (ent.data && (ent.data.url || ent.data.src)) || '';
                    const caption = (ent.data && ent.data.caption) || '';
                    if (src) blocks.push(caption ? { type: 'image', src, caption } : { type: 'image', src });
                } else if (etype === 'DIVIDER' || etype === 'HORIZONTAL_RULE') {
                    blocks.push({ type: 'divider' });
                } else if (etype === 'MARKDOWN') {
                    blocksFromMarkdownEntity(ent && ent.data && ent.data.markdown).forEach(x => blocks.push(x));
                } else if (etype === 'TWEET' || etype === 'POST') {
                    const tid = ent && ent.data && (ent.data.tweet_id || ent.data.tweetId || ent.data.id || ent.data.post_id);
                    blocks.push({ type: 'embed', tweetId: tid ? String(tid) : '', html: tid ? '内嵌帖 ' + String(tid) : '内嵌帖' });
                }
                return;
            }
            if (!String(text).trim()) {
                if (type === 'unstyled') blocks.push({ type: 'spacer' });
                return;
            }
            const html = getRichTextFromPlain(text, ranges);
            if (type === 'header-one' || type === 'header-1' || type === 'h1') blocks.push({ type: 'heading', html });
            else if (type === 'header-two' || type === 'header-three' || type === 'h2' || type === 'h3') blocks.push({ type: 'subheading', html });
            else if (type === 'blockquote') blocks.push({ type: 'quote', html });
            else if (type === 'code-block') blocks.push({ type: 'code', text });
            else if (type === 'unordered-list-item' || type === 'ordered-list-item') {
                const ordered = type === 'ordered-list-item';
                const last = blocks[blocks.length - 1];
                if (last && last.type === 'list' && last.ordered === ordered) last.items.push(html);
                else blocks.push({ type: 'list', ordered, items: [html] });
            } else {
                blocks.push({ type: 'text', html });
            }
        });
        return { title, cover: cover ? upgradeMediaUrl(cover) : '', blocks };
    }

    function getRichTextFromPlain(text, ranges) {
        const raw = text || '';
        if (!raw) return '';
        const marks = [];
        (ranges || []).forEach(r => {
            const style = String(r.style || '').toLowerCase();
            const tag = style.includes('bold') ? 'strong' : style.includes('italic') ? 'em' : style.includes('underline') ? 'u' : '';
            if (!tag) return;
            const start = Math.max(0, r.offset || 0);
            const end = Math.min(raw.length, start + (r.length || 0));
            if (end <= start) return;
            marks.push({ pos: start, open: true, tag });
            marks.push({ pos: end, open: false, tag });
        });
        marks.sort((a, b) => a.pos - b.pos || Number(a.open) - Number(b.open));
        let html = '', i = 0;
        marks.forEach(m => {
            html += escapeHtml(raw.slice(i, m.pos));
            html += m.open ? '<' + m.tag + '>' : '</' + m.tag + '>';
            i = m.pos;
        });
        html += escapeHtml(raw.slice(i));
        return html.replace(/\n/g, '<br>');
    }

    async function hydrateArticleFromApi(data) {
        if (!data || !data.isArticle) return;
        const parsed = parseStatusRef(data);
        if (!parsed) return;
        try {
            const fx = await fetchJsonGM(`https://api.fxtwitter.com/${parsed.user}/status/${parsed.id}`);
            const mapped = mapArticleFromFx(fx && fx.tweet && fx.tweet.article);
            if (!mapped || !mapped.blocks || !mapped.blocks.some(b => b.type === 'image' || b.type === 'video')) return;
            const panel = document.getElementById('share-card-panel');
            if (!panel || !panel._data) return;
            panel._data.articleBlocks = mapped.blocks;
            panel._data.articleTitle = panel._data.articleTitle || mapped.title;
            panel._data.articleCover = mapped.cover || panel._data.articleCover || '';
            panel._data.isArticle = true;
            const titleInput = document.getElementById('scp-article-title');
            const group = document.getElementById('scp-article-title-group');
            if (group) group.style.display = '';
            if (titleInput && !titleInput.value && mapped.title) titleInput.value = mapped.title;
            renderCard(panel._data);
        } catch (err) {
            console.warn('xShare article hydrate failed', err);
        }
    }

    function openCardFromArticle(article) {
        const data = extractArticleData(article);
        showPanel(data);
        hydrateArticleFromApi(data);
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
                    <span class="scp-version-badge">v6.10</span>
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

                    <div id="scp-article-title-group" class="scp-control-group" style="margin-top: 8px; display: none;">
                        <div class="scp-label-row">
                            <label>文章标题</label>
                            <button type="button" id="scp-article-reset" class="scp-link-action" title="重新从推文读取文章标题">重新读取</button>
                        </div>
                        <input type="text" id="scp-article-title" placeholder="文章标题" style="margin-top: 6px;">
                    </div>

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
                        <div class="scp-stat-chip">${ICONS.image}<span>图片 ${(data.images.length || 0) + (data.isArticle ? ((data.articleCover ? 1 : 0) + (data.articleBlocks || []).filter(b => b.type === 'image').length) : 0)}</span></div>
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
                        <div id="scp-cloud-actions" class="scp-cloud-actions">
                            <button id="scp-cloud-img" type="button" class="secondary">
                                ${ICONS.image}
                                <span>同步卡片图片</span>
                            </button>
                            <button id="scp-cloud-media" type="button" class="secondary">
                                ${ICONS.image}
                                <span>同步配图</span>
                            </button>
                            <button id="scp-cloud-md" type="button" class="secondary">
                                ${ICONS.copy}
                                <span>同步 Markdown</span>
                            </button>
                            <button id="scp-cloud-lib" type="button" class="secondary">
                                ${ICONS.cardSparkle}
                                <span>打开云端库</span>
                            </button>
                        </div>
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

        document.getElementById('scp-filename-reset').onclick = () => {
            const titleInput = document.getElementById('scp-article-title');
            const currentData = {
                name: document.getElementById('scp-name').value,
                handle: document.getElementById('scp-handle').value,
                isArticle: !!(panel._data && panel._data.isArticle),
                articleTitle: (titleInput && titleInput.value) || (panel._data && panel._data.articleTitle) || ''
            };
            document.getElementById('scp-filename').value = generateDefaultFilename(currentData);
            showToast('已重置导出文件名', 'info');
        };

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
        bindHiddenSupabaseEntry(panel);

        const playCheckbox = document.getElementById('scp-show-playbtn');
        playCheckbox.addEventListener('change', () => {
            setStoredShowPlay(playCheckbox.checked);
            renderCard(panel._data);
        });

        document.getElementById('scp-close').onclick = () => { panel.remove(); activePanel = null; };
        document.getElementById('scp-preview').onclick = () => renderCard(panel._data);
        document.getElementById('scp-download').onclick = () => exportCard(false);
        document.getElementById('scp-copy').onclick = () => exportCard(true);
        const cloudImgBtn = document.getElementById('scp-cloud-img');
        const cloudMdBtn = document.getElementById('scp-cloud-md');
        if (cloudImgBtn) cloudImgBtn.onclick = () => syncCloudImage();
        const cloudMediaBtn = document.getElementById('scp-cloud-media');
        if (cloudMediaBtn) cloudMediaBtn.onclick = () => syncCloudMedia();
        if (cloudMdBtn) cloudMdBtn.onclick = () => syncCloudMarkdown();
        const cloudLibBtn = document.getElementById('scp-cloud-lib');
        if (cloudLibBtn) cloudLibBtn.onclick = () => openCloudLibrary();
        refreshCloudButtons();

        renderCard(panel._data);

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
                    else if (b.type === 'code') body += `<div class="sc-art-prewrap"><div class="sc-art-prehead"><span class="sc-art-prelang">${escapeHtml(b.lang || 'text')}</span><span class="sc-art-precopy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></span></div><pre class="sc-art-pre">${escapeHtml(b.text || '')}</pre></div>`;
                    else if (b.type === 'embed') body += `<div class="sc-art-embed">${b.html || (b.tweetId ? '内嵌帖 ' + escapeHtml(b.tweetId) : '内嵌帖')}</div>`;
                    else if (b.type === 'image') body += `<figure class="sc-art-figure"><img class="sc-art-img" src="${b.src}" crossorigin="anonymous" referrerpolicy="no-referrer">${b.caption ? `<figcaption class="sc-art-cap">${escapeHtml(b.caption)}</figcaption>` : ''}</figure>`;
                    else if (b.type === 'video') body += `<div class="sc-media video sc-art-video"><img src="${b.src}" crossorigin="anonymous" referrerpolicy="no-referrer">${showPlay ? `<div class="play-btn">${ICONS.play}</div>` : ''}</div>`;
                    else if (b.type === 'divider') body += `<hr class="sc-art-hr">`;
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
            ${contentHtml ? `<div class="sc-content">${contentHtml}</div>` : ''}
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
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('blob');
            if (copy) {
                try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    showToast('已成功复制卡片至剪贴板！', 'success');
                } catch {
                    downloadBlob(blob, customName);
                    showToast('复制失败，已自动转为下载图片', 'info');
                }
            } else {
                downloadBlob(blob, customName);
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

    function downloadBlob(blob, customName) {
        let filename = (customName || '').trim();
        if (!filename) filename = `x-card-${Date.now()}`;
        filename = filename.replace(/[\\/:*?"<>|]/g, '_');
        if (!filename.toLowerCase().endsWith('.png')) filename += '.png';
        const a = document.createElement('a');
        a.download = filename;
        a.href = URL.createObjectURL(blob);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    function download(canvas, customName) {
        canvas.toBlob(blob => { if (blob) downloadBlob(blob, customName); }, 'image/png');
    }

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
        .sc-icon { width: 15px; height: 15px; display: inline-block; flex-shrink: 0; vertical-align: -0.125em; stroke-width: 2; }
        .sc-icon-xs { width: 12px; height: 12px; vertical-align: middle; }
        .sc-spin { animation: sc-spin-anim 0.8s linear infinite; }
        @keyframes sc-spin-anim { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .sc-action-wrap { display: flex; align-items: center; }
        .sc-gen-btn {
            display: inline-flex; align-items: center; justify-content: center;
            width: 34px; height: 34px; border-radius: 50%; cursor: pointer; color: #536471;
            margin-left: 2px; transition: color .15s ease, background-color .15s ease, transform .1s ease; user-select: none;
        }
        .sc-gen-btn .sc-icon { width: 17px; height: 17px; }
        .sc-gen-btn:hover { color: #1d9bf0; background-color: rgba(29, 155, 240, 0.1); transform: scale(1.05); }
        #share-card-panel {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 980px; max-width: 96vw; max-height: 92vh;
            background: #ffffff; border-radius: 18px; border: 1px solid rgba(0, 0, 0, 0.08); box-shadow: 0 25px 60px -15px rgba(15, 20, 25, 0.35);
            z-index: 999999; display: flex; flex-direction: column; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            animation: scp-fade-in .2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes scp-fade-in { from { opacity: 0; transform: translate(-50%, -48%) scale(0.98); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        .scp-header { background: #0f1419; color: #ffffff; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; user-select: none; }
        .scp-title { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 14.5px; letter-spacing: -0.2px; }
        .scp-title-icon { display: inline-flex; align-items: center; color: #1d9bf0; }
        .scp-title-icon .sc-icon { width: 18px; height: 18px; }
        .scp-version-badge { font-size: 11px; font-weight: 600; color: #8b98a5; background: rgba(255, 255, 255, 0.1); padding: 1px 6px; border-radius: 999px; }
        #scp-sb-mask { position: fixed; inset: 0; z-index: 1000002; background: rgba(15,20,25,.45); display: flex; align-items: center; justify-content: center; }
        .scp-sb-box { width: min(420px, calc(100vw - 32px)); background: #fff; color: #0f1419; border-radius: 16px; padding: 18px 18px 16px; box-shadow: 0 16px 40px rgba(15,20,25,.24); }
        .scp-sb-box h4 { margin: 0 0 6px; font-size: 15px; }
        .scp-sb-box p { margin: 0 0 12px; font-size: 12px; color: #536471; line-height: 1.5; }
        .scp-sb-box label { display: block; font-size: 12px; font-weight: 600; color: #536471; margin: 8px 0 4px; }
        .scp-sb-box input[type="text"], .scp-sb-box input[type="password"] { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #cfd9de; border-radius: 8px; font-size: 13px; }
        .scp-sb-box .scp-sb-check { display: flex; align-items: center; gap: 8px; font-weight: 600; color: #0f1419; margin-top: 12px; }
        .scp-sb-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
        .scp-sb-actions button { border: 1px solid #cfd9de; background: #fff; border-radius: 999px; padding: 7px 14px; font-size: 13px; font-weight: 700; cursor: pointer; }
        .scp-sb-actions #scp-sb-save { background: #0f1419; color: #fff; border-color: #0f1419; }
        .scp-cloud-actions { display: none; }
        #scp-cloud-md, #scp-cloud-lib { grid-column: 1 / -1; }
        #scp-lib-mask { position: fixed; inset: 0; z-index: 1000003; background: rgba(15,20,25,.45); display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        #scp-lib-mask .scp-lib-box {
            width: min(520px, calc(100vw - 28px));
            height: min(680px, calc(100vh - 36px));
            max-height: calc(100vh - 36px);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            background: #fff;
            color: #0f1419;
            border-radius: 18px;
            padding: 16px 16px 14px;
            box-shadow: 0 16px 40px rgba(15,20,25,.24);
        }
        #scp-lib-mask .scp-lib-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-shrink: 0; }
        #scp-lib-mask .scp-lib-head h4 { margin: 0; font-size: 16px; font-weight: 760; color: #0f1419; }
        #scp-lib-mask .scp-lib-x { appearance: none; border: 0; background: transparent; color: #536471; font-size: 13px; font-weight: 650; cursor: pointer; padding: 4px 2px; }
        #scp-lib-mask .scp-lib-search { display: flex; gap: 8px; margin-bottom: 8px; flex-shrink: 0; }
        #scp-lib-mask .scp-lib-search input { flex: 1; width: auto; box-sizing: border-box; padding: 8px 10px; border: 1px solid #cfd9de; border-radius: 10px; font-size: 13px; background: #fff; color: #0f1419; }
        #scp-lib-mask .scp-lib-search button { appearance: none; border: 1px solid #0f1419; background: #0f1419; color: #fff; border-radius: 10px; padding: 8px 12px; font-size: 13px; font-weight: 700; cursor: pointer; }
        #scp-lib-mask .scp-lib-filters { display: flex; flex-wrap: nowrap; gap: 6px; align-items: center; margin-bottom: 12px; flex-shrink: 0; overflow-x: auto; }
        #scp-lib-mask .scp-lib-gap { flex: 1; min-width: 8px; }
        #scp-lib-mask .scp-lib-chip { appearance: none; border: 1px solid #e1e8ed; background: #fff; color: #536471; border-radius: 999px; padding: 5px 10px; font-size: 12px; font-weight: 650; cursor: pointer; line-height: 1; }
        #scp-lib-mask .scp-lib-chip.on { background: #0f1419; color: #fff; border-color: #0f1419; }
        #scp-lib-mask .scp-lib-list { flex: 1 1 auto; min-height: 0; max-height: none; overflow: auto; display: flex; flex-direction: column; gap: 6px; border: 0; background: transparent; }
        #scp-lib-mask .scp-lib-list::-webkit-scrollbar { width: 8px; height: 8px; }
        #scp-lib-mask .scp-lib-list::-webkit-scrollbar-track { background: transparent; }
        #scp-lib-mask .scp-lib-list::-webkit-scrollbar-thumb { background: rgba(15,20,25,.28); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
        #scp-lib-mask .scp-lib-list { scrollbar-width: thin; scrollbar-color: rgba(15,20,25,.28) transparent; }
        #scp-lib-mask .scp-lib-group { border: 1px solid #e6ebef; border-radius: 12px; padding: 8px 10px; background: #fafbfc; }
        #scp-lib-mask .scp-lib-group-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        #scp-lib-mask .scp-lib-title { font-size: 13px; font-weight: 700; line-height: 1.35; color: #0f1419; min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #scp-lib-mask .scp-lib-aside { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        #scp-lib-mask .scp-lib-when { font-size: 11px; color: #8b98a5; white-space: nowrap; cursor: default; }
        #scp-lib-mask .scp-lib-src { font-size: 12px; color: #1d9bf0; text-decoration: none; font-weight: 650; white-space: nowrap; }
        #scp-lib-mask .scp-lib-files { display: flex; flex-direction: row; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
        #scp-lib-mask .scp-lib-file { appearance: none; display: inline-flex; align-items: center; width: auto; box-sizing: border-box; border: 1px solid #e1e8ed; background: #fff; border-radius: 999px; padding: 4px 9px; font-size: 11.5px; color: #0f1419; cursor: pointer; line-height: 1.2; }
        #scp-lib-mask .scp-lib-file:hover { background: #f7f9f9; }
        #scp-lib-mask .scp-lib-pager { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 12px; flex-shrink: 0; }
        #scp-lib-mask .scp-lib-pager button { appearance: none; border: 1px solid #cfd9de; background: #fff; color: #0f1419; border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; }
        #scp-lib-mask .scp-lib-pager button:disabled { opacity: .4; cursor: default; }
        #scp-lib-mask .scp-lib-empty { padding: 28px 12px; text-align: center; font-size: 13px; color: #536471; }
        #scp-dup-mask { position: fixed; inset: 0; z-index: 1000004; background: rgba(15,20,25,.45); display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        #scp-dup-mask .scp-dup-box { width: min(400px, calc(100vw - 32px)); background: #fff; color: #0f1419; border-radius: 16px; padding: 18px 18px 16px; box-shadow: 0 16px 40px rgba(15,20,25,.24); }
        #scp-dup-mask h4 { margin: 0 0 10px; font-size: 16px; }
        #scp-dup-mask .scp-dup-note { font-size: 13px; color: #536471; line-height: 1.5; margin-bottom: 12px; }
        #scp-dup-mask .scp-dup-meta { background: #f7f9f9; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
        #scp-dup-mask .scp-dup-meta span { display: inline-block; width: 36px; color: #8b98a5; font-size: 12px; }
        #scp-dup-mask .scp-dup-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
        #scp-dup-mask .scp-dup-actions button { appearance: none; border-radius: 999px; padding: 7px 14px; font-size: 13px; font-weight: 700; cursor: pointer; }
        #scp-dup-mask #scp-dup-over { background: #0f1419; color: #fff; border: 1px solid #0f1419; }
        #scp-dup-mask #scp-dup-cancel { background: #fff; color: #0f1419; border: 1px solid #cfd9de; }
        #scp-lib-mask .scp-lib-listwrap { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
        #scp-lib-mask .scp-lib-spin { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.55); z-index: 2; pointer-events: none; }
        #scp-lib-mask .scp-lib-spin[hidden] { display: none; }
        #scp-lib-mask .scp-lib-spin span { width: 22px; height: 22px; border: 2px solid #cfd9de; border-top-color: #0f1419; border-radius: 50%; animation: sc-spin-anim .8s linear infinite; }
        #scp-lib-mask .scp-lib-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }



        #scp-close { display: inline-flex; align-items: center; justify-content: center; background: none; border: none; color: #eff3f4; padding: 6px; cursor: pointer; border-radius: 50%; transition: all .15s ease; }
        #scp-close .sc-icon { width: 17px; height: 17px; }
        #scp-close:hover { background: rgba(255, 255, 255, 0.12); color: #ffffff; }
        .scp-body { display: flex; flex: 1; overflow: hidden; }
        .scp-form { width: 350px; padding: 18px 20px; overflow-y: auto; border-right: 1px solid #eff3f4; background: #f7f9f9; display: flex; flex-direction: column; box-sizing: border-box; }
        .scp-form > * { flex-shrink: 0; }
        .scp-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; flex-shrink: 0; }
        .scp-row-2 > div { min-width: 0; }
        .scp-form::-webkit-scrollbar { width: 6px; }
        .scp-form::-webkit-scrollbar-thumb { background: #cfd9de; border-radius: 3px; }
        .scp-control-group { background: #ffffff; border: 1px solid #e1e8ed; border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03); }
        .scp-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .scp-label-row label { margin: 0 !important; font-size: 12.5px; font-weight: 700; color: #0f1419; }
        .scp-link-action { background: none; border: none; padding: 0; font-size: 11.5px; font-weight: 600; color: #1d9bf0; cursor: pointer; transition: color .15s ease; }
        .scp-link-action:hover { color: #0c7abf; text-decoration: underline; }
        .scp-filename-wrap { position: relative; display: flex; align-items: center; margin-top: 6px; }
        .scp-ext-badge { position: absolute; right: 10px; font-size: 12px; font-weight: 600; color: #8b98a5; user-select: none; pointer-events: none; }
        .scp-badge { background: #0f1419; color: #ffffff; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 999px; font-variant-numeric: tabular-nums; }
        #scp-width-slider { width: 100%; height: 5px; border-radius: 3px; background: #e1e8ed; outline: none; -webkit-appearance: none; cursor: pointer; margin: 10px 0; }
        #scp-width-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #1d9bf0; cursor: pointer; border: 2px solid #ffffff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25); transition: transform .1s ease; }
        #scp-width-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
        .scp-width-presets { display: flex; gap: 6px; }
        .scp-chip-btn { flex: 1; padding: 4px 0; border: 1px solid #cfd9de; border-radius: 6px; background: #ffffff; font-size: 11px; font-weight: 600; color: #536471; cursor: pointer; transition: all .15s ease; text-align: center; }
        .scp-chip-btn:hover { background: #eff3f4; color: #0f1419; border-color: #bcc6cc; }
        .scp-chip-btn.active { background: #0f1419; color: #ffffff; border-color: #0f1419; }
        .scp-form label { display: block; font-size: 12px; font-weight: 600; color: #536471; margin: 8px 0 3px; }
        .scp-form input[type="text"], .scp-form textarea { width: 100%; padding: 7px 11px; border: 1px solid #cfd9de; border-radius: 8px; font-size: 13px; box-sizing: border-box; background: #ffffff; color: #0f1419; transition: border-color .15s ease, box-shadow .15s ease; font-family: inherit; }
        .scp-form input[type="text"]:focus, .scp-form textarea:focus { outline: none; border-color: #1d9bf0; box-shadow: 0 0 0 3px rgba(29, 155, 240, 0.15); }
        .scp-form textarea { resize: vertical; line-height: 1.45; min-height: 110px; height: 110px; flex-shrink: 0; }
        .scp-stats { display: flex; gap: 6px; margin: 12px 0 6px; }
        .scp-stat-chip { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 5px 6px; font-size: 11.5px; font-weight: 600; color: #536471; background: #ffffff; border: 1px solid #e1e8ed; border-radius: 8px; }
        .scp-stat-chip .sc-icon { color: #8b98a5; }
        .scp-actions { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .scp-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; border: 1px solid transparent; border-radius: 999px; cursor: pointer; font-size: 13px; font-weight: 700; transition: all .15s ease; user-select: none; }
        .scp-actions button:disabled { opacity: 0.65; cursor: not-allowed; }
        .scp-actions button.primary { grid-column: span 2; background: #0f1419; color: #ffffff; }
        .scp-actions button.primary:hover:not(:disabled) { background: #272c30; }
        .scp-actions button.secondary { background: #ffffff; color: #0f1419; border-color: #cfd9de; }
        .scp-actions button.secondary:hover:not(:disabled) { background: #eff3f4; }
        .scp-preview-wrap { flex: 1; padding: 32px; overflow: auto; display: flex; justify-content: center; align-items: flex-start; background: #f0f3f4; }
        #scp-card-wrapper { transition: width .15s ease; border-radius: 16px; overflow: hidden; background: #ffffff; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); flex-shrink: 0; }
        .share-card { width: 100%; background: #ffffff; padding: 16px 20px; font-size: 15px; line-height: 1.5; color: #0f1419; box-sizing: border-box; }
        .sc-header { display: flex; align-items: center; margin-bottom: 12px; gap: 10px; min-width: 0; }
        .sc-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; background: #cfd9de; flex-shrink: 0; }
        .sc-user { flex: 1; min-width: 0; overflow: hidden; }
        .sc-name { font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sc-name span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sc-verified { width: 17px; height: 17px; display: inline-block; flex-shrink: 0; vertical-align: middle; }
        .sc-handle { font-size: 13.5px; color: #536471; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sc-follow { background: #0f1419; color: #ffffff; border: none; border-radius: 999px; padding: 6px 15px; font-size: 13px; font-weight: 700; flex-shrink: 0; white-space: nowrap; }
        .sc-content { white-space: pre-wrap; word-break: break-word; margin-bottom: 12px; font-size: 15px; line-height: 1.45; color: #0f1419; }
        .sc-link { color: #1d9bf0; text-decoration: none; cursor: default; }
        .sc-article { border: 1px solid #eff3f4; border-radius: 16px; background: #f7f9f9; margin-bottom: 12px; }
        .sc-art-cover { width: 100%; height: auto; display: block; }
        .sc-art-body { padding: 16px 18px 18px; font-size: 15px; line-height: 1.75; color: #0f1419; }
        .sc-art-title { font-size: 18px; font-weight: 750; letter-spacing: -.02em; line-height: 1.35; color: #0f1419; margin: 0 0 14px; }
        .sc-art-h { font-size: 16px; font-weight: 700; line-height: 1.4; margin: 18px 0 8px; }
        .sc-art-h2 { font-size: 15px; font-weight: 700; line-height: 1.45; margin: 16px 0 7px; }
        .sc-art-p { margin: 0 0 12px; white-space: pre-wrap; word-break: break-word; }
        .sc-art-p:last-child { margin-bottom: 0; }
        .sc-art-figure { margin: 4px 0 12px; }
        .sc-art-img { width: 100%; border-radius: 10px; display: block; margin: 0; }
        .sc-art-cap { font-size: 12px; color: #536471; padding: 6px 2px 0; line-height: 1.4; }
        .sc-art-hr { border: 0; border-top: 1px solid #e1e8ed; margin: 14px 0; }
        .sc-art-video { margin: 4px 0 12px; border-radius: 10px; }
        #sc-article-fab {
            position: fixed; right: 18px; bottom: 22px; z-index: 999990;
            display: inline-flex; align-items: center; gap: 8px;
            background: #0f1419; color: #fff; border: 0; border-radius: 999px;
            padding: 10px 16px; font-size: 13px; font-weight: 700; cursor: pointer;
            box-shadow: 0 10px 28px rgba(15,20,25,.28);
            font-family: inherit;
        }
        #sc-article-fab .sc-icon { width: 16px; height: 16px; color: #1d9bf0; }
        #sc-article-fab:hover { background: #272c30; }
        .sc-art-ul, .sc-art-ol { margin: 0 0 10px; padding-left: 22px; }
        .sc-art-li { margin-bottom: 4px; }
        .sc-art-blockquote { margin: 0 0 10px; padding: 2px 0 2px 12px; border-left: 3px solid #cfd9de; color: #3b4a54; }
        .sc-art-prewrap { margin: 4px 0 14px; border: 1px solid #cfd6dd; border-radius: 10px; overflow: hidden; background: #f4f6f8; box-shadow: 0 1px 2px rgba(15,20,25,.04); }
        .sc-art-prehead { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 12px; background: #dce3e8; color: #536471; font-size: 12px; line-height: 1; border-bottom: 1px solid #cfd6dd; }
        .sc-art-prelang { font-weight: 500; letter-spacing: .01em; }
        .sc-art-precopy { width: 14px; height: 14px; color: #6b7c87; flex: 0 0 auto; opacity: .75; }
        .sc-art-precopy svg { display: block; width: 14px; height: 14px; }
        .sc-art-pre { margin: 0; padding: 11px 12px 12px; background: #f4f6f8; color: #0f1419; border: 0; font-size: 13px; line-height: 1.65; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

        .sc-art-embed { border: 1px solid #cfd9de; border-radius: 12px; padding: 10px 12px; margin: 0 0 10px; font-size: 13px; color: #536471; }
        .sc-art-spacer { height: 6px; }
        .sc-media { margin-bottom: 12px; border-radius: 14px; overflow: hidden; position: relative; background: transparent; }
        .sc-media.single img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
        .sc-media.video img { width: 100%; height: auto; display: block; }
        .sc-media.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
        .sc-media.grid img { width: 100%; height: auto; display: block; }
        .sc-media.video .play-btn { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 54px; height: 54px; background: rgba(15, 20, 25, 0.72); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 50%; color: #ffffff; display: flex; align-items: center; justify-content: center; pointer-events: none; backdrop-filter: blur(8px); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35); }
        .sc-play-icon { width: 22px; height: 22px; margin-left: 2px; }
        .sc-quote { border: 1px solid #cfd9de; border-radius: 12px; padding: 12px; margin-bottom: 12px; background: #ffffff; }
        .q-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .q-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #cfd9de; }
        .q-user { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; font-size: 13px; }
        .q-user strong { color: #0f1419; }
        .q-user span { color: #536471; }
        .q-content { font-size: 14px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
        .q-media { margin-top: 8px; border-radius: 8px; overflow: hidden; }
        .q-media img { width: 100%; max-height: 160px; object-fit: cover; display: block; }
        .sc-meta { font-size: 13px; color: #536471; margin-bottom: 12px; }
        .sc-footer { display: flex; justify-content: space-between; font-size: 13px; color: #536471; border-top: 1px solid #eff3f4; padding-top: 12px; }
        .sc-footer-link { display: inline-flex; align-items: center; gap: 3px; color: #536471; }
        .scp-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(50px); background: rgba(15, 20, 25, 0.92); backdrop-filter: blur(8px); color: #ffffff; padding: 9px 20px; border-radius: 999px; font-size: 13.5px; font-weight: 600; z-index: 1000010; opacity: 0; pointer-events: none; transition: all .25s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.25); }
        .scp-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
        .scp-toast-success { background: #00ba7c; color: #ffffff; }
        .scp-toast-error { background: #f4212e; color: #ffffff; }
        .scp-toast-info { background: #1d9bf0; color: #ffffff; }

        /* Video Parser Modal Styles */
        #tm-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); z-index: 9999999; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
        #tm-modal-overlay.active { opacity: 1; pointer-events: auto; }
        #tm-modal-content { background: #ffffff; width: 420px; max-width: 90vw; border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); position: relative; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; color: #0f1419; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        #tm-modal-body { overflow-y: auto; flex: 1 1 auto; min-height: 0; margin-right: -10px; padding-right: 10px; }
        #tm-modal-body::-webkit-scrollbar { width: 6px; }
        #tm-modal-body::-webkit-scrollbar-thumb { background: #cfd9de; border-radius: 3px; }
        .tm-close { position: absolute; top: 16px; right: 20px; font-size: 28px; cursor: pointer; color: #536471; line-height: 1; z-index: 10; }
        .tm-close:hover { color: #0f1419; }
        .tm-title { font-size: 20px; font-weight: 800; margin-bottom: 16px; margin-top: 0; text-align: center; flex: 0 0 auto; }
        .tm-loading { text-align: center; color: #536471; font-size: 15px; padding: 30px 0; }
        .tm-video-card { border: 1px solid #eff3f4; border-radius: 12px; padding: 14px; margin-bottom: 16px; background: #fafafa; }
        .tm-video-thumb { width: 100%; border-radius: 8px; margin-bottom: 14px; background: #eff3f4; object-fit: cover; }
        .tm-btn-group { display: flex; flex-direction: column; gap: 12px; }
        .tm-download-btn { background: #1d9bf0; color: white !important; text-decoration: none; padding: 12px; border-radius: 9999px; text-align: center; font-weight: bold; font-size: 15px; display: block; transition: 0.2s; box-sizing: border-box; }
        .tm-download-btn:hover:not(:disabled) { background: #1a8cd8; }
        .tm-link-btn { background: white; color: #0f1419 !important; border: 1px solid #cfd9de; text-decoration: none; padding: 12px; border-radius: 9999px; text-align: center; font-weight: bold; font-size: 15px; display: block; cursor: pointer; transition: 0.2s; box-sizing: border-box; }
        .tm-link-btn:hover { background: #e7e7e8; }
        .tm-footer { margin-top: 16px; text-align: center; font-size: 13px; color: #536471; border-top: 1px solid #eff3f4; padding-top: 15px; flex: 0 0 auto; }
        .tm-footer a { color: #1d9bf0; text-decoration: none; font-weight: 600; }
        .tm-footer a:hover { text-decoration: underline; }
    `);

    injectButtons();
    new MutationObserver(injectButtons).observe(document.body, { childList: true, subtree: true });
})();