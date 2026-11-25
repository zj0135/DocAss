import { ServiceError, validate } from '../contracts';
import type { Event, Response } from '../contracts';

export interface WebViewPort {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}
declare global { interface Window { chrome?: { webview?: WebViewPort } } }
type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void; cleanup: () => void };
export class Webview2Transport {
  private port: WebViewPort;
  private pending = new Map<string, Pending>();
  private listeners = new Set<(event: Event, missed: boolean) => void>();
  private sequence = 0;
  private disposed = false;
  get pendingCount() { return this.pending.size; }
  constructor(port: WebViewPort) { this.port = port; port.addEventListener('message', this.receive); window.addEventListener('pagehide', this.reset); }
  request<T>(method: string, params: unknown = {}, signal?: AbortSignal, timeoutMs = 10000): Promise<T> {
    if (this.disposed || signal?.aborted) return Promise.reject(new ServiceError('CANCELLED', '请求已取消'));
    const id = crypto.randomUUID();
    const request = validate('Request', { v: 1, kind: 'req', id, method, params });
    return new Promise<T>((resolve, reject) => {
      const cancel = (code: string) => {
        const p = this.pending.get(id); if (!p) return; this.pending.delete(id); p.cleanup(); p.reject(new ServiceError(code, code === 'TIMEOUT' ? '请求超时，可查询操作结果' : '请求已取消', true));
        try { this.port.postMessage({v:1,kind:'req',id:crypto.randomUUID(),method:'app.cancel',params:{requestId:id}}); } catch { /* The host may already have closed. */ }
      };
      const abort = () => cancel('CANCELLED'); const timer = setTimeout(() => cancel('TIMEOUT'), timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); } });
      signal?.addEventListener('abort', abort, { once: true });
      try { this.port.postMessage(request); } catch (error) { this.pending.get(id)?.cleanup(); this.pending.delete(id); reject(error); }
    });
  }
  private receive = ({ data }: { data: unknown }) => {
    if (!data || typeof data !== 'object') return;
    if ((data as {kind?:string}).kind === 'event') {
      try { const event = validate<Event>('Event', data); if (event.seq <= this.sequence) return; const missed = event.seq !== this.sequence + 1; this.sequence = event.seq; for (const fn of this.listeners) fn(event, missed); } catch { /* Invalid events never reach stores. */ }
      return;
    }
    let response: Response; try { response = validate<Response>('Response', data); } catch { return; }
    const p = this.pending.get(response.id); if (!p) return; this.pending.delete(response.id); p.cleanup();
    if (response.ok === true) p.resolve(response.result); else p.reject(new ServiceError(response.error.code, response.error.message, response.error.retryable));
  };
  subscribe(fn: (event: Event, missed: boolean) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  reset = () => { for (const p of this.pending.values()) { p.cleanup(); p.reject(new ServiceError('CANCELLED', '页面会话已结束')); } this.pending.clear(); this.sequence = 0; };
  dispose() { this.reset(); this.disposed = true; this.port.removeEventListener('message', this.receive); window.removeEventListener('pagehide', this.reset); this.listeners.clear(); }
}
