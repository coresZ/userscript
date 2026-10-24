/** 页面上下文 */
export interface PageContext {
  type:
    | 'home'
    | 'user'
    | 'repo'
    | 'blob'
    | 'tree'
    | 'issue'
    | 'issues'
    | 'pull_request'
    | 'pulls'
    | 'commit'
    | 'compare'
    | 'settings'
    | 'actions'
    | 'gist'
    | 'unknown';
  owner?: string;
  repo?: string;
  number?: number;
  path?: string;
  branch?: string;
  sha?: string;
  id?: string;
}

/** 插件运行时上下文（核心注入，插件唯一依赖） */
export interface PluginContext {
  eventBus: {
    on: (event: string, handler: (payload?: any) => void) => () => void;
    off: (event: string, handler: (payload?: any) => void) => void;
    emit: (event: string, payload?: any) => void;
  };
  storage: {
    get: <T = any>(key: string, defaultValue?: T) => T;
    set: (key: string, value: any) => void;
  };
  ui: {
    toast: (msg: string, duration?: number) => void;
    showPanel: (html: string, title?: string, anchor?: HTMLElement | null) => void;
    hidePanel: () => void;
  };
  dom: {
    qs: <T extends Element = Element>(sel: string, root?: ParentNode) => T | null;
    qsa: <T extends Element = Element>(sel: string, root?: ParentNode) => T[];
    observe: (selector: string, callback: (nodes: Element[]) => void) => MutationObserver;
  };
  page: PageContext;
  log: {
    log: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

/** 上下游绑定关系 */
export interface Binding {
  owner: string;
  repo: string;
  downstreams: string[];
  createdAt: number;
}

/** 插件在工具台面板中贡献的 Tab */
export interface PanelTab {
  id: string;
  label: string;
  render: (ctx: PluginContext) => string;
  mount?: (ctx: PluginContext, root: HTMLElement) => void;
}

/** 插件契约 */
export interface Plugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  /** 返回 true 时才在当前页面启用 */
  matches?: (page: PageContext) => boolean;
  onInit?: (ctx: PluginContext) => void | Promise<void>;
  onEnable?: (ctx: PluginContext) => void | Promise<void>;
  onDisable?: (ctx: PluginContext) => void | Promise<void>;
  onDestroy?: (ctx: PluginContext) => void | Promise<void>;
  /** 面板 Tab（启用后由主程序渲染） */
  panelTab?: PanelTab;
}
