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

      // 跟随面板：遮罩与对话框都定位到面板区域内，而不是全屏居中
      const panel = document.querySelector<HTMLElement>('.ghtk-panel');
      if (panel) {
        const rect = panel.getBoundingClientRect();
        mask.classList.add('in-panel');
        mask.style.position = 'fixed';
        mask.style.left = rect.left + 'px';
        mask.style.top = rect.top + 'px';
        mask.style.width = rect.width + 'px';
        mask.style.height = rect.height + 'px';
        mask.style.borderRadius = '14px';
      }

      const input = mask.querySelector<HTMLInputElement>('.ghtk-modal-input');
      if (input) {
        setTimeout(() => {
          input.focus();
          input.select();
        }, 50);
      }

      const close = (result: ModalResult) => {
        mask.remove();
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', syncToPanel);
        resolve(result);
      };

      // 面板移动/缩放时让遮罩跟随
      const syncToPanel = () => {
        const p = document.querySelector<HTMLElement>('.ghtk-panel');
        if (!p || !mask.classList.contains('in-panel')) return;
        const r = p.getBoundingClientRect();
        mask.style.left = r.left + 'px';
        mask.style.top = r.top + 'px';
        mask.style.width = r.width + 'px';
        mask.style.height = r.height + 'px';
      };
      window.addEventListener('resize', syncToPanel, { passive: true });

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
