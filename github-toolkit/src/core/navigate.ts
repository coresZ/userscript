/**
 * GitHub 软导航（Turbo）：只替换页面主体，脚本不重新执行。
 * 用它打开仓库链接可以保留工具台面板，避免整页刷新。
 */
interface TurboLike {
  visit?: (url: string, options?: Record<string, unknown>) => void;
}

/** 用 Turbo 打开站内链接；不可用时退回整页跳转 */
export function navigateTo(url: string): void {
  const w = window as unknown as { Turbo?: TurboLike; turbo?: TurboLike };
  const turbo = w.Turbo?.visit ? w.Turbo : w.turbo?.visit ? w.turbo : null;
  if (turbo?.visit) {
    turbo.visit(url);
    return;
  }
  window.location.href = url;
}

/**
 * 面板内标记了 `data-ghtk-nav` 的链接统一走软导航。
 * 修饰键（Cmd/Ctrl/Shift/Alt）与中键点击保持浏览器原生行为（新标签页打开）。
 */
export function bindSoftNav(): void {
  if (softNavBound) return;
  softNavBound = true;

  document.addEventListener(
    'click',
    (ev) => {
      const e = ev as MouseEvent;
      const target = e.target as HTMLElement | null;
      const link = target?.closest?.('a[data-ghtk-nav]') as HTMLAnchorElement | null;
      if (!link) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const href = link.getAttribute('href');
      if (!href) return;

      // capture 阶段先于 Turbo 自身的委托处理，避免重复导航
      e.preventDefault();
      e.stopPropagation();
      navigateTo(link.href);
    },
    true
  );
}

let softNavBound = false;

/** 当前是否处于 GitHub 站内页面 */
export function isGitHubUrl(url: string): boolean {
  try {
    const u = new URL(url, location.origin);
    return u.hostname === location.hostname;
  } catch {
    return false;
  }
}
