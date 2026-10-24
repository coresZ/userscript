export class DOMHelper {
  qs<T extends Element = Element>(sel: string, root: ParentNode = document): T | null {
    return root.querySelector(sel);
  }

  qsa<T extends Element = Element>(sel: string, root: ParentNode = document): T[] {
    return [...root.querySelectorAll(sel)] as T[];
  }

  observe(selector: string, callback: (nodes: Element[]) => void): MutationObserver {
    const processed = new WeakSet<Element>();
    const run = () => {
      this.qsa(selector).forEach((node) => {
        if (processed.has(node)) return;
        processed.add(node);
        callback([node]);
      });
    };
    run();
    const obs = new MutationObserver(run);
    obs.observe(document.body, { childList: true, subtree: true });
    return obs;
  }
}
