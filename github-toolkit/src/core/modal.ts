import { injectGlobalStyles, getRoot } from './styles';

export interface ModalOptions {
  title?: string;
  content?: string;
  showInput?: boolean;
  inputValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作：确认按钮用红色，用于删除类操作 */
  danger?: boolean;
}

export type ModalResult = string | boolean | null;

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
      document.querySelectorAll('.ghtk-modal-mask').forEach((el) => el.remove());

      const mask = document.createElement('div');
      mask.className = 'ghtk-modal-mask';
      mask.innerHTML = `
        <div class="ghtk-modal" role="dialog" aria-modal="true">
          <div class="ghtk-modal-header">
            <span class="ghtk-modal-title">${title}</span>
            <button class="ghtk-modal-close" type="button">✕</button>
          </div>
          <div class="ghtk-modal-body">
            ${content ? `<div class="ghtk-modal-content">${content}</div>` : ''}
            ${showInput ? `<input class="ghtk-modal-input" type="text" value="${inputValue.replace(/"/g, '&quot;')}" placeholder="${placeholder}" />` : ''}
          </div>
          <div class="ghtk-modal-footer">
            <button class="ghtk-btn" data-action="cancel" type="button">${cancelText}</button>
            <button class="ghtk-btn ${danger ? 'danger-solid' : 'primary'}" data-action="confirm" type="button">${confirmText}</button>
          </div>
        </div>
      `;

      getRoot().appendChild(mask);
      injectGlobalStyles();

      // 跟随面板：遮罩定位到面板区域内。
      // 注意：CSS 里 `.ghtk-modal-mask` 带 `inset: 0 !important`，
      // 内联样式必须同样用 important 才能覆盖，否则会被拉到视口左上角。
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
        mask.style.setProperty('position', 'fixed', 'important');
        mask.style.setProperty('border-radius', '14px', 'important');
        setBox(panel.getBoundingClientRect());
      }

      const input = mask.querySelector<HTMLInputElement>('.ghtk-modal-input');
      if (input) {
        setTimeout(() => {
          input.focus({ preventScroll: true });
          input.select();
        }, 50);
      }

      let rafId = 0;
      let lastKey = '';

      const close = (result: ModalResult) => {
        if (rafId) cancelAnimationFrame(rafId);
        mask.remove();
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };

      /**
       * 每帧比对面板位置：拖动面板、窗口缩放、面板重建都能跟上，
       * 位置没变则不写样式，避免无谓的重排。
       */
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

      mask.querySelector('.ghtk-modal-close')!.addEventListener('click', () => close(null));
      mask.querySelector('[data-action="cancel"]')!.addEventListener('click', () => close(null));
      mask.querySelector('[data-action="confirm"]')!.addEventListener('click', () => {
        close(showInput ? (input ? input.value.trim() : '') : true);
      });

      mask.addEventListener('click', (e) => {
        if (e.target === mask) close(null);
      });

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter' && showInput) close(input ? input.value.trim() : '');
      };
      document.addEventListener('keydown', onKey);
    });
  },
};
