import type { Binding, PageContext, Plugin, PluginContext } from '../types';
import { Modal } from '../core/modal';
import { checkHasForked, fetchRepoInfo, getCurrentUser } from '../core/github-api';

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
  copy: `<svg viewBox="0 0 16 16"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25ZM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>`,
  del: `<svg viewBox="0 0 16 16"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>`,
  open: `<svg viewBox="0 0 16 16"><path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2Zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.75.75 0 0 1-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1Z"/></svg>`,
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
        const rows = downs.length
          ? downs
              .map(
                (d) => `
            <div class="ghtk-drow">
              <span class="ghtk-drow-dash">└</span>
              <a href="https://github.com/${d}" target="_blank" title="${d}">${d}</a>
              <button class="ghtk-icon-btn ghtk-drow-rm" data-remove="${d}" type="button" title="移除">${ICONS.del}</button>
            </div>
          `
              )
              .join('')
          : `<div class="ghtk-dempty">无下游</div>`;

        detail.innerHTML = `
          <div class="ghtk-detail-head">
            <div class="ghtk-detail-title">
              <span class="name" title="${full}">${full}</span>
              ${
                isUpstreamOfCurrent(b)
                  ? '<span class="ghtk-chip">当前仓库</span>'
                  : isDownstreamOfCurrent(b)
                    ? '<span class="ghtk-chip">我的 Fork</span>'
                    : ''
              }
            </div>
            <div class="ghtk-detail-sub">
              <span>页面 <b><code>${page.type}</code></b></span>
              ${currentUser ? `<span>用户 <b>${currentUser}</b></span>` : '<span style="color:#cf222e">未登录</span>'}
            </div>
          </div>

          <div class="ghtk-detail-body">
            <div class="ghtk-sec-label">下游 · ${downs.length}</div>
            ${rows}
          </div>

          <div class="ghtk-detail-foot">
            <div class="ghtk-foot-main">
              <button class="ghtk-btn primary" id="ghtk-auto-bind" type="button">绑定下游</button>
              <a class="ghtk-btn" href="https://github.com/${full}" target="_blank">打开上游</a>
            </div>
            <div class="ghtk-foot-icons">
              <button class="ghtk-icon-btn" id="ghtk-manual-bind" type="button" title="手动绑定下游">${ICONS.plus}</button>
              <button class="ghtk-icon-btn" id="ghtk-copy-up" type="button" title="复制上游链接">${ICONS.copy}</button>
              <div class="ghtk-foot-spacer"></div>
              <button class="ghtk-icon-btn danger" id="ghtk-remove-up" type="button" title="删除绑定">${ICONS.del}</button>
            </div>
          </div>
        `;

        // 移除下游
        detail.querySelectorAll<HTMLElement>('[data-remove]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const down = btn.dataset.remove!;
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
            title: '删除',
            content: `删除 <b>${full}</b>？`,
            confirmText: '删除',
            cancelText: '取消',
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
                    <a class="ghtk-btn" href="https://github.com/${st.fullName}" target="_blank">打开</a>
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
