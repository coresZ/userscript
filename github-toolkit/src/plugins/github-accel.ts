import type { Plugin, PluginContext } from '../types';

const ACCEL_BASE_KEY = 'accel-base-url';
const EGO_IDENTITY_KEY = 'ego-identity';
const EGO_PROTOCOL_KEY = 'ego-protocol';

export const DEFAULT_ACCEL_BASE = 'https://github.akams.cn/';

type Protocol = 'ssh' | 'https';

export function getAccelBase(): string {
  return GM_getValue(ACCEL_BASE_KEY, DEFAULT_ACCEL_BASE);
}

function setAccelBase(url: string): void {
  GM_setValue(ACCEL_BASE_KEY, url);
}

function getEgoProtocol(): Protocol {
  return GM_getValue(EGO_PROTOCOL_KEY, 'ssh') === 'https' ? 'https' : 'ssh';
}

function getEgoIdentity(): string {
  return (GM_getValue(EGO_IDENTITY_KEY, '') || '').trim();
}

/**
 * 拼接克隆命令：
 * - 身份名为空 → 普通 git clone
 * - 身份名非空 → ego clone <身份> <url>
 */
function buildCloneCommand(owner: string, repo: string, identity: string, protocol: Protocol): string {
  const url =
    protocol === 'ssh'
      ? `git@github.com:${owner}/${repo}.git`
      : `https://github.com/${owner}/${repo}.git`;
  const id = identity.trim();
  return id ? `ego clone ${id} ${url}` : `git clone ${url}`;
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
            <button class="ghtk-btn" id="ghtk-save-accel" type="button">保存</button>
          </div>
        </div>
        <div class="ghtk-scroll-area ghtk-accel-body">
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

  if (!page.owner || !page.repo) {
    container.innerHTML = `<div class="ghtk-empty">进入仓库后可用</div>`;
    return;
  }

  const owner = page.owner;
  const repo = page.repo;
  const base = getAccelBase();
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const accelUrl = `${base}?url=${encodeURIComponent(repoUrl)}`;

  const identity = getEgoIdentity();
  const protocol = getEgoProtocol();
  const command = buildCloneCommand(owner, repo, identity, protocol);

  container.innerHTML = `
    <div class="ghtk-accel-repo">
      <div class="ghtk-sec-label">当前仓库加速地址</div>
      <div class="ghtk-accel-url">${accelUrl}</div>
      <div class="ghtk-btn-row">
        <a class="ghtk-btn primary" href="${accelUrl}" target="_blank">加速打开</a>
        <button class="ghtk-btn" id="ghtk-copy-accel" type="button">复制</button>
      </div>
    </div>

    <div class="ghtk-divider"></div>

    <div class="ghtk-ego">
      <div class="ghtk-ego-head">
        <div class="ghtk-ego-title">克隆命令</div>
        <div class="ghtk-seg" id="ghtk-ego-proto">
          <button type="button" data-proto="ssh" class="${protocol === 'ssh' ? 'on' : ''}">SSH</button>
          <button type="button" data-proto="https" class="${protocol === 'https' ? 'on' : ''}">HTTPS</button>
        </div>
      </div>

      <input class="ghtk-field-input" type="text" id="ghtk-ego-identity"
        value="${identity.replace(/"/g, '&quot;')}" placeholder="ego 身份名（留空用 git）" autocomplete="off" spellcheck="false" />

      <div class="ghtk-cmd-wrap">
        <div class="ghtk-cmd" id="ghtk-ego-cmd"><span class="ghtk-cmd-prompt">$</span>${escapeHtml(command)}</div>
      </div>

      <button class="ghtk-btn" id="ghtk-copy-ego" type="button">复制命令</button>

      <div class="ghtk-hint-list" id="ghtk-ego-hint">${hintHtml(!!identity)}</div>
    </div>
  `;

  // 复制加速链接
  document.getElementById('ghtk-copy-accel')?.addEventListener('click', () => {
    navigator.clipboard
      .writeText(`${getAccelBase()}?url=${encodeURIComponent(repoUrl)}`)
      .then(() => ctx.ui.toast('已复制'))
      .catch(() => ctx.ui.toast('复制失败'));
  });

  // 身份名输入：实时更新命令与提示，并持久化
  const identityInput = document.getElementById('ghtk-ego-identity') as HTMLInputElement | null;
  const cmdEl = document.getElementById('ghtk-ego-cmd');
  const hintEl = document.getElementById('ghtk-ego-hint');

  const refreshCommand = () => {
    const id = identityInput?.value.trim() || '';
    if (cmdEl) {
      const next = buildCloneCommand(owner, repo, id, getEgoProtocol());
      cmdEl.innerHTML = `<span class="ghtk-cmd-prompt">$</span>${escapeHtml(next)}`;
    }
    if (hintEl) hintEl.innerHTML = hintHtml(!!id);
  };

  identityInput?.addEventListener('input', () => {
    GM_setValue(EGO_IDENTITY_KEY, identityInput.value);
    refreshCommand();
  });

  // 协议切换
  document.querySelectorAll<HTMLButtonElement>('#ghtk-ego-proto button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const proto = (btn.dataset.proto as Protocol) || 'ssh';
      GM_setValue(EGO_PROTOCOL_KEY, proto);
      document.querySelectorAll('#ghtk-ego-proto button').forEach((b) => {
        b.classList.toggle('on', b === btn);
      });
      refreshCommand();
    });
  });

  // 复制命令
  document.getElementById('ghtk-copy-ego')?.addEventListener('click', () => {
    const cmd = buildCloneCommand(owner, repo, identityInput?.value.trim() || '', getEgoProtocol());
    navigator.clipboard
      .writeText(cmd)
      .then(() => ctx.ui.toast('已复制'))
      .catch(() => ctx.ui.toast('复制失败'));
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 底部说明：按是否填了身份名切换 */
function hintHtml(hasIdentity: boolean): string {
  if (hasIdentity) {
    return `· 使用 ego 按身份克隆，身份名需与本机 <code>ego users</code> 一致<br>
            · 在本机终端执行，脚本无法直接运行命令`;
  }
  return `· 未填身份名，使用普通 git 克隆<br>
          · 填入 ego 身份名后自动改用 ego 命令`;
}
