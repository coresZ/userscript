declare function GM_getValue(key: string, defaultValue?: any): any;
declare function GM_setValue(key: string, value: any): void;
declare function GM_deleteValue(key: string): void;
declare function GM_addStyle(css: string): void;
declare function GM_registerMenuCommand(name: string, onClick: () => void): void;

interface GM_xmlhttpRequestConfig {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
  onload?: (res: { status: number; responseText: string }) => void;
  onerror?: () => void;
  ontimeout?: () => void;
}
declare function GM_xmlhttpRequest(config: GM_xmlhttpRequestConfig): void;
