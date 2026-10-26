import { injectGlobalStyles, getRoot } from './styles';
import { Logger } from './logger';

const FAB_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M15 2.75a.75.75 0 0 1-.75.75h-4a.75.75 0 0 1 0-1.5h4a.75.75 0 0 1 .75.75Zm-8.5.75v1.25a.75.75 0 0 0 1.5 0v-4a.75.75 0 0 0-1.5 0V2H1.75a.75.75 0 0 0 0 1.5H6.5Zm1.25 5.5a.75.75 0 0 0 0-1.5h-6a.75.75 0 0 0 0 1.5h6ZM15 8a.75.75 0 0 1-.75.75H11.5V10a.75.75 0 1 1-1.5 0V6a.75.75 0 0 1 1.5 0v1.25h2.75A.75.75 0 0 1 15 8Zm-9 5.25v-2a.75.75 0 0 0-1.5 0v1.25H1.75a.75.75 0 1 0 0 1.5H4.5v1.25a.75.75 0 0 0 1.5 0v-2Zm9 2v-2.25a.75.75 0 0 0-1.5 0V15h-4a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 .75-.75v-1.5Z"/></svg>`;

/** 云图标（stroke 风格，currentColor 描边） */
const CLOUD_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;

const FAB_POS_KEY = 'fab-position';
const FAB_SIZE = 48;
const FAB_MARGIN = 8;
/** 拖动超过该距离才算拖拽，否则视为点击 */
const DRAG_THRESHOLD = 4;

interface FabPosition {
  left: number;
  top: number;
}

export class UIManager {
  panel: HTMLElement | null = null;
  private fab: HTMLButtonElement | null = null;
  private fabPos: FabPosition | null = null;
  private suppressClick = false;
  /** 由主程序注入：点击悬浮球时切换面板 */
  onFabToggle: () => void = () => {};
  /** 由主程序注入：点击标题栏云图标时打开云端备份面板 */
  onCloudClick: () => void = () => {};

