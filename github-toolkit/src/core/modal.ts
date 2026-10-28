import { injectGlobalStyles, getRoot } from './styles';
import { pushLayer } from './layers';
import { ICON } from './icons';
import { escapeHtml } from './html';

export interface ModalOptions {
  /** 纯文本，内部会转义 */
  title?: string;
  /** HTML 片段：其中的外部数据必须由调用方先 escapeHtml */
  content?: string;
  showInput?: boolean;
  inputValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作：确认按钮用红色，初始焦点放在「取消」上 */
  danger?: boolean;
}

export type ModalResult = string | boolean | null;

/** 当前打开的对话框（同一时间只有一个） */
let active: ((r: ModalResult) => void) | null = null;
let seq = 0;

export const Modal = {
  show({
    title = '提示',
    content = '',
    showInput = false,
    inputValue = '',
    placeholder = '',
    confirmText = '确定',
    cancelText = '取消',
    danger = false,
  }: ModalOptions = {}): Promise<ModalResult> {
    return new Promise((resolve) => {
      // 已有对话框：按取消处理，保证它的 Promise 也能结束
      active?.(null);

      const prevFocus = document.activeElement as HTMLElement | null;
      const titleId = `ghtk-modal-title-${++seq}`;
      const mask = document.createElement('div');
      mask.className = 'ghtk-modal-mask';
      mask.innerHTML = `
        <div class="ghtk-modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
          <div class="ghtk-modal-header">
            <span class="ghtk-modal-title" id="${titleId}">${escapeHtml(title)}</span>
            <button class="ghtk-icon-btn ghtk-modal-close" type="button" title="关闭" aria-label="关闭">${ICON.x}</button>
          </div>
          <div class="ghtk-modal-body">
            ${content ? `<div class="ghtk-modal-content">${content}</div>` : ''}
            ${
              showInput
                ? `<input class="ghtk-modal-input" type="text" value="${escapeHtml(inputValue)}" placeholder="${escapeHtml(
                    placeholder
                  )}" aria-label="${escapeHtml(placeholder || title)}" autocomplete="off" spellcheck="false" />`
                : ''
            }
          </div>
          <div class="ghtk-modal-footer">
            <button class="ghtk-btn" data-action="cancel" type="button">${escapeHtml(cancelText)}</button>
            <button class="ghtk-btn ${danger ? 'danger-solid' : 'primary'}" data-action="confirm" type="button">${escapeHtml(
              confirmText
            )}</button>
          </div>
        </div>
      `;

      injectGlobalStyles();
      getRoot().appendChild(mask);

      // 跟随面板：遮罩只盖住面板区域。
      // CSS 里 .ghtk-modal-mask 带 inset: 0 !important，内联也必须用 important 才能覆盖。
      const setBox = (r: DOMRect) => {
        mask.style.setProperty('left', r.left + 'px', 'important');
        mask.style.setProperty('top', r.top + 'px', 'important');
        mask.style.setProperty('width', r.width + 'px', 'important');
        mask.style.setProperty('height', r.height + 'px', 'important');
        mask.style.setProperty('right', 'auto', 'important');
        mask.style.setProperty('bottom', 'auto', 'important');
      };
      const panel = document.querySelector<HTMLElement>('.ghtk-panel');
      if (panel) {
        mask.classList.add('in-panel');
        mask.style.setProperty('border-radius', '14px', 'important');
        setBox(panel.getBoundingClientRect());
      }

      const input = mask.querySelector<HTMLInputElement>('.ghtk-modal-input');
      let done = false;
      let rafId = 0;
      let lastKey = '';
      let release: () => void = () => {};

      const finish = (result: ModalResult) => {
        if (done) return;
        done = true;
        if (active === finish) active = null;
        if (rafId) cancelAnimationFrame(rafId);
        release();
        mask.remove();
        if (prevFocus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true });
        resolve(result);
      };
      active = finish;
      // Esc 由弹层栈统一处理：只关这个对话框，不会连带关掉面板
      release = pushLayer('modal', () => finish(null));

      /** 每帧比对面板位置：拖动、缩放、重建都能跟上；位置没变不写样式 */
      const syncToPanel = () => {
        if (!mask.isConnected) return;
        const p = document.querySelector<HTMLElement>('.ghtk-panel');
        if (p && mask.classList.contains('in-panel')) {
          const r = p.getBoundingClientRect();
          const key = [r.left, r.top, r.width, r.height].map((n) => Math.round(n)).join(',');
          if (key !== lastKey) {
            lastKey = key;
            setBox(r);
          }
        }
        rafId = requestAnimationFrame(syncToPanel);
      };
      if (mask.classList.contains('in-panel')) rafId = requestAnimationFrame(syncToPanel);

      const confirmValue = (): ModalResult => (showInput ? (input ? input.value.trim() : '') : true);
      mask.querySelector('.ghtk-modal-close')?.addEventListener('click', () => finish(null));
      mask.querySelector('[data-action="cancel"]')?.addEventListener('click', () => finish(null));
      mask.querySelector('[data-action="confirm"]')?.addEventListener('click', () => finish(confirmValue()));

      // 只有按下和松开都在遮罩上才算点外部（避免从输入框拖选到外面误关）
      let downOnMask = false;
      mask.addEventListener('pointerdown', (e) => {
        downOnMask = e.target === mask;
      });
      mask.addEventListener('click', (e) => {
        if (e.target === mask && downOnMask) finish(null);
      });

      mask.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target === input && !e.isComposing) {
          e.preventDefault();
          finish(confirmValue());
          return;
        }
        if (e.key !== 'Tab') return;
        // 焦点限制在对话框内
        const list = Array.from(mask.querySelectorAll<HTMLElement>('button, input')).filter(
          (el) => !el.hasAttribute('disabled')
        );
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });

      setTimeout(() => {
        if (done) return;
        if (input) {
          input.focus({ preventScroll: true });
          input.select();
          return;
        }
        const target = mask.querySelector<HTMLElement>(danger ? '[data-action="cancel"]' : '[data-action="confirm"]');
        target?.focus({ preventScroll: true });
      }, 30);
    });
  },
};
