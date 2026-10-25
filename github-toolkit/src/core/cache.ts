/**
 * 带持久化的缓存存储。
 *
 * 三层结构：L1 内存 Map → L2 GM 存储 → L3 网络（由调用方负责）。
 * 命中过期数据时先返回旧值（stale-while-revalidate），并在后台刷新。
 */
interface CacheEntry<T> {
  data: T;
  at: number;
}

const PREFIX = 'ghtk-cache:';
const MAX_ENTRIES = 200;
/** 单条缓存序列化后的上限，超了不写持久层（防止撑爆油猴存储） */
const MAX_ENTRY_BYTES = 100 * 1024;

export interface CacheOptions {
  /** 存储 key */
  key: string;
  /** 有效期（毫秒） */
  ttl: number;
  /** 是否允许过期后先返回旧值（默认 true） */
  staleWhileRevalidate?: boolean;
}

export interface CacheResult<T> {
  /** 命中的数据（可能是过期的旧值） */
  data: T | null;
  /** 是否需要刷新（未命中或已过期） */
  stale: boolean;
}

class PersistentCache {
  private memory = new Map<string, CacheEntry<unknown>>();
  /** 按 key 记录最近访问时间，用于 LRU 淘汰 */
  private hits = new Map<string, number>();
  /** key 索引，用于容量控制 */
  private indexLoaded = false;
  private index: string[] = [];

  /** 读取缓存：内存优先，其次持久层 */
  read<T>(fullKey: string, ttl: number): CacheResult<T> {
    const now = Date.now();

    // L1 内存
    const mem = this.memory.get(fullKey) as CacheEntry<T> | undefined;
    if (mem) {
      const fresh = now - mem.at < ttl;
      this.touch(fullKey);
      return { data: mem.data, stale: !fresh };
    }

    // L2 持久层
    try {
      const raw = GM_getValue(PREFIX + fullKey, null) as CacheEntry<T> | null;
      if (raw && typeof raw.at === 'number') {
        this.memory.set(fullKey, raw as CacheEntry<unknown>);
        this.touch(fullKey);
        const fresh = now - raw.at < ttl;
        return { data: raw.data, stale: !fresh };
      }
    } catch {
      /* 读取失败当作未命中 */
    }

    return { data: null, stale: true };
  }

  /** 写入缓存（同时写内存与持久层） */
  write<T>(fullKey: string, data: T): void {
    const entry: CacheEntry<T> = { data, at: Date.now() };
    this.memory.set(fullKey, entry as CacheEntry<unknown>);
    this.touch(fullKey);

    try {
      const serialized = JSON.stringify(entry);
      if (serialized.length > MAX_ENTRY_BYTES) return;
      GM_setValue(PREFIX + fullKey, entry);
      this.addToIndex(fullKey);
    } catch {
      /* 写入失败（配额等）时静默降级为仅内存缓存 */
    }
  }

  /** 记录访问时间并维护索引 */
  private touch(fullKey: string): void {
    this.hits.set(fullKey, Date.now());
  }

  private loadIndex(): void {
    if (this.indexLoaded) return;
    this.indexLoaded = true;
    try {
      const raw = GM_getValue(PREFIX + '__index__', null) as string[] | null;
      if (Array.isArray(raw)) this.index = raw;
    } catch {
      this.index = [];
    }
  }

  private addToIndex(fullKey: string): void {
    this.loadIndex();
    if (this.index.includes(fullKey)) return;
    this.index.push(fullKey);

    // 超出容量：按 LRU 淘汰
    if (this.index.length > MAX_ENTRIES) {
      const sorted = [...this.index].sort(
        (a, b) => (this.hits.get(a) ?? 0) - (this.hits.get(b) ?? 0)
      );
      const removeCount = this.index.length - MAX_ENTRIES;
      const toRemove = sorted.slice(0, removeCount);
      for (const k of toRemove) {
        this.index = this.index.filter((x) => x !== k);
        this.memory.delete(k);
        try {
          GM_deleteValue(PREFIX + k);
        } catch {
          /* 忽略 */
        }
      }
    }

    try {
      GM_setValue(PREFIX + '__index__', this.index);
    } catch {
      /* 忽略 */
    }
  }

  /** 清空全部缓存（供调试/菜单使用） */
  clear(): void {
    this.memory.clear();
    this.hits.clear();
    this.loadIndex();
    for (const k of this.index) {
      try {
        GM_deleteValue(PREFIX + k);
      } catch {
        /* 忽略 */
      }
    }
    this.index = [];
    try {
      GM_setValue(PREFIX + '__index__', []);
    } catch {
      /* 忽略 */
    }
  }
}

export const cache = new PersistentCache();

/**
 * 通用「带持久化缓存 + 后台刷新」的取数封装。
 *
 * - 命中且新鲜：直接回调数据，不发请求
 * - 命中但过期：先回调旧数据，再后台刷新并回调新数据
 * - 完全未命中：发请求，完成后回调
 */
export function cachedFetch<T>(
  opts: CacheOptions,
  fetcher: () => Promise<T | null>,
  onData: (data: T | null) => void
): void {
  const { data, stale } = cache.read<T>(opts.key, opts.ttl);

  if (data !== null) {
    onData(data);
    if (!stale) return;
  }

  fetcher().then((fresh) => {
    if (fresh !== null && fresh !== undefined) {
      cache.write(opts.key, fresh);
      // 只有真正拿到新数据才回调，避免用 null 覆盖已有内容
      if (data === null || JSON.stringify(fresh) !== JSON.stringify(data)) {
        onData(fresh);
      }
    } else if (data === null) {
      onData(null);
    }
  });
}
