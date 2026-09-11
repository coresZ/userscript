// ==UserScript==
// @name         TradingView A 股
// @namespace    cores
// @description  Adds Tonghuashun watchlist sync, Wencai groups and pinyin search to TradingView
// @version      1.5.10
// @author       cores
// @match        https://*.tradingview.com/chart/*
// @match        https://*.tradingview.com/watchlists/*
// @match        https://cn.tradingview.com/watchlists/*
// @match        https://www.tradingview.com/watchlists/*
// @match        https://cn.tradingview.com/screener/*
// @run-at       document-idle
// @icon         https://static.tradingview.com/static/images/favicon.ico
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      t.10jqka.com.cn
// @connect      www.iwencai.com
// @connect      data.10jqka.com.cn
// @connect      qt.gtimg.cn
// @connect      smartbox.gtimg.cn
// @connect      image.sinajs.cn
// @require      https://unpkg.com/preact@10.11.0/dist/preact.min.umd.js
// @require      https://unpkg.com/preact@10.11.0/hooks/dist/hooks.umd.js
// @require      https://unpkg.com/htm@3.1.1/dist/htm.umd.js
// @require      https://unpkg.com/lodash@4.17.21/lodash.min.js
// @require      https://unpkg.com/lscache@1.3.0/lscache.min.js
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/585716/TradingView%20A%20%E8%82%A1.user.js
// @updateURL https://update.greasyfork.org/scripts/585716/TradingView%20A%20%E8%82%A1.meta.js
// ==/UserScript==

// Watchlist / screener page: lightweight full-chart buttons (no preact/lodash dependency)
(function bootWatchlistFullChart() {
    'use strict';
    const path = String(location.pathname || '');
    const isListPage = /\/watchlists\//i.test(path) || /\/screener\//i.test(path);
    console.info('[tvhelper] script entry', {path, isListPage, href: location.href});
    if (!isListPage) return;

    const CSS = `
.tvhelper-fullchart-btn{display:inline-flex;align-items:center;flex-shrink:0;margin:0 8px;vertical-align:middle}
.tvhelper-fullchart-btn a{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 4px;border-radius:6px;border:1px solid rgba(120,123,134,.28);background:transparent;color:inherit;text-decoration:none;font-size:12px;font-weight:500;line-height:1;white-space:nowrap;opacity:.75;transition:opacity .12s ease,background-color .12s ease,border-color .12s ease}
.tvhelper-fullchart-btn a:hover{opacity:1;background:rgba(41,98,255,.08);border-color:rgba(41,98,255,.35);color:#2962ff}
.tvhelper-fullchart-btn svg{display:block;width:16px;height:16px;flex-shrink:0}
[class*="symbolWrap"],[class*="symbol-container"]{display:inline-flex;align-items:center;min-width:0}
`;
    const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none" aria-hidden="true"><path fill="currentColor" d="M7 18.5A2.5 2.5 0 0 0 9.5 21H12v1H9.5A3.5 3.5 0 0 1 6 18.5V16h1zm15 0a3.5 3.5 0 0 1-3.5 3.5H16v-1h2.5a2.5 2.5 0 0 0 2.5-2.5V16h1zM12 7H9.5A2.5 2.5 0 0 0 7 9.5V12H6V9.5A3.5 3.5 0 0 1 9.5 6H12zm6.5-1A3.5 3.5 0 0 1 22 9.5V12h-1V9.5A2.5 2.5 0 0 0 18.5 7H16V6z"></path></svg>';

    // From href like /symbols/SSE-000001/ or /symbols/SKHYNIUSDT.P_MPRICE/?exchange=BINANCE
    const parseSymbolHref = (href) => {
        if (!href) return null;
        try {
            const url = new URL(href, location.origin);
            const m = url.pathname.match(/\/symbols\/([^/]+)\/?/i);
            if (!m) return null;
            let token = decodeURIComponent(m[1]);
            // SSE-000001 / SZSE-161121 / BINANCE-xxx
            const dash = token.match(/^([A-Za-z0-9]+)-(.+)$/);
            if (dash) {
                const ex = dash[1].toUpperCase();
                const sym = dash[2];
                const qEx = url.searchParams.get('exchange');
                if (qEx) return qEx.toUpperCase() + ':' + sym;
                return ex + ':' + sym;
            }
            const qEx = url.searchParams.get('exchange');
            if (qEx) return qEx.toUpperCase() + ':' + token;
            return token.includes(':') ? token.toUpperCase() : null;
        } catch (e) {
            return null;
        }
    };

    const extractFromRow = (row) => {
        if (!row || row.nodeType !== 1) return null;
        const link = row.querySelector('a[href*="/symbols/"]');
        if (!link) return null;
        return parseSymbolHref(link.getAttribute('href') || '');
    };

    const buildBtn = (tvSymbol) => {
        const wrap = document.createElement('div');
        wrap.className = 'tvhelper-fullchart-btn desktopFullChartButton-tvhelper';
        wrap.setAttribute('data-tvhelper-fullchart', '1');
        const href = '/chart/?symbol=' + encodeURIComponent(tvSymbol);
        wrap.innerHTML = '<a href="' + href + '" aria-label="完整图表" data-event="Full chart" title="完整图表" target="_blank" rel="noopener">' +
            '<span class="tvhelper-fullchart-icon" aria-hidden="true">' + ICON + '</span></a>';
        return wrap;
    };

    const injectRow = (row) => {
        if (!row || row.nodeType !== 1) return;
        if (row.querySelector('[data-tvhelper-fullchart="1"]')) return;
        const symbol = extractFromRow(row);
        if (!symbol) return;
        // Prefer symbolWrap next to ticker/description (matches real DOM)
        const mount =
            row.querySelector('[class*="symbolWrap"]') ||
            row.querySelector('[class*="symbol-container"]') ||
            row.querySelector('[data-qa-id="column-symbol"] [class*="wrap"]') ||
            row.querySelector('[data-qa-id="column-symbol"]') ||
            row.querySelector('a[href*="/symbols/"]')?.parentElement;
        if (!mount || mount.querySelector('[data-tvhelper-fullchart="1"]')) return;
        // 放到股票图片（logo）后面；无图片则放容器最后
        const btn = buildBtn(symbol);
        const img = mount.querySelector('img');
        if (img) img.insertAdjacentElement('afterend', btn);
        else mount.appendChild(btn);
    };

    const collectRows = () => {
        // TV watchlist rows: div.listItem-* ; TV screener rows: .tv-data-table__row / .tv-screener-table__result-row
        let rows = Array.from(document.querySelectorAll('[class*="listItem"], [class*="tv-data-table__row"], [class*="tv-screener-table__result-row"]'));
        if (!rows.length) {
            // fallback: any container that has exactly one symbols link
            const links = Array.from(document.querySelectorAll('a[href*="/symbols/"]'));
            rows = links.map(a => a.closest('[class*="listItem"],[class*="row"],[role="row"]') || a.parentElement).filter(Boolean);
        }
        const set = new Set();
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row === document.body) continue;
            if (extractFromRow(row)) set.add(row);
        }
        return Array.from(set);
    };

    const scan = () => {
        try {
            const rows = collectRows();
            for (let i = 0; i < rows.length; i++) injectRow(rows[i]);
            if (rows.length) {
                // one-shot debug after first successful scan
                if (!window.__tvhelperWatchlistLogged) {
                    window.__tvhelperWatchlistLogged = true;
                    console.info('[tvhelper] list rows injected', rows.length);
                }
            }
        } catch (err) {
            console.warn('[tvhelper] watchlist scan failed', err);
        }
    };

    const start = () => {
        try {
            if (typeof GM_addStyle === 'function') GM_addStyle(CSS);
            else {
                const style = document.createElement('style');
                style.textContent = CSS;
                (document.head || document.documentElement).appendChild(style);
            }
            scan();
            let scheduled = false;
            const schedule = () => {
                if (scheduled) return;
                scheduled = true;
                requestAnimationFrame(() => {
                    scheduled = false;
                    scan();
                });
            };
            const root = document.body || document.documentElement;
            const observer = new MutationObserver(schedule);
            observer.observe(root, {childList: true, subtree: true});
            setInterval(scan, 2500);
            console.info('[tvhelper] full-chart buttons enabled');
        } catch (err) {
            console.error('[tvhelper] watchlist boot failed', err);
        }
    };

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, {once: true});
})();

