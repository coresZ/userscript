import { injectGlobalStyles, getRoot } from './styles';
import { Logger } from './logger';
import { escapeHtml } from './html';
import { ICON } from './icons';
import { setBaseLayer, closeAllLayers, closeTransientLayers } from './layers';

const FAB_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M15 2.75a.75.75 0 0 1-.75.75h-4a.75.75 0 0 1 0-1.5h4a.75.75 0 0 1 .75.75Zm-8.5.75v1.25a.75.75 0 0 0 1.5 0v-4a.75.75 0 0 0-1.5 0V2H1.75a.75.75 0 0 0 0 1.5H6.5Zm1.25 5.5a.75.75 0 0 0 0-1.5h-6a.75.75 0 0 0 0 1.5h6ZM15 8a.75.75 0 0 1-.75.75H11.5V10a.75.75 0 1 1-1.5 0V6a.75.75 0 0 1 1.5 0v1.25h2.75A.75.75 0 0 1 15 8Zm-9 5.25v-2a.75.75 0 0 0-1.5 0v1.25H1.75a.75.75 0 1 0 0 1.5H4.5v1.25a.75.75 0 0 0 1.5 0v-2Zm9 2v-2.25a.75.75 0 0 0-1.5 0V15h-4a.75.75 0 0 0 0 1.5h4a.75.75 0 0 0 .75-.75v-1.5Z"/></svg>`;

