import type { Plugin, PluginContext, PageContext } from '../types';
import type { EventBus } from './event-bus';
import type { DOMHelper } from './dom-helper';
import type { UIManager } from './ui-manager';
import type { PageRouter } from './router';
import { Storage } from './storage';
import { Logger } from './logger';

export interface CoreRefs {
  eventBus: EventBus;
  dom: DOMHelper;
  ui: UIManager;
  router: PageRouter;
}

export class PluginManager {
  private plugins = new Map<string, Plugin>();
  private enabled = new Set<string>();
  private instances = new Map<string, { ctx: PluginContext; active: boolean }>();
  private core: CoreRefs;

  constructor(core: CoreRefs) {
    this.core = core;
  }

  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.id)) return;
    this.plugins.set(plugin.id, plugin);
    Logger.log('Registered:', plugin.id);
  }

  async enable(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin || this.enabled.has(id)) return;

    const ctx: PluginContext = {
      eventBus: this.core.eventBus,
      storage: new Storage(id),
      ui: this.core.ui,
      dom: this.core.dom,
      page: this.core.router.current,
      log: {
        log: (...a) => Logger.log(`[${id}]`, ...a),
        warn: (...a) => Logger.warn(`[${id}]`, ...a),
        error: (...a) => Logger.error(`[${id}]`, ...a),
      },
    };

    try {
      if (plugin.onInit) await plugin.onInit(ctx);
      if (plugin.matches && !plugin.matches(ctx.page)) {
        this.instances.set(id, { ctx, active: false });
        return;
      }
      if (plugin.onEnable) await plugin.onEnable(ctx);
      this.enabled.add(id);
      this.instances.set(id, { ctx, active: true });
      Logger.log('Enabled:', id);
    } catch (e) {
      Logger.error('Enable failed:', id, e);
    }
  }

  async disable(id: string): Promise<void> {
    if (!this.enabled.has(id)) return;
    const inst = this.instances.get(id);
    const plugin = this.plugins.get(id);
    try {
      if (plugin?.onDisable && inst) await plugin.onDisable(inst.ctx);
      this.enabled.delete(id);
      if (inst) inst.active = false;
      Logger.log('Disabled:', id);
    } catch (e) {
      Logger.error('Disable failed:', id, e);
    }
  }

  async onPageChange(page: PageContext): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      const should = !plugin.matches || plugin.matches(page);
      const isEnabled = this.enabled.has(id);
      const inst = this.instances.get(id);
      if (inst) inst.ctx.page = page;
      if (should && !isEnabled) await this.enable(id);
      else if (!should && isEnabled) await this.disable(id);
    }
  }

  getAll(): Plugin[] {
    return [...this.plugins.values()];
  }

  /** 取插件运行时上下文（未初始化过时返回 null） */
  getContext(id: string): PluginContext | null {
    return this.instances.get(id)?.ctx ?? null;
  }

  isEnabled(id: string): boolean {
    return this.enabled.has(id);
  }
}
