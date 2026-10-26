import type { Binding, PageContext, Plugin, PluginContext } from '../types';
import { Modal } from '../core/modal';
import {
  checkHasForked,
  fetchRepoInfo,
  getCurrentUser,
  loadRepoAbout,
  loadLastCommit,
} from '../core/github-api';
import { showAboutPopover } from '../core/popover';
import { relativeTime, formatDate } from '../core/time';
import type { RepoAbout } from '../core/github-api';

const BIND_STORAGE_KEY = 'upstream-downstream-bindings';

function loadBindings(): Binding[] {
  return GM_getValue(BIND_STORAGE_KEY, []);
}

function saveBindings(list: Binding[]): void {
  GM_setValue(BIND_STORAGE_KEY, list);
}

const ICONS = {
  search: `<svg viewBox="0 0 16 16"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/></svg>`,
  plus: `<svg viewBox="0 0 16 16"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg>`,
  del: `<svg viewBox="0 0 16 16"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>`,
};

interface UpstreamStatus {
  text: string;
  color?: string;
  fullName?: string;
  owner?: string;
  repo?: string;
  bound?: boolean;
}

interface ViewState {
  selected: number;
  addMode: boolean;
  query: string;
  status: UpstreamStatus;
  /** 添加视图中用户输入的仓库 */
  draft: string;
  /** 已加载的上游 about（按 owner/repo 小写缓存） */
  about: Map<string, RepoAbout | null>;
  /** 最后提交时间（按 owner/repo 小写缓存，ISO 字符串） */
  lastCommit: Map<string, string | null>;
}

/** 数字紧凑格式：1234 → 1.2k */
function compactNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n / 1000) + 'k';
}

/** 语言 → 圆点颜色（GitHub 语言配色节选） */
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
 * 渲染上游 about 区块（固定 88px 高）。
 * 描述 2 行截断、元信息单行、topics 单行，溢出内容通过右上角按钮开气泡查看。
 */
