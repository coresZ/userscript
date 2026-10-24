export class Storage {
  private ns: string;

  constructor(namespace = 'global') {
    this.ns = `gh-toolkit:${namespace}:`;
  }

  get<T = any>(key: string, defaultValue: T | null = null): T {
    return GM_getValue(this.ns + key, defaultValue) as T;
  }

  set(key: string, value: any): void {
    GM_setValue(this.ns + key, value);
  }
}
