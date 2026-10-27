import { EventBus } from './core/event-bus';
import { DOMHelper } from './core/dom-helper';
import { UIManager } from './core/ui-manager';
import { PageRouter } from './core/router';
import { PluginManager } from './core/plugin-manager';
import { Logger } from './core/logger';
import { bindSoftNav } from './core/navigate';
import { openCloudPanel } from './core/cloud';
import { builtinPlugins, DEFAULT_ENABLED } from './plugins';

const TOOLKIT_VERSION = '2.8.1';

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

// 页面变化时重新评估插件
eventBus.on('page:change', (page) => {
  pluginManager.onPageChange(page);

  // 软导航后面板若开着，按新页面重建（保持打开状态）
  if (ui.panel) renderPanel();
});

// ---------- 面板渲染 ----------
function renderPanel(): void {
  try {
    const page = router.current;
    const pluginTabs = pluginManager
      .getAll()
      .filter((p) => pluginManager.isEnabled(p.id) && p.panelTab);

    const tabsHtml =
      pluginTabs.map((p) => `<button class="ghtk-tab" data-tab="${p.panelTab!.id}" type="button">${p.panelTab!.label}</button>`).join('') +
      `<button class="ghtk-tab" data-tab="plugins" type="button">插件</button>`;

    // 默认选中第一个插件 Tab，没有则落在插件管理
    const defaultTab = pluginTabs[0]?.panelTab?.id ?? 'plugins';

    const contentsHtml = pluginTabs
      .map(
        (p) => `
        <div class="ghtk-tab-content ${p.panelTab!.id === defaultTab ? 'active' : ''}" data-content="${p.panelTab!.id}">
        </div>
      `
      )
      .join('');

    const contentHtml = `
      <div class="ghtk-tabs">${tabsHtml}</div>
      ${contentsHtml}
      <div class="ghtk-tab-content ${defaultTab === 'plugins' ? 'active' : ''}" data-content="plugins">
        <div class="ghtk-scroll-area" id="ghtk-plugins-list" style="padding-top:16px;"></div>
      </div>
    `;

    ui.showPanel(contentHtml, `GitHub Toolkit v${TOOLKIT_VERSION}`);

    // Tab 切换
    document.querySelectorAll('.ghtk-tab').forEach((tab) => {
      if ((tab as HTMLElement).dataset.tab === defaultTab) tab.classList.add('active');
      tab.addEventListener('click', () => {
        const name = (tab as HTMLElement).dataset.tab!;
        document.querySelectorAll('.ghtk-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.ghtk-tab-content').forEach((c) => c.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`.ghtk-tab-content[data-content="${name}"]`)?.classList.add('active');
      });
    });

    // 挂载各插件 Tab
    for (const p of pluginTabs) {
      const tab = p.panelTab!;
      const root = document.querySelector<HTMLElement>(`.ghtk-tab-content[data-content="${tab.id}"]`);
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

    renderPluginsList();
  } catch (err) {
    Logger.error('renderPanel 失败:', err);
    ui.toast('面板渲染失败');
  }
}

function renderPluginsList(): void {
  const container = document.getElementById('ghtk-plugins-list');
  if (!container) return;
  const plugins = pluginManager.getAll();
  container.innerHTML = plugins
    .map((p) => {
      const on = pluginManager.isEnabled(p.id);
      return `
        <div class="ghtk-plugin-item">
          <div style="min-width:0;">
            <strong style="font-size:13px;">${p.name}</strong>
            <div class="desc">${p.description || ''}</div>
          </div>
          <button class="ghtk-switch ${on ? 'on' : ''}" data-id="${p.id}" type="button"
            role="switch" aria-checked="${on}" title="${on ? '禁用' : '启用'}">
            <span class="ghtk-switch-knob"></span>
          </button>
        </div>
      `;
    })
    .join('');

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

      setTimeout(renderPanel, 150);
    });
  });
}

// ---------- 启动 ----------
ui.onFabToggle = () => {
  if (ui.panel) {
    ui.hidePanel();
  } else {
    renderPanel();
  }
};

// 标题栏云图标 → 打开 WebDAV 云端备份面板
ui.onCloudClick = () => {
  const ok = openCloudPanel();
  if (!ok) ui.toast('云端组件未加载');
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

  // 软导航结束后补回 FAB，并让面板跟随新页面
  ['turbo:load', 'turbo:render', 'pjax:end', 'soft-nav:end'].forEach((evt) => {
    document.addEventListener(evt, () => {
      ensureFab();
    });
  });

  Logger.log(`GitHub Toolkit v${TOOLKIT_VERSION} 已启动（图标操作 + 复制链接）`);
}

init();
