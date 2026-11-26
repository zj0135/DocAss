import { createStore } from 'zustand/vanilla';
import { payloadHash, ServiceError, validate } from '../contracts';
import type { Command, CommitCommand, DocHandle, Mutation, Annotation } from '../contracts';
import type { AppServices, DocumentState } from '../services/AppServices';
import { AnnotationHistory, applyAnnotations, inverseMutations } from '../annotations/model';
import type { Tool, ToolStyle, EditDraft } from '../annotations/model';
import type { DocumentText } from '../ocr/DocumentText';

type Pending = {
  command: Command;
  payload?: CommitCommand;
  signal?: AbortSignal;
  sent?: boolean;
  resolve: () => void;
  reject: (error: unknown) => void;
};
export class DocSession {
  handle: DocHandle;
  readonly history = new AnnotationHistory();
  readonly store = createStore<
    DocumentState & {
      access: DocHandle['access'];
      page: number;
      pageCount: number;
      anchorRatio: number;
      scale: number;
      rotation: number;
      fit: 'manual' | 'width' | 'page';
      draft: string;
      reply: string;
      running: boolean;
      saveState: 'pending' | 'saving' | 'saved' | 'error';
      closeState: 'open' | 'closing' | 'blocked' | 'closed';
      tool: Tool;
      toolPhase: 'idle' | 'armed' | 'dragging' | 'commit';
      styles: Partial<Record<Tool, ToolStyle>>;
      selectedId?: string;
      editor?: EditDraft;
      undoCount: number;
      redoCount: number;
      error?: string;
    }
  >(() => ({
    access: 'readOnly',
    documentRevision: 0,
    annotations: [],
    conversations: [],
    messages: [],
    page: 1,
    pageCount: 0,
    anchorRatio: 0,
    scale: 1,
    rotation: 0,
    fit: 'manual',
    draft: '',
    reply: '',
    running: false,
    saveState: 'saved',
    closeState: 'open',
    tool: 'select',
    toolPhase: 'idle',
    styles: {},
    undoCount: 0,
    redoCount: 0,
  }));
  private run?: AbortController;
  private pending: Pending[] = [];
  private worker?: Promise<void>;
  private closed = false;
  private failed = false;
  private closing?: Promise<void>;
  private revision = 0;
  private annotationRevisions = new Map<string, number>();
  private services: AppServices;
  migrationFrom?: string;
  text?: DocumentText;
  chat?: import('../llm/ChatSession').ChatSession;
  constructor(handle: DocHandle, services: AppServices) {
    this.handle = handle;
    this.services = services;
    this.store.setState({ access: handle.access });
  }
  async reacquire() {
    const { handle } = await this.services.documents.reacquire(this.handle.docId);
    this.handle = handle;
    await this.restore();
    this.store.setState({ access: handle.access, error: undefined });
  }
  async restore() {
    const state = await this.services.persistence.read(this.handle.docId);
    if (this.closed) return;
    this.revision = Math.max(this.revision, state.documentRevision);
    for (const a of state.annotations)
      this.annotationRevisions.set(
        a.id,
        Math.max(a.revision, this.annotationRevisions.get(a.id) ?? 0),
      );
    this.store.setState({
      ...state,
      annotations: this.pending.reduce(
        (a, p) => applyAnnotations(a, p.command.mutations),
        state.annotations,
      ),
    });
  }
  private writable() {
    if (this.closed || this.store.getState().closeState !== 'open')
      throw new ServiceError('BUSY', '文档正在关闭');
    if (this.handle.access !== 'edit') throw new ServiceError('READ_ONLY', '文档当前只读');
    if (this.failed) throw new ServiceError('STORAGE_FAILED', '请先重试未确认的保存');
  }
  commit(command: Command, signal?: AbortSignal): Promise<void> {
    try {
      this.writable();
      validate('Command', command);
    } catch (e) {
      return Promise.reject(e);
    }
    const stable = structuredClone(command);
    const task = new Promise<void>((resolve, reject) =>
      this.pending.push({ command: stable, signal, resolve, reject }),
    );
    this.store.setState(s => ({
      annotations: applyAnnotations(s.annotations, stable.mutations),
      saveState: 'pending',
      error: undefined,
    }));
    this.startWorker();
    return task;
  }
  private startWorker() {
    if (this.worker || this.failed) return;
    this.worker = Promise.resolve()
      .then(() => this.drain())
      .finally(() => {
        this.worker = undefined;
        if (this.pending.length && !this.failed) this.startWorker();
      });
  }
  private async drain() {
    while (this.pending.length && !this.failed) {
      const job = this.pending[0];
      this.store.setState({ saveState: 'saving' });
      try {
        if (job.signal?.aborted && !job.payload) {
          this.pending.shift();
          job.reject(new DOMException('已取消', 'AbortError'));
          await this.restore();
          this.store.setState({ saveState: this.pending.length ? 'pending' : 'saved' });
          continue;
        }
        job.payload ??= {
          schemaVersion: 1,
          docId: this.handle.docId,
          operationId: crypto.randomUUID(),
          expectedRevision: this.revision,
          payloadHash: await payloadHash(this.handle.docHash, job.command),
          command: job.command,
        };
        if (job.signal?.aborted && !job.sent) {
          job.payload = undefined;
          continue;
        }
        job.sent = true;
        const ack = await this.services.persistence.commit(job.payload);
        this.revision = Math.max(this.revision, ack.committedRevision);
        // Keep acknowledged work until refresh succeeds; retry uses the same operation.
        const saved = await this.services.persistence.read(this.handle.docId);
        this.revision = Math.max(this.revision, saved.documentRevision);
        this.pending.shift();
        this.store.setState({
          ...saved,
          annotations: this.pending.reduce(
            (a, p) => applyAnnotations(a, p.command.mutations),
            saved.annotations,
          ),
          saveState: this.pending.length ? 'pending' : 'saved',
          error: undefined,
        });
        job.resolve();
      } catch (e) {
        this.failed = true;
        this.store.setState({
          saveState: 'error',
          error: e instanceof Error ? e.message : String(e),
        });
        for (const p of this.pending) p.reject(e);
      }
    }
  }
  async retry() {
    await this.worker;
    this.failed = false;
    this.startWorker();
    await this.flush();
  }
  async flush() {
    while (this.worker) await this.worker;
    if (this.failed || this.pending.length) throw Error('仍有未保存的修改');
    if (this.store.getState().editor) throw Error('请先保存或取消正在编辑的批注');
  }
  private materialize(mutations: Mutation[]): Mutation[] {
    return mutations.map(m => {
      if (m.type !== 'annotation.put') return m;
      const revision =
        Math.max(
          m.value.revision,
          this.annotationRevisions.get(m.value.id) ?? 0,
          this.store.getState().annotations.find(a => a.id === m.value.id)?.revision ?? 0,
        ) + 1;
      this.annotationRevisions.set(m.value.id, revision);
      return { ...m, value: { ...m.value, revision, modifiedAt: new Date().toISOString() } };
    });
  }
  execute(mutations: Mutation[]): Promise<void> {
    try {
      this.writable();
      if (!mutations.length) return Promise.resolve();
      const forward = this.materialize(mutations),
        inverse = inverseMutations(this.store.getState().annotations, forward);
      validate('Command', { type: 'batch', mutations: forward });
      this.history.push({ forward, inverse });
      this.historyChanged();
      return this.commit({ type: 'batch', mutations: forward });
    } catch (e) {
      return Promise.reject(e);
    }
  }
  undo() {
    return this.replay(false);
  }
  redo() {
    return this.replay(true);
  }
  private replay(redo: boolean): Promise<void> {
    try {
      this.writable();
      const from = redo ? this.history.redoEntries : this.history.undoEntries,
        to = redo ? this.history.undoEntries : this.history.redoEntries,
        entry = from.at(-1);
      if (!entry) return Promise.resolve();
      const mutations = this.materialize(redo ? entry.forward : entry.inverse);
      validate('Command', { type: 'batch', mutations });
      from.pop();
      to.push(entry);
      this.historyChanged();
      return this.commit({ type: 'batch', mutations });
    } catch (e) {
      return Promise.reject(e);
    }
  }
  private historyChanged() {
    this.store.setState({
      undoCount: this.history.undoEntries.length,
      redoCount: this.history.redoEntries.length,
    });
  }
  remove(id: string) {
    const current = this.store.getState().annotations.find(a => a.id === id);
    if (!current) return Promise.resolve();
    const group = this.store
      .getState()
      .annotations.filter(a => a.id === id || (current.groupId && a.groupId === current.groupId));
    this.store.setState({ selectedId: undefined, editor: undefined });
    return this.execute(group.map(a => ({ type: 'annotation.remove', id: a.id })));
  }
  put(value: Annotation) {
    return this.execute([{ type: 'annotation.put', value }]);
  }
  async prepareClose() {
    this.chat?.stop();
    try {
      await this.chat?.flush();
      this.store.setState({ closeState: 'closing' });
      this.stop();
      await this.flush();
    } catch (e) {
      this.store.setState({ closeState: 'blocked' });
      throw e;
    }
  }
  cancelClose() {
    if (!this.closed) this.store.setState({ closeState: 'open' });
    this.closing = undefined;
  }
  async discard() {
    await this.worker;
    this.pending = [];
    this.failed = false;
    this.history.clear();
    this.historyChanged();
    this.store.setState({ editor: undefined, saveState: 'saved', error: undefined });
    await this.restore();
  }
  close(): Promise<void> {
    return (this.closing ??= this.closeCore());
  }
  private async closeCore() {
    await this.prepareClose();
    await this.services.documents.close(this.handle.docId);
    this.text?.dispose();
    this.closed = true;
    this.store.setState({ closeState: 'closed' });
  }
  async runFixture() {
    this.stop();
    const run = new AbortController();
    this.run = run;
    this.store.setState({ running: true, reply: '' });
    try {
      await this.services.fixtureReply(this.handle.docId, run.signal, text => {
        if (!this.closed && this.run === run && !run.signal.aborted)
          this.store.setState(s => ({ reply: s.reply + text }));
      });
    } catch (e) {
      if (!run.signal.aborted)
        this.store.setState({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (this.run === run && !this.closed) this.store.setState({ running: false });
    }
  }
  stop() {
    this.chat?.stop();
    this.run?.abort();
    this.run = undefined;
    this.text?.cancel();
    this.store.setState({ running: false });
  }
}
