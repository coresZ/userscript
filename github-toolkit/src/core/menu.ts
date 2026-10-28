import { injectGlobalStyles, getRoot } from './styles';
import { pushLayer } from './layers';
import { escapeHtml } from './html';

export interface MenuItem {
  label: string;
  danger?: boolean;
  onSelect: () => void;
}

interface OpenMenu {
  el: HTMLElement;
  anchor: HTMLElement;
  release: () => void;
  cleanup: () => void;
}

let current: OpenMenu | null = null;

/** 关闭当前下拉菜单；restoreFocus 为 true 时焦点回到触发按钮 */
export function closeMenu(restoreFocus = true): void {
  if (!current) return;
  const m = current;
  current = null;
  const hadFocus = m.el.contains(document.activeElement);
  m.cleanup();
  m.release();
  m.el.remove();
  m.anchor.setAttribute('aria-expanded', 'false');
  if (restoreFocus && hadFocus && m.anchor.isConnected) m.anchor.focus({ preventScroll: true });
}

/** 在触发按钮下方弹出菜单；再次点击同一按钮收起 */
export function showMenu(anchor: HTMLElement, items: MenuItem[]): void {
  if (current && current.anchor === anchor) {
    closeMenu();
    return;
  }
  closeMenu(false);
  injectGlobalStyles();

  const el = document.createElement('div');
  el.className = 'ghtk-menu';
  el.setAttribute('role', 'menu');
  el.innerHTML = items
    .map(
      (it, i) =>
        `<button class="ghtk-menu-item${it.danger ? ' danger' : ''}" type="button" role="menuitem" tabindex="-1" data-i="${i}">${escapeHtml(
          it.label
        )}</button>`
    )
    .join('');
  getRoot().appendChild(el);

  // 定位：锚点下方右对齐；下方放不下就翻到上方
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const margin = 8;
  const left = Math.min(Math.max(margin, r.right - w), window.innerWidth - w - margin);
  let top = r.bottom + 4;
  if (top + h > window.innerHeight - margin) top = Math.max(margin, r.top - h - 4);
  el.style.setProperty('left', left + 'px', 'important');
  el.style.setProperty('top', top + 'px', 'important');

  const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('.ghtk-menu-item'));
  const focusAt = (i: number) => buttons[(i + buttons.length) % buttons.length]?.focus({ preventScroll: true });

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.ghtk-menu-item');
    if (!b) return;
    const item = items[Number(b.dataset.i)];
    closeMenu();
    item?.onSelect();
  });

  el.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusAt(i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusAt(buttons.length - 1);
    } else if (e.key === 'Tab') {
      closeMenu(false);
    }
  });

  let alive = true;
  const onDown = (e: PointerEvent) => {
    const t = e.target as Node | null;
    if (!t || el.contains(t) || anchor.contains(t)) return;
    closeMenu(false);
  };
  // 推迟绑定，避免打开菜单的这次点击立刻把它关掉
  setTimeout(() => {
    if (alive) document.addEventListener('pointerdown', onDown, true);
  }, 0);

  const m: OpenMenu = {
    el,
    anchor,
    release: () => {},
    cleanup: () => {
      alive = false;
      document.removeEventListener('pointerdown', onDown, true);
    },
  };
  current = m;
  m.release = pushLayer('transient', () => closeMenu());
  anchor.setAttribute('aria-expanded', 'true');
  focusAt(0);
}
