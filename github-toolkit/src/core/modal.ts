import { injectGlobalStyles, getRoot } from './styles';

export interface ModalOptions {
  title?: string;
  content?: string;
  showInput?: boolean;
  inputValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
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
  }: ModalOptions = {}): Promise<ModalResult> {
    return new Promise((resolve) => {
      document.querySelectorAll('.ghtk-modal-mask').forEach((el) => el.remove());

      const mask = document.createElement('div');
      mask.className = 'ghtk-modal-mask';
      mask.innerHTML = `
        <div class="ghtk-modal">
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
            <button class="ghtk-btn primary" data-action="confirm" type="button">${confirmText}</button>
          </div>
        </div>
      `;

      getRoot().appendChild(mask);
      injectGlobalStyles();

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
        resolve(result);
      };

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
