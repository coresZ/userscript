import { injectGlobalStyles, getRoot } from './styles';
import type { RepoAbout } from './github-api';

const POPOVER_CLASS = 'ghtk-popover';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compactNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n / 1000) + 'k';
}

export interface PopoverAction {
  label: string;
  primary?: boolean;
  href?: string;
  onClick?: () => void;
}

export interface AboutPopoverOptions {
  about: RepoAbout;
  anchor: HTMLElement;
  pageType?: string;
  /** 追加到元信息网格末尾的自定义行（如最近推送 / 最后提交） */
  extraMeta?: Array<[string, string]>;
  actions?: PopoverAction[];
}

/** 关闭当前打开的气泡 */
export function closePopover(): void {
  document.querySelectorAll('.' + POPOVER_CLASS).forEach((el) => el.remove());
  document.removeEventListener('keydown', onDocKey);
  document.removeEventListener('mousedown', onDocDown, true);
}

const onDocKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') closePopover();
};

const onDocDown = (e: MouseEvent) => {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  if (t.closest('.' + POPOVER_CLASS)) return;
  if (t.closest('[data-ghtk-popover-trigger]')) return;
  closePopover();
};

/** 展示仓库 about 气泡：固定尺寸、内部滚动、锚定触发按钮 */
export function showAboutPopover({ about, anchor, pageType, extraMeta = [], actions = [] }: AboutPopoverOptions): void {
  injectGlobalStyles();
  const already = document.querySelector('.' + POPOVER_CLASS);
  const sameAnchor = already?.getAttribute('data-anchor') === about.full_name;
  closePopover();
  if (already && sameAnchor) return; // 再点一次 = 收起

  const desc = about.description?.trim() || '暂无简介';
  const metaRows: Array<[string, string]> = [
    ['页面', pageType || '—'],
    ['主语言', about.language || '—'],
    ['Star', compactNum(about.stars)],
    ['Fork', compactNum(about.forks)],
    ['License', about.license || '—'],
    ['Open Issues', String(about.openIssues)],
    ...extraMeta,
  ];

  const topics = about.topics.length
    ? `<div class="ghtk-pop-sec">Topics · ${about.topics.length}</div>
       <div class="ghtk-pop-topics">${about.topics
         .map((t) => `<span class="ghtk-topic">${escapeHtml(t)}</span>`)
         .join('')}</div>`
    : '';

  const home = about.homepage
    ? `<div class="ghtk-pop-sec">主页</div>
       <div class="ghtk-pop-home"><a href="${escapeHtml(about.homepage)}" target="_blank" rel="noreferrer">${escapeHtml(
         about.homepage.replace(/^https?:\/\//, '')
       )}</a></div>`
    : '';

  const footHtml = actions.length
    ? `<div class="ghtk-pop-foot">${actions
        .map((a, i) => {
          if (a.href) {
            return `<a class="ghtk-btn ${a.primary ? 'primary' : ''}" data-act="${i}" href="${escapeHtml(
              a.href
            )}" target="_blank" rel="noreferrer">${escapeHtml(a.label)}</a>`;
          }
          return `<button class="ghtk-btn ${a.primary ? 'primary' : ''}" data-act="${i}" type="button">${escapeHtml(
            a.label
          )}</button>`;
        })
        .join('')}</div>`
    : '';

  const el = document.createElement('div');
  el.className = POPOVER_CLASS;
  el.setAttribute('data-anchor', about.full_name);
  el.innerHTML = `
    <div class="ghtk-pop-arrow"></div>
    <div class="ghtk-pop-head">
      <div class="ghtk-pop-title" title="${escapeHtml(about.full_name)}">${escapeHtml(about.full_name)}</div>
      <button class="ghtk-icon-btn ghtk-pop-close" type="button" title="关闭">✕</button>
    </div>
    <div class="ghtk-pop-body">
      <div class="ghtk-pop-desc">${escapeHtml(desc)}</div>
      <div class="ghtk-pop-grid">
        ${metaRows
          .map(
            ([k, v]) => `
          <div class="ghtk-pop-cell">
            <div class="ghtk-pop-k">${escapeHtml(k)}</div>
            <div class="ghtk-pop-v" title="${escapeHtml(v)}">${escapeHtml(v)}</div>
          </div>`
          )
          .join('')}
      </div>
      ${topics}
      ${home}
      ${about.archived ? '<div class="ghtk-pop-note">该仓库已归档</div>' : ''}
    </div>
    ${footHtml}
  `;

  getRoot().appendChild(el);

  // 定位：锚点下方居中，空间不足翻转/贴边
  const rect = anchor.getBoundingClientRect();
  const gap = 8;
  const margin = 8;
  const panel = document.querySelector<HTMLElement>('.ghtk-panel');
  const panelRect = panel?.getBoundingClientRect() ?? null;

  // 气泡宽度自适应：优先不超出面板边界，最小 240、最大 328
  const maxByPanel = panelRect ? Math.max(240, panelRect.width - margin * 2) : 328;
  const pw = Math.min(328, maxByPanel);
  el.style.width = pw + 'px';

  const ph = el.offsetHeight || 320;

  const bounds = panelRect
    ? { left: panelRect.left, top: panelRect.top, right: panelRect.right, bottom: panelRect.bottom }
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };

  let left = rect.left + rect.width / 2 - pw / 2;
  left = Math.min(Math.max(bounds.left + margin, left), Math.max(bounds.left + margin, bounds.right - pw - margin));

  let top = rect.bottom + gap;
  let flipUp = false;
  if (top + ph > bounds.bottom - margin) {
    top = rect.top - ph - gap;
    flipUp = true;
    if (top < bounds.top + margin) {
      top = Math.max(bounds.top + margin, bounds.bottom - ph - margin);
    }
  }

  el.style.left = left + 'px';
  el.style.top = top + 'px';

  // 箭头对准锚点中心
  const arrow = el.querySelector<HTMLElement>('.ghtk-pop-arrow');
  if (arrow) {
    const ax = Math.min(Math.max(12, rect.left + rect.width / 2 - left - 5), pw - 22);
    arrow.style.left = ax + 'px';
    if (flipUp) {
      arrow.classList.add('up');
      arrow.style.top = 'auto';
      arrow.style.bottom = '-6px';
    }
  }

  el.querySelector('.ghtk-pop-close')?.addEventListener('click', () => closePopover());

  actions.forEach((a, i) => {
    el.querySelector(`[data-act="${i}"]`)?.addEventListener('click', (e) => {
      if (!a.onClick) return;
      e.preventDefault();
      a.onClick();
      closePopover();
    });
  });

  // 延迟绑定全局关闭，避免当前这次点击立刻触发
  setTimeout(() => {
    document.addEventListener('keydown', onDocKey);
    document.addEventListener('mousedown', onDocDown, true);
  }, 0);
}
