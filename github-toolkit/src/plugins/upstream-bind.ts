import type { Binding, Plugin, PluginContext } from '../types';
import { Modal } from '../core/modal';
import { checkHasForked, fetchRepoInfo, getCurrentUser, loadLastCommit, loadRepoAbout } from '../core/github-api';
import type { RepoAbout } from '../core/github-api';
import { isPopoverOpen, showAboutPopover } from '../core/popover';
import { showMenu } from '../core/menu';
import { pushLayer } from '../core/layers';
import { formatDate, relativeTime } from '../core/time';
import { compactNum, copyText, escapeHtml } from '../core/html';
import { ICON } from '../core/icons';

const BIND_STORAGE_KEY = 'upstream-downstream-bindings';

function loadBindings(): Binding[] {
  const v = GM_getValue(BIND_STORAGE_KEY, []);
  return Array.isArray(v) ? v : [];
}

function saveBindings(list: Binding[]): void {
  GM_setValue(BIND_STORAGE_KEY, list);
}

const fullOf = (b: Binding) => `${b.owner}/${b.repo}`;
const keyOf = (s: string) => s.toLowerCase();

/** 解析 owner/repo、仓库链接或 SSH 地址；不合法返回 null */
function parseRepo(input: string): { owner: string; repo: string } | null {
  const s = String(input || '')
    .trim()
    .replace(/^git@github\.com:/i, '')
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/[?#].*$/, '');
  const parts = s.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,38}$/.test(owner)) return null;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo };
}

/** 当前仓库的上游检测结果 */
type Detection =
  | { state: 'pending' }
  | { state: 'none' }
  | { state: 'failed' }
  | { state: 'fork'; upstream: string };

/** fork 关系基本不变：同一会话内按仓库缓存，跳页回来不重复请求（失败不缓存） */
const detectCache = new Map<string, Promise<Detection>>();

function detectUpstream(owner: string, repo: string): Promise<Detection> {
  const key = keyOf(`${owner}/${repo}`);
  const hit = detectCache.get(key);
  if (hit) return hit;
  const p = fetchRepoInfo(owner, repo).then((info): Detection => {
    if (!info) return { state: 'failed' };
    const up = info.parent || info.source;
    if (!info.fork || !up) return { state: 'none' };
    return { state: 'fork', upstream: up.full_name };
  });
  detectCache.set(key, p);
  void p.then((d) => {
    if (d.state === 'failed') detectCache.delete(key);
  });
  return p;
}

/** 软导航重建面板时保留的界面状态（只在内存里，不持久化） */
const viewMemory = { query: '', selected: '', railScroll: 0 };

interface ViewState {
  /** 选中绑定的 key（小写 owner/repo） */
  selected: string;
  addMode: boolean;
  /** 添加视图里输入的仓库 */
  draft: string;
  detection: Detection;
  about: Map<string, RepoAbout | null>;
  lastCommit: Map<string, string | null>;
  /** 已发起过 about / 最后提交请求的绑定 */
  requested: Set<string>;
  /** 正在检测 fork 的绑定 key */
  bindingKey: string;
  /** 气泡打开期间有待补的重绘 */
  dirty: boolean;
}

/** topics 单行按实际宽度裁剪：放不下的收进「+N」，保证「+N」完整显示 */
function fitTopics(scope: ParentNode): void {
  const row = scope.querySelector<HTMLElement>('.ghtk-topics');
  if (!row || !row.clientWidth) return;
  const chips = Array.from(row.querySelectorAll<HTMLElement>('.ghtk-topic:not(.more)'));
  const more = row.querySelector<HTMLElement>('.ghtk-topic.more');
  if (!chips.length || !more) return;
  chips.forEach((c) => (c.hidden = false));
  more.hidden = true;
  if (row.scrollWidth <= row.clientWidth) return;
  let shown = chips.length;
  more.hidden = false;
  while (shown > 1) {
    shown--;
    chips[shown].hidden = true;
    more.textContent = `+${chips.length - shown}`;
    if (row.scrollWidth <= row.clientWidth) return;
  }
}

/** 语言 → 圆点颜色（GitHub 语言配色节选，属于数据色，不随主题变化） */
const LANG_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  SCSS: '#c6538c',
  Lua: '#000080',
  Zig: '#ec915c',
};

