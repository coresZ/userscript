import type { PageContext } from '../types';
import type { EventBus } from './event-bus';

export class PageRouter {
  current: PageContext;
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.current = this.parse();
  }

  parse(): PageContext {
    const path = location.pathname;
    const parts = path.split('/').filter(Boolean);

    if (location.hostname === 'gist.github.com') {
      return { type: 'gist', owner: parts[0], id: parts[1] };
    }
    if (parts.length === 0) return { type: 'home' };

    const [owner, repo, ...rest] = parts;
    if (!repo) return { type: 'user', owner };

    const base: PageContext = { type: 'repo', owner, repo };

    if (rest[0] === 'issues') {
      if (rest[1] && /^\d+$/.test(rest[1])) return { ...base, type: 'issue', number: +rest[1] };
      return { ...base, type: 'issues' };
    }
    if (rest[0] === 'pull') {
      if (rest[1] && /^\d+$/.test(rest[1])) return { ...base, type: 'pull_request', number: +rest[1] };
      return { ...base, type: 'pulls' };
    }
    if (rest[0] === 'blob') {
      return { ...base, type: 'blob', branch: rest[1], path: rest.slice(2).join('/') };
    }
    if (rest[0] === 'tree') {
      return { ...base, type: 'tree', branch: rest[1], path: rest.slice(2).join('/') };
    }
    if (rest[0] === 'commit') return { ...base, type: 'commit', sha: rest[1] };
    if (rest[0] === 'compare') return { ...base, type: 'compare' };
    if (rest[0] === 'settings') return { ...base, type: 'settings' };
    if (rest[0] === 'actions') return { ...base, type: 'actions' };

    return base;
  }

  start(): void {
    this.eventBus.emit('page:enter', this.current);

    const check = () => {
      const next = this.parse();
      if (JSON.stringify(next) !== JSON.stringify(this.current)) {
        this.eventBus.emit('page:leave', this.current);
        this.current = next;
        this.eventBus.emit('page:enter', this.current);
        this.eventBus.emit('page:change', this.current);
      }
    };

    document.addEventListener('turbo:load', check);
    document.addEventListener('pjax:end', check);
    document.addEventListener('soft-nav:end', check);
    window.addEventListener('popstate', check);

    let timer: ReturnType<typeof setTimeout> | null = null;
    new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, 400);
    }).observe(document.body, { childList: true, subtree: true });
  }
}
