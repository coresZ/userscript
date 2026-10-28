/**
 * 弹层栈：面板是底层；气泡、菜单、添加视图、对话框按打开顺序入栈。
 * 全局只有一个 Esc 监听：有弹层时只关最上面一层，栈空时才关面板。
 *
 * - transient：气泡、菜单、添加视图。页面跳转或面板重建时直接关掉。
 * - modal：对话框。面板重建时保留，等它关闭后再执行排队的重建。
 */
export type LayerKind = 'transient' | 'modal';

interface Layer {
  kind: LayerKind;
  close: () => void;
}

const stack: Layer[] = [];
const idleQueue: Array<() => void> = [];
let baseClose: (() => void) | null = null;
let listening = false;

function ensureListener(): void {
  if (listening) return;
  listening = true;
  document.addEventListener('keydown', onKeydown);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.isComposing) return;
  const top = stack[stack.length - 1];
  if (top) {
    e.preventDefault();
    closeLayer(top);
    return;
  }
  if (!baseClose) return;
  // 焦点在页面自己的输入框里时，Esc 留给页面
  const t = e.target instanceof HTMLElement ? e.target : null;
  const inOwnUi = !!t?.closest('#ghtk-root');
  const editable = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (editable && !inOwnUi) return;
  baseClose();
}

function closeLayer(layer: Layer): void {
  const i = stack.indexOf(layer);
  if (i < 0) return;
  stack.splice(i, 1);
  try {
    layer.close();
  } finally {
    flushIdle();
  }
}

/** 入栈，返回 release：弹层自己关闭时调用，重复调用无副作用 */
export function pushLayer(kind: LayerKind, close: () => void): () => void {
  ensureListener();
  const layer: Layer = { kind, close };
  stack.push(layer);
  return () => {
    const i = stack.indexOf(layer);
    if (i < 0) return;
    stack.splice(i, 1);
    flushIdle();
  };
}

/** 设置底层（面板）的关闭函数；传 null 表示面板已关 */
export function setBaseLayer(close: (() => void) | null): void {
  ensureListener();
  baseClose = close;
}

export function hasModal(): boolean {
  return stack.some((l) => l.kind === 'modal');
}

/** 没有对话框时立即执行；否则等对话框全部关闭后再执行（同一函数只排一次） */
export function whenIdle(fn: () => void): void {
  if (!hasModal()) {
    fn();
    return;
  }
  if (!idleQueue.includes(fn)) idleQueue.push(fn);
}

function flushIdle(): void {
  if (hasModal() || !idleQueue.length) return;
  const fns = idleQueue.splice(0);
  // 推迟一拍：让对话框 Promise 之后的保存逻辑先跑完，重建时读到的是新数据
  setTimeout(() => fns.forEach((f) => f()), 0);
}

/** 关闭气泡、菜单、添加视图等临时层（保留对话框） */
export function closeTransientLayers(): void {
  for (const l of stack.slice().reverse()) {
    if (l.kind === 'transient') closeLayer(l);
  }
}

/** 关闭全部弹层（面板关闭时调用） */
export function closeAllLayers(): void {
  for (const l of stack.slice().reverse()) closeLayer(l);
}