/**
 * 上游 about 区块（固定 96px）：描述 2 行截断、元信息单行、topics 单行。
 * 完整信息走右上角按钮打开的气泡。时间只放在标题下方的副标题里，这里不重复。
 */
function renderAbout(about: RepoAbout | null | undefined): string {
  if (!about) {
    const text = about === undefined ? '正在加载仓库简介…' : '无仓库信息';
    return `
      <div class="ghtk-about">
        <div class="ghtk-about-top"><div class="ghtk-about-desc muted">${text}</div></div>
        <div class="ghtk-about-meta"></div>
        <div class="ghtk-topics"></div>
      </div>`;
  }

  const desc = about.description?.trim() || '';
  const meta: string[] = [];
  if (about.language) {
    const color = Object.prototype.hasOwnProperty.call(LANG_COLORS, about.language)
      ? LANG_COLORS[about.language]
      : '#8b949e';
    meta.push(
      `<span class="ghtk-meta-item"><span class="ghtk-lang-dot" style="background:${color}"></span>${escapeHtml(about.language)}</span>`
    );
  }
  if (about.stars) meta.push(`<span class="ghtk-meta-item" title="Star">${ICON.star}${compactNum(about.stars)}</span>`);
  if (about.forks) meta.push(`<span class="ghtk-meta-item" title="Fork">${ICON.fork}${compactNum(about.forks)}</span>`);
  if (about.license) meta.push(`<span class="ghtk-meta-item">${escapeHtml(about.license)}</span>`);

  // 先输出全部 topic，渲染后由 fitTopics 按实际宽度裁剪；没量到宽度时默认显示前 3 个
  const topics =
    about.topics
      .map((t, i) => `<span class="ghtk-topic" title="${escapeHtml(t)}"${i >= 3 ? ' hidden' : ''}>${escapeHtml(t)}</span>`)
      .join('') +
    (about.topics.length > 3
      ? `<span class="ghtk-topic more">+${about.topics.length - 3}</span>`
      : '<span class="ghtk-topic more" hidden></span>');

  return `
    <div class="ghtk-about">
      <div class="ghtk-about-top">
        <div class="ghtk-about-desc${desc ? '' : ' muted'}">${desc ? escapeHtml(desc) : '暂无简介'}</div>
        <button class="ghtk-icon-btn ghtk-about-more" type="button" data-act="about" data-ghtk-popover-trigger
          title="查看完整信息" aria-label="查看完整信息" aria-haspopup="dialog" aria-expanded="false">${ICON.info}</button>
      </div>
      <div class="ghtk-about-meta">${meta.join('')}</div>
      <div class="ghtk-topics">${topics}</div>
    </div>`;
}

