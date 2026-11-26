export class ByteLru<K, V> {
  private entries = new Map<K, { value: V; bytes: number }>();
  bytes = 0;
  readonly limit: number;
  constructor(limit: number) {
    this.limit = limit;
    textBudgets.add(new WeakRef(this));
  }
  get(key: K) {
    const item = this.entries.get(key);
    if (item) {
      this.entries.delete(key);
      this.entries.set(key, item);
    }
    return item?.value;
  }
  set(key: K, value: V, bytes: number) {
    this.delete(key);
    if (bytes > this.limit) return;
    while (this.bytes + bytes > this.limit) this.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
  }
  delete(key: K) {
    const item = this.entries.get(key);
    if (item) {
      this.bytes -= item.bytes;
      this.entries.delete(key);
    }
  }
  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}
const textBudgets = new Set<WeakRef<{ bytes: number; limit: number }>>();
type Work = {
  priority: number;
  thumbnail: boolean;
  signal: AbortSignal;
  run: () => Promise<void>;
  resolve: () => void;
  reject: (e: unknown) => void;
  abort: () => void;
};
export class RenderQueue {
  private pending: Work[] = [];
  running = 0;
  thumbnails = 0;
  schedule(
    run: () => Promise<void>,
    priority: number,
    signal: AbortSignal,
    thumbnail = false,
  ): Promise<void> {
    if (signal.aborted) return Promise.reject(new DOMException('已取消', 'AbortError'));
    return new Promise((resolve, reject) => {
      const task: Work = {
        run,
        priority,
        signal,
        thumbnail,
        resolve,
        reject,
        abort: () => {
          const i = this.pending.indexOf(task);
          if (i >= 0) {
            this.pending.splice(i, 1);
            reject(new DOMException('已取消', 'AbortError'));
          }
        },
      };
      signal.addEventListener('abort', task.abort, { once: true });
      this.pending.push(task);
      this.pump();
    });
  }
  private pump() {
    this.pending.sort((a, b) => a.priority - b.priority);
    while (this.running < 2) {
      const index = this.pending.findIndex(w => !w.thumbnail || this.thumbnails === 0);
      if (index < 0) return;
      const task = this.pending.splice(index, 1)[0];
      task.signal.removeEventListener('abort', task.abort);
      if (task.signal.aborted) {
        task.reject(new DOMException('已取消', 'AbortError'));
        continue;
      }
      this.running++;
      if (task.thumbnail) this.thumbnails++;
      void task
        .run()
        .then(task.resolve, task.reject)
        .finally(() => {
          this.running--;
          if (task.thumbnail) this.thumbnails--;
          this.pump();
        });
    }
  }
}
export const renderQueue = new RenderQueue();
export class CanvasBudget {
  readonly limit: number;
  private values = new Map<HTMLCanvasElement, number>();
  bytes = 0;
  constructor(limit: number) {
    this.limit = limit;
  }
  allocate(canvas: HTMLCanvasElement, width: number, height: number) {
    if (this.values.has(canvas) && canvas.width === width && canvas.height === height) return true;
    this.release(canvas);
    const bytes = width * height * 4;
    if (this.bytes + bytes > this.limit) return false;
    canvas.width = width;
    canvas.height = height;
    this.values.set(canvas, bytes);
    this.bytes += bytes;
    return true;
  }
  release(canvas: HTMLCanvasElement) {
    this.bytes -= this.values.get(canvas) ?? 0;
    this.values.delete(canvas);
    canvas.width = 0;
    canvas.height = 0;
  }
  get available() {
    return this.limit - this.bytes;
  }
}
export const pageCanvases = new CanvasBudget(256 * 1024 * 1024),
  thumbnailCanvases = new CanvasBudget(32 * 1024 * 1024);
export const offscreenCanvases = new CanvasBudget(96 * 1024 * 1024);
let offscreenTail: Promise<unknown> = Promise.resolve();
export function withOffscreen<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  const task = offscreenTail
    .catch(() => {})
    .then(() => {
      signal.throwIfAborted();
      return work();
    });
  offscreenTail = task;
  return task;
}
export const resourceSnapshot = () => ({
  pageBytes: pageCanvases.bytes,
  thumbnailBytes: thumbnailCanvases.bytes,
  offscreenBytes: offscreenCanvases.bytes,
  textBytes: [...textBudgets].reduce((n, ref) => {
    const budget = ref.deref();
    if (!budget) textBudgets.delete(ref);
    return n + (budget?.bytes ?? 0);
  }, 0),
  renders: renderQueue.running,
});
