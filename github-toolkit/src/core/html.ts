import { getRoot } from './styles';

/** 注入 innerHTML 前转义外部数据（仓库名、描述、topics 等） */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 数字紧凑格式：1234 → 1.2k */
export function compactNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n / 1000) + 'k';
}

/** 复制文本：优先 Clipboard API，失败时退回隐藏 textarea + execCommand */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    // 个别环境里剪贴板权限请求会一直挂起：800ms 没结果就走兜底，保证有反馈
    const ok = await Promise.race([
      navigator.clipboard.writeText(text).then(
        () => true,
        () => false
      ),
      new Promise<boolean>((r) => setTimeout(() => r(false), 800)),
    ]);
    if (ok) return true;
  }
  const prev = document.activeElement as HTMLElement | null;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  getRoot().appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  prev?.focus?.({ preventScroll: true });
  return ok;
}
