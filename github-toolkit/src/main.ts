import { EventBus } from './core/event-bus';
import { DOMHelper } from './core/dom-helper';
import { UIManager } from './core/ui-manager';
import { PageRouter } from './core/router';
import { PluginManager } from './core/plugin-manager';
import { Logger } from './core/logger';
import { bindSoftNav } from './core/navigate';
import { openCloudPanel } from './core/cloud';
import { whenIdle } from './core/layers';
import { escapeHtml } from './core/html';
import { builtinPlugins, DEFAULT_ENABLED } from './plugins';

const TOOLKIT_VERSION = '2.9.0';
/** 记住上次停留的 Tab：跳页、重开面板都回到这里 */
const TAB_KEY = 'panel-tab';

// ---------- 核心组装 ----------
const eventBus = new EventBus();
const dom = new DOMHelper();
const ui = new UIManager();
const router = new PageRouter(eventBus);
const pluginManager = new PluginManager({ eventBus, dom, ui, router });

// 注册所有内置插件
builtinPlugins.forEach((p) => pluginManager.register(p));

// 读取用户启用列表
let enabledList: string[] = GM_getValue('enabled-plugins', DEFAULT_ENABLED);

// 启动路由监听
router.start();

// 初始启用
(async () => {
  for (const id of enabledList) {
    await pluginManager.enable(id);
  }
})();

/** 面板开着时按新页面重建（固定引用，whenIdle 才能去重） */
const rerenderIfOpen = () => {
  if (ui.panel) renderPanel();
};

// 页面变化：重新评估插件；面板开着就重建，有对话框时等它关闭后再重建，不打断输入
eventBus.on('page:change', (page) => {
  pluginManager.onPageChange(page);
  if (ui.panel) whenIdle(rerenderIfOpen);
});

// ---------- 面板渲染 ----------
function renderPanel(): void {
  try {
    const page = router.current;
    const pluginTabs = pluginManager.getAll().filter((p) => pluginManager.isEnabled(p.id) && p.panelTab);
    const ids = [...pluginTabs.map((p) => p.panelTab!.id), 'plugins'];
    const saved = String(GM_getValue(TAB_KEY, '') || '');
    const activeId = ids.includes(saved) ? saved : ids[0];

    const tabBtn = (id: string, label: string) => {
      const on = id === activeId;
      return `<button class="ghtk-tab${on ? ' active' : ''}" type="button" role="tab" id="ghtk-tab-${id}"
        data-tab="${id}" aria-controls="ghtk-tabpanel-${id}" aria-selected="${on}" tabindex="${on ? '0' : '-1'}">${escapeHtml(label)}</button>`;
    };
    const tabPanel = (id: string, inner = '') => {
      const on = id === activeId;
      return `<div class="ghtk-tab-content${on ? ' active' : ''}" role="tabpanel" id="ghtk-tabpanel-${id}"
        aria-labelledby="ghtk-tab-${id}" data-content="${id}">${inner}</div>`;
    };

    const html = `
      <div class="ghtk-tabs" role="tablist" aria-label="功能">
        ${pluginTabs.map((p) => tabBtn(p.panelTab!.id, p.panelTab!.label)).join('')}
        ${tabBtn('plugins', '插件')}
      </div>
      ${pluginTabs.map((p) => tabPanel(p.panelTab!.id)).join('')}
      ${tabPanel('plugins', '<div class="ghtk-scroll-area"><div class="ghtk-plugins" id="ghtk-plugins-list"></div></div>')}
    `;

    // 版本号不再放标题栏，挪到插件页底部
    ui.showPanel(html, 'GitHub Toolkit');
    const panel = ui.panel;
    if (!panel) return;

    // Tab：点击切换 + 左右方向键 / Home / End
    const tabs = Array.from(panel.querySelectorAll<HTMLButtonElement>('.ghtk-tab'));
    const activate = (tab: HTMLButtonElement, focus = false) => {
      const id = tab.dataset.tab!;
      tabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      panel.querySelectorAll<HTMLElement>('.ghtk-tab-content').forEach((c) => {
        c.classList.toggle('active', c.dataset.content === id);
      });
      GM_setValue(TAB_KEY, id);
      if (focus) tab.focus();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', (e) => {
        let next: number;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        else return;
        e.preventDefault();
        activate(tabs[next], true);
      });
    });

    // 挂载各插件 Tab
    for (const p of pluginTabs) {
      const tab = p.panelTab!;
      const root = panel.querySelector<HTMLElement>(`.ghtk-tab-content[data-content="${tab.id}"]`);
      if (!root) continue;
      const ctx = pluginManager.getContext(p.id) ?? {
        eventBus,
        storage: { get: <T,>(k: string, d?: T) => GM_getValue(k, d), set: (k: string, v: any) => GM_setValue(k, v) },
        ui,
        dom,
        page,
        log: Logger,
      };
      root.innerHTML = tab.render(ctx);
      tab.mount?.(ctx, root);
    }

    renderPluginsList(panel);
  } catch (err) {
    Logger.error('renderPanel 失败:', err);
    ui.toast('面板渲染失败');
  }
}

