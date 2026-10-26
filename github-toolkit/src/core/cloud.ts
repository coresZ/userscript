/**
 * 云端备份（WebDAV）：基于 webdev-component 组件库（经 @require 引入）。
 * 备份范围：上下游绑定、启用插件、加速地址、ego 身份/协议。
 * 不备份：API 缓存（ghtk-cache:*，恢复时自动重新拉取）、FAB 位置（本机偏好）。
 */
import { Logger } from './logger';

// ---- 备份范围内的存储键（与各模块保持一致） ----
export const BACKUP_KEYS = {
  bindings: 'upstream-downstream-bindings',
  enabledPlugins: 'enabled-plugins',
  accelBase: 'accel-base-url',
  egoIdentity: 'ego-identity',
  egoProtocol: 'ego-protocol',
} as const;

interface BackupPayload {
  app: 'github-toolkit';
  version: 1;
  exportedAt: string;
  data: {
    bindings: unknown;
    enabledPlugins: unknown;
    accelBase: unknown;
    egoIdentity: unknown;
    egoProtocol: unknown;
  };
}

export interface WebdevLike {
  openPanel: (opts?: Record<string, unknown>) => void;
}

let webdev: WebdevLike | null = null;

declare const WebdevComponent: {
  createWebdev: (opts: Record<string, unknown>) => WebdevLike;
};

/** 惰性初始化组件实例（库经 @require 注入后才可用） */
function ensureWebdev(): WebdevLike | null {
  if (webdev) return webdev;
  try {
    if (typeof WebdevComponent === 'undefined' || !WebdevComponent?.createWebdev) {
      Logger.warn('WebdevComponent 未加载（@require 缺失或网络失败）');
      return null;
    }
    webdev = WebdevComponent.createWebdev({
      key: "ghtk-webdev-v1",
      defaultFile: 'github-toolkit-backup.json',
      storage: {
        get: (k: string, d: unknown) => GM_getValue(k, d),
        set: (k: string, v: unknown) => GM_setValue(k, v),
      },
      // 上传数据源：只收集备份范围内的键
      exportPayload(): string {
        return JSON.stringify({
          app: 'github-toolkit',
          version: 1,
          exportedAt: new Date().toISOString(),
          data: {
            bindings: GM_getValue(BACKUP_KEYS.bindings, []),
            enabledPlugins: GM_getValue(BACKUP_KEYS.enabledPlugins, []),
            accelBase: GM_getValue(BACKUP_KEYS.accelBase, null),
            egoIdentity: GM_getValue(BACKUP_KEYS.egoIdentity, ''),
            egoProtocol: GM_getValue(BACKUP_KEYS.egoProtocol, 'ssh'),
          },
        } satisfies BackupPayload);
      },
      // 下载数据接收器：校验并回写，返回统计供组件 UI 展示
      importPayload(data: BackupPayload | null) {
        if (!data || data.app !== 'github-toolkit' || !data.data) {
          throw new Error('不是 GitHub Toolkit 的备份文件');
        }
        const d = data.data;
        const counts: string[] = [];

        if (Array.isArray(d.bindings)) {
          GM_setValue(BACKUP_KEYS.bindings, d.bindings);
          counts.push(`绑定 ${d.bindings.length}`);
        }
        if (Array.isArray(d.enabledPlugins)) {
          GM_setValue(BACKUP_KEYS.enabledPlugins, d.enabledPlugins);
          counts.push(`插件 ${d.enabledPlugins.length}`);
        }
        if (typeof d.accelBase === 'string' && d.accelBase) {
          GM_setValue(BACKUP_KEYS.accelBase, d.accelBase);
          counts.push('加速地址');
        }
        if (typeof d.egoIdentity === 'string') {
          GM_setValue(BACKUP_KEYS.egoIdentity, d.egoIdentity);
          counts.push('ego 身份');
        }
        if (d.egoProtocol === 'ssh' || d.egoProtocol === 'https') {
          GM_setValue(BACKUP_KEYS.egoProtocol, d.egoProtocol);
          counts.push('ego 协议');
        }

        return { restored: counts.join('、') || '无数据' };
      },
    });
    return webdev;
  } catch (e) {
    Logger.error('WebdevComponent 初始化失败:', e);
    return null;
  }
}

/** 打开云端备份设置面板（组件自带 UI） */
export function openCloudPanel(): boolean {
  const w = ensureWebdev();
  if (!w) return false;
  try {
    w.openPanel();
    return true;
  } catch (e) {
    Logger.error('打开云端面板失败:', e);
    return false;
  }
}
