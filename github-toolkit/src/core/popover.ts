import { injectGlobalStyles, getRoot } from './styles';
import { pushLayer } from './layers';
import { ICON } from './icons';
import { escapeHtml, compactNum } from './html';
import type { RepoAbout } from './github-api';

export interface AboutPopoverOptions {
  about: RepoAbout;
  anchor: HTMLElement;
  /** 追加到信息网格末尾的行（如最近推送 / 最后提交） */
  extraMeta?: Array<[string, string]>;
  /** 气泡关闭后回调（调用方用它补做被推迟的重绘） */
  onClose?: () => void;
}

interface OpenPopover {
  el: HTMLElement;
  anchor: HTMLElement;
  key: string;
  release: () => void;
  cleanup: () => void;
  onClose?: () => void;
}

let current: OpenPopover | null = null;

export function isPopoverOpen(): boolean {
  return !!current;
}

/** 关闭当前气泡 */
export function closePopover(): void {
  if (!current) return;
  const p = current;
  current = null;
  const hadFocus = p.el.contains(document.activeElement);
  p.cleanup();
  p.release();
  p.el.remove();
  p.anchor.setAttribute('aria-expanded', 'false');
  if (hadFocus && p.anchor.isConnected) p.anchor.focus({ preventScroll: true });
  p.onClose?.();
}

/** 展示仓库 about 气泡：宽度跟面板走、内部滚动、锚定触发按钮；再点一次同一按钮收起 */
export function showAboutPopover({ about, anchor, extraMeta = [], onClose }: AboutPopoverOptions): void {
  injectGlobalStyles();
  const key = about.full_name.toLowerCase();
  if (current && current.key === key) {
    closePopover();
    return;
  }
  closePopover();

  const rows: Array<[string, string]> = [
    ['主语言', about.language || '—'],
    ['Star', compactNum(about.stars)],
    ['Fork', compactNum(about.forks)],
    ['许可证', about.license || '—'],
    ['未关闭 Issue/PR', String(about.openIssues)],
    ...extraMeta,
  ];
  const desc = about.description?.trim() || '暂无简介';
  const topics = about.topics.length
    ? `<div class="ghtk-pop-group">
         <div class="ghtk-pop-sec">主题 · ${about.topics.length}</div>
         <div class="ghtk-pop-topics">${about.topics.map((t) => `<span class="ghtk-topic">${escapeHtml(t)}</span>`).join('')}</div>
       </div>`
    : '';
  const homeRaw = (about.homepage || '').trim();
  const homeHref = homeRaw ? (/^https?:\/\//i.test(homeRaw) ? homeRaw : 'https://' + homeRaw) : '';
  const home =
    homeHref && /^https?:\/\/[^\s"'<>]+$/i.test(homeHref)
      ? `<div class="ghtk-pop-group">
           <div class="ghtk-pop-sec">主页</div>
           <a class="ghtk-pop-home" href="${escapeHtml(homeHref)}" target="_blank" rel="noreferrer">${escapeHtml(
             homeHref.replace(/^https?:\/\//i, '')
           )}</a>
         </div>`
      : '';

  const el = document.createElement('div');
  el.className = 'ghtk-popover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', about.full_name);
  el.innerHTML = `
    <div class="ghtk-pop-arrow" aria-hidden="true"></div>
    <div class="ghtk-pop-inner">
      <div class="ghtk-pop-head">
        <div class="ghtk-pop-title" title="${escapeHtml(about.full_name)}">${escapeHtml(about.full_name)}</div>
        <button class="ghtk-icon-btn ghtk-pop-close" type="button" title="关闭" aria-label="关闭">${ICON.x}</button>
      </div>
      <div class="ghtk-pop-body">
        <div class="ghtk-pop-desc">${escapeHtml(desc)}</div>
        <div class="ghtk-pop-grid">
          ${rows
            .map(
              ([k, v]) => `<div class="ghtk-pop-cell">
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
    </div>
  `;
  getRoot().appendChild(el);

  // 宽度跟面板走（左右各留 8px），高度不超过面板；放不下时贴边并隐藏箭头
  const panel = document.querySelector<HTMLElement>('.ghtk-panel');
  const b = panel
    ? panel.getBoundingClientRect()
    : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  const margin = 8;
  const gap = 8;
  const pw = Math.max(240, Math.min(384, b.width - margin * 2));
  el.style.setProperty('width', pw + 'px', 'important');
  el.style.setProperty('max-height', Math.max(200, b.height - margin * 2) + 'px', 'important');
  const ph = el.offsetHeight;
  const a = anchor.getBoundingClientRect();

  const left = Math.min(Math.max(b.left + margin, a.left + a.width / 2 - pw / 2), b.right - pw - margin);
  let top: number;
  let arrow: 'up' | 'down' | null;
  if (a.bottom + gap + ph <= b.bottom - margin) {
    top = a.bottom + gap;
    arrow = 'up';
  } else if (a.top - gap - ph >= b.top + margin) {
    top = a.top - gap - ph;
    arrow = 'down';
  } else {
    top = Math.max(b.top + margin, b.bottom - margin - ph);
    arrow = null;
  }
  el.style.setProperty('left', left + 'px', 'important');
  el.style.setProperty('top', top + 'px', 'important');

  const arrowEl = el.querySelector<HTMLElement>('.ghtk-pop-arrow');
  if (arrowEl) {
    if (arrow) {
      arrowEl.classList.add(arrow);
      const ax = Math.min(Math.max(14, a.left + a.width / 2 - left - 5), pw - 24);
      arrowEl.style.setProperty('left', ax + 'px', 'important');
    } else {
      arrowEl.remove();
    }
  }

  el.querySelector('.ghtk-pop-close')?.addEventListener('click', () => closePopover());

  let alive = true;
  const onDown = (e: PointerEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t || el.contains(t) || anchor.contains(t)) return;
    if (t.closest('[data-ghtk-popover-trigger]')) return;
    closePopover();
  };
  // 推迟绑定，避免打开气泡的这次点击立刻把它关掉
  setTimeout(() => {
    if (alive) document.addEventListener('pointerdown', onDown, true);
  }, 0);

  const p: OpenPopover = {
    el,
    anchor,
    key,
    onClose,
    release: () => {},
    cleanup: () => {
      alive = false;
      document.removeEventListener('pointerdown', onDown, true);
    },
  };
  current = p;
  p.release = pushLayer('transient', () => closePopover());
  anchor.setAttribute('aria-expanded', 'true');
  el.querySelector<HTMLElement>('.ghtk-pop-close')?.focus({ preventScroll: true });
}
