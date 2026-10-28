import type { Plugin, PluginContext } from '../types';
import { copyText, escapeHtml } from '../core/html';
import { ICON } from '../core/icons';

const ACCEL_BASE_KEY = 'accel-base-url';
const EGO_IDENTITY_KEY = 'ego-identity';
const EGO_PROTOCOL_KEY = 'ego-protocol';

export const DEFAULT_ACCEL_BASE = 'https://github.akams.cn/';

type Protocol = 'ssh' | 'https';

const URL_RE = /^https?:\/\/[^\s"'<>]+$/i;

/** 读取加速地址；存的值不是 http(s) 链接（比如导入了坏数据）时退回默认值 */
export function getAccelBase(): string {
  const v = String(GM_getValue(ACCEL_BASE_KEY, DEFAULT_ACCEL_BASE) || '').trim();
  return URL_RE.test(v) ? v : DEFAULT_ACCEL_BASE;
}

function getProtocol(): Protocol {
  return GM_getValue(EGO_PROTOCOL_KEY, 'ssh') === 'https' ? 'https' : 'ssh';
}

function getIdentity(): string {
  return String(GM_getValue(EGO_IDENTITY_KEY, '') || '').trim();
}

function cloneUrl(owner: string, repo: string, protocol: Protocol): string {
  return protocol === 'ssh' ? `git@github.com:${owner}/${repo}.git` : `https://github.com/${owner}/${repo}.git`;
}

/** 身份名为空 → 普通 git clone；非空 → ego clone <身份> <url> */
function buildCloneCommand(owner: string, repo: string, identity: string, protocol: Protocol): string {
  const id = identity.trim();
  const url = cloneUrl(owner, repo, protocol);
  return id ? `ego clone ${id} ${url}` : `git clone ${url}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function accelUrlOf(owner: string, repo: string): string {
  return `${getAccelBase()}?url=${encodeURIComponent(`https://github.com/${owner}/${repo}`)}`;
}

/** 底部说明：按是否填了身份名切换 */
function hintHtml(hasIdentity: boolean): string {
  return hasIdentity
    ? '· 身份名需与本机 <code>ego users</code> 一致<br>· 复制后在本机终端执行，脚本无法直接运行命令'
    : '· 留空用 git clone，填 ego 身份名后改用 ego clone<br>· 复制后在本机终端执行，脚本无法直接运行命令';
}

export const AccelPlugin: Plugin = {
  id: 'github-accel',
  name: 'GitHub 加速 (akams)',
  version: '1.1.0',
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
      return `<div class="ghtk-scroll-area"><div class="ghtk-accel" id="ghtk-accel"></div></div>`;
    },
    mount(ctx: PluginContext, root: HTMLElement) {
      const box = root.querySelector<HTMLElement>('#ghtk-accel');
      if (!box) return;
      renderAccel(ctx, box, false);
      bindAccel(ctx, box);
    },
  },
};

/**
 * 常用操作在上（加速打开、克隆命令），只配一次的加速服务地址收进底部折叠区。
 * 编码后的长链接不再直接展示，放在按钮的 title 里。
 */
function renderAccel(ctx: PluginContext, box: HTMLElement, settingsOpen: boolean): void {
  const base = getAccelBase();
  const settings = `
    <details class="ghtk-settings"${settingsOpen ? ' open' : ''}>
      <summary>加速服务<span class="ghtk-settings-value">${escapeHtml(hostOf(base))}</span>${ICON.chevron}</summary>
      <div class="ghtk-settings-body">
        <label class="ghtk-field-label" for="ghtk-accel-base">加速地址（默认 ${escapeHtml(DEFAULT_ACCEL_BASE)}）</label>
        <div class="ghtk-field-row">
          <input class="ghtk-input" type="text" id="ghtk-accel-base" value="${escapeHtml(base)}"
            placeholder="${escapeHtml(DEFAULT_ACCEL_BASE)}" autocomplete="off" spellcheck="false" />
          <button class="ghtk-btn" type="button" data-act="save-base">保存</button>
        </div>
      </div>
    </details>`;

  const { owner, repo } = ctx.page;
  if (!owner || !repo) {
    box.innerHTML = `<div class="ghtk-blank">进入仓库页面后可用</div>${settings}`;
    return;
  }

  const accelUrl = accelUrlOf(owner, repo);
  const identity = getIdentity();
  const protocol = getProtocol();
  box.innerHTML = `
    <section class="ghtk-accel-sec">
      <div class="ghtk-sec-head">
        <span class="ghtk-sec-title">加速访问</span>
        <span class="ghtk-sec-note" title="${escapeHtml(accelUrl)}">经 ${escapeHtml(hostOf(base))} 中转</span>
      </div>
      <div class="ghtk-btn-row">
        <a class="ghtk-btn primary" href="${escapeHtml(accelUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(accelUrl)}">加速打开</a>
        <button class="ghtk-btn" type="button" data-act="copy-accel">复制链接</button>
      </div>
    </section>
    <section class="ghtk-accel-sec">
      <div class="ghtk-sec-head">
        <span class="ghtk-sec-title">克隆命令</span>
        <div class="ghtk-seg" role="group" aria-label="克隆协议">
          <button type="button" data-proto="ssh" class="${protocol === 'ssh' ? 'on' : ''}" aria-pressed="${protocol === 'ssh'}">SSH</button>
          <button type="button" data-proto="https" class="${protocol === 'https' ? 'on' : ''}" aria-pressed="${protocol === 'https'}">HTTPS</button>
        </div>
      </div>
      <input class="ghtk-input" type="text" id="ghtk-ego-identity" value="${escapeHtml(identity)}"
        placeholder="ego 身份名（留空用 git）" aria-label="ego 身份名" autocomplete="off" spellcheck="false" />
      <div class="ghtk-cmd" tabindex="0" aria-label="克隆命令"><span class="ghtk-cmd-prompt">$</span><span id="ghtk-ego-cmd">${escapeHtml(
        buildCloneCommand(owner, repo, identity, protocol)
      )}</span></div>
      <div class="ghtk-btn-row">
        <button class="ghtk-btn" type="button" data-act="copy-cmd">复制命令</button>
        <button class="ghtk-btn" type="button" data-act="copy-url">复制地址</button>
      </div>
      <div class="ghtk-hint" id="ghtk-ego-hint">${hintHtml(!!identity)}</div>
    </section>
    ${settings}
  `;
}

/** 事件委托：只绑一次，renderAccel 重绘内容后依然有效 */
function bindAccel(ctx: PluginContext, box: HTMLElement): void {
  const currentRepo = () => {
    const { owner, repo } = ctx.page;
    return owner && repo ? { owner, repo } : null;
  };
  const identityValue = () =>
    box.querySelector<HTMLInputElement>('#ghtk-ego-identity')?.value.trim() ?? getIdentity();
  const copy = (text: string) => {
    void copyText(text).then((ok) => ctx.ui.toast(ok ? '已复制' : '复制失败'));
  };

  const refreshCmd = () => {
    const r = currentRepo();
    if (!r) return;
    const id = identityValue();
    const cmd = box.querySelector('#ghtk-ego-cmd');
    if (cmd) cmd.textContent = buildCloneCommand(r.owner, r.repo, id, getProtocol());
    const hint = box.querySelector('#ghtk-ego-hint');
    if (hint) hint.innerHTML = hintHtml(!!id);
  };

  const saveBase = () => {
    const input = box.querySelector<HTMLInputElement>('#ghtk-accel-base');
    let val = (input?.value || '').trim() || DEFAULT_ACCEL_BASE;
    if (!URL_RE.test(val)) {
      ctx.ui.toast('地址无效');
      input?.focus();
      return;
    }
    if (!val.endsWith('/')) val += '/';
    GM_setValue(ACCEL_BASE_KEY, val);
    renderAccel(ctx, box, true);
    ctx.ui.toast('已保存');
  };

  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const proto = t.closest<HTMLButtonElement>('[data-proto]');
    if (proto) {
      const p: Protocol = proto.dataset.proto === 'https' ? 'https' : 'ssh';
      GM_setValue(EGO_PROTOCOL_KEY, p);
      box.querySelectorAll<HTMLButtonElement>('[data-proto]').forEach((b) => {
        const on = b === proto;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      refreshCmd();
      return;
    }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'save-base') {
      saveBase();
      return;
    }
    const r = currentRepo();
    if (!r) return;
    if (act === 'copy-accel') copy(accelUrlOf(r.owner, r.repo));
    else if (act === 'copy-cmd') copy(buildCloneCommand(r.owner, r.repo, identityValue(), getProtocol()));
    else if (act === 'copy-url') copy(cloneUrl(r.owner, r.repo, getProtocol()));
  });

  box.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id !== 'ghtk-ego-identity') return;
    GM_setValue(EGO_IDENTITY_KEY, t.value);
    refreshCmd();
  });

  box.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'ghtk-accel-base' && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      saveBase();
    }
  });
}
