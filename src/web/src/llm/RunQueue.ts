export class RunQueue {
  private active = 0;
  private waiting: {
    signal: AbortSignal;
    resolve: (release: () => void) => void;
    reject: (e: unknown) => void;
    abort: () => void;
  }[] = [];
  acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted();
    if (this.active < 2) {
      this.active++;
      return Promise.resolve(this.release());
    }
    return new Promise((resolve, reject) => {
      const item = {
        signal,
        resolve,
        reject,
        abort: () => {
          this.waiting = this.waiting.filter(v => v !== item);
          reject(new DOMException('排队已取消', 'AbortError'));
        },
      };
      this.waiting.push(item);
      signal.addEventListener('abort', item.abort, { once: true });
    });
  }
  private release() {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.active--;
      const next = this.waiting.shift();
      if (next) {
        next.signal.removeEventListener('abort', next.abort);
        this.active++;
        next.resolve(this.release());
      }
    };
  }
}
export const runQueue = new RunQueue();