function renderAbout(
  about: RepoAbout | null | undefined,
  full: string,
  lastCommit: string | null | undefined
): string {
  const expandIcon = `<svg viewBox="0 0 16 16"><path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.75.75 0 0 1-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/></svg>`;
  const clockIcon = `<svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/></svg>`;

  if (about === undefined) {
    return `
      <div class="ghtk-about">
        <div class="ghtk-about-top"><div class="ghtk-about-desc muted">正在加载仓库简介…</div></div>
        <div class="ghtk-about-meta"></div>
        <div class="ghtk-topics"></div>
      </div>
    `;
  }
  if (about === null) {
    return `
      <div class="ghtk-about">
        <div class="ghtk-about-top"><div class="ghtk-about-desc muted">无仓库信息</div></div>
        <div class="ghtk-about-meta"></div>
        <div class="ghtk-topics"></div>
      </div>
    `;
  }

  const desc = about.description?.trim() || '';
  const metaItems: string[] = [];
  if (about.language) {
    const color = LANG_COLORS[about.language] || '#8b949e';
    metaItems.push(
      `<span class="item"><span class="ghtk-lang-dot" style="background:${color}"></span><span>${escapeHtml(about.language)}</span></span>`
    );
  }
  if (about.stars) {
    metaItems.push(
      `<span class="item"><svg viewBox="0 0 16 16"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg><span>${compactNum(about.stars)}</span></span>`
    );
  }
  if (about.forks) {
    metaItems.push(
      `<span class="item"><svg viewBox="0 0 16 16"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/></svg><span>${compactNum(about.forks)}</span></span>`
    );
  }
  if (about.updatedAt) {
    metaItems.push(
      `<span class="item" title="最近推送 ${formatDate(about.updatedAt)}">${clockIcon}<span>${relativeTime(about.updatedAt)}</span></span>`
    );
  }
  if (about.license) {
    metaItems.push(`<span class="item"><span>${escapeHtml(about.license)}</span></span>`);
  }

  const showTopics = about.topics.slice(0, 3);
  const restTopics = about.topics.length - showTopics.length;
  const topicsHtml = about.topics.length
    ? `<div class="ghtk-topics">${showTopics
        .map((t) => `<span class="ghtk-topic">${escapeHtml(t)}</span>`)
        .join('')}${
        restTopics > 0 ? `<span class="ghtk-topic" style="color:#59636e;background:#f6f8fa;border-color:#d0d7de">+${restTopics}</span>` : ''
      }</div>`
    : '<div class="ghtk-topics"></div>';

  return `
    <div class="ghtk-about">
      <div class="ghtk-about-top">
        <div class="ghtk-about-desc">${desc ? escapeHtml(desc) : '<span style="font-style:italic">暂无简介</span>'}</div>
        <button class="ghtk-about-expand" id="ghtk-about-detail" type="button" data-ghtk-popover-trigger title="查看完整信息">${expandIcon}</button>
      </div>
      <div class="ghtk-about-meta">${metaItems.join('')}</div>
      ${topicsHtml}
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const UpstreamBindPlugin: Plugin = {
  id: 'upstream-bind',
  name: '上游/下游仓库绑定',
  version: '2.5.0',
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
          <div class="ghtk-search">
            ${ICONS.search}
            <input type="text" id="ghtk-search-input" placeholder="搜索绑定" autocomplete="off" spellcheck="false" />
          </div>
          <button class="ghtk-toolbar-btn" id="ghtk-add-toggle" type="button" title="添加上游">${ICONS.plus}</button>
        </div>
        <div class="ghtk-split">
          <div class="ghtk-rail">
            <div class="ghtk-rail-head">
              <span>上游</span>
              <span class="ghtk-rail-state" id="ghtk-rail-state"></span>
            </div>
            <div class="ghtk-rail-list" id="ghtk-rail-list"></div>
          </div>
          <div class="ghtk-detail" id="ghtk-detail"></div>
        </div>
      `;
    },
    mount(ctx, root) {
      const state: ViewState = {
        selected: -1,
        addMode: false,
        query: '',
        status: { text: '' },
        draft: '',
        about: new Map(),
        lastCommit: new Map(),
      };

      const railList = root.querySelector<HTMLElement>('#ghtk-rail-list');
      const railState = root.querySelector<HTMLElement>('#ghtk-rail-state');
      const detail = root.querySelector<HTMLElement>('#ghtk-detail');
      const addToggle = root.querySelector<HTMLElement>('#ghtk-add-toggle');
      const searchInput = root.querySelector<HTMLInputElement>('#ghtk-search-input');
      if (!railList || !detail || !railState) return;

      const currentUser = getCurrentUser(ctx.dom);
      const page = ctx.page;
      const currentRepo = page.owner && page.repo ? `${page.owner}/${page.repo}` : '';

      /** 当前仓库是这条绑定的上游（即正在浏览上游仓库本身） */
      const isUpstreamOfCurrent = (b: Binding) =>
        !!currentRepo && `${b.owner}/${b.repo}`.toLowerCase() === currentRepo.toLowerCase();

      /** 当前仓库是这条绑定的下游（即正在浏览某个 fork） */
      const isDownstreamOfCurrent = (b: Binding) =>
        !!currentRepo && (b.downstreams || []).some((d) => d.toLowerCase() === currentRepo.toLowerCase());

      /** 与当前仓库相关的绑定 */
      const isCurrent = (b: Binding) => isUpstreamOfCurrent(b) || isDownstreamOfCurrent(b);

      /** 默认选中：当前仓库本身是上游 → 优先；其次当前仓库是下游；否则第一条 */
      const pickDefault = () => {
        const list = loadBindings();
        let idx = list.findIndex(isUpstreamOfCurrent);
        if (idx < 0) idx = list.findIndex(isDownstreamOfCurrent);
        state.selected = idx >= 0 ? idx : list.length ? 0 : -1;
      };

      const renderStatus = () => {
        railState.textContent = state.status.text;
        railState.style.color = state.status.color || '';
      };

      const renderRail = () => {
        const list = loadBindings();
        const q = state.query.trim().toLowerCase();
        const rows = list
          .map((b, idx) => ({ b, idx }))
          .filter(({ b }) => !q || `${b.owner}/${b.repo}`.toLowerCase().includes(q));

        if (!list.length) {
          railList.innerHTML = `<div class="ghtk-rail-empty">暂无绑定<br>点上方 + 添加</div>`;
          return;
        }
        if (!rows.length) {
          railList.innerHTML = `<div class="ghtk-rail-empty">无匹配</div>`;
          return;
        }

        railList.innerHTML = rows
          .map(({ b, idx }) => {
            const hitUp = isUpstreamOfCurrent(b);
            const hitDown = isDownstreamOfCurrent(b);
            const related = hitUp || hitDown;
            const cls = [
              'ghtk-rail-item',
              idx === state.selected && !state.addMode ? 'active' : '',
              related ? 'related' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const tip = related ? (hitUp ? '当前仓库即此上游' : '当前仓库是它的下游') : `${b.owner}/${b.repo}`;
            return `
            <div class="${cls}" data-idx="${idx}" title="${tip}">
              <span class="ghtk-rail-name">${b.owner}/${b.repo}</span>
              ${related ? '<span class="ghtk-rail-dot" title="与当前页面相关"></span>' : ''}
              <span class="ghtk-rail-n">${(b.downstreams || []).length}</span>
            </div>
          `;
          })
          .join('');

        railList.querySelectorAll<HTMLElement>('.ghtk-rail-item').forEach((el) => {
          el.addEventListener('click', () => {
            state.selected = +el.dataset.idx!;
            state.addMode = false;
            addToggle?.classList.remove('active');
            renderRail();
            renderDetail();
          });
        });
      };

      const renderDetail = () => {
        const list = loadBindings();

        if (state.addMode) {
          renderAddView(list);
          return;
        }

        if (!list.length) {
          detail.innerHTML = `
            <div class="ghtk-detail-empty">
              <div>暂无绑定</div>
              <button class="ghtk-btn primary" id="ghtk-empty-add" type="button">添加上游</button>
            </div>
          `;
          detail.querySelector('#ghtk-empty-add')?.addEventListener('click', () => enterAddMode());
          return;
        }

        const b = list[state.selected];
        if (!b) {
          state.selected = 0;
          renderDetail();
          return;
        }

        const downs = b.downstreams || [];
        const full = `${b.owner}/${b.repo}`;
        const about = state.about.get(full.toLowerCase());
        const lastCommit = state.lastCommit.get(full.toLowerCase());
        const aboutHtml = renderAbout(about, full, lastCommit);
        const ownerText = `${b.owner}`;

        const rows = downs.length
          ? downs
              .map((d) => {
                // 该下游是否就是当前登录用户的 fork（或当前正在浏览的仓库）
                const isMine = !!currentUser && d.toLowerCase().startsWith(`${currentUser.toLowerCase()}/`);
                const isCurrentPage = !!currentRepo && d.toLowerCase() === currentRepo.toLowerCase();
                const tag = isCurrentPage
                  ? '<span class="ghtk-chip">当前仓库</span>'
                  : isMine
                    ? '<span class="ghtk-chip">我的 Fork</span>'
                    : '';
                return `
            <div class="ghtk-drow">
              <span class="ghtk-drow-dash">└</span>
              <a href="https://github.com/${d}" data-ghtk-nav title="打开下游 ${d}">${d}</a>
              ${tag}
              <button class="ghtk-icon-btn ghtk-drow-rm" data-remove="${d}" type="button" title="移除下游">${ICONS.del}</button>
            </div>
          `;
              })
              .join('')
          : `<div class="ghtk-dempty">无下游</div>`;

        detail.innerHTML = `
          <div class="ghtk-detail-head">
            <div class="ghtk-detail-title">
              <span class="name" title="${full}">${full}</span>
              ${isUpstreamOfCurrent(b) ? '<span class="ghtk-chip">当前仓库</span>' : ''}
            </div>
            <div class="ghtk-detail-sub">
              <span>上游所有者 <b>${ownerText}</b></span>
              <span>${
                currentUser
                  ? `当前用户 <b>${currentUser}</b>`
                  : '<span style="color:#cf222e">未登录</span>'
              }</span>
            </div>
          </div>

          ${aboutHtml}

          <div class="ghtk-detail-body">
            <div class="ghtk-sec-label">下游 · ${downs.length}</div>
            ${rows}
          </div>

          <div class="ghtk-detail-foot">
            <div class="ghtk-foot-main">
              <button class="ghtk-btn primary" id="ghtk-auto-bind" type="button">绑定下游</button>
              <button class="ghtk-btn" id="ghtk-manual-bind" type="button">手动绑定</button>
            </div>
            <div class="ghtk-foot-main ghtk-foot-second">
              <a class="ghtk-btn" href="https://github.com/${full}" data-ghtk-nav>打开上游</a>
              <button class="ghtk-btn" id="ghtk-copy-up" type="button">复制链接</button>
              <button class="ghtk-btn danger" id="ghtk-remove-up" type="button">删除</button>
            </div>
          </div>
        `;

        // about 完整信息气泡
        detail.querySelector('#ghtk-about-detail')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const data = state.about.get(full.toLowerCase());
          if (!data) {
            // 数据还没回来（或请求失败），给出反馈而不是静默无响应
            ctx.ui.toast(state.about.has(full.toLowerCase()) ? '无仓库信息' : '正在加载…');
            return;
          }
          const anchor = ev.currentTarget as HTMLElement;
          const lastCommitDate = state.lastCommit.get(full.toLowerCase());
          showAboutPopover({
            about: data,
            anchor,
            pageType: page.type,
            extraMeta: [
              [
                '最近推送',
                data.updatedAt
                  ? `${formatDate(data.updatedAt)}（${relativeTime(data.updatedAt)}）`
                  : '—',
              ],
              ['最后提交', lastCommitDate ? `${formatDate(lastCommitDate)}（${relativeTime(lastCommitDate)}）` : '—'],
            ],
            actions: [
              { label: '打开仓库', href: `https://github.com/${full}` },
              {
                label: '复制链接',
                onClick: () => {
                  navigator.clipboard
                    .writeText(`https://github.com/${full}`)
                    .then(() => ctx.ui.toast('已复制'))
                    .catch(() => ctx.ui.toast('复制失败'));
                },
              },
            ],
          });
        });

        // 移除下游（二次确认）
        detail.querySelectorAll<HTMLElement>('[data-remove]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const down = btn.dataset.remove!;
            const ok = await Modal.show({
              title: '移除下游',
              content: `从 <b>${full}</b> 的下游中移除 <b>${down}</b>？`,
              confirmText: '移除',
              cancelText: '取消',
              danger: true,
            });
            if (!ok) return;
            const latest = loadBindings();
            if (!latest[state.selected]) return;
            latest[state.selected].downstreams = (latest[state.selected].downstreams || []).filter(
              (x) => x !== down
            );
            saveBindings(latest);
            renderRail();
            renderDetail();
            ctx.ui.toast('已移除');
          });
        });

        // 自动绑定下游（检测我的 fork）
        detail.querySelector('#ghtk-auto-bind')?.addEventListener('click', async () => {
          if (!currentUser) {
            ctx.ui.toast('未登录');
            return;
          }
          const target = loadBindings()[state.selected];
          if (!target) return;
          ctx.ui.toast('正在检测…');
          const forkUrl = await checkHasForked(currentUser, target.owner, target.repo);
          const latest = loadBindings();
          const cur = latest[state.selected];
          if (!cur) return;
          if (forkUrl) {
            const down = `${currentUser}/${cur.repo}`;
            cur.downstreams = cur.downstreams || [];
            if (!cur.downstreams.includes(down)) {
              cur.downstreams.push(down);
              saveBindings(latest);
              renderRail();
              renderDetail();
              ctx.ui.toast('已绑定 ' + down);
            } else {
              ctx.ui.toast('已存在');
            }
          } else {
            ctx.ui.toast('未检测到 Fork');
          }
        });

        // 手动绑定下游
        detail.querySelector('#ghtk-manual-bind')?.addEventListener('click', async () => {
          const val = await Modal.show({
            title: '绑定下游',
            showInput: true,
            inputValue: currentUser ? `${currentUser}/` : '',
            placeholder: 'owner/repo',
            confirmText: '绑定',
          });
          if (!val) return;
          const cleaned = String(val).trim().replace(/^https?:\/\/github\.com\//i, '');
          if (!cleaned.includes('/')) {
            ctx.ui.toast('格式错误');
            return;
          }
          const latest = loadBindings();
          const cur = latest[state.selected];
          if (!cur) return;
          cur.downstreams = cur.downstreams || [];
          if (!cur.downstreams.includes(cleaned)) {
            cur.downstreams.push(cleaned);
            saveBindings(latest);
            renderRail();
            renderDetail();
            ctx.ui.toast('已绑定 ' + cleaned);
          } else {
            ctx.ui.toast('已存在');
          }
        });

        // 复制上游链接
        detail.querySelector('#ghtk-copy-up')?.addEventListener('click', () => {
          navigator.clipboard
            .writeText(`https://github.com/${full}`)
            .then(() => ctx.ui.toast('已复制'))
            .catch(() => ctx.ui.toast('复制失败'));
        });

        // 删除整条绑定
        detail.querySelector('#ghtk-remove-up')?.addEventListener('click', async () => {
          const ok = await Modal.show({
            title: '删除绑定',
            content: `删除上游 <b>${full}</b> 及其全部下游记录？`,
            confirmText: '删除',
            cancelText: '取消',
            danger: true,
          });
          if (!ok) return;
          const latest = loadBindings();
          latest.splice(state.selected, 1);
          saveBindings(latest);
          pickDefault();
          renderRail();
          renderDetail();
          ctx.ui.toast('已删除');
        });

        // 按需加载 about（命中持久缓存则立即渲染，不显示加载态）
        loadAbout(b);
        // 按需加载最后提交时间
        loadCommitTime(b);
      };

      /** 读取 about：内存 → GM 持久缓存 → 网络，过期时先渲染旧值再后台刷新 */
      const loadAbout = (b: Binding) => {
        const key = `${b.owner}/${b.repo}`.toLowerCase();
        if (state.about.has(key)) return;

        loadRepoAbout(b.owner, b.repo, (data) => {
          state.about.set(key, data);
          // 仅当当前选中的还是这一条时才刷新，避免切走后又闪回
          const cur = loadBindings()[state.selected];
          if (!cur) return;
          if (`${cur.owner}/${cur.repo}`.toLowerCase() === key) renderDetail();
        });
      };

      /** 读取默认分支最后提交时间，回调后局部刷新详情 */
      const loadCommitTime = (b: Binding) => {
        const key = `${b.owner}/${b.repo}`.toLowerCase();
        if (state.lastCommit.has(key)) return;

        loadLastCommit(b.owner, b.repo, (date) => {
          state.lastCommit.set(key, date);
          const cur = loadBindings()[state.selected];
          if (!cur) return;
          if (`${cur.owner}/${cur.repo}`.toLowerCase() === key) renderDetail();
        });
      };

      const enterAddMode = () => {
        state.addMode = true;
        state.draft = '';
        addToggle?.classList.add('active');
        renderRail();
        renderDetail();
      };

      const exitAddMode = () => {
        state.addMode = false;
        addToggle?.classList.remove('active');
        renderRail();
        renderDetail();
      };

      const renderAddView = (list: Binding[]) => {
        const st = state.status;
        const detected = st.fullName && st.owner && st.repo;
        const alreadyBound = detected && st.bound;

        detail.innerHTML = `
          <div class="ghtk-addview">
            <div class="ghtk-addview-head">
              <div class="ghtk-addview-title">添加上游</div>
              <div class="ghtk-addview-sub">owner/repo 或完整链接</div>
            </div>
            <div class="ghtk-addview-body">
              <label class="ghtk-field-label" for="ghtk-upstream-input">仓库</label>
              <div class="ghtk-field">
                <input type="text" id="ghtk-upstream-input" placeholder="owner/repo" value="${state.draft.replace(/"/g, '&quot;')}" />
                <button class="ghtk-btn primary" id="ghtk-add-upstream" type="button">添加</button>
              </div>
              <div class="ghtk-hint">也支持粘贴 https://github.com/owner/repo</div>
              ${
                detected && !alreadyBound
                  ? `
                <div class="ghtk-detect">
                  <div class="ghtk-detect-label">检测到当前仓库上游</div>
                  <div class="ghtk-detect-repo" title="${st.fullName}">${st.fullName}</div>
                  <div class="ghtk-detect-actions">
                    <button class="ghtk-btn primary" id="ghtk-oneclick-bind" type="button">绑定为下游</button>
                    <a class="ghtk-btn" href="https://github.com/${st.fullName}" data-ghtk-nav>打开</a>
                  </div>
                </div>
              `
                  : detected && alreadyBound
                    ? `<div class="ghtk-note">当前仓库已绑定上游 ${st.fullName}</div>`
                    : st.text === '检测失败'
                      ? `<div class="ghtk-note">无法获取仓库信息</div>`
                      : st.text === '无上游'
                        ? `<div class="ghtk-note">当前仓库不是 Fork，没有上游</div>`
                        : ''
              }
              ${list.length === 0 ? '' : ''}
            </div>
            <div class="ghtk-addview-foot">
              <button class="ghtk-btn" id="ghtk-add-cancel" type="button">取消</button>
            </div>
          </div>
        `;

        const input = detail.querySelector<HTMLInputElement>('#ghtk-upstream-input');
        input?.focus();

        detail.querySelector('#ghtk-add-cancel')?.addEventListener('click', () => exitAddMode());

        const submit = () => {
          const val = (input?.value || '').trim().replace(/^https?:\/\/github\.com\//i, '');
          if (!val || !val.includes('/')) {
            ctx.ui.toast('格式错误');
            return;
          }
          const [owner, repo] = val.split('/');
          if (!owner || !repo) {
            ctx.ui.toast('格式错误');
            return;
          }
          const latest = loadBindings();
          const key = `${owner}/${repo}`.toLowerCase();
          if (latest.some((b) => `${b.owner}/${b.repo}`.toLowerCase() === key)) {
            ctx.ui.toast('已存在');
            return;
          }
          latest.push({ owner, repo, downstreams: [], createdAt: Date.now() });
          saveBindings(latest);
          state.selected = latest.length - 1;
          state.addMode = false;
          addToggle?.classList.remove('active');
          renderRail();
          renderDetail();
          ctx.ui.toast('已添加 ' + owner + '/' + repo);
        };

        detail.querySelector('#ghtk-add-upstream')?.addEventListener('click', submit);
        input?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') submit();
        });

        // 一键绑定检测到的上游
        detail.querySelector('#ghtk-oneclick-bind')?.addEventListener('click', () => {
          if (!st.owner || !st.repo || !st.fullName) return;
          const latest = loadBindings();
          let binding = latest.find(
            (x) =>
              x.owner.toLowerCase() === st.owner!.toLowerCase() &&
              x.repo.toLowerCase() === st.repo!.toLowerCase()
          );
          if (!binding) {
            binding = { owner: st.owner, repo: st.repo, downstreams: [], createdAt: Date.now() };
            latest.push(binding);
          }
          binding.downstreams = binding.downstreams || [];
          if (currentRepo && !binding.downstreams.includes(currentRepo)) {
            binding.downstreams.push(currentRepo);
          }
          saveBindings(latest);
          state.selected = latest.indexOf(binding);
          state.addMode = false;
          state.status = { ...st, bound: true };
          addToggle?.classList.remove('active');
          renderStatus();
          renderRail();
          renderDetail();
          ctx.ui.toast('已绑定 ' + (currentRepo || st.fullName));
        });
      };

      // 搜索
      searchInput?.addEventListener('input', () => {
        state.query = searchInput.value;
        renderRail();
      });

      // 添加上游开关
      addToggle?.addEventListener('click', () => {
        if (state.addMode) exitAddMode();
        else enterAddMode();
      });

      pickDefault();
      renderStatus();
      renderRail();
      renderDetail();

      // 检测当前仓库上游（状态显示在左栏标题右侧）
      if (page.owner && page.repo) {
        state.status = { text: '检测中…' };
        renderStatus();
        detectUpstream(page, currentUser).then((st) => {
          state.status = st;
          renderStatus();
          if (state.addMode) renderDetail();
        });
      }
    },
  },
};

async function detectUpstream(page: PageContext, currentUser: string | null): Promise<UpstreamStatus> {
  const owner = page.owner!;
  const repo = page.repo!;
  const info = await fetchRepoInfo(owner, repo);
  if (!info) return { text: '检测失败', color: '#cf222e' };

  const upstream = info.parent || info.source;
  if (!info.fork || !upstream) return { text: '无上游' };

  const currentFull = `${owner}/${repo}`;
  const bindings = loadBindings();
  const bound = bindings.some(
    (b) =>
      b.owner.toLowerCase() === upstream.owner.toLowerCase() &&
      b.repo.toLowerCase() === upstream.repo.toLowerCase() &&
      (b.downstreams || []).includes(currentFull)
  );

  return {
    text: bound ? '已绑定' : '未绑定',
    color: bound ? '#1a7f37' : undefined,
    fullName: upstream.full_name,
    owner: upstream.owner,
    repo: upstream.repo,
    bound,
  };
}
