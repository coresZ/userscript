import { Logger } from './logger';

export class EventBus {
  private listeners = new Map<string, Set<(payload?: any) => void>>();

  on(event: string, handler: (payload?: any) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: (payload?: any) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, payload?: any): void {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        Logger.error('Event handler error:', event, e);
      }
    });
  }
}
