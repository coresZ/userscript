import { DOMHelper } from './dom-helper';
import { Logger } from './logger';

export interface RepoInfo {
  full_name: string;
  fork: boolean;
  parent: { full_name: string; owner: string; repo: string } | null;
  source: { full_name: string; owner: string; repo: string } | null;
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