  createFab(): void {
    if (this.fab && document.body.contains(this.fab)) return;
    injectGlobalStyles();
    document.querySelectorAll('.ghtk-fab').forEach((el) => el.remove());

    this.fab = document.createElement('button');
    this.fab.className = 'ghtk-fab';
    this.fab.type = 'button';
    this.fab.title = 'GitHub Toolkit（可拖动）';
    this.fab.setAttribute('aria-label', 'GitHub Toolkit');
    this.fab.innerHTML = FAB_ICON;

    this.fab.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // 刚刚拖动过，不当作点击
        if (this.suppressClick) {
          this.suppressClick = false;
          return;
        }
        try {
          this.onFabToggle();
        } catch (err) {
          Logger.error('FAB click error:', err);
          this.toast('打开面板失败');
        }
      },
      true
    );

    getRoot().appendChild(this.fab);
    this.restoreFabPosition();
    this.enableFabDrag();
    window.addEventListener('resize', () => this.clampFabPosition(), { passive: true });
  }

  /** 读取并应用上次拖拽的位置 */
  private restoreFabPosition(): void {
    const saved = GM_getValue(FAB_POS_KEY, null) as FabPosition | null;
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      this.applyFabPosition(saved);
    }
  }

  private applyFabPosition(pos: FabPosition): void {
    if (!this.fab) return;
    const clamped = this.clamp(pos);
    this.fabPos = clamped;
    this.fab.style.left = clamped.left + 'px';
    this.fab.style.top = clamped.top + 'px';
    this.fab.style.right = 'auto';
    this.fab.style.bottom = 'auto';
  }

  private clamp(pos: FabPosition): FabPosition {
    const maxLeft = Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN);
    const maxTop = Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN);
    return {
      left: Math.min(Math.max(FAB_MARGIN, pos.left), maxLeft),
      top: Math.min(Math.max(FAB_MARGIN, pos.top), maxTop),
    };
  }

  /** 视口变化后把悬浮球拉回可见区域 */
  private clampFabPosition(): void {
    if (!this.fabPos || !this.fab) return;
    const next = this.clamp(this.fabPos);
    if (next.left !== this.fabPos.left || next.top !== this.fabPos.top) {
      this.applyFabPosition(next);
    }
  }

  private enableFabDrag(): void {
    const fab = this.fab;
    if (!fab) return;

    fab.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const rect = fab.getBoundingClientRect();
      const start = {
        x: e.clientX,
        y: e.clientY,
        left: rect.left,
        top: rect.top,
      };
      let dragging = false;

      try {
        fab.setPointerCapture(e.pointerId);
      } catch {
        /* 忽略：部分环境不支持 */
      }

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
        fab.classList.add('dragging');
        this.applyFabPosition({ left: start.left + dx, top: start.top + dy });
      };

      const onUp = (ev: PointerEvent) => {
        fab.removeEventListener('pointermove', onMove);
        fab.removeEventListener('pointerup', onUp);
        fab.removeEventListener('pointercancel', onUp);
        fab.classList.remove('dragging');
        try {
          fab.releasePointerCapture(ev.pointerId);
        } catch {
          /* 忽略 */
        }
        if (dragging) {
          this.suppressClick = true;
          if (this.fabPos) {
            GM_setValue(FAB_POS_KEY, this.fabPos);
            // 面板开着就跟着移动
            if (this.panel) this.placePanelNearFab();
          }
        }
      };

      fab.addEventListener('pointermove', onMove);
      fab.addEventListener('pointerup', onUp);
      fab.addEventListener('pointercancel', onUp);
    });
  }

  /** 面板贴着悬浮球展开，空间不足时自动翻到另一侧 */
  private placePanelNearFab(): void {
    if (!this.panel || !this.fab) return;
    const rect = this.fab.getBoundingClientRect();
    const pw = this.panel.offsetWidth || 400;
    const ph = this.panel.offsetHeight || 560;
    const gap = 12;
    const margin = 8;

    // 水平：优先与球左对齐，右侧放不下则右对齐
    let left = rect.left;
    if (left + pw > window.innerWidth - margin) left = rect.right - pw;
    left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - pw - margin));

    // 垂直：优先在球上方展开，上方不够则下方
    let top = rect.top - ph - gap;
    if (top < margin) top = rect.bottom + gap;
    if (top + ph > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - ph - margin);
    }

    this.panel.style.left = left + 'px';
    this.panel.style.top = top + 'px';
    this.panel.style.right = 'auto';
    this.panel.style.bottom = 'auto';
  }

  showPanel(contentHtml: string, title = 'GitHub Toolkit'): void {
    injectGlobalStyles();
    this.hidePanel();

    this.panel = document.createElement('div');
    this.panel.className = 'ghtk-panel';
    this.panel.innerHTML = `
      <header>
        <span class="title">${title}</span>
        <span class="head-actions">
          <button class="cloud-btn" type="button" title="云端备份" aria-label="云端备份">${CLOUD_ICON}</button>
          <button class="close-btn" type="button" title="关闭">✕</button>
        </span>
      </header>
      <div class="body">${contentHtml || ''}</div>
    `;

    // 先按默认位置挂载，再贴近悬浮球定位（需要 element 已入 DOM 才能量尺寸）
    this.panel.style.right = '20px';
    this.panel.style.bottom = '84px';
    this.panel.style.left = 'auto';
    this.panel.style.top = 'auto';

    getRoot().appendChild(this.panel);
    this.placePanelNearFab();

    this.panel.querySelector('.close-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hidePanel();
    });

    this.onCloudClick = this.onCloudClick || (() => {});
    this.panel.querySelector('.cloud-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onCloudClick();
    });

    this.enableDrag(this.panel.querySelector('header'));
    document.addEventListener('keydown', this.onEsc);
  }

  private onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.hidePanel();
  };

  hidePanel(): void {
    if (!this.panel) return;
    this.panel.remove();
    this.panel = null;
    document.removeEventListener('keydown', this.onEsc);
  }

  private enableDrag(handle: Element | null): void {
    if (!handle || !this.panel) return;
    handle.addEventListener('mousedown', (ev) => {
      const e = ev as MouseEvent;
      if (e.button !== 0 || !this.panel) return;
      const rect = this.panel.getBoundingClientRect();
      const dragState = {
        startX: e.clientX,
        startY: e.clientY,
        origLeft: rect.left,
        origTop: rect.top,
      };
      this.panel.style.right = 'auto';
      this.panel.style.bottom = 'auto';
      this.panel.style.left = rect.left + 'px';
      this.panel.style.top = rect.top + 'px';

      const onMove = (ev2: MouseEvent) => {
        if (!this.panel) return;
        const dx = ev2.clientX - dragState.startX;
        const dy = ev2.clientY - dragState.startY;
        this.panel.style.left = Math.max(8, dragState.origLeft + dx) + 'px';
        this.panel.style.top = Math.max(8, dragState.origTop + dy) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  toast(msg: string, duration = 2200): void {
    injectGlobalStyles();
    const t = document.createElement('div');
    t.className = 'ghtk-toast';
    t.textContent = msg;
    getRoot().appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 280);
    }, duration);
  }
}
