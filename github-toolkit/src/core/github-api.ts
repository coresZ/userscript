import { DOMHelper } from './dom-helper';
import { cachedFetch } from './cache';

export interface RepoInfo {
  full_name: string;
  fork: boolean;
  parent: { full_name: string; owner: string; repo: string } | null;
  source: { full_name: string; owner: string; repo: string } | null;
}

/** 仓库 about 区块信息（用于面板右栏展示） */
export interface RepoAbout {
  full_name: string;
  owner: string;
  repo: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  license: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  topics: string[];
  archived: boolean;
  updatedAt: string | null;
  ownerAvatar: string | null;
}

const API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

export function getCurrentUser(dom: DOMHelper): string | null {
  const meta =
    dom.qs<HTMLMetaElement>('meta[name="user-login"]') ||
    dom.qs<HTMLMetaElement>('meta[name="octolytics-actor-login"]');
  if (meta?.content?.trim()) return meta.content.trim();

  const dataLogin = dom.qs<HTMLElement>('[data-login]');
  if (dataLogin?.getAttribute('data-login')) return dataLogin.getAttribute('data-login')!.trim();

  const avatar =
    dom.qs<HTMLImageElement>('img.avatar[alt^="@"]') ||
    dom.qs<HTMLImageElement>('[data-testid="github-avatar"][alt^="@"]');
  if (avatar?.alt) {
    const m = avatar.alt.match(/@([\w-]+)/);
    if (m) return m[1];
  }
  return null;
}

export function fetchRepoInfo(owner: string, repo: string): Promise<RepoInfo | null> {
  return new Promise((resolve) => {
    try {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://api.github.com/repos/${owner}/${repo}`,
        headers: API_HEADERS,
        onload: (res) => {
          if (res.status !== 200) {
            resolve(null);
            return;
          }
          try {
            const data = JSON.parse(res.responseText);
            resolve({
              full_name: data.full_name,
              fork: !!data.fork,
              parent: data.parent
                ? {
                    full_name: data.parent.full_name,
                    owner: data.parent.owner.login,
                    repo: data.parent.name,
                  }
                : null,
              source: data.source
                ? {
                    full_name: data.source.full_name,
                    owner: data.source.owner.login,
                    repo: data.source.name,
                  }
                : null,
            });
          } catch {
            resolve(null);
          }
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    } catch {
      resolve(null);
    }
  });
}

const forkCache = new Map<string, { url: string | null; at: number }>();
const FORK_CACHE_TTL = 10 * 60 * 1000;

const aboutCache = new Map<string, { data: RepoAbout | null; at: number }>();
/** about 数据变化慢，持久缓存 24 小时 */
const ABOUT_TTL = 24 * 60 * 60 * 1000;

/** 最后提交时间：变化较快，持久缓存 1 小时 */
const LAST_COMMIT_TTL = 60 * 60 * 1000;
const lastCommitMem = new Map<string, string | null>();

/**
 * 读取默认分支最后提交时间：内存 → 持久层 → 网络。
 * 命中过期数据时先回调旧值，后台静默刷新后再回调新值。
 */
export function loadLastCommit(
  owner: string,
  repo: string,
  onData: (date: string | null) => void
): void {
  const key = `lastcommit:${owner}/${repo}`.toLowerCase();
  cachedFetch<string>(
    { key, ttl: LAST_COMMIT_TTL },
    () => fetchLastCommit(owner, repo),
    (date) => {
      if (date) lastCommitMem.set(key, date);
      onData(date);
    }
  );
}

/** 拉取默认分支最后提交时间（ISO 字符串；空仓库返回 null） */
function fetchLastCommit(owner: string, repo: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
        headers: API_HEADERS,
        onload: (res) => {
          if (res.status !== 200) {
            resolve(null);
            return;
          }
          try {
            const arr = JSON.parse(res.responseText);
            const date =
              Array.isArray(arr) && arr[0]?.commit?.committer?.date
                ? (arr[0].commit.committer.date as string)
                : null;
            resolve(date);
          } catch {
            resolve(null);
          }
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * 读取 about：内存 → 持久层 → 网络。
 * 命中过期数据时先回调旧值（不显示加载态），后台静默刷新后再回调新值。
 */
export function loadRepoAbout(
  owner: string,
  repo: string,
  onData: (data: RepoAbout | null) => void
): void {
  const key = `about:${owner}/${repo}`.toLowerCase();
  cachedFetch<RepoAbout>(
    { key, ttl: ABOUT_TTL },
    () => fetchRepoAbout(owner, repo),
    (data) => {
      if (data) aboutCache.set(key, { data, at: Date.now() });
      onData(data);
    }
  );
}

/** 拉取仓库 about 信息（description/topics/语言/星标等），带持久化缓存 */
export function fetchRepoAbout(owner: string, repo: string): Promise<RepoAbout | null> {
  const key = `about:${owner}/${repo}`.toLowerCase();
  const cached = aboutCache.get(key);
  if (cached && Date.now() - cached.at < ABOUT_TTL) {
    return Promise.resolve(cached.data);
  }

  return new Promise((resolve) => {
    const done = (data: RepoAbout | null) => {
      aboutCache.set(key, { data, at: Date.now() });
      resolve(data);
    };
    try {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://api.github.com/repos/${owner}/${repo}`,
        headers: API_HEADERS,
        onload: (res) => {
          if (res.status !== 200) {
            done(null);
            return;
          }
          try {
            const d = JSON.parse(res.responseText);
            done({
              full_name: d.full_name,
              owner: d.owner?.login ?? owner,
              repo: d.name ?? repo,
              description: d.description ?? null,
              homepage: d.homepage || null,
              language: d.language ?? null,
              license: d.license?.spdx_id ?? d.license?.name ?? null,
              stars: d.stargazers_count ?? 0,
              forks: d.forks_count ?? 0,
              openIssues: d.open_issues_count ?? 0,
              topics: Array.isArray(d.topics) ? d.topics : [],
              archived: !!d.archived,
              updatedAt: d.pushed_at ?? d.updated_at ?? null,
              ownerAvatar: d.owner?.avatar_url ?? null,
            });
          } catch {
            done(null);
          }
        },
        onerror: () => done(null),
        ontimeout: () => done(null),
      });
    } catch {
      done(null);
    }
  });
}

/** 检测当前用户是否已 fork 过 owner/repo，返回其 fork 地址（未 fork 返回 null） */
export function checkHasForked(
  currentUser: string,
  owner: string,
  repo: string
): Promise<string | null> {
  const forkUrl = `https://github.com/${currentUser}/${repo}`;
  const cacheKey = `${currentUser}/${owner}/${repo}`.toLowerCase();
  const cached = forkCache.get(cacheKey);
  if (cached && Date.now() - cached.at < FORK_CACHE_TTL) {
    return Promise.resolve(cached.url);
  }

  return new Promise((resolve) => {
    const done = (url: string | null) => {
      forkCache.set(cacheKey, { url, at: Date.now() });
      resolve(url);
    };
    try {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://api.github.com/repos/${currentUser}/${repo}`,
        headers: API_HEADERS,
        onload: (res) => {
          if (res.status !== 200) {
            done(null);
            return;
          }
          try {
            const data = JSON.parse(res.responseText);
            const isForkOfThis =
              data.fork &&
              data.parent?.full_name?.toLowerCase() === `${owner}/${repo}`.toLowerCase();
            done(data.fork || isForkOfThis ? forkUrl : null);
          } catch {
            done(null);
          }
        },
        onerror: () => done(null),
        ontimeout: () => done(null),
      });
    } catch {
      done(null);
    }
  });
}