// Chart page only below this line
if (/\/watchlists\/|\/screener\//i.test(String(location.pathname || ''))) {
    // stop chart panel boot on watchlist / screener pages
} else {

// config
// * Show Wencai smart groups
const SHOW_WENCAI_PLATE = true;
const MARKET_REFRESH_INTERVAL = 3000;
const MARKET_ACTIVE_TTL = 2500;
const MARKET_BACKGROUND_TTL = 20000;
const MARKET_PRIORITY_BATCH_SIZE = 80;
const MARKET_BACKGROUND_BATCH_SIZE = 20;
const PERF_LOG_ENABLED = false;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_ALERT_CONFIG = {enabled: false, threshold: 5, sound: true};
const LIMIT_UP_FILTER = 'HS,GEM2STAR';
const LIMIT_UP_OPEN_FIELDS = '199112,9002,48,1968584,19,3475914,9003,9001,10,9004';
const LIMIT_UP_PAGE_SIZE = 40;
const LIMIT_UP_REFERER = 'https://data.10jqka.com.cn/mobile/limitup/v2/index.html';

const tvhelperCss = `
#tvhelper {
  /* palette aligned with limit_up.html */
  --tvh-surface: #ffffff;
  --tvh-bg: #e8edf5;
  --tvh-hover: #f1f5f9;
  --tvh-active: #e3effd;
  --tvh-border: #e2e8f0;
  --tvh-line: #f1f5f9;
  --tvh-text: #0f172a;
  --tvh-muted: #64748b;
  --tvh-blue: #2563eb;
  --tvh-up: #16a34a;
  --tvh-down: #dc2626;
  --tvh-green: #16a34a;
  --tvh-red: #dc2626;
  --tvh-gold: #f59e0b;
  --tvh-accent: #7c3aed;
  --tvh-row: 34px;
  --tvh-plate: 38px;
  --tvh-header: 44px;
  --tvh-radius: 8px;
  --tvh-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --tvh-mono: ui-monospace, 'SF Mono', Consolas, monospace;
  box-sizing: border-box;
  color: var(--tvh-text);
  font-family: var(--tvh-font);
  font-size: 13px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}
#tvhelper *, #tvhelper *::before, #tvhelper *::after { box-sizing: border-box; }
#tvhelper.tvhelper-hidden { display: none !important; }

#tvhelper {
  position: fixed;
  top: 3.5rem;
  right: 3.35rem;
  z-index: 50;
  width: min(21rem, calc(100vw - 4rem));
  height: min(40rem, calc(100vh - 4.5rem));
  min-height: 16rem;
  margin: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transform: translateX(calc(100% + 5rem));
  transition: transform .2s ease, opacity .16s ease;
}
#tvhelper.is-open {
  opacity: 1;
  pointer-events: auto;
  transform: none;
}

.tvhelper-overlay-ready {
  position: relative !important;
  overflow: hidden !important;
  background: var(--tv-color-pane-background, #fff) !important;
}
.tvhelper-overlay-ready #tvhelper,
.tvhelper-overlay-ready #tvhelper.is-open {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  max-height: none !important;
  margin: 0 !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  transform: none !important;
  transition: none !important;
  z-index: 12 !important;
}
.tvhelper-right-ready {
  min-width: 320px !important;
  width: 340px !important;
  padding: 0 !important;
  overflow: hidden !important;
}

/* shell */
#tvhelper > .card {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: var(--tvh-surface);
  border: 1px solid var(--tvh-border);
  border-radius: 0;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
  color: var(--tvh-text);
}
.tvhelper-overlay-ready #tvhelper > .card {
  border: 0;
  box-shadow: none;
}

/* header */
#tvhelper .card-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: var(--tvh-header);
  min-height: var(--tvh-header);
  padding: 0 8px 0 12px;
  background: linear-gradient(180deg, #fff, #fafbfc);
  border-bottom: 1px solid var(--tvh-line);
}
#tvhelper .card-header-title {
  display: flex;
  flex: 1;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 0;
}
#tvhelper .tvhelper-title-main {
  color: var(--tvh-text);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -.02em;
}
#tvhelper .tvhelper-title-sub {
  color: var(--tvh-muted);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
#tvhelper .tvhelper-fetch-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--tvh-blue);
  font-size: 11px;
  font-weight: 600;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
#tvhelper .tvhelper-fetch-status.is-error {
  color: var(--tvh-red);
  background: #fef2f2;
  border-color: #fecaca;
}
#tvhelper .tvhelper-fetch-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  animation: tvhelperPulse 1s ease-in-out infinite;
}
#tvhelper .tvhelper-fetch-status.is-error .tvhelper-fetch-dot {
  animation: none;
}
@keyframes tvhelperPulse {
  0%, 100% { opacity: .35; transform: scale(.85); }
  50% { opacity: 1; transform: scale(1); }
}
.tvhelper-overlay-ready #tvhelper.tvhelper-native-panel .tvhelper-title-sub,
.tvhelper-overlay-ready #tvhelper.tvhelper-native-panel .tvhelper-close {
  display: none !important;
}
#tvhelper .card-header-icon {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* icon buttons */
#tvhelper .header-icon-btn,
#tvhelper .plate-action-button,
#tvhelper .plate-sort-button,
#tvhelper .tvhelper-close,
#tvhelper .b-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--tvh-muted);
  cursor: pointer;
  fill: currentColor;
  stroke: currentColor;
  transition: background-color .12s ease, color .12s ease, border-color .12s ease;
}
#tvhelper .header-icon-btn svg,
#tvhelper .plate-action-button svg,
#tvhelper .plate-sort-button svg,
#tvhelper .b-icon svg {
  display: block;
  width: 16px;
  height: 16px;
}
#tvhelper .header-icon-btn:hover,
#tvhelper .plate-action-button:hover,
#tvhelper .plate-sort-button:hover,
#tvhelper .tvhelper-close:hover,
#tvhelper .b-icon:hover {
  background: #eff6ff;
  color: var(--tvh-blue);
  border-color: #93c5fd;
}
#tvhelper .header-icon-btn.is-active,
#tvhelper .plate-action-button.is-active {
  background: #eff6ff;
  color: var(--tvh-blue);
}
#tvhelper .tvhelper-close {
  font-size: 18px;
  font-weight: 300;
  line-height: 1;
  color: var(--tvh-muted);
}

/* tabs — pill switch like limit_up */
#tvhelper .tvhelper-tabs {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 0;
  height: auto;
  margin: 8px 10px 0;
  padding: 3px;
  background: #f1f5f9;
  border-bottom: 0;
  border-radius: 999px;
}
#tvhelper .tvhelper-tab {
  position: relative;
  flex: 1 1 0;
  height: 30px;
  min-width: 0;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--tvh-muted);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all .12s ease;
}
#tvhelper .tvhelper-tab:hover { color: var(--tvh-text); }
#tvhelper .tvhelper-tab.is-active {
  color: var(--tvh-text);
  font-weight: 700;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
  border: 0;
}
#tvhelper .tvhelper-tab.is-active::after { display: none; }

/* filter chips like limit_up */
#tvhelper .tvhelper-toolbar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  padding: 7px 10px;
  border: 0;
  border-bottom: 1px solid var(--tvh-line);
  border-radius: 0;
  background: #f8fafc;
}
#tvhelper .tvhelper-chip {
  flex: 0 0 auto;
  min-width: 0;
  height: auto;
  padding: 2px 9px;
  border: 1px solid var(--tvh-border);
  border-radius: 999px;
  background: #fff;
  color: var(--tvh-muted);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  text-align: center;
  transition: all .12s ease;
}
#tvhelper .tvhelper-chip:hover {
  border-color: #93c5fd;
  color: var(--tvh-blue);
}
#tvhelper .tvhelper-chip.is-active {
  background: #eff6ff;
  border-color: #93c5fd;
  box-shadow: none;
  color: var(--tvh-blue);
  font-weight: 600;
}
#tvhelper .tvhelper-chip.is-active[data-filter="up"] {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: var(--tvh-up);
}
#tvhelper .tvhelper-chip.is-active[data-filter="down"] {
  background: #fef2f2;
  border-color: #fecaca;
  color: var(--tvh-down);
}

/* content */
#tvhelper > .card .card-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 4px 0 10px;
  background: var(--tvh-surface);
  scrollbar-gutter: stable;
}
#tvhelper > .card .card-content.limit-board {
  padding: 0;
  overflow-x: auto;
  overflow-y: auto;
}
#tvhelper > .card .card-content::-webkit-scrollbar { width: 6px; }
#tvhelper > .card .card-content::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--tvh-muted) 28%, transparent);
  border-radius: 3px;
}
#tvhelper > .card .card-content::-webkit-scrollbar-track { background: transparent; }
#tvhelper .menu {
  color: var(--tvh-text);
  font-feature-settings: "tnum" 1;
}
#tvhelper .notification {
  margin: 12px;
  padding: 10px 12px;
  border: 1px solid #fde68a;
  border-radius: 8px;
  background: #fffbeb;
  color: #92400e;
  font-size: 12px;
}
#tvhelper .notification a {
  color: var(--tvh-blue);
  text-decoration: none;
  font-weight: 600;
}

/* plates */
#tvhelper .tvhelper-plate {
  position: relative;
  z-index: 0;
  margin: 0;
  padding: 0;
  border-bottom: 1px solid var(--tvh-line);
  overflow: visible;
  content-visibility: auto;
}
#tvhelper .tvhelper-plate:last-child {
  margin-bottom: 0;
  border-bottom: 0;
}
#tvhelper .tvhelper-plate summary { list-style: none; }
#tvhelper .tvhelper-plate summary::-webkit-details-marker { display: none; }
#tvhelper .menu-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: var(--tvh-plate);
  margin: 0;
  padding: 0 10px 0 12px;
  border-radius: 0;
  background: linear-gradient(180deg, #fff, #fafbfc);
  color: var(--tvh-text);
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: none;
  line-height: 1.2;
  border-bottom: 1px solid transparent;
}
#tvhelper .menu-label:hover,
#tvhelper .tvhelper-plate[open] > .menu-label:hover {
  background: var(--tvh-hover);
  color: var(--tvh-text);
}
#tvhelper .tvhelper-plate[open] > .menu-label {
  position: sticky;
  top: 0;
  z-index: 4;
  background: linear-gradient(180deg, #fff, #fafbfc);
  box-shadow: 0 1px 0 var(--tvh-line);
  color: var(--tvh-text);
}
#tvhelper .plate-name,
#tvhelper .symbol-name {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
#tvhelper .plate-name {
  gap: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--tvh-text);
}
#tvhelper .plate-count {
  margin-left: 6px;
  color: var(--tvh-muted);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
#tvhelper .symbol-name { gap: 8px; }
#tvhelper .plate-name::before {
  content: '';
  display: inline-block;
  flex-shrink: 0;
  width: 0;
  height: 0;
  margin-right: 8px;
  border-style: solid;
  border-width: 4px 0 4px 6px;
  border-color: transparent transparent transparent var(--tvh-muted);
  transform: rotate(0deg);
  transition: transform .12s ease;
}
#tvhelper .tvhelper-plate[open] .plate-name::before {
  transform: rotate(90deg);
  border-left-color: var(--tvh-text);
}
#tvhelper .plate-actions {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  opacity: 0;
  transition: opacity .12s ease;
}
#tvhelper .menu-label:hover .plate-actions,
#tvhelper .tvhelper-plate.has-open-favorite-picker .plate-actions {
  opacity: 1;
}

/* stock rows — clean list */
#tvhelper .menu-list {
  list-style: none;
  margin: 0;
  padding: 2px 0 6px;
}
#tvhelper .menu-list li { height: var(--tvh-row); }
#tvhelper .menu-list a {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: var(--tvh-row);
  margin: 0;
  padding: 0 12px 0 24px;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  color: var(--tvh-text);
  cursor: pointer;
  font-size: 12.5px;
  line-height: 1;
  transition: background-color .12s ease;
}
#tvhelper .menu-list a::before { display: none; }
#tvhelper .menu-list a:hover {
  background: var(--tvh-hover);
  box-shadow: none;
  border: 0;
}
/* original selection style: soft active + left bar */
#tvhelper .menu-list a.is-active {
  background: var(--tvh-active);
  box-shadow: none;
  border: 0;
}
#tvhelper .menu-list a.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  bottom: 7px;
  width: 2px;
  border-radius: 0 1px 1px 0;
  background: var(--tvh-blue);
}
#tvhelper .symbol-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 500;
}
#tvhelper .symbol-code {
  flex-shrink: 0;
  color: var(--tvh-muted);
  font-family: var(--tvh-mono);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0;
  opacity: 1;
}
#tvhelper .stock-actions {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
}
#tvhelper .tvhelper-empty-filter {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px !important;
  margin: 0;
  color: var(--tvh-muted);
  font-size: 12px;
}

/* change % tags — green up / red down */
#tvhelper .tag {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  width: 54px;
  min-width: 54px;
  height: 22px;
  border-radius: 4px;
  background: transparent;
  box-shadow: none;
  color: var(--tvh-muted);
  font-family: var(--tvh-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: 0;
  white-space: nowrap;
}
#tvhelper .tag.is-success {
  background: #f0fdf4;
  color: var(--tvh-up);
}
#tvhelper .tag.is-danger {
  background: #fef2f2;
  color: var(--tvh-down);
}

/* favorites */
#tvhelper .favorite-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--tvh-radius);
  color: var(--tvh-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: opacity .1s ease, color .1s ease, background-color .1s ease;
}
#tvhelper .menu-list a:hover .favorite-toggle,
#tvhelper .favorite-toggle.is-active,
#tvhelper .menu-list li.has-favorite-picker .favorite-toggle {
  opacity: 1;
}
#tvhelper .favorite-toggle:hover { background: color-mix(in srgb, var(--tvh-text) 6%, transparent); }
#tvhelper .favorite-toggle.is-active {
  background: transparent;
  box-shadow: none;
  color: var(--tvh-gold);
}
#tvhelper .menu-list li.has-favorite-picker {
  position: relative;
  z-index: 40;
  height: var(--tvh-row);
  overflow: visible;
}
#tvhelper .tvhelper-plate.has-open-favorite-picker {
  z-index: 100;
  overflow: visible;
  content-visibility: visible;
  contain: none;
  isolation: isolate;
}
#tvhelper .favorite-picker,
#tvhelper .overflow-menu {
  position: absolute;
  top: calc(100% + 2px);
  right: 0;
  z-index: 60;
  min-width: 140px;
  max-height: 200px;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  background: var(--tvh-surface);
  border: 1px solid var(--tvh-border);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, .14);
}
#tvhelper .favorite-picker {
  top: calc(var(--tvh-row) - 2px);
  right: 8px;
  width: min(200px, calc(100% - 16px));
  z-index: 50;
}
#tvhelper .favorite-picker-item,
#tvhelper .overflow-menu-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--tvh-text);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
}
#tvhelper .favorite-picker-item { justify-content: space-between; }
#tvhelper .favorite-picker-item:hover,
#tvhelper .favorite-picker-item:focus,
#tvhelper .overflow-menu-item:hover {
  background: var(--tvh-hover);
  outline: none;
}
#tvhelper .favorite-picker-item.is-active {
  background: #eff6ff;
  color: var(--tvh-blue);
}
#tvhelper .overflow-menu-item.is-danger { color: var(--tvh-up); }
#tvhelper .overflow-menu-item svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  fill: currentColor;
  stroke: currentColor;
  opacity: .75;
}
#tvhelper .favorite-picker-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#tvhelper .favorite-picker-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  color: var(--tvh-muted);
  font-size: 13px;
  font-weight: 600;
}
#tvhelper .favorite-picker-item.is-active .favorite-picker-mark {
  background: transparent;
  color: var(--tvh-blue);
}
#tvhelper .overflow-wrap {
  position: relative;
  display: inline-flex;
}

/* dialogs */
#tvhelper .import-dialog-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(19, 23, 34, .32);
  backdrop-filter: blur(2px);
}
#tvhelper .import-dialog {
  display: flex;
  flex-direction: column;
  width: min(360px, 100%);
  max-height: min(480px, calc(100% - 24px));
  overflow: hidden;
  background: var(--tvh-surface);
  border: 1px solid var(--tvh-border);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, .14);
  color: var(--tvh-text);
}
#tvhelper .import-dialog-header,
#tvhelper .import-dialog-footer {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  padding: 12px 14px;
  background: linear-gradient(180deg, #fff, #fafbfc);
}
#tvhelper .import-dialog-header { border-bottom: 1px solid var(--tvh-line); }
#tvhelper .import-dialog-footer {
  justify-content: flex-end;
  border-top: 1px solid var(--tvh-line);
}
#tvhelper .import-dialog-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--tvh-text);
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#tvhelper .import-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 14px;
  overflow-y: auto;
}
#tvhelper .import-dialog textarea,
#tvhelper .import-dialog input,
#tvhelper .alert-row input[type="number"] {
  width: 100%;
  border: 1px solid var(--tvh-border);
  border-radius: 6px;
  background: var(--tvh-surface);
  color: var(--tvh-text);
  font-size: 13px;
  outline: none;
  transition: border-color .12s ease, box-shadow .12s ease;
}
#tvhelper .import-dialog textarea {
  min-height: 120px;
  padding: 10px;
  font-family: var(--tvh-mono);
  line-height: 1.45;
  resize: vertical;
}
#tvhelper .import-dialog input {
  height: 34px;
  padding: 0 10px;
  line-height: 34px;
}
#tvhelper .import-dialog textarea:focus,
#tvhelper .import-dialog input:focus,
#tvhelper .alert-row input[type="number"]:focus {
  border-color: var(--tvh-blue);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tvh-blue) 16%, transparent);
}
#tvhelper .import-dialog-close,
#tvhelper .import-dialog-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--tvh-muted);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
#tvhelper .import-dialog-close {
  width: 28px;
  padding: 0;
  border: 0;
  font-size: 18px;
  font-weight: 300;
}
#tvhelper .import-dialog-button {
  border-color: var(--tvh-border);
  background: #fff;
}
#tvhelper .import-dialog-button:hover,
#tvhelper .import-dialog-close:hover {
  background: #eff6ff;
  border-color: #93c5fd;
  color: var(--tvh-blue);
}
#tvhelper .import-dialog-button.is-primary {
  background: var(--tvh-blue);
  border-color: var(--tvh-blue);
  box-shadow: none;
  color: #fff;
}
#tvhelper .import-dialog-button.is-primary:hover {
  filter: brightness(.96);
  color: #fff;
}
#tvhelper .import-dialog-button:disabled {
  cursor: default;
  opacity: .4;
}
#tvhelper .import-dialog-hint,
#tvhelper .import-dialog-empty,
#tvhelper .import-dialog-message {
  color: var(--tvh-muted);
  font-size: 12px;
  line-height: 1.4;
}
#tvhelper .import-dialog-error {
  color: var(--tvh-red);
  font-size: 12px;
}
#tvhelper .import-match-list {
  max-height: 168px;
  overflow-y: auto;
  border: 1px solid var(--tvh-border);
  border-radius: 6px;
}
#tvhelper .import-match-row {
  display: grid;
  grid-template-columns: 76px 1fr;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
}
#tvhelper .import-match-row + .import-match-row {
  border-top: 1px solid var(--tvh-border);
}
#tvhelper .import-match-code {
  color: var(--tvh-muted);
  font-family: var(--tvh-mono);
}
#tvhelper .import-match-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* limit-up board */
#tvhelper .limit-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border-bottom: 1px solid var(--tvh-line);
  background: linear-gradient(180deg, #fff, #fafbfc);
}
#tvhelper .limit-tab-switch {
  display: inline-flex;
  gap: 0;
  padding: 3px;
  border-radius: 999px;
  background: #f1f5f9;
}
#tvhelper .limit-tab-btn {
  border: 0;
  background: transparent;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tvh-muted);
  cursor: pointer;
  transition: all .12s ease;
  line-height: 1.2;
}
#tvhelper .limit-tab-btn:hover:not(.is-active) { color: var(--tvh-text); }
#tvhelper .limit-tab-btn.is-active {
  background: #fff;
  color: var(--tvh-text);
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
}
#tvhelper .limit-meta {
  margin-left: auto;
  font-weight: 500;
  font-size: 11px;
  color: var(--tvh-muted);
  white-space: nowrap;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
#tvhelper .limit-back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--tvh-border);
  background: #fff;
  color: var(--tvh-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}
#tvhelper .limit-back:hover {
  color: var(--tvh-blue);
  border-color: #93c5fd;
  background: #eff6ff;
}
#tvhelper .limit-msg {
  margin: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--tvh-muted);
  text-align: center;
}
#tvhelper .limit-msg.is-loading {
  padding: 36px 12px;
  margin: 0;
  background: transparent;
}
#tvhelper .limit-msg.is-error {
  background: #fef2f2;
  color: var(--tvh-up);
  text-align: left;
}
#tvhelper .limit-msg.is-warn {
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #fde68a;
}
#tvhelper .limit-table-wrap {
  width: 100%;
  overflow: visible;
}
#tvhelper .limit-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  line-height: 1.2;
}
#tvhelper .limit-table thead th {
  text-align: left;
  padding: 8px 10px;
  background: #ffffff;
  background-clip: padding-box;
  border-bottom: 1px solid var(--tvh-border);
  box-shadow: none;
  color: #475569;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 5;
  user-select: none;
}
#tvhelper .limit-table thead th.sortable {
  cursor: pointer;
}
#tvhelper .limit-table thead th.sortable:hover {
  color: var(--tvh-blue);
  background: #f8fafc;
  box-shadow: none;
}
#tvhelper .limit-table thead th.sortable .arrow {
  margin-left: 3px;
  font-size: 10px;
  opacity: .45;
  color: inherit;
}
#tvhelper .limit-table thead th.sortable .arrow::after { content: '\u2195'; }
#tvhelper .limit-table thead th.sortable.asc .arrow,
#tvhelper .limit-table thead th.sortable.desc .arrow {
  opacity: 1;
  color: var(--tvh-blue);
}
#tvhelper .limit-table thead th.sortable.asc .arrow::after { content: '\u25B2'; }
#tvhelper .limit-table thead th.sortable.desc .arrow::after { content: '\u25BC'; }
#tvhelper .limit-table th.num,
#tvhelper .limit-table td.num {
  text-align: right;
  font-family: var(--tvh-mono);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
#tvhelper .limit-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--tvh-line);
  vertical-align: middle;
  color: var(--tvh-text);
  font-size: 13px;
}
#tvhelper .limit-table tbody tr {
  cursor: pointer;
  transition: background .12s ease;
}
#tvhelper .limit-table tbody tr:hover td { background: var(--tvh-hover); }
/* original selection: soft active + left bar */
#tvhelper .limit-table tbody tr.is-active td {
  background: var(--tvh-active);
}
#tvhelper .limit-table tbody tr.is-active td:first-child {
  box-shadow: inset 2px 0 0 var(--tvh-blue);
}
#tvhelper .limit-table tbody tr.is-active:hover td {
  background: var(--tvh-active);
}
#tvhelper .limit-name {
  font-size: 13px;
  font-weight: 500;
  color: inherit;
}
#tvhelper .limit-code {
  font-family: var(--tvh-mono);
  color: var(--tvh-muted);
  font-size: 11px;
  font-weight: 400;
}
#tvhelper .limit-link {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px dashed transparent;
  cursor: pointer;
  font-weight: 500;
}
#tvhelper .limit-link:hover {
  color: var(--tvh-blue);
  border-bottom-color: var(--tvh-blue);
}
#tvhelper .limit-code.limit-link { font-weight: 400; }
#tvhelper .limit-code.limit-link:hover { color: var(--tvh-blue); }
#tvhelper .limit-up,
#tvhelper .limit-table td.limit-up,
#tvhelper .limit-table .limit-up {
  color: var(--tvh-up) !important;
  font-weight: 600;
}
#tvhelper .limit-down,
#tvhelper .limit-table td.limit-down,
#tvhelper .limit-table .limit-down {
  color: var(--tvh-down) !important;
  font-weight: 600;
}
#tvhelper .limit-sentinel {
  padding: 12px;
  text-align: center;
  color: var(--tvh-muted);
  font-size: 12px;
}
#tvhelper .limit-tag {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  color: var(--tvh-muted);
  margin: 1px 3px 1px 0;
  white-space: nowrap;
}
#tvhelper .limit-tag.is-first { background: #f0fdf4; color: var(--tvh-up); }
#tvhelper .limit-tag.is-back { background: #fef2f2; color: var(--tvh-down); }
#tvhelper .limit-reason {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tvh-muted);
  font-size: 11px;
}
#tvhelper .limit-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  max-width: 120px;
}
#tvhelper .limit-page {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px;
}
#tvhelper .limit-more {
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--tvh-border);
  background: #fff;
  color: var(--tvh-muted);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
#tvhelper .limit-more:hover {
  color: var(--tvh-blue);
  border-color: #93c5fd;
  background: #eff6ff;
}
#tvhelper .limit-more:disabled {
  opacity: .5;
  cursor: not-allowed;
}
#tvhelper .limit-page-info {
  font-size: 12px;
  color: var(--tvh-muted);
}

/* toast */
#tvhelper .tvhelper-toasts {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: min(260px, calc(100% - 20px));
  pointer-events: none;
}
#tvhelper .tvhelper-toast {
  padding: 10px 12px;
  border: 1px solid var(--tvh-border);
  border-radius: 10px;
  background: var(--tvh-surface);
  box-shadow: 0 8px 24px rgba(15, 23, 42, .12);
  color: var(--tvh-text);
  font-size: 12px;
  line-height: 1.35;
  pointer-events: auto;
}
#tvhelper .tvhelper-toast.is-up { border-left: 3px solid var(--tvh-up); }
#tvhelper .tvhelper-toast.is-down { border-left: 3px solid var(--tvh-down); }
#tvhelper .tvhelper-toast-title { font-weight: 600; }
#tvhelper .tvhelper-toast-sub { color: var(--tvh-muted); margin-top: 2px; }
#tvhelper .alert-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
  font-size: 13px;
}
#tvhelper .alert-row input[type="number"] {
  width: 76px;
  height: 30px;
  padding: 0 8px;
}
#tvhelper .alert-row label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

#tvhelper-fab.tvhelper-native-button {
  position: relative !important;
  inset: auto !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 44px !important;
  height: 44px !important;
  min-width: 44px !important;
  min-height: 44px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  color: inherit !important;
  writing-mode: horizontal-tb !important;
  z-index: auto !important;
}
#tvhelper-tooltip {
  position: fixed;
  right: min(27rem, calc(100vw - 34rem));
  bottom: .8rem;
  z-index: 52;
  display: none;
  width: min(33rem, calc(100vw - 25rem));
  height: 18rem;
  margin: 0;
  border: 1px solid var(--tv-color-platform-background, #e0e3eb);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 12px 32px rgba(19,23,34,.18);
  background: #fff;
}
#tvhelper-tooltip.is-active { display: block; }
#tvhelper-tooltip img { width: 100%; display: block; }
#tvhelper .disabled { opacity: .4; pointer-events: none; }
span.tv-data-mode--delayed--for-symbol-list {
  margin-left: -6px;
  transform: scale(.6) translate(10px, -10px);
}
`;

const RIGHT_TOOLBAR_SELECTOR = '.layout__area--right [data-name="right-toolbar"], [class*="layout__area--right"] [data-name="right-toolbar"]';
const RIGHT_WIDGET_PANEL_SELECTOR = [
    '.layout__area--right [data-name="widgetbar-pages-with-tabs"] .widgetbar-page.active',
    '[class*="layout__area--right"] [data-name="widgetbar-pages-with-tabs"] .widgetbar-page.active',
    '.layout__area--right .widgetbar-pagescontent .widgetbar-page.active',
    '[class*="layout__area--right"] .widgetbar-pagescontent .widgetbar-page.active'
].join(',');
const RIGHT_AREA_SELECTOR = '.layout__area--right, [class*="layout__area--right"]';
const TV_BASE_PANEL_LABEL = '\u81ea\u9009\u8868\u3001\u8be6\u60c5\u548c\u65b0\u95fb';
const TV_BASE_BUTTON_SELECTOR = RIGHT_TOOLBAR_SELECTOR + ' button[data-name="base"], .layout__area--right button[data-name="base"], [class*="layout__area--right"] button[data-name="base"]';
const TVHELPER_BUTTON_LABEL = '\u540c\u82b1\u987a';
const svgSprite = `<svg width="0" height="0" class="hidden"><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="refresh-outline"><title>Refresh</title><path d="M320 146s24.36-12-64-12a160 160 0 10160 160" fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32"></path><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M256 58l80 80-80 80"></path></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 460" id="search-circle"><title>Search Circle</title><path d="m225,33c-105.87,0 -192,86.13 -192,192s86.13,192 192,192s192,-86.13 192,-192s-86.13,-192 -192,-192zm91.31,283.31a16,16 0 0 1 -22.62,0l-42.84,-42.83a88.08,88.08 0 1 1 22.63,-22.63l42.83,42.84a16,16 0 0 1 0,22.62z" id="svg_1"/><circle cx="201" cy="201" id="svg_2" r="56"/></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 460" id="search-circle-outline"><title>Search Circle</title><path d="m230,54a176,176 0 1 0 176,176a176,176 0 0 0 -176,-176z" fill="none" id="svg_1" stroke="currentColor" stroke-miterlimit="10" stroke-width="32"/><path d="m206,134a72,72 0 1 0 72,72a72,72 0 0 0 -72,-72z" fill="none" id="svg_2" stroke="currentColor" stroke-miterlimit="10" stroke-width="32"/><path d="m257.64,257.64l52.36,52.36" fill="none" id="svg_3" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32"/></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="eye-outline"><title>Eye</title><path d="M255.66 112c-77.94 0-157.89 45.11-220.83 135.33a16 16 0 00-.27 17.77C82.92 340.8 161.8 400 255.66 400c92.84 0 173.34-59.38 221.79-135.25a16.14 16.14 0 000-17.47C428.89 172.28 347.8 112 255.66 112z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"></path><circle cx="256" cy="256" r="80" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32"></circle></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="eye-off-outline"><title>Eye Off</title><path d="M432 448a15.92 15.92 0 01-11.31-4.69l-352-352a16 16 0 0122.62-22.62l352 352A16 16 0 01432 448zM255.66 384c-41.49 0-81.5-12.28-118.92-36.5-34.07-22-64.74-53.51-88.7-91v-.08c19.94-28.57 41.78-52.73 65.24-72.21a2 2 0 00.14-2.94L93.5 161.38a2 2 0 00-2.71-.12c-24.92 21-48.05 46.76-69.08 76.92a31.92 31.92 0 00-.64 35.54c26.41 41.33 60.4 76.14 98.28 100.65C162 402 207.9 416 255.66 416a239.13 239.13 0 0075.8-12.58 2 2 0 00.77-3.31l-21.58-21.58a4 4 0 00-3.83-1 204.8 204.8 0 01-51.16 6.47zM490.84 238.6c-26.46-40.92-60.79-75.68-99.27-100.53C349 110.55 302 96 255.66 96a227.34 227.34 0 00-74.89 12.83 2 2 0 00-.75 3.31l21.55 21.55a4 4 0 003.88 1 192.82 192.82 0 0150.21-6.69c40.69 0 80.58 12.43 118.55 37 34.71 22.4 65.74 53.88 89.76 91a.13.13 0 010 .16 310.72 310.72 0 01-64.12 72.73 2 2 0 00-.15 2.95l19.9 19.89a2 2 0 002.7.13 343.49 343.49 0 0068.64-78.48 32.2 32.2 0 00-.1-34.78z"></path><path d="M256 160a95.88 95.88 0 00-21.37 2.4 2 2 0 00-1 3.38l112.59 112.56a2 2 0 003.38-1A96 96 0 00256 160zM165.78 233.66a2 2 0 00-3.38 1 96 96 0 00115 115 2 2 0 001-3.38z"></path></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="caret-up-outline"><title>Caret Up</title><path d="M414 321.94L274.22 158.82a24 24 0 00-36.44 0L98 321.94c-13.34 15.57-2.28 39.62 18.22 39.62h279.6c20.5 0 31.56-24.05 18.18-39.62z"></path></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="sort-ascending-outline"><title>Sort Ascending</title><path d="M96 144h320M96 256h224M96 368h128" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="40"></path><path d="M384 352l48 48 48-48M432 112v288" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="40"></path></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="sort-descending-outline"><title>Sort Descending</title><path d="M96 144h128M96 256h224M96 368h320" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="40"></path><path d="M384 160l48-48 48 48M432 112v288" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="40"></path></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="pencil-outline"><title>Pencil</title><path d="M96 416l24-104L336 96c20-20 52-20 72 0l8 8c20 20 20 52 0 72L200 392 96 416z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"></path><path d="M304 128l80 80" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"></path></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="trash-outline"><title>Trash</title><path d="M112 144h288M208 144V96h96v48M160 144l16 288h160l16-288" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"></path><path d="M224 216v144M288 216v144" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"></path></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="add-circle-outline"><title>Add Circle</title><circle cx="256" cy="256" r="176" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32"></circle><path d="M256 176v160M176 256h160" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"></path></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="import-outline"><title>Import</title><path d="M112 336v64h288v-64" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"></path><path d="M256 96v224M176 240l80 80 80-80" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"></path></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="export-outline"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M336 176h40a40 40 0 0140 40v208a40 40 0 01-40 40H136a40 40 0 01-40-40V216a40 40 0 0140-40h40"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M176 272l80 80 80-80M256 48v288"/></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="ellipsis-horizontal"><circle cx="256" cy="256" r="32" fill="currentColor"/><circle cx="416" cy="256" r="32" fill="currentColor"/><circle cx="96" cy="256" r="32" fill="currentColor"/></symbol><symbol xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" id="notifications-outline"><path d="M427.68 351.43C402 320 383.87 304 383.87 217.35 383.87 138 343.35 109.73 310 96c-4.43-1.82-8.6-6-9.95-10.55C294.2 65.54 277.8 48 256 48s-38.21 17.55-44 37.47c-1.35 4.6-5.52 8.71-9.95 10.53-33.39 13.75-73.87 41.92-73.87 121.35C128.13 304 110 320 84.32 351.43 73.68 364.45 83 384 101.61 384h308.88c18.51 0 27.77-19.61 17.19-32.57zM320 384v16a64 64 0 01-128 0v-16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></symbol></svg>`;

(function(window) {
    'use strict';
    const marketMap = {sz: 'SZSE', sh: 'SSE', hk: 'HKEX', hsi: 'HSI', ny: 'NYSE', oq: 'NASDAQ', am: 'AMEX'};
    const currencyMap = {sz: 'CNY', sh: 'CNY', hk: 'HKD', hsi: 'HKD', ny: 'USD', oq: 'USD', am: 'USD'};

    // ==================== Utils ====================
    const cEl = function (tag) { return document.createElement(tag) };
    const gID = function (id) { return document.getElementById(id) };
    const deU = function (str) { return JSON.parse(`["${str}"]`)[0] };
    const getNow = (div = 0) => Math.floor(new Date().getTime() / (div == 0 ? 1 : div));
    const toMarketDataId = (id) => (id.startsWith('ny') || id.startsWith('oq') || id.startsWith('am')) ? 'us' + id.slice(2) : id;
    const cachePlateData = (data) => { lscache.set('plateData', data, 1e15); };
    const cacheStockInfo = (data) => { lscache.set('stockInfo', data, 1e15); };
    const LOCAL_DEFAULT_PLATE_ID = 'local-favorites';
    const createLocalPlateId = () => 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const normalizeLocalPlate = (plate, index = 0) => ({
        id: plate?.id || (index == 0 ? LOCAL_DEFAULT_PLATE_ID : createLocalPlateId()),
        name: plate?.name || (index == 0 ? '\u81ea\u9009' : `\u81ea\u9009${index + 1}`),
        items: _.uniq(plate?.items || []),
        open: plate?.open !== false,
        sortDir: plate?.sortDir == 'desc' ? 'desc' : 'asc'
    });
    const getInitialLocalPlates = () => {
        const savedPlates = lscache.get('localFavoritePlates');
        if (Array.isArray(savedPlates) && savedPlates.length > 0) return savedPlates.map(normalizeLocalPlate);
        return [normalizeLocalPlate({
            id: LOCAL_DEFAULT_PLATE_ID,
            name: '\u81ea\u9009',
            items: lscache.get('localFavorites') || [],
            open: lscache.get('localPlateOpen') !== false,
            sortDir: 'asc'
        })];
    };
    const cacheLocalPlates = (data) => {
        const plates = data.map(normalizeLocalPlate);
        lscache.set('localFavoritePlates', plates, 1e15);
        lscache.set('localFavorites', plates[0]?.items || [], 1e15);
        lscache.set('localPlateOpen', plates[0]?.open !== false, 1e15);
    };
    const loadAlertConfig = () => {
        const saved = lscache.get('alertConfig');
        if (!saved || typeof saved != 'object') return {...DEFAULT_ALERT_CONFIG};
        return {
            enabled: !!saved.enabled,
            threshold: Number.isFinite(Number(saved.threshold)) ? Math.max(0.5, Math.min(20, Number(saved.threshold))) : DEFAULT_ALERT_CONFIG.threshold,
            sound: saved.sound !== false
        };
    };
    const cacheAlertConfig = (cfg) => { lscache.set('alertConfig', cfg, 1e15); };
    const downloadTextFile = (filename, text, mime = 'text/plain;charset=utf-8') => {
        const blob = new Blob([text], {type: mime});
        const url = URL.createObjectURL(blob);
        const a = cEl('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
        }, 1000);
    };
    const matchListFilter = (stockId, marketData, filter) => {
        if (!filter || filter == 'all') return true;
        const item = marketData[toMarketDataId(stockId)];
        if (!item) return filter == 'unknown';
        if (item.status == 'S') return filter == 'halt';
        const rate = Number(item.change_rate);
        if (!Number.isFinite(rate)) return filter == 'unknown';
        if (filter == 'up') return rate > 0;
        if (filter == 'down') return rate < 0;
        if (filter == 'flat') return rate == 0;
        if (filter == 'halt') return false;
        return true;
    };
    const filterStockIds = (items, marketData, filter) => (items || []).filter(id => matchListFilter(id, marketData, filter));
    // ==================== Service Layer ====================
    const gtRealtimeFetcher = async (ids) => {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://qt.gtimg.cn/q=' + ids.join(','),
                responseType: 'arraybuffer',
                timeout: 8000,
                onload: function (response) {
                    const responseText = new TextDecoder('gbk').decode(response.response);
                    resolve(_.fromPairs(responseText.split('\n').filter(l => l.length > 2).map(l => {
                        let [key, val] = l.split('=');
                        return [key.slice(2), val.slice(1, -2)];
                    })));
                },
                onerror: function (err) {
                    reject(err);
                },
                ontimeout: function () {
                    reject(new Error('gtRealtime timeout'));
                }
            });
        });
    };
    const gtSuggestRaw = async (text) => {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(text)}&t=all&c=1`,
                timeout: 8000,
                onload: function (response) {
                    try {
                        const hintLine = String(response.responseText || '')
                            .split('\n')
                            .find(l => l.startsWith('v_hint'));
                        if (!hintLine) {
                            resolve([]);
                            return;
                        }
                        const raw = hintLine.slice(8, -1);
                        let line = raw;
                        try {
                            line = deU(raw);
                        } catch (err) {
                            line = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
                        }
                        if (!line || line.startsWith('N')) {
                            resolve([]);
                        } else {
                            resolve(_.flatten([line.split('^')]).map(l => l.split('~')));
                        }
                    } catch (err) {
                        reject(err);
                    }
                },
                onerror: function (err) {
                    reject(err);
                },
                ontimeout: function () {
                    reject(new Error('gtSuggest timeout'));
                }
            });
        });
    };
    const fetchDataToDict = function (data, keys) {
        return _.zipObject(Object.keys(data), Object.values(data).map(i => _.zipObject(keys, i.split('~'))));
    };
    const getRealtimeBasic = async (...args) => {
        const keys = ['_', 'name', 'code', 'last', 'prev_close', 'open', 'volume', 's', 'b',
                      'buy1', 'buy1_vol', 'buy2', 'buy2_vol', 'buy3', 'buy3_vol', 'buy4', 'buy4_vol', 'buy5', 'buy5_vol',
                      'sell1', 'sell1_vol', 'sell2', 'sell2_vol', 'sell3', 'sell3_vol', 'sell4', 'sell4_vol', 'sell5', 'sell5_vol',
                      'latest_deal', 'time', 'change', 'change_rate', 'high', 'low', 'p_v_m', '_volume', 'turnover', 'turn_rate',
                      'pe', 'status'];
        let ids = [...args];
        ids = ids.map(i => (i.startsWith('ny') || i.startsWith('oq') || i.startsWith('am')) ? 'us' + i.slice(2) : i);
        const data = await gtRealtimeFetcher(ids);
        return fetchDataToDict(data, keys);
    };
    const gtSuggest = async (text) => {
        const arr = await gtSuggestRaw(text);
        const typeMap = {GP: 'stock', 'GP-A': 'stock', 'GP-A-KCB': 'stock', ZS: 'index', ETF: 'fund', LOF: 'fund', 'QDII-LOF': 'fund'}; // KJ: 'fund'
        return arr.map(i => {
            const [type, description] = [typeMap[i[4]], i[2]];
            if (type == undefined) return null;
            let [exchange, symbol] = [i[0], i[1]];
            if (symbol.includes('.')) {
                [symbol, exchange] = symbol.split('.');
                if (exchange == 'n') exchange = 'ny';
            } else if (exchange == 'hk' && type == typeMap.GP) {
                symbol = Number(symbol).toString();
            } else if (exchange == 'hk' && type == typeMap.ZS) {
                exchange = 'hsi';
            }
            if (marketMap[exchange] == undefined) return null;
            return {
                "symbol": symbol,
                "description": description,
                "type": type,
                "exchange": marketMap[exchange],
                "currency_code": currencyMap[exchange],
                "provider_id": "ice",
                "country": currencyMap[exchange].slice(0, 2)
            };
        }).filter(i => !!i);
    };

    // 获取自选分组
    const getThsSelfRaw = async () => {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://t.10jqka.com.cn/newcircle/group/getSelfStockWithMarket",
                responseType: 'json',
                onload: function (response) {
                    resolve(response.response);
                },
                onerror: function (err) {
                    reject(err);
                }
            });
        });
    };
    const getWencaiPlateRaw = async () => {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: "https://www.iwencai.com/unifiedwap/self-stock/plate/list",
                data: 'stocks=0&ths=0',
                responseType: 'json',
                onload: function (response) {
                    resolve(response.response);
                },
                onerror: function (err) {
                    reject(err);
                }
            });
        });
    };
    const parseMarketCode = (obj, mark = 'mark', stock = 'stock') => {
        if (obj[mark] == '17' || obj[mark] == '20') return 'sh' + obj[stock];
        if (obj[mark] == '33' || obj[mark] == '36' || obj[mark] == '32') return 'sz' + obj[stock];
        if (obj[mark] == '16') return 'sh' + obj[stock].replace(/^1B/, '00');
        if (obj[mark] == '120' && obj[stock].startsWith('00')) return 'sh' + obj[stock];
        if (obj[mark] == '177') return 'hk0' + obj[stock].slice(2);
        if (obj[mark] == '169') return 'ny' + obj[stock];
        if (obj[mark] == '185') return 'oq' + obj[stock];
        return null;
    };
    const getThsSelf = async () => {
        const obj = await getThsSelfRaw();
        if (obj.errorCode != 0) return obj.errorMsg;
        return obj.result.map(obj => parseMarketCode(obj, 'marketid', 'code')).filter(c => !!c);
    };
    const getWencaiPlate = async () => {
        const obj = await getWencaiPlateRaw();
        if (!obj.success) return new Map(); // TODO: show error

        // 构建 Map: key = 板块ID (sn), value = 板块对象
        return new Map(
            obj.data.map(g => {
                const stocks = g.list
                    .map(item => parseMarketCode(item))
                    .filter(c => !!c);
                return [
                    g.sn,
                    {
                        id: g.sn,
                        name: g.ln,
                        items: stocks
                    }
                ];
            })
        );
    };

    // ==================== Limit-up Board (data.10jqka) ====================
    const ymdToday = () => {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    };
    const fmtYmd = (ymd) => {
        const s = String(ymd || '');
        return s.length == 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : (s || '--');
    };
    const fmtTsTime = (ts) => {
        const n = Number(ts);
        if (!Number.isFinite(n) || n <= 0) return '-';
        const d = new Date(n * 1000);
        return [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => String(x).padStart(2, '0')).join(':');
    };
    const fmtPctNum = (v, digits = 2) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return '-';
        const sign = n > 0 ? '+' : '';
        return `${sign}${n.toFixed(digits)}%`;
    };
    const codeToStockId = (code, marketType = '') => {
        const c = String(code || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
        if (!/^\d{6}$/.test(c)) return null;
        const mt = String(marketType || '').toUpperCase();
        if (mt == 'STAR' || mt == 'KCB') return 'sh' + c;
        if (mt == 'GEM' || mt == 'CYB') return 'sz' + c;
        if (c.startsWith('6') || c.startsWith('5') || c.startsWith('9')) return 'sh' + c;
        return 'sz' + c;
    };
    const gmGetJson = (url, headers = {}) => new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            responseType: 'text',
            timeout: 12000,
            headers: {
                Accept: 'application/json, text/plain, */*',
                Referer: LIMIT_UP_REFERER,
                ...headers
            },
            onload: (response) => {
                if (response.status < 200 || response.status >= 300) {
                    reject(new Error(`HTTP ${response.status}`));
                    return;
                }
                try {
                    const text = typeof response.responseText == 'string' ? response.responseText : String(response.response || '');
                    resolve(JSON.parse(text));
                } catch (err) {
                    reject(new Error('invalid json'));
                }
            },
            onerror: (err) => reject(err || new Error('network error')),
            ontimeout: () => reject(new Error('timeout'))
        });
    });
    const fetchTradeDay = async (date = ymdToday()) => {
        const json = await gmGetJson(`https://data.10jqka.com.cn/dataapi/limit_up/trade_day?stock=stock&prev=30&next=5&date=${date}`);
        const data = json?.data || {};
        const prev = Array.isArray(data.prev_dates) ? data.prev_dates : [];
        const next = Array.isArray(data.next_dates) ? data.next_dates : [];
        const isTrade = data.trade_day === true;
        const tradeDate = isTrade ? date : (prev[prev.length - 1] || date);
        return {tradeDate, isTrade, prev, next, map: Object.fromEntries([...prev, ...next, ...(isTrade ? [date] : [])].map(d => [d, true]))};
    };
    const parseLimitStocks = (list) => {
        if (!Array.isArray(list)) return [];
        return list.map(s => {
            const code = String(s.code ?? '');
            const marketType = s.market_type ?? '';
            const stockId = codeToStockId(code, marketType);
            const changeTag = s.change_tag ?? '';
            const continueNum = Number(s.continue_num ?? 0);
            const tags = [];
            if (changeTag == 'FIRST_LIMIT') tags.push({label: '\u9996\u677f', kind: 'first'});
            if (changeTag == 'LIMIT_BACK') tags.push({label: '\u56de\u5c01', kind: 'back'});
            if (Number(s.is_new) == 1) tags.push({label: '\u65b0', kind: 'new'});
            if (continueNum > 1) tags.push({label: `${continueNum}\u8fde\u677f`, kind: 'high'});
            return {
                code,
                stockId,
                name: s.name ?? '-',
                latest: s.latest ?? '-',
                changeRate: Number(s.change_rate ?? 0),
                high: s.high ?? '-',
                continueNum,
                firstTime: s.first_limit_up_time,
                lastTime: s.last_limit_up_time,
                marketType,
                changeTag,
                reasonType: s.reason_type ?? '',
                reasonInfo: s.reason_info ?? '',
                tags
            };
        }).filter(s => s.code);
    };
    const parseLimitBlocks = (json) => {
        const list = json?.data;
        if (!Array.isArray(list)) return [];
        return list.map((b, index) => ({
            index,
            code: String(b.code ?? index),
            name: b.name ?? '-',
            change: Number(b.change ?? 0),
            limitUpNum: Number(b.limit_up_num ?? 0),
            continuousPlateNum: Number(b.continuous_plate_num ?? 0),
            high: b.high ?? '-',
            days: Number(b.days ?? 0),
            stocks: parseLimitStocks(b.stock_list)
        }));
    };
    const parseOpenLimitList = (json) => {
        const data = json?.data || {};
        const list = Array.isArray(data.info) ? data.info : [];
        const page = data.page || {};
        const items = list.map(s => {
            const code = String(s.code ?? '');
            const marketType = s.market_type ?? '';
            return {
                code,
                stockId: codeToStockId(code, marketType),
                name: s.name ?? '-',
                latest: s.latest ?? '-',
                changeRate: Number(s.change_rate ?? 0),
                openNum: Number(s.open_num ?? 0),
                turnoverRate: Number(s.turnover_rate ?? 0),
                marketType,
                isAgainLimit: Number(s.is_again_limit ?? 0) == 1,
                reasonInfo: s.reason_info ?? ''
            };
        }).filter(s => s.code);
        return {
            list: items,
            total: Number(page.total ?? data.limit_up_count?.today?.open_num ?? items.length) || items.length,
            page: Number(page.page ?? 1) || 1
        };
    };
    const fetchLimitBlocks = async (date) => {
        const json = await gmGetJson(`https://data.10jqka.com.cn/dataapi/limit_up/block_top?filter=${LIMIT_UP_FILTER}&date=${date}`);
        return parseLimitBlocks(json);
    };
    const fetchOpenLimitPool = async (date, page = 1) => {
        const url = `https://data.10jqka.com.cn/dataapi/limit_up/open_limit_pool?page=${page}&limit=${LIMIT_UP_PAGE_SIZE}&field=${LIMIT_UP_OPEN_FIELDS}&filter=${LIMIT_UP_FILTER}&order_field=199112&order_type=0&date=${date}`;
        const json = await gmGetJson(url);
        return parseOpenLimitList(json);
    };
    // ==================== TradingView Search Hook ====================
    // Bind early so later page wrappers / our hook cannot lose the native fetch.
    const originalFetch = typeof window.fetch == 'function' ? window.fetch.bind(window) : null;
    const getTvChart = () => window._exposed_chartWidgetCollection;
    let originalSetSymbol = null;
    const toTvSymbol = (id) => {
        const [market, code] = [marketMap[id.slice(0, 2)], id.slice(2)];
        return market + ':' + (market == 'HKEX' ? Number(code).toString() : code);
    };
    const fromTvSymbol = (symbol) => {
        if (!symbol) return null;
        let [market, code] = symbol.split(':');
        if (market == 'HKEX') code = _.padStart(code, 5, '0');
        market = _.findKey(marketMap, (m) => m == market);
        if (market == undefined) return null;
        return market + code;
    };
    const fromSuggestSymbol = (item) => {
        if (!item?.symbol || !item?.exchange) return null;
        const market = _.findKey(marketMap, (m) => m == item.exchange);
        if (!market || market == 'hsi') return null;
        const code = market == 'hk' ? _.padStart(String(item.symbol), 5, '0') : String(item.symbol).toUpperCase();
        return market + code;
    };
    const pickImportSuggestStock = (raw, symbols) => {
        const keyword = String(raw || '').trim().toLowerCase();
        const candidates = (symbols || [])
            .map(item => ({...item, id: fromSuggestSymbol(item)}))
            .filter(item => item.id && item.type == 'stock');
        if (candidates.length == 0) return null;
        return candidates.find(item => String(item.description || '').trim().toLowerCase() == keyword) || candidates[0];
    };
    const normalizeImportStockCode = (raw) => {
        let text = String(raw || '').trim().toUpperCase();
        if (!text) return null;
        text = text.replace(/^[A-Z]+:/, '').replace(/[\s,，;；]+.*$/, '');
        let match = text.match(/^(SH|SZ)(\d{6})$/);
        if (match) return match[1].toLowerCase() + match[2];
        match = text.match(/^(\d{6})\.(SH|SZ|SS)$/);
        if (match) return (match[2] == 'SZ' ? 'sz' : 'sh') + match[1];
        match = text.match(/^(\d{6})$/);
        if (!match) return null;
        const code = match[1];
        if (/^[659]/.test(code)) return 'sh' + code;
        if (/^[013]/.test(code)) return 'sz' + code;
        return null;
    };
    const parseImportStockLines = (text) => {
        const seen = new Set();
        const parsed = [];
        const queries = [];
        // Support full JSON backup paste in text import.
        const trimmed = String(text || '').trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                const data = JSON.parse(trimmed);
                const plates = Array.isArray(data) ? data : data.plates;
                if (Array.isArray(plates)) {
                    plates.forEach(plate => {
                        (plate.items || []).forEach(stockId => {
                            const id = String(stockId || '').trim();
                            if (!id || seen.has(id)) return;
                            seen.add(id);
                            parsed.push({raw: id, id, marketId: toMarketDataId(id), code: id.slice(2)});
                        });
                    });
                    return {parsed, queries};
                }
            } catch (err) {}
        }
        String(text || '').split(/\r?\n/).forEach(line => {
            let raw = line.trim();
            if (!raw) return;
            // code,name / code\tname / code name
            raw = raw.split(/[\t,，]/)[0].trim();
            const id = normalizeImportStockCode(raw);
            if (!id) {
                queries.push({raw: line.trim()});
                return;
            }
            if (seen.has(id)) return;
            seen.add(id);
            parsed.push({raw, id, marketId: toMarketDataId(id), code: id.slice(2)});
        });
        return {parsed, queries};
    };
    let latestSearchKw = null, latestSearchRes = null, searchSeq = 0;
    // Only rewrite free-text CN searches. Never hijack TV's own symbol resolve on page load.
    const isCnUserSearchKeyword = (kw) => {
        const text = String(kw || '').trim();
        if (!text) return false;
        if (/^[A-Z]+:/i.test(text)) return false; // SSE:600000 / NASDAQ:AAPL
        if (/^\d{6}(\.(SH|SZ|SS))?$/i.test(text)) return true;
        if (/^(sh|sz)\d{6}$/i.test(text)) return true;
        if (/[\u4e00-\u9fff]/.test(text)) return true;
        // short pinyin / code fragments only; leave long English company queries to TV
        if (/^[a-zA-Z]{1,8}$/.test(text)) return true;
        return false;
    };
    const callOriginalFetch = (...args) => {
        if (typeof originalFetch == 'function') return originalFetch(...args);
        if (typeof window.fetch == 'function' && window.fetch !== hookedTvSearch) return window.fetch(...args);
        throw new Error('fetch unavailable');
    };
    const updateTvSymbol = (id) => {
        const tvChart = getTvChart();
        if (typeof tvChart?.setSymbol != 'function') return;
        tvChart.setSymbol(toTvSymbol(id), null, tvChart._subscribedChartWidget);
    };
    const hookedTvSearch = async (...args) => {
        try {
            const [resource] = args;
            const requestUrl = typeof resource == 'string' ? resource : (resource?.url || '');
            if (!requestUrl.includes('symbol-search'))
                return await callOriginalFetch(...args);

            let kw = '';
            try {
                kw = new URL(requestUrl, location.origin).searchParams.get('text') || '';
            } catch (err) {
                return await callOriginalFetch(...args);
            }

            if (!isCnUserSearchKeyword(kw)) {
                return await callOriginalFetch(...args);
            }

            const seq = ++searchSeq;
            try {
                const symbols = await gtSuggest(kw);
                if (seq == searchSeq) {
                    latestSearchKw = kw;
                    latestSearchRes = symbols;
                }
                return new Response(JSON.stringify({symbols: symbols || [], symbols_remaining: 0}), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'}
                });
            } catch (err) {
                console.warn('[tvhelper] symbol search fallback', err);
                if (seq == searchSeq) {
                    latestSearchKw = null;
                    latestSearchRes = null;
                }
                return await callOriginalFetch(...args);
            }
        } catch (err) {
            console.warn('[tvhelper] fetch hook error', err);
            try {
                return await callOriginalFetch(...args);
            } catch (fetchErr) {
                return new Response(JSON.stringify({symbols: [], symbols_remaining: 0}), {
                    status: 200,
                    headers: {'Content-Type': 'application/json'}
                });
            }
        }
    };

    // ==================== Store Layer ====================
    const createStore = (initialState) => ({
        state: initialState,
        listeners: new Set(),
        getState() {
            return this.state;
        },
        subscribe(listener) {
            this.listeners.add(listener);
            return () => this.listeners.delete(listener);
        },
        setState(update) {
            const patch = typeof update == 'function' ? update(this.state) : update;
            if (!patch) return this.state;
            this.state = {...this.state, ...patch};
            this.listeners.forEach(listener => listener(this.state));
            return this.state;
        }
    });

    const Store = createStore({
        isPanelOpen: false,
        plateData: lscache.get('plateData') || [],
        localPlates: getInitialLocalPlates(),
        activeTab: 'ths',
        marketData: {},
        stockInfo: lscache.get('stockInfo') || {},
        onRefresh: false,
        fetchStatus: null,
        isLogin: true,
        enableSearchHook: true,
        curSymbolTv: null,
        listFilter: lscache.get('listFilter') || 'all',
        alertConfig: loadAlertConfig(),
        toasts: []
    });

    const alertCooldown = new Map();
    const pushToast = (toast) => {
        const id = 't' + getNow() + Math.random().toString(36).slice(2, 6);
        const item = {id, at: getNow(), ...toast};
        Store.setState(prev => ({toasts: [...(prev.toasts || []).slice(-4), item]}));
        window.setTimeout(() => {
            Store.setState(prev => ({toasts: (prev.toasts || []).filter(t => t.id != id)}));
        }, 6000);
        return item;
    };
    const playAlertBeep = () => {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 880;
            gain.gain.value = 0.04;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            window.setTimeout(() => {
                osc.stop();
                ctx.close();
            }, 160);
        } catch (err) {}
    };
    const evaluateAlerts = (passData, prevMarketData, stockInfo, alertConfig) => {
        if (!alertConfig?.enabled) return;
        const threshold = Number(alertConfig.threshold) || DEFAULT_ALERT_CONFIG.threshold;
        const now = getNow();
        Object.entries(passData || {}).forEach(([stockId, item]) => {
            if (!item || item.status == 'S') return;
            const rate = Number(item.change_rate);
            if (!Number.isFinite(rate) || Math.abs(rate) < threshold) return;
            const oldRate = Number(prevMarketData?.[stockId]?.change_rate);
            const crossed = !Number.isFinite(oldRate) || Math.abs(oldRate) < threshold || Math.sign(oldRate) != Math.sign(rate);
            if (!crossed) return;
            const lastAt = alertCooldown.get(stockId) || 0;
            if (now - lastAt < ALERT_COOLDOWN_MS) return;
            alertCooldown.set(stockId, now);
            const name = stockInfo?.[stockId]?.name || item.name || stockId;
            const dir = rate > 0 ? 'up' : 'down';
            pushToast({
                kind: dir,
                title: `${name} ${rate > 0 ? '+' : ''}${rate}%`,
                sub: `\u6da8\u8dcc\u5e45\u8fbe\u5230 ${threshold}% \u9608\u503c`
            });
            if (alertConfig.sound) playAlertBeep();
        });
    };

    const mergePlateData = (oldData, newData) => {
        const newById = _.fromPairs(newData.map(group => [group.id, group]));
        const insertedIds = [];
        const merged = oldData.flatMap(group => {
            const next = newById[group.id];
            if (!next) return [];
            insertedIds.push(group.id);
            return [{...group, name: next.name, items: next.items}];
        });
        return _.concat(merged, newData.filter(group => !insertedIds.includes(group.id)));
    };

    // ==================== Scheduler Layer ====================
    class MarketScheduler {
        constructor(store) {
            this.store = store;
            this.marketCache = {};
            this.timer = null;
            this.isRunning = false;
            this.isUpdating = false;
            this.activePlateId = null;
        }

        start(force = false) {
            if (this.isRunning) {
                if (force) this.tick(true);
                return;
            }
            this.isRunning = true;
            this.tick(force);
            this.timer = window.setInterval(() => this.tick(), MARKET_REFRESH_INTERVAL);
        }

        stop() {
            this.isRunning = false;
            if (this.timer) window.clearInterval(this.timer);
            this.timer = null;
        }

        setActivePlate(id) {
            this.activePlateId = id;
        }

        pickStocks(stocks, limit, ttl, ignoreTtl = false) {
            const now = getNow();
            return _.slice(stocks
                .filter(id => ignoreTtl || !this.marketCache[id] || now - this.marketCache[id] >= ttl)
                .sort((a, b) => (this.marketCache[a] || 0) - (this.marketCache[b] || 0)), 0, limit);
        }

        async tick(force = false) {
            const state = this.store.getState();
            if (!this.isRunning || !state.isPanelOpen || document.hidden || this.isUpdating) return;
            if (state.activeTab == 'limit') return;
            this.isUpdating = true;
            try {
                const scheduleGroups = state.activeTab == 'local' ? state.localPlates : state.plateData;
                // All expanded plates; activePlate only controls refresh priority.
                const openPlates = scheduleGroups.filter(group => Object.keys(group).includes('open') && group.open);
                if (openPlates.length == 0) return;
                const activePlate = openPlates.find(group => group.id == this.activePlateId) || openPlates[0];
                if (activePlate) this.activePlateId = activePlate.id;

                const activeStocks = activePlate ? _.uniq((activePlate.items || []).map(toMarketDataId)) : [];
                const openStocks = _.uniq(_.flatten(openPlates.map(group => group.items || [])).map(toMarketDataId));
                const backgroundStocks = _.difference(openStocks, activeStocks);
                const activePass = this.pickStocks(activeStocks, MARKET_PRIORITY_BATCH_SIZE, MARKET_ACTIVE_TTL, force);
                const backgroundLimit = Math.min(MARKET_BACKGROUND_BATCH_SIZE, Math.max(MARKET_PRIORITY_BATCH_SIZE - activePass.length, 0));
                const backgroundPass = this.pickStocks(backgroundStocks, backgroundLimit, MARKET_BACKGROUND_TTL);
                const pass = _.slice(_.uniq([...activePass, ...backgroundPass]), 0, MARKET_PRIORITY_BATCH_SIZE);
                if (pass.length == 0) return;

                const fetchStart = performance.now();
                const passData = await getRealtimeBasic(...pass);
                const fetchMs = performance.now() - fetchStart;
                const stateStart = performance.now();
                const now = getNow();
                const passStocks = Object.keys(passData);
                this.marketCache = {...this.marketCache, ..._.zipObject(passStocks, _.fill(Array(passStocks.length), now))};

                const currentState = this.store.getState();
                let nextStockInfo = currentState.stockInfo;
                Object.entries(passData).forEach(([stockId, item]) => {
                    if (!item?.name || nextStockInfo[stockId]?.name) return;
                    if (nextStockInfo === currentState.stockInfo) nextStockInfo = {...currentState.stockInfo};
                    nextStockInfo[stockId] = {name: item.name};
                });
                if (nextStockInfo !== currentState.stockInfo) {
                    cacheStockInfo(nextStockInfo);
                    this.store.setState({stockInfo: nextStockInfo});
                }

                let hasMarketChanges = false;
                let prevMarketData = currentState.marketData;
                this.store.setState(prev => {
                    prevMarketData = prev.marketData;
                    hasMarketChanges = Object.entries(passData).some(([stockId, item]) => {
                        const oldItem = prev.marketData[stockId];
                        return !oldItem || ['name', 'last', 'change_rate', 'status', 'time'].some(key => oldItem[key] != item[key]);
                    });
                    return hasMarketChanges ? {marketData: {...prev.marketData, ...passData}} : null;
                });
                if (hasMarketChanges) {
                    evaluateAlerts(passData, prevMarketData, this.store.getState().stockInfo, this.store.getState().alertConfig);
                }
                const stateMs = performance.now() - stateStart;
                if (PERF_LOG_ENABLED) {
                    const renderStart = performance.now();
                    requestAnimationFrame(() => {
                        console.log('[tvhelper:perf]', {
                            stocks: pass.length,
                            returned: passStocks.length,
                            changed: hasMarketChanges,
                            fetchMs: Number(fetchMs.toFixed(1)),
                            stateMs: Number(stateMs.toFixed(1)),
                            renderFrameMs: Number((performance.now() - renderStart).toFixed(1))
                        });
                    });
                }
            } catch (err) {
                console.warn('[tvhelper] market update failed', err);
            } finally {
                this.isUpdating = false;
            }
        }
    }

    const marketScheduler = new MarketScheduler(Store);

    // ==================== UI Layer ====================
    const {h, render} = preact;
    const {useState, useEffect} = preactHooks;
    const html = htm.bind(h);

    const showIntraday = _.debounce((e) => {
        if (e.type != 'mouseover') {
            tooltipElement.classList.remove('is-active');
            tooltipElement.innerHTML = '';
            return;
        }
        const id = e.currentTarget.dataset.id;
        if (!id.startsWith('sz') && !id.match(/^sh[^0]/)) return;
        tooltipElement.innerHTML = `<img src="https://image.sinajs.cn/newchart/min/n/${id}.gif?_=${getNow(100000)}" referrerpolicy="no-referrer">`;
        tooltipElement.classList.add('is-active');
    }, 300);

    function StockItem({stockId, groupId, marketId, name, percent, isCurSymbol, isLocalFavorite, localPlates, favoritePicker, onSelect, onToggleFavorite, onToggleFavoritePlate, onCloseFavoritePicker}) {
        const numericPercent = Number(percent);
        const spanClass = numericPercent > 0 ? 'is-success' : (numericPercent < 0 ? 'is-danger' : '');
        const percentText = percent == '\u505c\u724c'
            ? percent
            : (Number.isFinite(numericPercent)
                ? `${numericPercent > 0 ? '+' : ''}${numericPercent.toFixed(2)}%`
                : `${percent}%`);
        const pickerOpen = favoritePicker?.stockId == stockId && favoritePicker?.groupId == groupId;
        return html`
        <li class="${pickerOpen ? 'has-favorite-picker' : ''}">
          <a onclick=${() => onSelect(stockId)} class="${isCurSymbol ? 'is-active' : ''}" title="${name} ${stockId}">
            <span class="symbol-name"><span class="symbol-label">${name}</span><span class="symbol-code">${stockId.slice(2)}</span></span>
            <span class="stock-actions">
              <span
                class="favorite-toggle ${isLocalFavorite ? 'is-active' : ''}"
                title="${isLocalFavorite ? '\u67e5\u770b\u5df2\u52a0\u5165\u7684\u672c\u5730\u81ea\u9009' : '\u52a0\u5165\u672c\u5730\u81ea\u9009'}"
                onclick=${(e) => onToggleFavorite(stockId, groupId, e)}>${isLocalFavorite ? '\u2605' : '\u2606'}</span>
              <span class="tag is-info is-light ${spanClass}" title="${name} ${percentText}" data-id=${marketId} onmouseover=${showIntraday} onmouseout=${showIntraday}
              >${percentText}</span>
            </span>
          </a>
          ${pickerOpen && html`
            <div class="favorite-picker" onclick=${(e) => { e.preventDefault(); e.stopPropagation(); }}>
              ${localPlates.map(plate => {
                  const joined = (plate.items || []).includes(stockId);
                  return html`
                    <span
                      class="favorite-picker-item ${joined ? 'is-active' : ''}"
                      role="button"
                      tabindex="0"
                      title="${joined ? '\u70b9\u51fb\u53d6\u6d88\u52a0\u5165' : '\u70b9\u51fb\u52a0\u5165'}${plate.name}"
                      onclick=${(e) => onToggleFavoritePlate(stockId, plate.id, e)}
                      onkeydown=${(e) => {
                          if (e.key == 'Enter' || e.key == ' ') onToggleFavoritePlate(stockId, plate.id, e);
                          if (e.key == 'Escape') onCloseFavoritePicker(e);
                      }}>
                      <span class="favorite-picker-name">${plate.name}</span>
                      <span class="favorite-picker-mark">${joined ? '\u2713' : '+'}</span>
                    </span>`;
              })}
            </div>`}
        </li>`;
    }
    function Plate({group, groupIndex, isLocalTab, marketData, stockInfo, listFilter, localFavoriteSet, localPlates, favoritePicker, plateMenuId, curSymbolTv, onSelectStock, onToggleFavorite, onToggleFavoritePlate, onCloseFavoritePicker, onTogglePlate, onPinPlate, onSortPlate, onTogglePlateMenu, onExportPlate, onImportPlate, onRenamePlate, onDeletePlate}) {
        const visible = Object.keys(group).includes('open') && group.open;
        const sortTitle = group.sortDir == 'asc'
            ? '\u6309\u677f\u5757\u5185\u6da8\u5e45\u4ece\u4f4e\u5230\u9ad8\u6392\u5e8f'
            : '\u6309\u677f\u5757\u5185\u6da8\u5e45\u4ece\u9ad8\u5230\u4f4e\u6392\u5e8f';
        const visibleItems = filterStockIds(group.items, marketData, listFilter);
        const menuOpen = plateMenuId == group.id;
        return html`
        <details class="tvhelper-plate ${favoritePicker?.groupId == group.id || menuOpen ? 'has-open-favorite-picker' : ''}" open=${visible} ontoggle=${(e) => onTogglePlate(group.id, e)}>
          <summary class="menu-label" title="${group.name}">
            <span class="plate-name">${group.name}${listFilter != 'all' ? html`<span class="plate-count">${visibleItems.length}/${(group.items || []).length}</span>` : ''}</span>
            <span class="plate-actions">
              <button class="plate-sort-button" type="button" title=${sortTitle} onclick=${(e) => onSortPlate(group.id, e)}><svg><use xlink:href=${group.sortDir == 'asc' ? '#sort-ascending-outline' : '#sort-descending-outline'}/></svg></button>
              ${isLocalTab && html`
                <span class="overflow-wrap">
                  <button class="plate-action-button ${menuOpen ? 'is-active' : ''}" type="button" title="\u66f4\u591a" onclick=${(e) => onTogglePlateMenu(group.id, e)}>
                    <svg><use xlink:href="#ellipsis-horizontal"/></svg>
                  </button>
                  ${menuOpen && html`
                    <div class="overflow-menu" onclick=${(e) => { e.preventDefault(); e.stopPropagation(); }}>
                      <button class="overflow-menu-item" type="button" onclick=${(e) => onImportPlate(group.id, e)}><svg><use xlink:href="#import-outline"/></svg>\u5bfc\u5165</button>
                      <button class="overflow-menu-item" type="button" onclick=${(e) => onExportPlate(group.id, e)}><svg><use xlink:href="#export-outline"/></svg>\u5bfc\u51fa</button>
                      <button class="overflow-menu-item" type="button" onclick=${(e) => onRenamePlate(group.id, e)}><svg><use xlink:href="#pencil-outline"/></svg>\u91cd\u547d\u540d</button>
                      <button class="overflow-menu-item is-danger" type="button" onclick=${(e) => onDeletePlate(group.id, e)}><svg><use xlink:href="#trash-outline"/></svg>\u5220\u9664</button>
                    </div>
                  `}
                </span>
              `}
              ${!isLocalTab && html`<button class="plate-action-button ${groupIndex < 2 ? 'disabled' : ''}" type="button" title="\u7f6e\u9876\u5206\u7ec4" onclick=${(e) => onPinPlate(groupIndex, e)}><svg><use xlink:href="#caret-up-outline"/></svg></button>`}
            </span>
          </summary>
          ${visible && html`<ul class="menu-list">
            ${visibleItems.length == 0 && html`<li class="tvhelper-empty-filter" style="height:auto;padding:8px;">\u65e0\u5339\u914d\u7b5b\u9009\u6761\u4ef6\u7684\u80a1\u7968</li>`}
            ${visibleItems.map(stockId => {
                const marketId = toMarketDataId(stockId);
                const marketItem = marketData[marketId];
                const infoItem = stockInfo[marketId];
                const name = infoItem?.name || marketItem?.name || marketId;
                const percent = marketItem ? (marketItem.status == 'S' ? '\u505c\u724c' : marketItem.change_rate) : '-';
                return html`<${StockItem}
                    key=${stockId}
                    stockId=${stockId}
                    groupId=${group.id}
                    marketId=${marketId}
                    name=${name}
                    percent=${percent}
                    isCurSymbol=${stockId == curSymbolTv}
                    isLocalFavorite=${localFavoriteSet.has(stockId)}
                    localPlates=${localPlates}
                    favoritePicker=${favoritePicker}
                    onSelect=${onSelectStock}
                    onToggleFavorite=${onToggleFavorite}
                    onToggleFavoritePlate=${onToggleFavoritePlate}
                    onCloseFavoritePicker=${onCloseFavoritePicker}
                />`;
            })}
          </ul>`}
        </details>`;
    }

    function LimitPct({value}) {
        const n = Number(value);
        const cls = Number.isFinite(n) ? (n > 0 ? 'limit-up' : (n < 0 ? 'limit-down' : '')) : '';
        return html`<span class="${cls}">${fmtPctNum(value)}</span>`;
    }

    const limitCmp = (a, b, dir) => {
        if (a == null && b == null) return 0;
        if (a == null || a === '') return 1;
        if (b == null || b === '') return -1;
        if (typeof a == 'string' || typeof b == 'string') {
            const r = String(a).localeCompare(String(b), 'zh-CN');
            return dir == 'asc' ? r : -r;
        }
        const an = Number(a);
        const bn = Number(b);
        if (!Number.isFinite(an) && !Number.isFinite(bn)) return 0;
        if (!Number.isFinite(an)) return 1;
        if (!Number.isFinite(bn)) return -1;
        return dir == 'asc' ? an - bn : bn - an;
    };
    const sortLimitRows = (list, key, dir, getter) =>
        [...(list || [])].sort((a, b) => limitCmp(getter(a, key), getter(b, key), dir) || 0);

    function LimitTh({label, sortKey, sort, onSort, num}) {
        const active = sort?.key == sortKey;
        const cls = ['sortable', num ? 'num' : '', active ? sort.dir : ''].filter(Boolean).join(' ');
        return html`<th class=${cls} onclick=${(e) => { e.preventDefault(); e.stopPropagation(); onSort(sortKey); }}>
          ${label}<span class="arrow"></span>
        </th>`;
    }

    function LimitBlockList({blocks, selectedCode, onSelect}) {
        const [sort, setSort] = useState({key: 'limitUpNum', dir: 'desc'});
        if (!blocks?.length) return html`<div class="limit-msg is-warn">\u5f53\u65e5\u65e0\u677f\u5757\u6570\u636e</div>`;
        const getter = (b, key) => {
            if (key == 'name') return b.name;
            if (key == 'limitUpNum') return b.limitUpNum;
            if (key == 'continuousPlateNum') return b.continuousPlateNum;
            if (key == 'high') return b.high;
            if (key == 'change') return b.change;
            return b[key];
        };
        const onSort = (key) => {
            setSort(prev => prev.key == key
                ? {key, dir: prev.dir == 'asc' ? 'desc' : 'asc'}
                : {key, dir: (key == 'name' || key == 'high') ? 'asc' : 'desc'});
        };
        const rows = sortLimitRows(blocks, sort.key, sort.dir, getter);
        return html`<div class="limit-table-wrap">
          <table class="limit-table">
            <thead>
              <tr>
                <${LimitTh} label="\u677f\u5757" sortKey="name" sort=${sort} onSort=${onSort} />
                <${LimitTh} label="\u6da8\u505c" sortKey="limitUpNum" sort=${sort} onSort=${onSort} num=${true} />
                <${LimitTh} label="\u8fde\u677f" sortKey="continuousPlateNum" sort=${sort} onSort=${onSort} num=${true} />
                <${LimitTh} label="\u9ad8\u5ea6" sortKey="high" sort=${sort} onSort=${onSort} />
                <${LimitTh} label="\u6da8\u5e45" sortKey="change" sort=${sort} onSort=${onSort} num=${true} />
              </tr>
            </thead>
            <tbody>
              ${rows.map(block => html`
                <tr class="${block.code == selectedCode ? 'is-active' : ''}" key=${block.code} onclick=${() => onSelect(block.code)}>
                  <td><span class="limit-name">${block.name}</span></td>
                  <td class="num">${block.limitUpNum}</td>
                  <td class="num">${block.continuousPlateNum}</td>
                  <td>${block.high || '-'}</td>
                  <td class="num"><${LimitPct} value=${block.change} /></td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>`;
    }

    function LimitStockList({stocks, mode, curSymbolTv, emptyText, onSelect, hasMore, loadingMore}) {
        const isOpen = mode == 'open';
        const [sort, setSort] = useState(isOpen
            ? {key: 'openNum', dir: 'desc'}
            : {key: 'firstTime', dir: 'asc'});
        if (!stocks?.length) return html`<div class="limit-msg is-warn">${emptyText || '\u65e0\u4e2a\u80a1'}</div>`;
        const getter = (s, key) => {
            if (key == 'code') return s.code;
            if (key == 'name') return s.name;
            if (key == 'latest') return Number(s.latest);
            if (key == 'changeRate') return s.changeRate;
            if (key == 'high') return s.high;
            if (key == 'firstTime') return Number(s.firstTime) || 0;
            if (key == 'openNum') return s.openNum;
            if (key == 'reasonType') return s.reasonType;
            return s[key];
        };
        const onSort = (key) => {
            setSort(prev => prev.key == key
                ? {key, dir: prev.dir == 'asc' ? 'desc' : 'asc'}
                : {key, dir: ['code', 'name', 'high', 'firstTime', 'reasonType'].includes(key) ? 'asc' : 'desc'});
        };
        const rows = sortLimitRows(stocks, sort.key, sort.dir, getter);
        return html`<div class="limit-table-wrap">
          <table class="limit-table">
            <thead>
              <tr>
                <${LimitTh} label="\u4ee3\u7801" sortKey="code" sort=${sort} onSort=${onSort} />
                <${LimitTh} label="\u540d\u79f0" sortKey="name" sort=${sort} onSort=${onSort} />
                <${LimitTh} label="\u6700\u65b0" sortKey="latest" sort=${sort} onSort=${onSort} num=${true} />
                <${LimitTh} label="\u6da8\u5e45" sortKey="changeRate" sort=${sort} onSort=${onSort} num=${true} />
                ${isOpen
                    ? html`<${LimitTh} label="\u70b8\u677f" sortKey="openNum" sort=${sort} onSort=${onSort} num=${true} />`
                    : html`
                      <${LimitTh} label="\u9ad8\u5ea6" sortKey="high" sort=${sort} onSort=${onSort} />
                      <${LimitTh} label="\u9996\u5c01" sortKey="firstTime" sort=${sort} onSort=${onSort} num=${true} />
                    `}
                <${LimitTh} label="\u6807\u7b7e" sortKey="reasonType" sort=${sort} onSort=${onSort} />
              </tr>
            </thead>
            <tbody>
              ${rows.map(stock => {
                  const active = stock.stockId && stock.stockId == curSymbolTv;
                  return html`
                  <tr class="${active ? 'is-active' : ''}" key=${stock.code} onclick=${() => stock.stockId && onSelect(stock.stockId)}>
                    <td><span class="limit-code limit-link">${stock.code}</span></td>
                    <td><span class="limit-link limit-name">${stock.name}</span></td>
                    <td class="num">${stock.latest ?? '-'}</td>
                    <td class="num"><${LimitPct} value=${stock.changeRate} /></td>
                    ${isOpen
                        ? html`<td class="num">${stock.openNum ?? '-'}</td>`
                        : html`
                          <td>${stock.high || '-'}</td>
                          <td class="num">${fmtTsTime(stock.firstTime)}</td>
                        `}
                    <td>
                      <div class="limit-tags">
                        ${isOpen && stock.isAgainLimit ? html`<span class="limit-tag is-back">\u56de\u5c01</span>` : null}
                        ${(stock.tags || []).map(tag => html`
                          <span class="limit-tag ${tag.kind == 'first' ? 'is-first' : (tag.kind == 'back' ? 'is-back' : '')}" key=${tag.label}>${tag.label}</span>
                        `)}
                        ${stock.reasonType ? html`<span class="limit-reason" title=${stock.reasonInfo || stock.reasonType}>${stock.reasonType}</span>` : null}
                      </div>
                    </td>
                  </tr>`;
              })}
            </tbody>
          </table>
          ${isOpen && (hasMore || loadingMore) && html`
            <div class="limit-sentinel">${loadingMore ? '\u52a0\u8f7d\u4e2d\u2026' : '\u6eda\u52a8\u52a0\u8f7d\u66f4\u591a'}</div>
          `}
        </div>`;
    }

    function App() {
        const [state, setState] = useState(Store.getState());
        const [favoritePicker, setFavoritePicker] = useState(null);
        const [importDialog, setImportDialog] = useState(null);
        const [plateDialog, setPlateDialog] = useState(null);
        const [alertDialog, setAlertDialog] = useState(null);
        const [toolsDialog, setToolsDialog] = useState(null);
        const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
        const [plateMenuId, setPlateMenuId] = useState(null);
        const [limitBoard, setLimitBoard] = useState({
            date: '',
            view: 'block',
            loading: false,
            error: '',
            blocks: [],
            selectedCode: null,
            openList: [],
            openTotal: 0,
            openPage: 1,
            blockLoaded: false,
            openLoaded: false
        });

        useEffect(() => Store.subscribe(setState), []);
        useEffect(() => {
            if (!state.enableSearchHook) {
                if (window.fetch === hookedTvSearch) window.fetch = originalFetch;
                return;
            }
            // Keep any third-party wrapper; only replace once from the live page fetch.
            if (window.fetch !== hookedTvSearch) {
                // If TV/other scripts wrapped fetch after we loaded, prefer the current one as base.
                // originalFetch is captured at boot; hookedTvSearch already delegates to it.
                window.fetch = hookedTvSearch;
            }
            return () => {
                if (window.fetch === hookedTvSearch) window.fetch = originalFetch;
            };
        }, [state.enableSearchHook]);
        useEffect(() => {
            let hookedChart = null;
            let hookedSetSymbol = null;
            const installSetSymbolHook = () => {
                const tvChart = getTvChart();
                if (typeof tvChart?.setSymbol != 'function') return false;
                if (tvChart.setSymbol.__tvhelperHooked) return true;
                originalSetSymbol = tvChart.setSymbol;
                hookedChart = tvChart;
                hookedSetSymbol = (...args) => {
                    Store.setState({curSymbolTv: fromTvSymbol(args[0])});
                    // When TV tries to set the raw search keyword (pinyin / Chinese),
                    // map it to the first gtimg match with a full EXCHANGE:SYMBOL id.
                    if (latestSearchKw && args[0] == latestSearchKw && latestSearchRes?.length > 0) {
                        const best = latestSearchRes[0];
                        const full = best.exchange ? `${best.exchange}:${best.symbol}` : best.symbol;
                        return originalSetSymbol.bind(tvChart)(full, null, tvChart._subscribedChartWidget);
                    }
                    return originalSetSymbol.bind(tvChart)(...args);
                };
                hookedSetSymbol.__tvhelperHooked = true;
                tvChart.setSymbol = hookedSetSymbol;
                return true;
            };
            const timer = installSetSymbolHook() ? null : window.setInterval(() => {
                if (installSetSymbolHook()) window.clearInterval(timer);
            }, 500);
            return () => {
                if (timer) window.clearInterval(timer);
                if (hookedChart && hookedChart.setSymbol === hookedSetSymbol) hookedChart.setSymbol = originalSetSymbol;
            };
        }, []);
        useEffect(() => {
            if (Store.getState().plateData.length == 0) updatePlateData();
        }, []);
        useEffect(() => {
            if (state.isPanelOpen) marketScheduler.start(true);
            else marketScheduler.stop();
            return () => marketScheduler.stop();
        }, [state.isPanelOpen, state.activeTab, state.plateData.length, state.localPlates.length]);

        useEffect(() => {
            if (!favoritePicker && !headerMenuOpen && !plateMenuId) return;
            const closeMenus = () => {
                setFavoritePicker(null);
                setHeaderMenuOpen(false);
                setPlateMenuId(null);
            };
            document.addEventListener('click', closeMenus);
            return () => document.removeEventListener('click', closeMenus);
        }, [favoritePicker, headerMenuOpen, plateMenuId]);

        async function loadLimitBoard({force = false, page = 1, view} = {}) {
            let activeView = view || 'block';
            let skip = false;
            setLimitBoard(prev => {
                activeView = view || prev.view || 'block';
                if (prev.loading && !force) {
                    skip = true;
                    return prev;
                }
                return {...prev, loading: true, error: '', view: activeView};
            });
            if (skip) return;
            try {
                const trade = await fetchTradeDay(ymdToday());
                const date = trade.tradeDate;
                if (activeView == 'open') {
                    const open = await fetchOpenLimitPool(date, page);
                    setLimitBoard(prev => {
                        let nextList = open.list;
                        if (page > 1) {
                            const seen = new Set((prev.openList || []).map(s => s.code));
                            nextList = [...(prev.openList || [])];
                            open.list.forEach(item => {
                                if (!seen.has(item.code)) {
                                    seen.add(item.code);
                                    nextList.push(item);
                                }
                            });
                        }
                        return {
                            ...prev,
                            date,
                            view: 'open',
                            loading: false,
                            error: '',
                            openLoaded: true,
                            openList: nextList,
                            openTotal: open.total,
                            openPage: page,
                            selectedCode: page > 1 ? prev.selectedCode : null
                        };
                    });
                    return;
                }
                const blocks = await fetchLimitBlocks(date);
                setLimitBoard(prev => ({
                    ...prev,
                    date,
                    view: 'block',
                    loading: false,
                    error: '',
                    blockLoaded: true,
                    blocks
                }));
            } catch (err) {
                console.warn('[tvhelper] limit board load failed', err);
                setLimitBoard(prev => ({
                    ...prev,
                    loading: false,
                    error: err?.message || '\u52a0\u8f7d\u5931\u8d25',
                    ...(activeView == 'open' ? {openLoaded: true} : {blockLoaded: true})
                }));
            }
        }

        useEffect(() => {
            if (state.activeTab != 'limit' || limitBoard.loading) return;
            if (limitBoard.view == 'open' && !limitBoard.openLoaded) {
                loadLimitBoard({force: true, page: 1, view: 'open'});
                return;
            }
            if (limitBoard.view == 'block' && !limitBoard.blockLoaded) {
                loadLimitBoard({force: true, page: 1, view: 'block'});
            }
        }, [state.activeTab, limitBoard.view, limitBoard.blockLoaded, limitBoard.openLoaded, limitBoard.loading]);

        async function updatePlateData() {
            if (Store.getState().activeTab == 'limit') {
                setHeaderMenuOpen(false);
                await loadLimitBoard({force: true, page: 1, view: limitBoard.view});
                return;
            }
            if (Store.getState().onRefresh) return;
            Store.setState({onRefresh: true, fetchStatus: {phase: 'stock', text: '\u6b63\u5728\u62c9\u53d6\u4e2a\u80a1\u2026'}});
            try {
                const selfData = await getThsSelf();
                if (typeof selfData == 'string') {
                    Store.setState({isLogin: false, fetchStatus: {phase: 'error', text: '\u4e2a\u80a1\u62c9\u53d6\u5931\u8d25'}});
                    return;
                }
                Store.setState({fetchStatus: {phase: 'plate', text: `\u4e2a\u80a1 ${selfData.length} \u53ea\uff0c\u6b63\u5728\u62c9\u53d6\u95ee\u8d22\u677f\u5757\u2026`}});
                const newPlateMap = await getWencaiPlate();
                const newPlateData = Array.from(newPlateMap.values());
                const filteredPlateData = SHOW_WENCAI_PLATE ? newPlateData : newPlateData.filter(group => Number(group.id) > 0);
                const newData = [{id: 0, name: '\u81ea\u9009\u80a1', items: selfData, open: true}, ...filteredPlateData];
                const saveData = mergePlateData(Store.getState().plateData, newData);
                cachePlateData(saveData);
                Store.setState({isLogin: true, plateData: saveData, fetchStatus: {phase: 'done', text: `\u5df2\u62c9\u53d6 ${selfData.length} \u53ea\u4e2a\u80a1\u3001${filteredPlateData.length} \u4e2a\u95ee\u8d22\u677f\u5757`}});
                window.setTimeout(() => {
                    if (Store.getState().fetchStatus?.phase == 'done') Store.setState({fetchStatus: null});
                }, 2500);
                marketScheduler.tick(true);
            } catch (err) {
                console.warn('[tvhelper] plate update failed', err);
                Store.setState({fetchStatus: {phase: 'error', text: '\u62c9\u53d6\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5'}});
            } finally {
                Store.setState({onRefresh: false});
            }
        }

        function pinPlate(index) {
            if (index < 2) return;
            const current = Store.getState().plateData;
            const newPlate = [...current];
            const [plate] = newPlate.splice(index, 1);
            newPlate.splice(1, 0, plate);
            cachePlateData(newPlate);
            Store.setState({plateData: newPlate});
        }

        function syncPlateOpen(groupId, e) {
            const isOpen = e.currentTarget.open;
            marketScheduler.setActivePlate(groupId);
            if (Store.getState().activeTab == 'local') {
                const nextPlates = Store.getState().localPlates.map(group => group.id == groupId ? {...group, open: isOpen} : group);
                cacheLocalPlates(nextPlates);
                Store.setState({localPlates: nextPlates});
                if (isOpen) marketScheduler.tick(true);
                return;
            }
            const current = Store.getState().plateData;
            const nextData = current.map(group => group.id == groupId ? {...group, open: isOpen} : group);
            cachePlateData(nextData);
            Store.setState({plateData: nextData});
            if (isOpen) marketScheduler.tick(true);
        }

        function setActiveTab(tab) {
            if (Store.getState().activeTab == tab) return;
            setFavoritePicker(null);
            setImportDialog(null);
            setPlateDialog(null);
            setAlertDialog(null);
            setToolsDialog(null);
            setHeaderMenuOpen(false);
            setPlateMenuId(null);
            Store.setState({activeTab: tab});
            marketScheduler.setActivePlate(null);
        }

        function setLimitView(view) {
            if (limitBoard.view == view) return;
            setLimitBoard(prev => ({...prev, view, selectedCode: null, error: ''}));
            // force reload path via effect when target view not loaded yet
        }

        function selectLimitBlock(code) {
            setLimitBoard(prev => ({...prev, selectedCode: code}));
        }

        function backLimitBlocks() {
            setLimitBoard(prev => ({...prev, selectedCode: null}));
        }

        function loadMoreOpenLimit() {
            if (limitBoard.loading) return;
            if ((limitBoard.openList || []).length >= (limitBoard.openTotal || 0)) return;
            loadLimitBoard({force: true, page: (limitBoard.openPage || 1) + 1, view: 'open'});
        }

        useEffect(() => {
            if (state.activeTab != 'limit' || limitBoard.view != 'open') return;
            const root = document.querySelector('#tvhelper .card-content.limit-board');
            if (!root) return;
            let ticking = false;
            const onScroll = () => {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => {
                    ticking = false;
                    if (limitBoard.loading) return;
                    const loaded = (limitBoard.openList || []).length;
                    const total = limitBoard.openTotal || 0;
                    if (!total || loaded >= total) return;
                    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 100) {
                        loadMoreOpenLimit();
                    }
                });
            };
            root.addEventListener('scroll', onScroll, {passive: true});
            // auto fill if first page shorter than viewport
            onScroll();
            return () => root.removeEventListener('scroll', onScroll);
        }, [state.activeTab, limitBoard.view, limitBoard.loading, limitBoard.openList.length, limitBoard.openTotal, limitBoard.openPage]);

        function toggleHeaderMenu(e) {
            e.preventDefault();
            e.stopPropagation();
            setFavoritePicker(null);
            setPlateMenuId(null);
            setHeaderMenuOpen(prev => !prev);
        }

        function togglePlateMenu(groupId, e) {
            e.preventDefault();
            e.stopPropagation();
            setFavoritePicker(null);
            setHeaderMenuOpen(false);
            setPlateMenuId(prev => prev == groupId ? null : groupId);
        }

        function setListFilter(filter) {
            lscache.set('listFilter', filter, 1e15);
            Store.setState({listFilter: filter});
        }

        function openAlertDialog(e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            setFavoritePicker(null);
            setImportDialog(null);
            setPlateDialog(null);
            setToolsDialog(null);
            setHeaderMenuOpen(false);
            setPlateMenuId(null);
            setAlertDialog({...Store.getState().alertConfig});
        }

        function closeAlertDialog(e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            setAlertDialog(null);
        }

        function confirmAlertDialog(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!alertDialog) return;
            const next = {
                enabled: !!alertDialog.enabled,
                threshold: Math.max(0.5, Math.min(20, Number(alertDialog.threshold) || DEFAULT_ALERT_CONFIG.threshold)),
                sound: alertDialog.sound !== false
            };
            cacheAlertConfig(next);
            Store.setState({alertConfig: next});
            setAlertDialog(null);
            pushToast({kind: next.enabled ? 'up' : 'flat', title: next.enabled ? `\u63d0\u9192\u5df2\u5f00\u542f ${next.threshold}%` : '\u63d0\u9192\u5df2\u5173\u95ed', sub: '\u4ec5\u76d1\u63a7\u5f53\u524d\u5c55\u5f00\u677f\u5757\u7684\u884c\u60c5'});
        }

        function exportLocalBackup() {
            const current = Store.getState();
            const payload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                plates: current.localPlates.map(plate => ({
                    id: plate.id,
                    name: plate.name,
                    items: plate.items || [],
                    open: plate.open !== false,
                    sortDir: plate.sortDir == 'desc' ? 'desc' : 'asc'
                }))
            };
            downloadTextFile(`tvhelper-local-${getNow(1000)}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
            pushToast({kind: 'up', title: '\u5df2\u5bfc\u51fa JSON \u5907\u4efd', sub: `${payload.plates.length} \u4e2a\u677f\u5757`});
        }

        function exportLocalCsv() {
            const current = Store.getState();
            const rows = [['plate', 'code', 'id', 'name']];
            current.localPlates.forEach(plate => {
                (plate.items || []).forEach(stockId => {
                    const marketId = toMarketDataId(stockId);
                    const name = current.stockInfo[marketId]?.name || current.marketData[marketId]?.name || '';
                    rows.push([plate.name, stockId.slice(2), stockId, name]);
                });
            });
            const csv = rows.map(cols => cols.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
            downloadTextFile(`tvhelper-local-${getNow(1000)}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8');
            pushToast({kind: 'up', title: '\u5df2\u5bfc\u51fa CSV', sub: `${rows.length - 1} \u53ea\u80a1\u7968`});
        }

        function exportPlate(groupId, e) {
            e.preventDefault();
            e.stopPropagation();
            setPlateMenuId(null);
            const current = Store.getState();
            const plate = current.localPlates.find(group => group.id == groupId);
            if (!plate) return;
            const lines = (plate.items || []).map(stockId => {
                const marketId = toMarketDataId(stockId);
                const name = current.stockInfo[marketId]?.name || current.marketData[marketId]?.name || '';
                return `${stockId.slice(2)}\t${name}`;
            });
            downloadTextFile(`${plate.name || 'plate'}-${getNow(1000)}.txt`, lines.join('\n'), 'text/plain;charset=utf-8');
            pushToast({kind: 'up', title: `\u5df2\u5bfc\u51fa ${plate.name}`, sub: `${(plate.items || []).length} \u53ea\u80a1\u7968`});
        }

        function openToolsDialog(e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            setFavoritePicker(null);
            setImportDialog(null);
            setPlateDialog(null);
            setAlertDialog(null);
            setHeaderMenuOpen(false);
            setPlateMenuId(null);
            setToolsDialog({mode: 'menu', input: '', error: ''});
        }

        function runHeaderAction(action, e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            setHeaderMenuOpen(false);
            if (action == 'create') return createLocalPlate(e);
            if (action == 'export-json') return exportLocalBackup();
            if (action == 'export-csv') return exportLocalCsv();
            if (action == 'import-json') return openJsonImport(e);
            if (action == 'alert') return openAlertDialog(e);
            if (action == 'tools') return openToolsDialog(e);
        }

        function closeToolsDialog(e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            setToolsDialog(null);
        }

        function openJsonImport(e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            setToolsDialog({mode: 'json-import', input: '', error: ''});
        }

        function confirmJsonImport(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!toolsDialog) return;
            try {
                const raw = String(toolsDialog.input || '').trim();
                if (!raw) {
                    setToolsDialog(prev => prev ? {...prev, error: '\u8bf7\u7c98\u8d34 JSON \u5907\u4efd\u5185\u5bb9'} : prev);
                    return;
                }
                const data = JSON.parse(raw);
                const platesRaw = Array.isArray(data) ? data : data.plates;
                if (!Array.isArray(platesRaw) || platesRaw.length == 0) {
                    setToolsDialog(prev => prev ? {...prev, error: '\u5907\u4efd\u4e2d\u6ca1\u6709\u677f\u5757\u6570\u636e'} : prev);
                    return;
                }
                const nextPlates = platesRaw.map((plate, index) => normalizeLocalPlate({
                    id: plate.id,
                    name: plate.name,
                    items: Array.isArray(plate.items) ? plate.items : [],
                    open: plate.open !== false,
                    sortDir: plate.sortDir
                }, index));
                cacheLocalPlates(nextPlates);
                Store.setState({localPlates: nextPlates, activeTab: 'local'});
                setToolsDialog(null);
                marketScheduler.tick(true);
                pushToast({kind: 'up', title: '\u5df2\u5bfc\u5165 JSON \u5907\u4efd', sub: `${nextPlates.length} \u4e2a\u677f\u5757`});
            } catch (err) {
                setToolsDialog(prev => prev ? {...prev, error: '\u89e3\u6790\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5 JSON \u683c\u5f0f'} : prev);
            }
        }

        function onToolsInput(e) {
            const value = e.currentTarget.value;
            setToolsDialog(prev => prev ? {...prev, input: value, error: ''} : prev);
        }

        function onAlertThresholdInput(e) {
            const value = e.currentTarget.value;
            setAlertDialog(prev => prev ? {...prev, threshold: value} : prev);
        }

        function ensureLocalPlates() {
            let plates = Store.getState().localPlates;
            if (plates.length > 0) return plates;
            plates = [normalizeLocalPlate({id: LOCAL_DEFAULT_PLATE_ID, name: '\u81ea\u9009', items: []})];
            cacheLocalPlates(plates);
            Store.setState({localPlates: plates});
            return plates;
        }

        function applyLocalFavorite(stockId, targetPlateId) {
            if (!targetPlateId) return;
            const currentState = Store.getState();
            const nextPlates = currentState.localPlates.map(plate => {
                if (plate.id != targetPlateId) return plate;
                const exists = (plate.items || []).includes(stockId);
                const items = exists ? plate.items.filter(id => id != stockId) : _.uniq([...(plate.items || []), stockId]);
                return {...plate, items};
            });
            cacheLocalPlates(nextPlates);
            Store.setState({localPlates: nextPlates});
            if (Store.getState().activeTab == 'local') marketScheduler.tick(true);
        }

        function openFavoritePicker(stockId, groupId) {
            ensureLocalPlates();
            setFavoritePicker(prev => (
                prev?.stockId == stockId && prev?.groupId == groupId ? null : {stockId, groupId}
            ));
        }

        function toggleLocalFavorite(stockId, groupId, e) {
            e.preventDefault();
            e.stopPropagation();
            const currentState = Store.getState();
            const isJoinedLocal = currentState.localPlates.some(group => (group.items || []).includes(stockId));
            if (currentState.activeTab != 'local' || isJoinedLocal) {
                openFavoritePicker(stockId, groupId);
                return;
            }
            applyLocalFavorite(stockId, groupId);
        }

        function toggleFavoritePlate(stockId, plateId, e) {
            e.preventDefault();
            e.stopPropagation();
            applyLocalFavorite(stockId, plateId);
        }
        function closeFavoritePicker(e) {
            e.preventDefault();
            e.stopPropagation();
            setFavoritePicker(null);
        }

        function sortStockIdsByChange(items, marketData, direction = 'desc') {
            const order = direction == 'asc' ? 1 : -1;
            return (items || [])
                .map((stockId, index) => ({stockId, index}))
                .sort((a, b) => {
                    const aRate = Number(marketData[toMarketDataId(a.stockId)]?.change_rate);
                    const bRate = Number(marketData[toMarketDataId(b.stockId)]?.change_rate);
                    const aHasValue = Number.isFinite(aRate);
                    const bHasValue = Number.isFinite(bRate);
                    if (aHasValue != bHasValue) return aHasValue ? -1 : 1;
                    if (!aHasValue && !bHasValue) return a.index - b.index;
                    return (aRate - bRate) * order || a.index - b.index;
                })
                .map(item => item.stockId);
        }

        function sortPlateByChange(groupId, e) {
            e.preventDefault();
            e.stopPropagation();
            const currentState = Store.getState();
            if (currentState.activeTab == 'local') {
                const nextPlates = currentState.localPlates.map(group => {
                    if (group.id != groupId) return group;
                    const sortDir = group.sortDir == 'desc' ? 'asc' : 'desc';
                    return {...group, sortDir, items: sortStockIdsByChange(group.items, currentState.marketData, sortDir)};
                });
                cacheLocalPlates(nextPlates);
                Store.setState({localPlates: nextPlates});
                return;
            }
            const nextPlateData = currentState.plateData.map(group => {
                if (group.id != groupId) return group;
                const sortDir = group.sortDir == 'desc' ? 'asc' : 'desc';
                return {...group, sortDir, items: sortStockIdsByChange(group.items, currentState.marketData, sortDir)};
            });
            cachePlateData(nextPlateData);
            Store.setState({plateData: nextPlateData});
        }


        function openImportDialog(groupId, e) {
            e.preventDefault();
            e.stopPropagation();
            setFavoritePicker(null);
            setAlertDialog(null);
            setToolsDialog(null);
            setHeaderMenuOpen(false);
            setPlateMenuId(null);
            setImportDialog({groupId, input: '', matches: null, unmatched: [], loading: false, error: '', mode: 'text'});
        }

        function closeImportDialog(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            setImportDialog(null);
        }

        async function matchImportDialog(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!importDialog) return;
            const {parsed, queries} = parseImportStockLines(importDialog.input);
            if (parsed.length == 0 && queries.length == 0) {
                setImportDialog(prev => prev ? {...prev, matches: [], unmatched: [], error: '\u672a\u8bc6\u522b\u5230\u6709\u6548\u80a1\u7968\u4ee3\u7801\u6216\u540d\u79f0'} : prev);
                return;
            }
            setImportDialog(prev => prev ? {...prev, loading: true, error: ''} : prev);
            try {
                const failed = [];
                const seen = new Set(parsed.map(item => item.id));
                const resolvedByName = await Promise.all(queries.map(async item => {
                    const symbols = await gtSuggest(item.raw);
                    const best = pickImportSuggestStock(item.raw, symbols);
                    if (!best) return null;
                    if (seen.has(best.id)) return {duplicate: true};
                    seen.add(best.id);
                    return {
                        raw: item.raw,
                        id: best.id,
                        marketId: toMarketDataId(best.id),
                        code: best.id.slice(2),
                        suggestName: best.description
                    };
                }));
                queries.forEach((item, index) => {
                    if (!resolvedByName[index]) failed.push(item.raw);
                });
                const allParsed = [...parsed, ...resolvedByName.filter(item => item?.id)];
                if (allParsed.length == 0) {
                    setImportDialog(prev => prev ? {...prev, matches: [], unmatched: failed, loading: false, error: '\u6ca1\u6709\u5339\u914d\u5230\u53ef\u5bfc\u5165\u7684\u80a1\u7968'} : prev);
                    return;
                }
                const passData = await getRealtimeBasic(...allParsed.map(item => item.id));
                const currentState = Store.getState();
                const targetPlate = currentState.localPlates.find(group => group.id == importDialog.groupId);
                const targetItems = targetPlate?.items || [];
                const matched = [];
                let nextStockInfo = currentState.stockInfo;
                allParsed.forEach(item => {
                    const quote = passData[item.marketId] || passData[item.id];
                    const name = quote?.name || item.suggestName || currentState.stockInfo[item.marketId]?.name;
                    if (!name) {
                        failed.push(item.raw);
                        return;
                    }
                    matched.push({...item, name, exists: targetItems.includes(item.id)});
                    if (!currentState.stockInfo[item.marketId]?.name) {
                        if (nextStockInfo === currentState.stockInfo) nextStockInfo = {...currentState.stockInfo};
                        nextStockInfo[item.marketId] = {name};
                    }
                });
                if (nextStockInfo !== currentState.stockInfo) {
                    cacheStockInfo(nextStockInfo);
                    Store.setState({stockInfo: nextStockInfo});
                }
                setImportDialog(prev => prev ? {...prev, matches: matched, unmatched: failed, loading: false, error: ''} : prev);
            } catch (err) {
                console.warn('[tvhelper] import match failed', err);
                setImportDialog(prev => prev ? {...prev, loading: false, error: '\u5339\u914d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5'} : prev);
            }
        }

        function confirmImportDialog(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!importDialog?.groupId || !importDialog.matches?.length) return;
            const importIds = importDialog.matches.map(item => item.id);
            const current = Store.getState().localPlates;
            const nextPlates = current.map(group => {
                if (group.id != importDialog.groupId) return group;
                return {...group, items: _.uniq([...(group.items || []), ...importIds]), open: true};
            });
            cacheLocalPlates(nextPlates);
            Store.setState({localPlates: nextPlates, activeTab: 'local'});
            setImportDialog(null);
            marketScheduler.tick(true);
            pushToast({kind: 'up', title: '\u5bfc\u5165\u5b8c\u6210', sub: `${importIds.length} \u53ea\u80a1\u7968`});
        }

        function openPlateDialog(nextDialog, e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            setFavoritePicker(null);
            setImportDialog(null);
            setAlertDialog(null);
            setToolsDialog(null);
            setPlateDialog({...nextDialog, error: ''});
        }

        function closePlateDialog(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            setPlateDialog(null);
        }

        function createLocalPlate(e) {
            openPlateDialog({mode: 'create', title: '\u65b0\u5efa\u81ea\u9009\u677f\u5757', value: '\u65b0\u81ea\u9009'}, e);
        }

        function renameLocalPlate(groupId, e) {
            setPlateMenuId(null);
            const current = Store.getState().localPlates;
            const plate = current.find(group => group.id == groupId);
            if (!plate) return;
            openPlateDialog({mode: 'rename', groupId, title: '\u91cd\u547d\u540d\u677f\u5757', value: plate.name}, e);
        }

        function deleteLocalPlate(groupId, e) {
            setPlateMenuId(null);
            const current = Store.getState().localPlates;
            const plate = current.find(group => group.id == groupId);
            if (!plate) return;
            openPlateDialog({
                mode: 'delete',
                groupId,
                title: '\u5220\u9664\u677f\u5757',
                message: `\u5220\u9664\u81ea\u9009\u677f\u5757\u300c${plate.name}\u300d?`
            }, e);
        }

        function confirmPlateDialog(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!plateDialog) return;
            const current = Store.getState().localPlates;
            if (plateDialog.mode == 'delete') {
                let nextPlates = current.filter(group => group.id != plateDialog.groupId);
                if (nextPlates.length == 0) nextPlates = [normalizeLocalPlate({id: LOCAL_DEFAULT_PLATE_ID, name: '\u81ea\u9009', items: []})];
                cacheLocalPlates(nextPlates);
                Store.setState({localPlates: nextPlates});
                setPlateDialog(null);
                return;
            }
            const name = String(plateDialog.value || '').trim();
            if (!name) {
                setPlateDialog(prev => prev ? {...prev, error: '\u8bf7\u8f93\u5165\u677f\u5757\u540d\u79f0'} : prev);
                return;
            }
            if (plateDialog.mode == 'create') {
                const nextPlates = [...current, normalizeLocalPlate({id: createLocalPlateId(), name, items: [], open: true})];
                cacheLocalPlates(nextPlates);
                Store.setState({localPlates: nextPlates, activeTab: 'local'});
                setPlateDialog(null);
                return;
            }
            if (plateDialog.mode == 'rename') {
                const nextPlates = current.map(group => group.id == plateDialog.groupId ? {...group, name} : group);
                cacheLocalPlates(nextPlates);
                Store.setState({localPlates: nextPlates});
                setPlateDialog(null);
            }
        }

        function pinPlateEvent(index, e) {
            e.preventDefault();
            e.stopPropagation();
            pinPlate(index);
        }
        function onImportInput(e) {
            const value = e.currentTarget.value;
            setImportDialog(prev => prev ? {...prev, input: value, matches: null, unmatched: [], error: ''} : prev);
        }
        function onPlateNameInput(e) {
            const value = e.currentTarget.value;
            setPlateDialog(prev => prev ? {...prev, value, error: ''} : prev);
        }
        const isLimitTab = state.activeTab == 'limit';
        const localFavoriteSet = new Set(_.uniq(_.flatten(state.localPlates.map(group => group.items || []))));
        const visibleGroups = state.activeTab == 'local' ? state.localPlates : state.plateData;
        const allStockIds = _.uniq(_.flatten(visibleGroups.map(group => group.items || [])));
        const filteredStockIds = filterStockIds(allStockIds, state.marketData, state.listFilter);
        const stockCount = allStockIds.length;
        const importPlate = importDialog ? state.localPlates.find(group => group.id == importDialog.groupId) : null;
        const closePanel = () => hideDockPanel();
        const filterOptions = [
            {id: 'all', label: '\u5168\u90e8'},
            {id: 'up', label: '\u6da8'},
            {id: 'down', label: '\u8dcc'},
            {id: 'flat', label: '\u5e73'},
            {id: 'halt', label: '\u505c\u724c'}
        ];
        const selectedLimitBlock = isLimitTab && limitBoard.selectedCode
            ? (limitBoard.blocks || []).find(b => b.code == limitBoard.selectedCode)
            : null;
        const limitHeaderSub = isLimitTab
            ? (limitBoard.date
                ? `${fmtYmd(limitBoard.date)}${limitBoard.view == 'open'
                    ? ` \u00b7 \u70b8\u677f ${limitBoard.openList.length}/${limitBoard.openTotal || limitBoard.openList.length}`
                    : (selectedLimitBlock
                        ? ` \u00b7 ${selectedLimitBlock.name} ${selectedLimitBlock.stocks.length}\u53ea`
                        : ` \u00b7 \u677f\u5757 ${limitBoard.blocks.length}`)}`
                : '\u6da8\u505c\u677f')
            : `${visibleGroups.length} \u7ec4 \u00b7 ${state.listFilter == 'all' ? stockCount : `${filteredStockIds.length}/${stockCount}`}`;
        const limitRefreshing = isLimitTab && limitBoard.loading;

        return html`
        <div class="card">
          <header class="card-header">
            <p class="card-header-title">
              <span class="tvhelper-title-main">${isLimitTab ? '\u6da8\u505c\u677f' : '\u540c\u82b1\u987a'}</span>
              <span class="tvhelper-title-sub">${limitHeaderSub}</span>
              ${!isLimitTab && state.fetchStatus && html`
                <span class="tvhelper-fetch-status ${state.fetchStatus.phase == 'error' ? 'is-error' : ''}" title=${state.fetchStatus.text}>
                  <span class="tvhelper-fetch-dot"></span>${state.fetchStatus.text}
                </span>
              `}
            </p>
            <span class="card-header-icon">
              ${!isLimitTab && html`
                <button class="header-icon-btn ${state.alertConfig?.enabled ? 'is-active' : ''}" type="button" title="\u6da8\u8dcc\u5e45\u63d0\u9192" onclick=${openAlertDialog}>
                  <svg><use xlink:href="#notifications-outline"/></svg>
                </button>
              `}
              <span class="overflow-wrap">
                <button class="header-icon-btn ${headerMenuOpen ? 'is-active' : ''}" type="button" title="\u66f4\u591a" onclick=${toggleHeaderMenu}>
                  <svg><use xlink:href="#ellipsis-horizontal"/></svg>
                </button>
                ${headerMenuOpen && html`
                  <div class="overflow-menu" onclick=${(e) => { e.preventDefault(); e.stopPropagation(); }}>
                    ${state.activeTab == 'local' && html`<button class="overflow-menu-item" type="button" onclick=${(e) => runHeaderAction('create', e)}><svg><use xlink:href="#add-circle-outline"/></svg>\u65b0\u5efa\u677f\u5757</button>`}
                    ${state.activeTab == 'local' && html`<button class="overflow-menu-item" type="button" onclick=${(e) => runHeaderAction('export-json', e)}><svg><use xlink:href="#export-outline"/></svg>\u5bfc\u51fa JSON</button>`}
                    ${state.activeTab == 'local' && html`<button class="overflow-menu-item" type="button" onclick=${(e) => runHeaderAction('export-csv', e)}><svg><use xlink:href="#export-outline"/></svg>\u5bfc\u51fa CSV</button>`}
                    ${state.activeTab == 'local' && html`<button class="overflow-menu-item" type="button" onclick=${(e) => runHeaderAction('import-json', e)}><svg><use xlink:href="#import-outline"/></svg>\u5bfc\u5165\u5907\u4efd</button>`}
                    ${!isLimitTab && html`<button class="overflow-menu-item" type="button" onclick=${(e) => runHeaderAction('alert', e)}><svg><use xlink:href="#notifications-outline"/></svg>\u63d0\u9192\u8bbe\u7f6e</button>`}
                    <button class="overflow-menu-item" type="button" onclick=${updatePlateData}><svg><use xlink:href="#refresh-outline"/></svg>\u5237\u65b0</button>
                  </div>
                `}
              </span>
              <button class="header-icon-btn ${state.onRefresh || limitRefreshing ? 'disabled' : ''}" type="button" title="\u5237\u65b0" onclick=${updatePlateData}>
                <svg><use xlink:href="#refresh-outline"/></svg>
              </button>
              <button class="tvhelper-close" title="\u6536\u8d77\u9762\u677f" onclick=${closePanel}>\u00d7</button>
            </span>
          </header>
          <div class="tvhelper-tabs">
            <button class="tvhelper-tab ${state.activeTab == 'ths' ? 'is-active' : ''}" type="button" onclick=${() => setActiveTab('ths')}>\u540c\u82b1\u987a</button>
            <button class="tvhelper-tab ${state.activeTab == 'local' ? 'is-active' : ''}" type="button" onclick=${() => setActiveTab('local')}>\u81ea\u9009</button>
            <button class="tvhelper-tab ${state.activeTab == 'limit' ? 'is-active' : ''}" type="button" onclick=${() => setActiveTab('limit')}>\u6da8\u505c</button>
          </div>
          ${isLimitTab ? html`
            <div class="limit-toolbar">
              ${selectedLimitBlock
                ? html`<button class="limit-back" type="button" onclick=${backLimitBlocks}>\u2190 \u8fd4\u56de</button>
                       <span class="limit-name" style="font-weight:600">${selectedLimitBlock.name}</span>`
                : html`
                  <div class="limit-tab-switch">
                    <button class="limit-tab-btn ${limitBoard.view == 'block' ? 'is-active' : ''}" type="button" onclick=${() => setLimitView('block')}>\u677f\u5757\u6392\u884c</button>
                    <button class="limit-tab-btn ${limitBoard.view == 'open' ? 'is-active' : ''}" type="button" onclick=${() => setLimitView('open')}>\u70b8\u677f</button>
                  </div>
                `}
              <span class="limit-meta">${limitBoard.loading ? '\u52a0\u8f7d\u4e2d\u2026' : (
                  selectedLimitBlock
                    ? `${selectedLimitBlock.stocks.length}\u53ea`
                    : (limitBoard.view == 'open'
                        ? `${limitBoard.openList.length}/${limitBoard.openTotal || limitBoard.openList.length}\u53ea`
                        : `${limitBoard.blocks.length}\u4e2a\u677f\u5757`)
              )}${limitBoard.date ? ` \u00b7 ${fmtYmd(limitBoard.date)}` : ''}</span>
            </div>
          ` : html`
            <div class="tvhelper-toolbar">
              ${filterOptions.map(opt => html`
                <button class="tvhelper-chip ${state.listFilter == opt.id ? 'is-active' : ''}" data-filter=${opt.id} type="button" onclick=${() => setListFilter(opt.id)}>${opt.label}</button>
              `)}
            </div>
          `}
          <div class="card-content ${isLimitTab ? 'limit-board' : ''}">
            ${isLimitTab ? html`
              ${limitBoard.error && html`
                <div class="limit-msg is-error">
                  ${limitBoard.error}
                  <div class="limit-page">
                    <button class="limit-more" type="button" onclick=${() => loadLimitBoard({force: true, page: 1, view: limitBoard.view})}>\u91cd\u8bd5</button>
                  </div>
                </div>
              `}
              ${!limitBoard.error && limitBoard.loading && ((limitBoard.view == 'block' && !limitBoard.blockLoaded) || (limitBoard.view == 'open' && !limitBoard.openLoaded)) && html`<div class="limit-msg is-loading">\u52a0\u8f7d\u4e2d\u2026</div>`}
              ${!limitBoard.error && limitBoard.view == 'block' && limitBoard.blockLoaded && !selectedLimitBlock && html`
                <${LimitBlockList} blocks=${limitBoard.blocks} selectedCode=${limitBoard.selectedCode} onSelect=${selectLimitBlock} />
              `}
              ${!limitBoard.error && limitBoard.view == 'block' && selectedLimitBlock && html`
                <${LimitStockList}
                  stocks=${selectedLimitBlock.stocks}
                  mode="block"
                  curSymbolTv=${state.curSymbolTv}
                  emptyText="\u8be5\u677f\u5757\u65e0\u6da8\u505c\u4e2a\u80a1"
                  onSelect=${updateTvSymbol}
                />
              `}
              ${!limitBoard.error && limitBoard.view == 'open' && limitBoard.openLoaded && html`
                <${LimitStockList}
                  stocks=${limitBoard.openList}
                  mode="open"
                  curSymbolTv=${state.curSymbolTv}
                  emptyText="\u5f53\u65e5\u65e0\u70b8\u677f\u6570\u636e"
                  onSelect=${updateTvSymbol}
                  hasMore=${(limitBoard.openList || []).length < (limitBoard.openTotal || 0)}
                  loadingMore=${limitBoard.loading && (limitBoard.openList || []).length > 0}
                />
              `}
            ` : html`
              <div class="notification is-warning" style="display: ${!state.isLogin ? 'block' : 'none'};">
                \u672a\u767b\u5f55\uff0c
                <a
                  href="https://www.10jqka.com.cn/"
                  title="\u5982\u679c\u65e0\u6cd5\u52a0\u8f7d\u81ea\u9009\u677f\u5757\uff0c\u8bf7\u767b\u5f55\u540c\u82b1\u987a\u540e\u518d\u5237\u65b0"
                  rel="noopener noreferrer"
                  target="_blank">\u5230\u540c\u82b1\u987a\u5b98\u7f51\u767b\u5f55</a>
              </div>
              <aside class="menu">
                ${visibleGroups.map((group, groupIndex) => html`<${Plate}
                    key=${group.id}
                    group=${group}
                    groupIndex=${groupIndex}
                    marketData=${state.marketData}
                    stockInfo=${state.stockInfo}
                    listFilter=${state.listFilter}
                    localFavoriteSet=${localFavoriteSet}
                    localPlates=${state.localPlates}
                    favoritePicker=${favoritePicker}
                    plateMenuId=${plateMenuId}
                    isLocalTab=${state.activeTab == 'local'}
                    curSymbolTv=${state.curSymbolTv}
                    onSelectStock=${updateTvSymbol}
                    onToggleFavorite=${toggleLocalFavorite}
                    onToggleFavoritePlate=${toggleFavoritePlate}
                    onCloseFavoritePicker=${closeFavoritePicker}
                    onTogglePlate=${syncPlateOpen}
                    onPinPlate=${pinPlateEvent}
                    onSortPlate=${sortPlateByChange}
                    onTogglePlateMenu=${togglePlateMenu}
                    onExportPlate=${exportPlate}
                    onImportPlate=${openImportDialog}
                    onRenamePlate=${renameLocalPlate}
                    onDeletePlate=${deleteLocalPlate}
                />`)}
              </aside>
            `}
          </div>
          ${(state.toasts || []).length > 0 && html`
            <div class="tvhelper-toasts">
              ${state.toasts.map(toast => html`
                <div class="tvhelper-toast ${toast.kind == 'up' ? 'is-up' : (toast.kind == 'down' ? 'is-down' : '')}" key=${toast.id}>
                  <div class="tvhelper-toast-title">${toast.title}</div>
                  ${toast.sub && html`<div class="tvhelper-toast-sub">${toast.sub}</div>`}
                </div>
              `)}
            </div>
          `}
          ${importDialog && html`
            <div class="import-dialog-backdrop" onclick=${closeImportDialog}>
              <section class="import-dialog" onclick=${(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <header class="import-dialog-header">
                  <span class="import-dialog-title">\u5bfc\u5165\u5230 ${importPlate?.name || '\u81ea\u9009'}</span>
                  <button class="import-dialog-close" type="button" title="\u5173\u95ed" onclick=${closeImportDialog}>×</button>
                </header>
                <div class="import-dialog-body">
                  <textarea
                    value=${importDialog.input}
                    placeholder="600000\n000001\n300750\n\u8d35\u5dde\u8305\u53f0"
                    oninput=${onImportInput}></textarea>
                  <div class="import-dialog-hint">\u4e00\u884c\u4e00\u4e2a\u4ee3\u7801/\u540d\u79f0\uff1b\u652f\u6301 600000\u3001sh600000\u3001600000.SH\u3001code,name\u3001\u4ee5\u53ca JSON \u5907\u4efd\u7c98\u8d34</div>
                  ${importDialog.error && html`<div class="import-dialog-error">${importDialog.error}</div>`}
                  ${importDialog.matches && html`
                    <div class="import-match-list">
                      ${importDialog.matches.length == 0 && html`<div class="import-dialog-empty">\u6ca1\u6709\u5339\u914d\u5230\u53ef\u5bfc\u5165\u7684\u80a1\u7968</div>`}
                      ${importDialog.matches.map(item => html`
                        <div class="import-match-row">
                          <span class="import-match-code">${item.code}</span>
                          <span class="import-match-name" title=${item.name}>${item.name}${item.exists ? ' \u00b7 \u5df2\u5728\u677f\u5757' : ''}</span>
                        </div>`)}
                    </div>`}
                  ${importDialog.unmatched?.length > 0 && html`<div class="import-dialog-error">\u672a\u5339\u914d\uff1a${importDialog.unmatched.join('\u3001')}</div>`}
                </div>
                <footer class="import-dialog-footer">
                  <button class="import-dialog-button" type="button" onclick=${closeImportDialog}>\u653e\u5f03</button>
                  <button class="import-dialog-button" type="button" disabled=${importDialog.loading} onclick=${matchImportDialog}>${importDialog.loading ? '\u5339\u914d\u4e2d' : '\u5339\u914d'}</button>
                  <button class="import-dialog-button is-primary" type="button" disabled=${importDialog.loading || !importDialog.matches?.length} onclick=${confirmImportDialog}>\u786e\u8ba4\u5bfc\u5165</button>
                </footer>
              </section>
            </div>`}
          ${plateDialog && html`
            <div class="import-dialog-backdrop" onclick=${closePlateDialog}>
              <section class="import-dialog" onclick=${(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <header class="import-dialog-header">
                  <span class="import-dialog-title">${plateDialog.title}</span>
                  <button class="import-dialog-close" type="button" title="\u5173\u95ed" onclick=${closePlateDialog}>${'\u00d7'}</button>
                </header>
                <div class="import-dialog-body">
                  ${plateDialog.mode == 'delete'
                    ? html`<div class="import-dialog-message">${plateDialog.message}</div>`
                    : html`<input
                        value=${plateDialog.value || ''}
                        oninput=${onPlateNameInput}
                        onkeydown=${(e) => { if (e.key == 'Enter') confirmPlateDialog(e); if (e.key == 'Escape') closePlateDialog(e); }} />`}
                  ${plateDialog.error && html`<div class="import-dialog-error">${plateDialog.error}</div>`}
                </div>
                <footer class="import-dialog-footer">
                  <button class="import-dialog-button" type="button" onclick=${closePlateDialog}>\u653e\u5f03</button>
                  <button class="import-dialog-button is-primary" type="button" onclick=${confirmPlateDialog}>${plateDialog.mode == 'delete' ? '\u5220\u9664' : '\u786e\u8ba4'}</button>
                </footer>
              </section>
            </div>`}
          ${alertDialog && html`
            <div class="import-dialog-backdrop" onclick=${closeAlertDialog}>
              <section class="import-dialog" onclick=${(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <header class="import-dialog-header">
                  <span class="import-dialog-title">\u6da8\u8dcc\u5e45\u63d0\u9192</span>
                  <button class="import-dialog-close" type="button" title="\u5173\u95ed" onclick=${closeAlertDialog}>${'\u00d7'}</button>
                </header>
                <div class="import-dialog-body">
                  <div class="alert-row">
                    <label><input type="checkbox" checked=${!!alertDialog.enabled} onchange=${(e) => setAlertDialog(prev => prev ? {...prev, enabled: e.currentTarget.checked} : prev)} /> \u5f00\u542f\u63d0\u9192</label>
                  </div>
                  <div class="alert-row">
                    <span>\u9608\u503c |%\u2223</span>
                    <input type="number" min="0.5" max="20" step="0.5" value=${alertDialog.threshold} oninput=${onAlertThresholdInput} />
                  </div>
                  <div class="alert-row">
                    <label><input type="checkbox" checked=${alertDialog.sound !== false} onchange=${(e) => setAlertDialog(prev => prev ? {...prev, sound: e.currentTarget.checked} : prev)} /> \u63d0\u793a\u97f3</label>
                  </div>
                  <div class="import-dialog-hint">\u5f53\u5c55\u5f00\u677f\u5757\u4e2d\u80a1\u7968\u6da8\u8dcc\u5e45\u7a7f\u8d8a\u9608\u503c\u65f6\u5f39\u51fa Toast\uff08\u540c\u4e00\u6807\u7684 5 \u5206\u949f\u51b7\u5374\uff09</div>
                </div>
                <footer class="import-dialog-footer">
                  <button class="import-dialog-button" type="button" onclick=${closeAlertDialog}>\u53d6\u6d88</button>
                  <button class="import-dialog-button is-primary" type="button" onclick=${confirmAlertDialog}>\u4fdd\u5b58</button>
                </footer>
              </section>
            </div>`}
          ${toolsDialog && html`
            <div class="import-dialog-backdrop" onclick=${closeToolsDialog}>
              <section class="import-dialog" onclick=${(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <header class="import-dialog-header">
                  <span class="import-dialog-title">${toolsDialog.mode == 'json-import' ? '\u5bfc\u5165 JSON \u5907\u4efd' : '\u5907\u4efd\u4e0e\u5bfc\u51fa'}</span>
                  <button class="import-dialog-close" type="button" title="\u5173\u95ed" onclick=${closeToolsDialog}>${'\u00d7'}</button>
                </header>
                <div class="import-dialog-body">
                  ${toolsDialog.mode == 'menu' && html`
                    <div class="import-dialog-hint">\u5bfc\u51fa\u672c\u5730\u81ea\u9009\u677f\u5757\uff0c\u6216\u4ece JSON \u5907\u4efd\u6062\u590d</div>
                    <button class="import-dialog-button is-primary" type="button" onclick=${(e) => { e.preventDefault(); exportLocalBackup(); setToolsDialog(null); }}>\u5bfc\u51fa JSON \u5907\u4efd</button>
                    <button class="import-dialog-button" type="button" onclick=${(e) => { e.preventDefault(); exportLocalCsv(); setToolsDialog(null); }}>\u5bfc\u51fa CSV</button>
                    <button class="import-dialog-button" type="button" onclick=${openJsonImport}>\u5bfc\u5165 JSON \u5907\u4efd</button>
                  `}
                  ${toolsDialog.mode == 'json-import' && html`
                    <textarea
                      value=${toolsDialog.input}
                      placeholder='{"version":1,"plates":[{"name":"\u81ea\u9009","items":["sh600000"]}]}'
                      oninput=${onToolsInput}></textarea>
                    <div class="import-dialog-hint">\u7c98\u8d34\u5148\u524d\u5bfc\u51fa\u7684 JSON\uff1b\u5c06\u8986\u76d6\u5f53\u524d\u5168\u90e8\u672c\u5730\u677f\u5757</div>
                    ${toolsDialog.error && html`<div class="import-dialog-error">${toolsDialog.error}</div>`}
                  `}
                </div>
                <footer class="import-dialog-footer">
                  <button class="import-dialog-button" type="button" onclick=${closeToolsDialog}>\u5173\u95ed</button>
                  ${toolsDialog.mode == 'json-import' && html`<button class="import-dialog-button is-primary" type="button" onclick=${confirmJsonImport}>\u786e\u8ba4\u5bfc\u5165</button>`}
                </footer>
              </section>
            </div>`}
        </div>`;
    }

    // ==================== Integration Layer ====================

    const container = cEl('div'), fabElement = cEl('button'), svgElement = cEl('div'), tooltipElement = cEl('div');
    let dockedRightPanel = null;
    let dockedRightPanelNodes = [];
    let dockedRightPanelNodeDisplays = [];

    const findBasePanelButton = () => {
        const toolbar = document.querySelector(RIGHT_TOOLBAR_SELECTOR);
        return toolbar?.querySelector('button[data-name="base"]') ||
            document.querySelector(TV_BASE_BUTTON_SELECTOR) ||
            [...document.querySelectorAll('button[data-name="base"]')]
                .find(button => button.getAttribute('aria-label') == TV_BASE_PANEL_LABEL || button.getAttribute('data-tooltip') == TV_BASE_PANEL_LABEL);
    };

    const getBaseActiveClass = () => [...(findBasePanelButton()?.classList || [])].find(name => name.startsWith('isActive-'));

    const setTvHelperButtonPressed = (pressed) => {
        fabElement.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        fabElement.classList.toggle('is-active', pressed);
        const activeClass = getBaseActiveClass();
        if (activeClass) fabElement.classList.toggle(activeClass, pressed);
    };

    const buildTvHelperButtonIcon = (baseButton) => {
        const baseIcon = baseButton?.querySelector('[role="img"]');
        const iconClass = baseIcon?.getAttribute('class') || '';
        return `<span role="img" class="${iconClass}" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44"><rect x="12" y="11" width="20" height="22" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M16 18h12M16 23h12M16 28h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><text x="22" y="16" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor">\u540c</text></svg></span>`;
    };

    const mountTvHelperButton = () => {
        const baseButton = findBasePanelButton();
        const toolbar = baseButton?.closest('[data-name="right-toolbar"]');
        const parent = toolbar || baseButton?.parentElement;
        if (!baseButton || !parent) return false;

        const active = container.classList.contains('is-open');
        const activeClass = getBaseActiveClass();
        fabElement.className = baseButton.className;
        fabElement.classList.add('tvhelper-native-button');
        if (activeClass) fabElement.classList.toggle(activeClass, active);
        fabElement.id = 'tvhelper-fab';
        fabElement.type = 'button';
        fabElement.tabIndex = -1;
        fabElement.setAttribute('aria-label', TVHELPER_BUTTON_LABEL);
        fabElement.setAttribute('aria-pressed', active ? 'true' : 'false');
        fabElement.setAttribute('data-name', 'tvhelper-ths');
        fabElement.setAttribute('data-tooltip', TVHELPER_BUTTON_LABEL);
        fabElement.title = TVHELPER_BUTTON_LABEL;
        fabElement.innerHTML = buildTvHelperButtonIcon(baseButton);

        if (fabElement.parentElement !== parent || fabElement.previousElementSibling !== baseButton) {
            parent.insertBefore(fabElement, baseButton.nextSibling);
        }
        setTvHelperButtonPressed(active);
        return true;
    };

    const watchTvHelperButtonMount = () => {
        mountTvHelperButton();
        const mountRoot = document.querySelector(RIGHT_AREA_SELECTOR) || document.body;
        let remountScheduled = false;
        const scheduleRemount = () => {
            if (remountScheduled) return;
            remountScheduled = true;
            requestAnimationFrame(() => {
                remountScheduled = false;
                if (!document.body.contains(fabElement) || fabElement.parentElement !== findBasePanelButton()?.parentElement) {
                    mountTvHelperButton();
                }
            });
        };
        const observer = new MutationObserver(scheduleRemount);
        observer.observe(mountRoot, {childList: true, subtree: true});
        const timer = window.setInterval(scheduleRemount, 10000);
        window.addEventListener('beforeunload', () => {
            observer.disconnect();
            window.clearInterval(timer);
        }, {once: true});
    };

    const waitForNextFrames = (count = 2) => new Promise(resolve => {
        const tick = () => (--count <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
    });

    const findRightPanel = () => {
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const isVisiblePanel = (el) => {
            const rect = el.getBoundingClientRect();
            return el !== container && !el.contains(container) && rect.width >= 180 && rect.height >= 240 &&
                rect.left >= viewportWidth * 0.45 && rect.right <= viewportWidth + 4;
        };

        const activePage = [...document.querySelectorAll(RIGHT_WIDGET_PANEL_SELECTOR)].find(isVisiblePanel);
        if (activePage) return activePage;

        const pages = [...document.querySelectorAll('.layout__area--right [data-name="widgetbar-pages-with-tabs"], [class*="layout__area--right"] [data-name="widgetbar-pages-with-tabs"]')].find(isVisiblePanel);
        if (pages) return pages;

        return [...document.querySelectorAll(RIGHT_AREA_SELECTOR)]
            .filter(isVisiblePanel)
            .sort((a, b) => {
                const ar = a.getBoundingClientRect();
                const br = b.getBoundingClientRect();
                return (br.width * br.height) - (ar.width * ar.height) || br.left - ar.left;
            })[0] || null;
    };

    async function showDockPanel() {
        const baseButton = findBasePanelButton();
        if (baseButton && baseButton.getAttribute('aria-pressed') != 'true') {
            baseButton.click();
            await waitForNextFrames(3);
        }

        const rightPanel = findRightPanel();
        if (!rightPanel) {
            container.classList.remove('tvhelper-hidden');
            container.classList.add('is-open');
            setTvHelperButtonPressed(true);
            Store.setState({isPanelOpen: true});
            marketScheduler.start(true);
            return;
        }

        dockedRightPanel = rightPanel;
        dockedRightPanelNodes = [...rightPanel.children].filter(node => node !== container);
        dockedRightPanelNodeDisplays = dockedRightPanelNodes.map(node => node.style.display);
        dockedRightPanelNodes.forEach(node => { node.style.display = 'none'; });
        rightPanel.classList.remove('tvhelper-right-ready');
        rightPanel.classList.add('tvhelper-overlay-ready');
        rightPanel.appendChild(container);
        container.classList.remove('tvhelper-hidden');
        container.classList.add('is-open');
        setTvHelperButtonPressed(true);
        Store.setState({isPanelOpen: true});
        marketScheduler.start(true);
    }

    function hideDockPanel() {
        container.classList.add('tvhelper-hidden');
        container.classList.remove('is-open');
        setTvHelperButtonPressed(false);
        Store.setState({isPanelOpen: false});
        marketScheduler.stop();

        if (dockedRightPanel) {
            const rightPanel = dockedRightPanel;
            rightPanel.classList.remove('tvhelper-overlay-ready');
            rightPanel.classList.remove('tvhelper-right-ready');
            document.body.appendChild(container);
            dockedRightPanelNodes.forEach((node, index) => { node.style.display = dockedRightPanelNodeDisplays[index] || ''; });
            dockedRightPanelNodes = [];
            dockedRightPanelNodeDisplays = [];
            dockedRightPanel = null;
        } else {
            document.body.appendChild(container);
        }

        const baseButton = findBasePanelButton();
        if (baseButton && baseButton.getAttribute('aria-pressed') == 'true') baseButton.click();
    }
    function toggleDockPanel() {
        if (container.classList.contains('is-open')) hideDockPanel();
        else showDockPanel();
    }

    const boot = () => {
        try {
            if (!document.body) {
                document.addEventListener('DOMContentLoaded', boot, {once: true});
                return;
            }
            container.id = 'tvhelper';
            container.className = tooltipElement.className = 'card';
            container.classList.add('tvhelper-hidden', 'tvhelper-native-panel');
            fabElement.id = 'tvhelper-fab';
            fabElement.type = 'button';
            fabElement.title = TVHELPER_BUTTON_LABEL;
            fabElement.setAttribute('aria-label', TVHELPER_BUTTON_LABEL);
            fabElement.setAttribute('aria-pressed', 'false');
            fabElement.setAttribute('data-name', 'tvhelper-ths');
            fabElement.setAttribute('data-tooltip', TVHELPER_BUTTON_LABEL);
            tooltipElement.id = 'tvhelper-tooltip';
            svgElement.innerHTML = svgSprite;
            fabElement.addEventListener('click', toggleDockPanel);
            document.body.appendChild(svgElement);
            document.body.appendChild(container);
            document.body.appendChild(tooltipElement);
            render(html`<${App} />`, container);

            watchTvHelperButtonMount();
            window.addEventListener('beforeunload', () => marketScheduler.stop());
            GM_addStyle(tvhelperCss);
        } catch (err) {
            console.error('[tvhelper] boot failed', err);
            try {
                if (window.fetch === hookedTvSearch) window.fetch = originalFetch;
            } catch (restoreErr) {}
        }
    };

    boot();

})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

} // end chart-page-only branch
