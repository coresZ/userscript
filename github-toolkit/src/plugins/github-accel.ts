import type { Plugin, PluginContext } from '../types';

const ACCEL_BASE_KEY = 'accel-base-url';
export const DEFAULT_ACCEL_BASE = 'https://github.akams.cn/';

export function getAccelBase(): string {
  return GM_getValue(ACCEL_BASE_KEY, DEFAULT_ACCEL_BASE);
}

function setAccelBase(url: string): void {
  GM_setValue(ACCEL_BASE_KEY, url);
}

export const AccelPlugin: Plugin = {
  id: 'github-accel',
  name: 'GitHub 加速 (akams)',
  version: '1.0.2',
  description: '使用加速地址打开仓库，支持自定义加速服务地址',
  matches() {
    return true;
  },
  async onEnable() {},
  onDisable() {},
  panelTab: {
    id: 'accel',
    label: '加速',
    render() {
      const accelBase = getAccelBase();
      return `
        <div class="ghtk-accel-setting">
          <label>加速地址（默认 ${DEFAULT_ACCEL_BASE}）</label>
          <div class="ghtk-form-row">
            <input type="text" id="ghtk-accel-base" value="${accelBase}" placeholder="${DEFAULT_ACCEL_BASE}" />
            <button class="ghtk-btn primary" id="ghtk-save-accel" type="button">保存</button>
          </div>
        </div>
        <div class="ghtk-scroll-area" style="padding-top:12px;">
          <div id="ghtk-accel-actions"></div>
        </div>
      `;
    },
    mount(ctx) {
      renderAccelActions(ctx);

      document.getElementById('ghtk-save-accel')?.addEventListener('click', () => {
        const input = document.getElementById('ghtk-accel-base') as HTMLInputElement | null;
        let val = (input?.value || '').trim();
        if (!val) val = DEFAULT_ACCEL_BASE;
        if (!val.endsWith('/')) val += '/';
        setAccelBase(val);
        ctx.ui.toast('已保存');
        renderAccelActions(ctx);
      });
    },
  },
};

function renderAccelActions(ctx: PluginContext): void {
  const container = document.getElementById('ghtk-accel-actions');
  if (!container) return;

  const page = ctx.page;
  const base = getAccelBase();

  if (!page.owner || !page.repo) {
    container.innerHTML = `<div class="ghtk-empty">进入仓库后可用</div>`;
    return;
  }

  const repoUrl = `https://github.com/${page.owner}/${page.repo}`;
  const accelUrl = `${base}?url=${encodeURIComponent(repoUrl)}`;

  container.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-size:12px;color:var(--fgColor-muted);margin-bottom:6px;">当前仓库加速地址</div>
      <div style="font-size:12px;word-break:break-all;margin-bottom:8px;padding:8px;background:var(--bgColor-muted);border-radius:6px;">
        ${accelUrl}
      </div>
      <div class="ghtk-btn-row">
        <a class="ghtk-btn primary" href="${accelUrl}" target="_blank">加速打开</a>
        <button class="ghtk-btn" id="ghtk-copy-accel" type="button">复制</button>
      </div>
    </div>
  `;

  document.getElementById('ghtk-copy-accel')?.addEventListener('click', () => {
    const url = `${getAccelBase()}?url=${encodeURIComponent(repoUrl)}`;
    navigator.clipboard
      .writeText(url)
      .then(() => ctx.ui.toast('已复制'))
      .catch(() => ctx.ui.toast('复制失败'));
  });
}