export const UpstreamBindPlugin: Plugin = {
  id: 'upstream-bind',
  name: '上游/下游仓库绑定',
  version: '2.9.0',
  description: '自动检测当前仓库上游，支持手动添加与上下游绑定',
  matches() {
    return true;
  },
  async onEnable() {},
  onDisable() {},
  panelTab: {
    id: 'fork',
    label: '绑定',
    render() {
      return `
        <div class="ghtk-toolbar">
          <label class="ghtk-search">
            ${ICON.search}
            <input type="text" id="ghtk-search-input" placeholder="搜索绑定" aria-label="搜索上游或下游" autocomplete="off" spellcheck="false" />
          </label>
          <button class="ghtk-icon-btn ghtk-toolbar-add" id="ghtk-add-toggle" type="button"
            title="添加上游" aria-label="添加上游" aria-pressed="false">${ICON.plus}</button>
        </div>
        <div class="ghtk-split">
          <div class="ghtk-rail">
            <div class="ghtk-rail-head"><span>上游</span><span id="ghtk-rail-total"></span></div>
            <button class="ghtk-current-repo" id="ghtk-current-repo" type="button" hidden>
              ${ICON.pin}<span class="ghtk-cur-name" id="ghtk-current-repo-name"></span>${ICON.circle}
            </button>
            <div class="ghtk-rail-list" id="ghtk-rail-list" role="listbox" aria-label="上游列表"></div>
          </div>
          <div class="ghtk-detail" id="ghtk-detail"></div>
        </div>
      `;
    },
    mount(ctx: PluginContext, root: HTMLElement) {
      const railList = root.querySelector<HTMLElement>('#ghtk-rail-list');
      const railTotal = root.querySelector<HTMLElement>('#ghtk-rail-total');
      const detail = root.querySelector<HTMLElement>('#ghtk-detail');
      const addToggle = root.querySelector<HTMLButtonElement>('#ghtk-add-toggle');
      const searchInput = root.querySelector<HTMLInputElement>('#ghtk-search-input');
      const curBtn = root.querySelector<HTMLButtonElement>('#ghtk-current-repo');
      const curName = root.querySelector<HTMLElement>('#ghtk-current-repo-name');
      if (!railList || !railTotal || !detail || !addToggle || !searchInput || !curBtn || !curName) return;

      const currentUser = getCurrentUser(ctx.dom);
      const page = ctx.page;
      const currentRepo = page.owner && page.repo ? `${page.owner}/${page.repo}` : '';
      const curKey = keyOf(currentRepo);

      const state: ViewState = {
        selected: '',
        addMode: false,
        draft: '',
        detection: currentRepo ? { state: 'pending' } : { state: 'none' },
        about: new Map(),
        lastCommit: new Map(),
        requested: new Set(),
        bindingKey: '',
        dirty: false,
      };
      const detectionPromise: Promise<Detection> = currentRepo
        ? detectUpstream(page.owner!, page.repo!)
        : Promise.resolve<Detection>({ state: 'none' });
      let releaseAdd: (() => void) | null = null;

      const isUpstreamOfCurrent = (b: Binding) => !!curKey && keyOf(fullOf(b)) === curKey;
      const isDownstreamOfCurrent = (b: Binding) =>
        !!curKey && (b.downstreams || []).some((d) => keyOf(d) === curKey);
      const isRelated = (b: Binding) => isUpstreamOfCurrent(b) || isDownstreamOfCurrent(b);

      const setSelected = (key: string) => {
        state.selected = key;
        viewMemory.selected = key;
      };

      /** 初始选中：与当前仓库相关的绑定 → 上次选中的 → 第一条 */
      const pickInitial = () => {
        const list = loadBindings();
        const pick =
          list.find(isUpstreamOfCurrent) ||
          list.find(isDownstreamOfCurrent) ||
          list.find((b) => keyOf(fullOf(b)) === viewMemory.selected) ||
          list[0];
        setSelected(pick ? keyOf(fullOf(pick)) : '');
      };

      const findSelected = (list = loadBindings()) => list.find((b) => keyOf(fullOf(b)) === state.selected) || null;

      /** 搜索同时匹配上游与下游 */
      const matchesQuery = (b: Binding, q: string) =>
        !q || keyOf(fullOf(b)).includes(q) || (b.downstreams || []).some((d) => keyOf(d).includes(q));

      const copy = (text: string) => {
        void copyText(text).then((ok) => ctx.ui.toast(ok ? '已复制' : '复制失败'));
      };

      // ---------- 左栏 ----------

      /** 「当前仓库」入口：当前仓库已在列表里（作为上游或下游）就不显示，避免同一仓库出现两次 */
      const updateCurrentEntry = () => {
        const list = loadBindings();
        if (!currentRepo || list.some(isRelated)) {
          curBtn.hidden = true;
          return;
        }
        curBtn.hidden = false;
        curName.textContent = currentRepo;
        const d = state.detection;
        let tip: string;
        if (d.state === 'pending') tip = `当前仓库：${currentRepo}\n正在检测上游…`;
        else if (d.state === 'fork') tip = `当前仓库：${currentRepo}\n未绑定 · 上游是 ${d.upstream}\n点击绑定为它的下游`;
        else if (d.state === 'failed') tip = `当前仓库：${currentRepo}\n未绑定 · 上游检测失败\n点击手动添加`;
        else tip = `当前仓库：${currentRepo}\n未绑定\n点击添加为上游`;
        curBtn.title = tip;
        curBtn.setAttribute('aria-label', tip.replace(/\n/g, '，'));
        if (d.state === 'pending') curBtn.setAttribute('aria-busy', 'true');
        else curBtn.removeAttribute('aria-busy');
      };

      const renderRail = () => {
        updateCurrentEntry();
        const list = loadBindings();
        railTotal.textContent = list.length ? String(list.length) : '';
        if (!list.length) {
          railList.innerHTML = `<div class="ghtk-rail-empty">暂无绑定</div>`;
          return;
        }
        const q = viewMemory.query.trim().toLowerCase();
        const rows = list.filter((b) => matchesQuery(b, q));
        if (!rows.length) {
          railList.innerHTML = `<div class="ghtk-rail-empty">无匹配</div>`;
          return;
        }
        const activeVisible = !state.addMode && rows.some((b) => keyOf(fullOf(b)) === state.selected);
        railList.innerHTML = rows
          .map((b, i) => {
            const key = keyOf(fullOf(b));
            const active = !state.addMode && key === state.selected;
            const related = isRelated(b);
            const count = (b.downstreams || []).length;
            const tabIndex = active || (!activeVisible && i === 0) ? '0' : '-1';
            const tip = `${fullOf(b)}${related ? ' · 与当前仓库相关' : ''} · ${count} 个下游`;
            return `
              <button class="ghtk-rail-item${active ? ' active' : ''}" type="button" role="option"
                aria-selected="${active}" tabindex="${tabIndex}" data-key="${escapeHtml(key)}" title="${escapeHtml(tip)}">
                <span class="ghtk-rail-text">
                  <span class="ghtk-rail-name">${related ? ICON.pin : ''}<span>${escapeHtml(b.repo)}</span></span>
                  <span class="ghtk-rail-owner">${escapeHtml(b.owner)}</span>
                </span>
                <span class="ghtk-rail-count">${count}</span>
              </button>`;
          })
          .join('');
        railList.scrollTop = viewMemory.railScroll;
      };

      const selectKey = (key: string, focus = false) => {
        if (state.addMode) exitAddMode(false);
        setSelected(key);
        renderRail();
        renderDetail();
        if (focus) {
          railList.querySelector<HTMLElement>(`.ghtk-rail-item[data-key="${CSS.escape(key)}"]`)?.focus();
        }
      };

      railList.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement).closest<HTMLElement>('.ghtk-rail-item');
        if (item?.dataset.key) selectKey(item.dataset.key);
      });
      railList.addEventListener('keydown', (e) => {
        const items = Array.from(railList.querySelectorAll<HTMLButtonElement>('.ghtk-rail-item'));
        const i = items.indexOf(document.activeElement as HTMLButtonElement);
        if (i < 0) return;
        let next: number;
        if (e.key === 'ArrowDown') next = Math.min(items.length - 1, i + 1);
        else if (e.key === 'ArrowUp') next = Math.max(0, i - 1);
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = items.length - 1;
        else return;
        e.preventDefault();
        const key = items[next]?.dataset.key;
        if (key) selectKey(key, true);
      });
      railList.addEventListener(
        'scroll',
        () => {
          viewMemory.railScroll = railList.scrollTop;
        },
        { passive: true }
      );

      // ---------- 添加视图 ----------

      const enterAddMode = (prefill = '') => {
        if (!state.addMode) {
          state.addMode = true;
          // Esc 先退出添加视图，而不是直接关面板
          releaseAdd = pushLayer('transient', () => {
            releaseAdd = null;
            exitAddMode();
          });
        }
        state.draft = prefill;
        addToggle.classList.add('active');
        addToggle.setAttribute('aria-pressed', 'true');
        renderRail();
        renderDetail();
        const input = detail.querySelector<HTMLInputElement>('#ghtk-upstream-input');
        input?.focus({ preventScroll: true });
        input?.select();
      };

      function exitAddMode(render = true) {
        if (!state.addMode) return;
        const hadFocus = !!detail && detail.contains(document.activeElement);
        state.addMode = false;
        addToggle!.classList.remove('active');
        addToggle!.setAttribute('aria-pressed', 'false');
        const release = releaseAdd;
        releaseAdd = null;
        release?.();
        if (!render) return;
        renderRail();
        renderDetail();
        if (hadFocus) addToggle!.focus({ preventScroll: true });
      }

      // ---------- 右栏详情 ----------

      function renderDetail() {
        if (!detail) return;
        // 气泡开着时不重绘，避免气泡锚点被替换；关闭后补一次
        if (isPopoverOpen()) {
          state.dirty = true;
          return;
        }
        state.dirty = false;
        if (state.addMode) {
          renderAddView();
          return;
        }

        const list = loadBindings();
        if (!list.length) {
          detail.innerHTML = `
            <div class="ghtk-blank">
              <div>还没有绑定任何上游</div>
              <button class="ghtk-btn primary" type="button" data-act="add-upstream">添加上游</button>
            </div>`;
          return;
        }
        let b = findSelected(list);
        if (!b) {
          pickInitial();
          b = findSelected(list);
        }
        if (!b) return;

        const full = fullOf(b);
        const key = keyOf(full);
        const downs = b.downstreams || [];
        const about = state.about.get(key);
        const last = state.lastCommit.get(key);
        const userPrefix = currentUser ? keyOf(currentUser) + '/' : '';
        // 按 owner 判断「我的 Fork」：fork 改了名也算
        const myForkBound = !!userPrefix && downs.some((d) => keyOf(d).startsWith(userPrefix));
        const busy = state.bindingKey === key;

        const rows = downs
          .map((d) => {
            const mine = !!userPrefix && keyOf(d).startsWith(userPrefix);
            const isCur = !!curKey && keyOf(d) === curKey;
            return `
              <div class="ghtk-drow">
                <span class="ghtk-drow-branch" aria-hidden="true">└</span>
                ${isCur ? `<span class="ghtk-drow-pin" title="当前仓库">${ICON.pin}</span>` : ''}
                <a class="ghtk-drow-name" href="https://github.com/${escapeHtml(d)}" data-ghtk-nav title="${escapeHtml(d)}">${escapeHtml(d)}</a>
                ${mine ? '<span class="ghtk-chip">我的 Fork</span>' : ''}
                <button class="ghtk-icon-btn ghtk-drow-rm" type="button" data-act="remove-down" data-down="${escapeHtml(d)}"
                  title="移除下游" aria-label="移除下游 ${escapeHtml(d)}">${ICON.x}</button>
              </div>`;
          })
          .join('');

        const emptyCta = currentUser
          ? `<button class="ghtk-empty-cta" type="button" data-act="bind-fork"${busy ? ' aria-busy="true"' : ''}>
               <span>还没有下游</span><strong>${busy ? '检测中…' : '检测我的 Fork'}</strong>
             </button>`
          : `<button class="ghtk-empty-cta" type="button" data-act="add-down">
               <span>还没有下游</span><strong>添加下游</strong>
             </button>`;

        // 唯一的蓝色主按钮固定在底部；已绑定我的 Fork 后不再显示（其它下游从「⋯」添加）
        const foot =
          currentUser && downs.length && !myForkBound
            ? `<div class="ghtk-detail-foot">
                 <button class="ghtk-btn primary block" type="button" data-act="bind-fork"${busy ? ' aria-busy="true"' : ''}>
                   ${busy ? '<span class="ghtk-spinner" aria-hidden="true"></span>检测中…' : '绑定我的 Fork'}
                 </button>
               </div>`
            : '';

        const when = last || about?.updatedAt || null;
        const subParts = [`${downs.length} 个下游`];
        if (when) subParts.push(`${relativeTime(when)}更新`);
        if (!currentUser) subParts.push('未登录');
        const subTip = when ? `${last ? '最后提交' : '最近推送'} ${formatDate(when)}` : '';

        detail.innerHTML = `
          <div class="ghtk-detail-head">
            <div class="ghtk-detail-title-row">
              <a class="ghtk-detail-title" href="https://github.com/${escapeHtml(full)}" data-ghtk-nav
                title="打开上游 ${escapeHtml(full)}">${escapeHtml(full)}</a>
              <button class="ghtk-icon-btn" type="button" data-act="copy" title="复制上游链接" aria-label="复制上游链接">${ICON.copy}</button>
              <button class="ghtk-icon-btn" type="button" data-act="more" title="更多操作" aria-label="更多操作"
                aria-haspopup="menu" aria-expanded="false">${ICON.kebab}</button>
            </div>
            <div class="ghtk-detail-sub"${subTip ? ` title="${escapeHtml(subTip)}"` : ''}>${escapeHtml(subParts.join(' · '))}</div>
          </div>
          ${renderAbout(about)}
          <div class="ghtk-detail-body">
            <div class="ghtk-sec-label">下游</div>
            ${downs.length ? rows : emptyCta}
          </div>
          ${foot}
        `;
        fitTopics(detail);
        loadFor(b);
      }

      // Tab 隐藏时宽度为 0 量不准：变为可见或尺寸变化时重新裁剪 topics
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => {
          if (detail.clientWidth) fitTopics(detail);
        }).observe(detail);
      }

      /** 按需加载 about 与最后提交（每个绑定只发一次，缓存层负责过期刷新） */
      const loadFor = (b: Binding) => {
        const key = keyOf(fullOf(b));
        if (state.requested.has(key)) return;
        state.requested.add(key);
        loadRepoAbout(b.owner, b.repo, (data) => {
          state.about.set(key, data);
          if (state.selected === key && !state.addMode) renderDetail();
        });
        loadLastCommit(b.owner, b.repo, (date) => {
          state.lastCommit.set(key, date);
          if (state.selected === key && !state.addMode) renderDetail();
        });
      };

      function renderAddView() {
        if (!detail) return;
        const prev = detail.querySelector<HTMLInputElement>('#ghtk-upstream-input');
        const hadFocus = !!prev && document.activeElement === prev;
        const selStart = prev?.selectionStart ?? null;
        const selEnd = prev?.selectionEnd ?? null;

        const list = loadBindings();
        const d = state.detection;
        let extra = '';
        let detectPrimary = false;
        if (d.state === 'pending') {
          extra = '<div class="ghtk-note">正在检测当前仓库…</div>';
        } else if (d.state === 'fork') {
          const up = list.find((x) => keyOf(fullOf(x)) === keyOf(d.upstream));
          const already = !!up && (up.downstreams || []).some((x) => keyOf(x) === curKey);
          if (already) {
            extra = `<div class="ghtk-note">当前仓库已是 ${escapeHtml(d.upstream)} 的下游</div>`;
          } else {
            detectPrimary = true;
            extra = `
              <div class="ghtk-detect">
                <div class="ghtk-detect-label">当前仓库的上游</div>
                <div class="ghtk-detect-name" title="${escapeHtml(d.upstream)}">${escapeHtml(d.upstream)}</div>
                <div class="ghtk-btn-row">
                  <button class="ghtk-btn primary" type="button" data-act="bind-current">绑定为下游</button>
                  <a class="ghtk-btn" href="https://github.com/${escapeHtml(d.upstream)}" data-ghtk-nav>打开</a>
                </div>
              </div>`;
          }
        } else if (d.state === 'failed') {
          extra = '<div class="ghtk-note">没能获取当前仓库信息</div>';
        } else if (currentRepo) {
          extra = '<div class="ghtk-note">当前仓库不是 Fork，没有上游</div>';
        }

        // 检测到上游时「绑定为下游」是主操作，「添加」降为次要（一屏只有一个蓝色按钮）
        detail.innerHTML = `
          <div class="ghtk-addview">
            <div class="ghtk-addview-head">
              <div class="ghtk-addview-title">添加上游</div>
              <div class="ghtk-detail-sub">输入 owner/repo 或粘贴仓库链接</div>
            </div>
            <div class="ghtk-addview-body">
              <div class="ghtk-field">
                <label class="ghtk-field-label" for="ghtk-upstream-input">仓库</label>
                <div class="ghtk-field-row">
                  <input class="ghtk-input" type="text" id="ghtk-upstream-input" placeholder="owner/repo"
                    value="${escapeHtml(state.draft)}" autocomplete="off" spellcheck="false" />
                  <button class="ghtk-btn${detectPrimary ? '' : ' primary'}" type="button" data-act="submit-upstream">添加</button>
                </div>
              </div>
              ${extra}
            </div>
            <div class="ghtk-detail-foot">
              <div class="ghtk-btn-row">
                <button class="ghtk-btn" type="button" data-act="cancel-add">取消</button>
              </div>
            </div>
          </div>
        `;

        if (hadFocus) {
          const input = detail.querySelector<HTMLInputElement>('#ghtk-upstream-input');
          if (input) {
            input.focus({ preventScroll: true });
            if (selStart !== null && selEnd !== null) input.setSelectionRange(selStart, selEnd);
          }
        }
      }

      // ---------- 数据操作 ----------

      /** 往指定上游追加下游 */
      const addDownstream = (upKey: string, down: string): 'added' | 'exists' | 'missing' => {
        const list = loadBindings();
        const b = list.find((x) => keyOf(fullOf(x)) === upKey);
        if (!b) return 'missing';
        b.downstreams = b.downstreams || [];
        if (b.downstreams.some((d) => keyOf(d) === keyOf(down))) return 'exists';
        b.downstreams.push(down);
        saveBindings(list);
        return 'added';
      };

      const reportAdd = (r: 'added' | 'exists' | 'missing') => {
        renderRail();
        renderDetail();
        ctx.ui.toast(r === 'added' ? '已绑定' : r === 'exists' ? '已存在' : '上游已删除');
      };

      const promptAddDownstream = async (
        upKey: string,
        opts: { title?: string; content?: string; value?: string } = {}
      ) => {
        const val = await Modal.show({
          title: opts.title || '添加下游',
          content: opts.content || '',
          showInput: true,
          inputValue: opts.value ?? '',
          placeholder: 'owner/repo 或链接',
          confirmText: '绑定',
        });
        if (val === null || val === false) return;
        const p = parseRepo(String(val));
        if (!p) {
          ctx.ui.toast('格式错误');
          return;
        }
        reportAdd(addDownstream(upKey, `${p.owner}/${p.repo}`));
      };

      /** 检测我的 fork 并绑定；检测不到时弹出手动确认（预填我的 fork 路径） */
      const bindMyFork = async (b: Binding) => {
        const upKey = keyOf(fullOf(b));
        if (!currentUser) {
          await promptAddDownstream(upKey);
          return;
        }
        if (state.bindingKey) return;
        state.bindingKey = upKey;
        renderDetail();
        const res = await checkHasForked(currentUser, b.owner, b.repo);
        state.bindingKey = '';
        if (res.forkUrl) {
          reportAdd(addDownstream(upKey, `${currentUser}/${b.repo}`));
          return;
        }
        renderDetail();
        const reason =
          res.reason === 'rate-limited'
            ? 'GitHub API 暂时限流，没法自动检测。'
            : res.reason === 'unknown'
              ? '自动检测失败。'
              : `没找到 ${escapeHtml(currentUser)}/${escapeHtml(b.repo)}。`;
        await promptAddDownstream(upKey, {
          title: '确认我的 Fork',
          content: `${reason}如果 fork 过（比如改了名字），填仓库全名即可。`,
          value: `${currentUser}/${b.repo}`,
        });
      };

      const removeDownstream = async (b: Binding, down: string) => {
        const ok = await Modal.show({
          title: '移除下游',
          content: `从 <b>${escapeHtml(fullOf(b))}</b> 的下游中移除 <b>${escapeHtml(down)}</b>？`,
          confirmText: '移除',
          danger: true,
        });
        if (!ok) return;
        const upKey = keyOf(fullOf(b));
        const list = loadBindings();
        const target = list.find((x) => keyOf(fullOf(x)) === upKey);
        if (!target) return;
        target.downstreams = (target.downstreams || []).filter((d) => keyOf(d) !== keyOf(down));
        saveBindings(list);
        renderRail();
        renderDetail();
        ctx.ui.toast('已移除');
      };

      const removeBinding = async (b: Binding) => {
        const full = fullOf(b);
        const ok = await Modal.show({
          title: '删除绑定',
          content: `删除上游 <b>${escapeHtml(full)}</b> 及其全部下游记录？`,
          confirmText: '删除',
          danger: true,
        });
        if (!ok) return;
        saveBindings(loadBindings().filter((x) => keyOf(fullOf(x)) !== keyOf(full)));
        pickInitial();
        renderRail();
        renderDetail();
        ctx.ui.toast('已删除');
      };

      const openMore = (anchor: HTMLElement, b: Binding) => {
        showMenu(anchor, [
          { label: '添加其他下游…', onSelect: () => void promptAddDownstream(keyOf(fullOf(b))) },
          { label: '删除绑定', danger: true, onSelect: () => void removeBinding(b) },
        ]);
      };

      const openAbout = (anchor: HTMLElement, b: Binding) => {
        const key = keyOf(fullOf(b));
        const about = state.about.get(key);
        if (!about) return;
        const last = state.lastCommit.get(key);
        showAboutPopover({
          about,
          anchor,
          extraMeta: [
            ['最近推送', about.updatedAt ? `${formatDate(about.updatedAt)}（${relativeTime(about.updatedAt)}）` : '—'],
            ['最后提交', last ? `${formatDate(last)}（${relativeTime(last)}）` : '—'],
          ],
          onClose: () => {
            if (state.dirty) renderDetail();
          },
        });
      };

      const submitUpstream = () => {
        const input = detail.querySelector<HTMLInputElement>('#ghtk-upstream-input');
        const p = parseRepo(input ? input.value : state.draft);
        if (!p) {
          ctx.ui.toast('格式错误');
          input?.focus();
          return;
        }
        const list = loadBindings();
        const key = keyOf(`${p.owner}/${p.repo}`);
        if (list.some((b) => keyOf(fullOf(b)) === key)) {
          ctx.ui.toast('已存在');
        } else {
          list.push({ owner: p.owner, repo: p.repo, downstreams: [], createdAt: Date.now() });
          saveBindings(list);
          ctx.ui.toast('已添加');
        }
        setSelected(key);
        state.draft = '';
        exitAddMode();
      };

      /** 当前仓库是 fork：直接绑定为上游的下游（上游不在列表里就一起加上） */
      const bindCurrentAsDownstream = async () => {
        const d = await detectionPromise;
        if (d.state !== 'fork' || !currentRepo) return;
        const list = loadBindings();
        const upKey = keyOf(d.upstream);
        let up = list.find((x) => keyOf(fullOf(x)) === upKey);
        if (!up) {
          const [owner, repo] = d.upstream.split('/');
          up = { owner, repo, downstreams: [], createdAt: Date.now() };
          list.push(up);
        }
        up.downstreams = up.downstreams || [];
        if (!up.downstreams.some((x) => keyOf(x) === curKey)) up.downstreams.push(currentRepo);
        saveBindings(list);
        setSelected(upKey);
        if (state.addMode) exitAddMode(false);
        renderRail();
        renderDetail();
        ctx.ui.toast('已绑定');
      };

      // ---------- 事件（委托，只绑一次） ----------

      detail.addEventListener('click', (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
        if (!el || !detail.contains(el)) return;
        const b = findSelected();
        switch (el.dataset.act) {
          case 'add-upstream':
            enterAddMode('');
            break;
          case 'copy':
            if (b) copy(`https://github.com/${fullOf(b)}`);
            break;
          case 'more':
            if (b) openMore(el, b);
            break;
          case 'about':
            if (b) openAbout(el, b);
            break;
          case 'bind-fork':
            if (b) void bindMyFork(b);
            break;
          case 'add-down':
            if (b) void promptAddDownstream(keyOf(fullOf(b)));
            break;
          case 'remove-down':
            if (b && el.dataset.down) void removeDownstream(b, el.dataset.down);
            break;
          case 'submit-upstream':
            submitUpstream();
            break;
          case 'bind-current':
            void bindCurrentAsDownstream();
            break;
          case 'cancel-add':
            exitAddMode();
            break;
        }
      });
      detail.addEventListener('keydown', (e) => {
        const t = e.target as HTMLElement;
        if (t.id === 'ghtk-upstream-input' && e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          submitUpstream();
        }
      });
      detail.addEventListener('input', (e) => {
        const t = e.target as HTMLInputElement;
        if (t.id === 'ghtk-upstream-input') state.draft = t.value;
      });

      curBtn.addEventListener('click', async () => {
        const d = await detectionPromise;
        if (d.state === 'fork') {
          await bindCurrentAsDownstream();
          return;
        }
        enterAddMode(currentRepo);
      });

      addToggle.addEventListener('click', () => {
        if (state.addMode) exitAddMode();
        else enterAddMode('');
      });

      searchInput.value = viewMemory.query;
      searchInput.addEventListener('input', () => {
        viewMemory.query = searchInput.value;
        renderRail();
      });

      // ---------- 初始渲染 ----------

      pickInitial();
      renderRail();
      renderDetail();
      if (currentRepo) {
        void detectionPromise.then((d) => {
          state.detection = d;
          if (!root.isConnected) return;
          renderRail();
          if (state.addMode) renderDetail();
        });
      }
    },
  },
};