/** 云图标（描边风格；.ghtk-stroke 防止被 reset 的 fill 覆盖成实心） */
const CLOUD_ICON = `<svg class="ghtk-stroke" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;

const FAB_POS_KEY = 'fab-position';
/** 面板被拖动过才会记录；拖动悬浮球后清除，面板重新贴着悬浮球 */
const PANEL_POS_KEY = 'panel-position';
const FAB_SIZE = 48;
const PANEL_W = 400;
const PANEL_H = 560;
const EDGE = 8;
/** 拖动超过该距离才算拖拽，否则视为点击 */
const DRAG_THRESHOLD = 4;

interface Point {
  left: number;
  top: number;
}

function isPoint(v: unknown): v is Point {
  return !!v && typeof (v as Point).left === 'number' && typeof (v as Point).top === 'number';
}

export class UIManager {
  panel: HTMLElement | null = null;
  private fab: HTMLButtonElement | null = null;
  private fabPos: Point | null = null;
  private suppressClick = false;
  private resizeBound = false;
  private toastEl: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  /** 由主程序注入：点击悬浮球时切换面板 */
  onFabToggle: () => void = () => {};
  /** 由主程序注入：点击标题栏云图标时打开云端备份面板 */
  onCloudClick: () => void = () => {};

  // ---------- 悬浮球 ----------

  createFab(): void {
    if (this.fab && this.fab.isConnected) return;
    injectGlobalStyles();
    document.querySelectorAll('.ghtk-fab').forEach((el) => el.remove());

    const fab = document.createElement('button');
    fab.className = 'ghtk-fab';
    fab.type = 'button';
    fab.title = 'GitHub Toolkit（可拖动）';
    fab.setAttribute('aria-label', 'GitHub Toolkit');
    fab.setAttribute('aria-expanded', this.panel ? 'true' : 'false');
    fab.innerHTML = FAB_ICON;
    this.fab = fab;

    fab.addEventListener(
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

    getRoot().appendChild(fab);
    const saved = GM_getValue(FAB_POS_KEY, null);
    if (isPoint(saved)) this.applyFabPos(saved);
    this.enableFabDrag(fab);

    if (!this.resizeBound) {
      this.resizeBound = true;
      window.addEventListener(
        'resize',
        () => {
          if (this.fabPos) this.applyFabPos(this.fabPos);
          if (this.panel) {
            const r = this.panel.getBoundingClientRect();
            this.setPanelPos(this.clampPanelPos({ left: r.left, top: r.top }));
          }
        },
        { passive: true }
      );
    }
  }

  private applyFabPos(pos: Point): void {
    if (!this.fab) return;
    const maxLeft = Math.max(EDGE, window.innerWidth - FAB_SIZE - EDGE);
    const maxTop = Math.max(EDGE, window.innerHeight - FAB_SIZE - EDGE);
    const p = {
      left: Math.min(Math.max(EDGE, pos.left), maxLeft),
      top: Math.min(Math.max(EDGE, pos.top), maxTop),
    };
    this.fabPos = p;
    this.fab.style.left = p.left + 'px';
    this.fab.style.top = p.top + 'px';
    this.fab.style.right = 'auto';
    this.fab.style.bottom = 'auto';
  }

  private enableFabDrag(fab: HTMLButtonElement): void {
    fab.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const rect = fab.getBoundingClientRect();
      const sx = e.clientX;
      const sy = e.clientY;
      let moved = false;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        moved = true;
        this.applyFabPos({ left: rect.left + dx, top: rect.top + dy });
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        if (!moved) return;
        // click 紧跟 pointerup 同步派发；没有 click（在别处松手）时由定时器复位
        this.suppressClick = true;
        setTimeout(() => (this.suppressClick = false), 0);
        if (this.fabPos) GM_setValue(FAB_POS_KEY, this.fabPos);
        GM_deleteValue(PANEL_POS_KEY);
        if (this.panel) this.positionPanel();
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  // ---------- 面板 ----------

  showPanel(html: string, title = 'GitHub Toolkit'): void {
    injectGlobalStyles();
    this.removePanel();

    const panel = document.createElement('div');
    panel.className = 'ghtk-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', title);
    panel.innerHTML = `
      <div class="ghtk-panel-head">
        <span class="ghtk-panel-title">${escapeHtml(title)}</span>
        <span class="ghtk-head-actions">
          <button class="ghtk-icon-btn ghtk-cloud-btn" type="button" title="云端备份" aria-label="云端备份">${CLOUD_ICON}</button>
          <button class="ghtk-icon-btn ghtk-close-btn" type="button" title="关闭（Esc）" aria-label="关闭">${ICON.x}</button>
        </span>
      </div>
      <div class="ghtk-panel-body">${html}</div>
    `;
    getRoot().appendChild(panel);
    this.panel = panel;
    this.positionPanel();

    panel.querySelector('.ghtk-close-btn')?.addEventListener('click', () => this.hidePanel());
    panel.querySelector('.ghtk-cloud-btn')?.addEventListener('click', () => this.onCloudClick());
    this.enablePanelDrag(panel);
    setBaseLayer(() => this.hidePanel());
    this.fab?.setAttribute('aria-expanded', 'true');
  }

  /** 只拆掉面板 DOM（重建用）：关掉气泡/菜单等临时层，保留打开中的对话框 */
  private removePanel(): void {
    closeTransientLayers();
    this.panel?.remove();
    this.panel = null;
  }

  /** 关闭面板：连同所有弹层一起关 */
  hidePanel(): void {
    if (!this.panel) return;
    const hadFocus = this.panel.contains(document.activeElement);
    closeAllLayers();
    this.panel?.remove();
    this.panel = null;
    setBaseLayer(null);
    this.fab?.setAttribute('aria-expanded', 'false');
    if (hadFocus) this.fab?.focus({ preventScroll: true });
  }

  /** 有拖动记录用记录的位置，否则贴着悬浮球（优先上方，放不下翻到下方） */
  private positionPanel(): void {
    if (!this.panel) return;
    const saved = GM_getValue(PANEL_POS_KEY, null);
    this.setPanelPos(this.clampPanelPos(isPoint(saved) ? saved : this.nearFab()));
  }

  private nearFab(): Point {
    const w = this.panel?.offsetWidth || PANEL_W;
    const h = this.panel?.offsetHeight || PANEL_H;
    const fab = this.fab?.getBoundingClientRect();
    if (!fab) return { left: window.innerWidth - w - 20, top: window.innerHeight - h - 84 };
    let left = fab.right - w;
    if (left < EDGE) left = fab.left;
    let top = fab.top - h - 12;
    if (top < EDGE) top = fab.bottom + 12;
    return { left, top };
  }

  private clampPanelPos(p: Point): Point {
    const w = this.panel?.offsetWidth || PANEL_W;
    const h = this.panel?.offsetHeight || PANEL_H;
    return {
      left: Math.min(Math.max(EDGE, p.left), Math.max(EDGE, window.innerWidth - w - EDGE)),
      top: Math.min(Math.max(EDGE, p.top), Math.max(EDGE, window.innerHeight - h - EDGE)),
    };
  }

  private setPanelPos(p: Point): void {
    if (!this.panel) return;
    this.panel.style.left = Math.round(p.left) + 'px';
    this.panel.style.top = Math.round(p.top) + 'px';
    this.panel.style.right = 'auto';
    this.panel.style.bottom = 'auto';
  }

  /** 拖动标题栏移动面板，松手后记住位置 */
  private enablePanelDrag(panel: HTMLElement): void {
    const head = panel.querySelector<HTMLElement>('.ghtk-panel-head');
    if (!head) return;
    head.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button')) return;
      if (window.matchMedia('(max-width: 480px)').matches) return;
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      const sx = e.clientX;
      const sy = e.clientY;
      let moved = false;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        moved = true;
        this.setPanelPos(this.clampPanelPos({ left: rect.left + dx, top: rect.top + dy }));
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        if (!moved || !this.panel) return;
        const r = this.panel.getBoundingClientRect();
        GM_setValue(PANEL_POS_KEY, { left: Math.round(r.left), top: Math.round(r.top) });
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  // ---------- 提示条（单例：新提示替换旧提示） ----------

  toast(msg: string, duration = 2200): void {
    injectGlobalStyles();
    let t = this.toastEl;
    if (!t || !t.isConnected) {
      t = document.createElement('div');
      t.className = 'ghtk-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      getRoot().appendChild(t);
      this.toastEl = t;
    }
    const el = t;
    el.textContent = msg;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    requestAnimationFrame(() => el.classList.add('show'));
    this.toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }
}