function renderPluginsList(panel: HTMLElement): void {
  const container = panel.querySelector<HTMLElement>('#ghtk-plugins-list');
  if (!container) return;
  container.innerHTML =
    pluginManager
      .getAll()
      .map((p) => {
        const on = pluginManager.isEnabled(p.id);
        const nameId = `ghtk-plugin-name-${p.id}`;
        return `
          <div class="ghtk-plugin-item">
            <div class="ghtk-plugin-text">
              <div class="ghtk-plugin-name" id="${escapeHtml(nameId)}">${escapeHtml(p.name)}</div>
              <div class="ghtk-plugin-desc">${escapeHtml(p.description || '')}</div>
            </div>
            <button class="ghtk-switch${on ? ' on' : ''}" type="button" role="switch" aria-checked="${on}"
              aria-labelledby="${escapeHtml(nameId)}" data-id="${escapeHtml(p.id)}" title="${on ? '点击禁用' : '点击启用'}">
              <span class="ghtk-switch-knob"></span>
            </button>
          </div>`;
      })
      .join('') + `<div class="ghtk-plugins-foot">GitHub Toolkit v${TOOLKIT_VERSION}</div>`;

  container.querySelectorAll<HTMLButtonElement>('.ghtk-switch[data-id]').forEach((sw) => {
    sw.addEventListener('click', async () => {
      const id = sw.dataset.id!;
      const turningOn = !sw.classList.contains('on');
      if (turningOn) {
        await pluginManager.enable(id);
        if (!enabledList.includes(id)) enabledList.push(id);
      } else {
        await pluginManager.disable(id);
        enabledList = enabledList.filter((x) => x !== id);
      }
      GM_setValue('enabled-plugins', enabledList);
      ui.toast(turningOn ? '已启用' : '已禁用');
      // 重建后仍停在插件页（Tab 已记住），焦点回到刚才的开关
      setTimeout(() => {
        renderPanel();
        ui.panel?.querySelector<HTMLElement>(`.ghtk-switch[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      }, 150);
    });
  });
}

// ---------- 启动 ----------
ui.onFabToggle = () => {
  if (ui.panel) ui.hidePanel();
  else renderPanel();
};

// 标题栏云图标 → 打开 WebDAV 云端备份面板
ui.onCloudClick = () => {
  if (!openCloudPanel()) ui.toast('云端组件未加载');
};

GM_registerMenuCommand('打开 GitHub Toolkit 面板', renderPanel);

/** Turbo 软导航替换 body 后，FAB 会被一起冲掉，需要补回 */
function ensureFab(): void {
  if (!document.getElementById('ghtk-root')?.querySelector('.ghtk-fab')) {
    ui.createFab();
  }
}

function init(): void {
  if (!document.body) {
    setTimeout(init, 100);
    return;
  }
  ui.createFab();
  bindSoftNav();
  ['turbo:load', 'turbo:render', 'pjax:end', 'soft-nav:end'].forEach((evt) => {
    document.addEventListener(evt, ensureFab);
  });
  Logger.log(`GitHub Toolkit v${TOOLKIT_VERSION} 已启动`);
}

init();
