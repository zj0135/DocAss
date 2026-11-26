import { createStore } from 'zustand/vanilla';
import type { Content, Conversation, Message, Provider, Box } from '../contracts';
import { ServiceError } from '../contracts';
import { ancestorChain, documentContext } from './context';
import { DocumentTools, stableCallId } from './tools';
import type { DocumentAccess } from './tools';
import type { Turn, LlmEvent, LlmTransport } from './types';
import { canImage } from './types';
import { PiTransport } from './piAdapter';
import { runQueue } from './RunQueue';
import { cropPage, imageData } from './images';
import { parseCitations } from './citations';

export type Attachment = Extract<Content, { type: 'attachment' }>;
export type Navigation = {
  id: string;
  page: number;
  quote?: string;
  textRevision?: string;
  ranges?: { start: number; end: number }[];
  confirmed?: boolean;
  rect?: Box;
  annotationId?: string;
};
type ChatState = {
  tools: Record<string, string>;
  loaded: boolean;
  conversations: Conversation[];
  messages: Message[];
  activeId: string;
  draft: string;
  attachments: Attachment[];
  quotes: Extract<Content, { type: 'citation' }>[];
  providers: Provider[];
  phase: 'idle' | 'queued' | 'running' | 'stopping';
  error?: string;
  notice?: string;
  navigation?: Navigation;
  focusMessage?: string;
};
export class ChatSession {
  readonly store = createStore<ChatState>(() => ({
    tools: {},
    loaded: false,
    conversations: [],
    messages: [],
    activeId: '',
    draft: '',
    attachments: [],
    quotes: [],
    providers: [],
    phase: 'idle',
  }));
  private abort?: AbortController;
  private task?: Promise<void>;
  private checkpoint?: ReturnType<typeof setTimeout>;
  private current?: Message;
  private persistedBytes = 0;
  private pending = Promise.resolve();
  private saveError?: unknown;
  private busy = false;
  private stopRequested = false;
  private preparation?: Promise<void>;
  private failedSnapshots = new Map<string, { message: Message; conversation: Conversation }>();
  private drafts = new Map<string, Pick<ChatState, 'draft' | 'attachments' | 'quotes'>>();
  readonly access: DocumentAccess;
  private transport: LlmTransport;
  constructor(access: DocumentAccess, transport: LlmTransport = new PiTransport()) {
    this.access = access;
    this.transport = transport;
  }
  async load() {
    const { session, services } = this.access,
      state = session.store.getState(),
      messages = state.messages.map(m =>
        m.state === 'running' ? { ...m, state: 'interrupted' as const } : m,
      );
    this.store.setState({
      loaded: true,
      conversations: state.conversations,
      messages,
      activeId: state.conversations[0]?.id ?? '',
    });
    await this.refreshProviders();
    if (session.handle.access === 'edit') {
      const interrupted = messages.filter(
        m =>
          m.state === 'interrupted' && state.messages.find(v => v.id === m.id)?.state === 'running',
      );
      for (const value of interrupted)
        await session.commit({ type: 'batch', mutations: [{ type: 'message.put', value }] });
    }
    await this.loadMore(true);
    void services;
  }
  async refreshProviders() {
    this.store.setState({ providers: await this.access.services.providers.list() });
  }
  private async saveConversation(value: Conversation) {
    await this.access.session.commit({
      type: 'batch',
      mutations: [{ type: 'conversation.put', value }],
    });
    this.store.setState(s => ({
      conversations: [...s.conversations.filter(c => c.id !== value.id), value],
    }));
  }
  async create() {
    if (this.store.getState().phase !== 'idle') throw Error('请先停止当前生成');
    const providers = await this.access.services.providers.list(),
      p =
        providers.find(p => p.isDefault && p.models.length) ?? providers.find(p => p.models.length),
      value: Conversation = {
        id: crypto.randomUUID(),
        title: '新对话',
        modelRef: p ? `${p.id}/${p.models[0].modelId}` : '',
        createdAt: new Date().toISOString(),
        headId: null,
      };
    await this.saveConversation(value);
    this.select(value.id);
    return value;
  }
  select(id: string) {
    const state = this.store.getState();
    this.drafts.set(state.activeId, {
      draft: state.draft,
      attachments: state.attachments,
      quotes: state.quotes,
    });
    this.store.setState({
      activeId: id,
      ...(this.drafts.get(id) ?? { draft: '', attachments: [], quotes: [] }),
      error: undefined,
    });
    if (id) void this.loadMore(true).catch(e => this.store.setState({ error: String(e) }));
  }
  async loadMore(latest = false) {
    const state = this.store.getState(),
      id = state.activeId;
    if (!id) return;
    const before = latest
        ? 2147483647
        : Math.min(
            2147483647,
            ...state.messages.filter(m => m.conversationId === id).map(m => m.sequence),
          ),
      page = await this.access.services.persistence.messages(
        this.access.session.handle.docId,
        id,
        before,
      );
    this.store.setState(s => {
      const map = new Map(
        page.map(m => [
          m.id,
          m.state === 'running' && !this.abort ? { ...m, state: 'interrupted' as const } : m,
        ]),
      );
      for (const m of s.messages) map.set(m.id, m);
      return { messages: [...map.values()].sort((a, b) => a.sequence - b.sequence) };
    });
    return page.length;
  }
  async rename(title: string) {
    const c = this.conversation();
    if (!c) return;
    await this.saveConversation({
      ...c,
      title: title.trim().slice(0, 256) || '新对话',
      renamed: true,
    });
  }
  async remove() {
    const c = this.conversation();
    if (!c) return;
    this.stop();
    await this.flush();
    await this.access.session.commit({
      type: 'batch',
      mutations: [{ type: 'conversation.remove', id: c.id }],
    });
    this.store.setState(s => ({
      conversations: s.conversations.filter(v => v.id !== c.id),
      messages: s.messages.filter(v => v.conversationId !== c.id),
      activeId: s.conversations.find(v => v.id !== c.id)?.id ?? '',
      draft: '',
      attachments: [],
      quotes: [],
    }));
  }
  conversation() {
    const s = this.store.getState();
    return s.conversations.find(c => c.id === s.activeId);
  }
  async model(modelRef: string) {
    const draft = this.store.getState();
    let c = this.conversation();
    if (!c) {
      c = await this.create();
      this.store.setState({
        draft: draft.draft,
        quotes: draft.quotes,
        attachments: draft.attachments,
      });
    }
    await this.saveConversation({ ...c, modelRef });
  }
  visible() {
    const c = this.conversation();
    return c ? ancestorChain(this.store.getState().messages, c.headId) : [];
  }
  branches() {
    const c = this.conversation(),
      messages = this.store.getState().messages.filter(m => m.conversationId === c?.id),
      parents = new Set(messages.map(m => m.parentId));
    return messages.filter(m => !parents.has(m.id) && m.role !== 'user');
  }
  async branch(headId: string) {
    const c = this.conversation();
    if (c) await this.saveConversation({ ...c, headId });
  }
  addQuote(value: Extract<Content, { type: 'citation' }>) {
    const state = this.store.getState();
    if (state.quotes.length >= 4) throw Error('最多加入4个文字引用');
    this.store.setState({ quotes: [...state.quotes, structuredClone(value)] });
  }
  async addRegion(page: number, rect: Box) {
    const { session, pool, prompt, services } = this.access;
    if (this.store.getState().attachments.length >= 4) throw Error('最多4个附件');
    const signal = new AbortController().signal,
      lease = await pool.acquire(session.handle.docId, prompt, signal);
    try {
      const image = await cropPage(lease.document, page, rect, 2048, signal);
      const text = session.text
        ? await session.text.getPage(page, signal)
        : await services.text.getPage(session.handle.docId, page, signal).catch(() => undefined);
      let regionText = '';
      if (text && text.quality !== 'unavailable') {
        const ids = new Set(
          text.glyphs
            .filter(g => {
              const x = (g.quad[0] + g.quad[4]) / 2,
                y = (g.quad[1] + g.quad[5]) / 2;
              return x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3];
            })
            .map(g => g.id),
        );
        regionText = text.spans
          .filter(s => s.glyphIds.some(id => ids.has(id)))
          .map(s => text.text.slice(s.range.start, s.range.end))
          .join('')
          .slice(0, 20000);
      }
      const upload = await services.attachments.begin(session.handle.docId);
      await services.attachments.upload(session.handle.docId, upload, image.blob);
      const id = await services.attachments.commit(session.handle.docId, upload);
      if (this.store.getState().attachments.length >= 4) throw Error('最多4个附件');
      this.store.setState(s => ({
        attachments: [
          ...s.attachments,
          {
            type: 'attachment',
            attachmentId: id,
            page,
            rect,
            docHash: session.handle.docHash,
            scale: image.scale,
            text: regionText,
          },
        ],
      }));
    } finally {
      lease.release();
    }
  }
  private update(message: Message) {
    this.store.setState(s => ({
      messages: s.messages.some(m => m.id === message.id)
        ? s.messages.map(m => (m.id === message.id ? structuredClone(message) : m))
        : [...s.messages, structuredClone(message)],
    }));
  }
  private sequence() {
    return Math.max(-1, ...this.store.getState().messages.map(m => m.sequence)) + 1;
  }
  private persist(message: Message, conversation: Conversation) {
    const snapshot = structuredClone(message),
      live = this.store.getState().conversations.find(v => v.id === conversation.id),
      c = structuredClone({
        ...conversation,
        ...(live
          ? { modelRef: live.modelRef, title: live.title, renamed: live.renamed ?? false }
          : {}),
      });
    this.pending = this.pending
      .then(async () => {
        await this.access.session.commit({
          type: 'batch',
          mutations: [
            { type: 'message.put', value: snapshot },
            { type: 'conversation.put', value: c },
          ],
        });
        this.failedSnapshots.delete(snapshot.id);
      })
      .catch(e => {
        this.failedSnapshots.set(snapshot.id, { message: snapshot, conversation: c });
        this.saveError = e;
        this.abort?.abort();
        this.store.setState({ error: '聊天保存失败，请重试文档保存：' + String(e) });
      });
    return this.pending;
  }
  private schedule(conversation: Conversation) {
    if (this.checkpoint) return;
    this.checkpoint = setTimeout(() => {
      this.checkpoint = undefined;
      if (this.current) void this.persist(this.current, conversation);
    }, 500);
  }
  stop() {
    this.stopRequested = true;
    this.abort?.abort();
    if (this.store.getState().phase !== 'idle') {
      this.store.setState({ phase: 'stopping' });
      if (this.current?.state === 'running') {
        this.current.state = 'cancelled';
        this.update(this.current);
      }
    }
  }
  async flush() {
    await this.preparation;
    await this.task;
    await this.pending;
    if (this.saveError) {
      if (this.access.session.store.getState().saveState !== 'saved') throw this.saveError;
      for (const value of this.failedSnapshots.values())
        await this.access.session.commit({
          type: 'batch',
          mutations: [
            { type: 'message.put', value: value.message },
            { type: 'conversation.put', value: value.conversation },
          ],
        });
      this.failedSnapshots.clear();
      this.saveError = undefined;
    }
  }
  async send(regenerateUserId?: string) {
    if (this.busy || this.store.getState().phase !== 'idle') return;
    this.busy = true;
    this.stopRequested = false;
    this.preparation = this.prepareSend(regenerateUserId);
    try {
      await this.preparation;
    } finally {
      this.busy = false;
      this.preparation = undefined;
    }
  }
  private async prepareSend(regenerateUserId?: string) {
    const { session, services } = this.access;
    if (!services.capabilities.llm) throw Error('真实模型请求需要桌面服务');
    if (session.handle.access !== 'edit') throw Error('只读文档不能创建会话');
    const draft = this.store.getState(),
      selected = this.conversation();
    let c: Conversation = selected ?? (await this.create());
    if (!selected)
      this.store.setState({
        draft: draft.draft,
        attachments: draft.attachments,
        quotes: draft.quotes,
      });
    await this.refreshProviders();
    const state = this.store.getState(),
      slash = c.modelRef.indexOf('/'),
      provider = state.providers.find(p => p.id === c.modelRef.slice(0, slash)),
      model = provider?.models.find(m => m.modelId === c.modelRef.slice(slash + 1));
    if (!provider || !model) throw Error('模型配置缺失，请在设置中添加提供方和模型');
    const original = regenerateUserId
      ? state.messages.find(
          m => m.id === regenerateUserId && m.role === 'user' && m.conversationId === c.id,
        )
      : undefined;
    if (regenerateUserId && !original) throw Error('原问题已删除');
    const content: Content[] = original
      ? structuredClone(original.content)
      : [
          ...(state.draft.trim() ? [{ type: 'text' as const, text: state.draft.trim() }] : []),
          ...structuredClone(state.quotes),
          ...structuredClone(state.attachments),
        ];
    if (!content.length) throw Error('请输入问题或添加引用');
    if (!canImage(provider, model) && content.some(b => b.type === 'attachment' && !b.text?.trim()))
      throw Error('当前模型不支持图像，区域没有可读文字；请换视觉模型或先识别该页');
    const runId = crypto.randomUUID(),
      branchId = crypto.randomUUID(),
      user: Message = original ?? {
        id: crypto.randomUUID(),
        conversationId: c.id,
        parentId: c.headId ?? null,
        branchId,
        role: 'user',
        createdAt: new Date().toISOString(),
        state: 'completed',
        sequence: this.sequence(),
        content,
        modelRef: c.modelRef,
        runId,
      };
    if (!c.renamed && c.title === '新对话')
      c = { ...c, title: (state.draft || '文档问答').slice(0, 20) };
    await session.commit({
      type: 'batch',
      mutations: [
        { type: 'message.put', value: user },
        { type: 'conversation.put', value: { ...c, headId: user.id } },
      ],
    });
    this.update(user);
    this.store.setState(s => ({
      conversations: s.conversations.map(v => (v.id === c.id ? { ...c, headId: user.id } : v)),
      draft: '',
      attachments: [],
      quotes: [],
      phase: 'queued',
      error: undefined,
      notice:
        !canImage(provider, model) && content.some(b => b.type === 'attachment')
          ? '本次仅发送区域文字'
          : undefined,
    }));
    if (this.stopRequested || session.store.getState().closeState !== 'open') {
      this.store.setState({ phase: 'idle' });
      return;
    }
    const controller = new AbortController();
    this.abort = controller;
    this.task = this.generate(c, user, branchId, runId, controller).finally(() => {
      if (this.abort === controller) {
        this.abort = undefined;
        this.current = undefined;
        this.store.setState({ phase: 'idle', tools: {} });
      }
    });
    void this.task.catch(() => {});
  }
  private async hydrate(
    messages: Message[],
    imageAllowed: boolean,
    signal: AbortSignal,
  ): Promise<Turn[]> {
    const imageIds = new Set(
      messages
        .flatMap(m => m.content.filter(b => b.type === 'attachment').map(b => b.attachmentId))
        .slice(-4),
    );
    const turns: Turn[] = [];
    for (const m of messages) {
      const text = m.content
          .filter(b => b.type === 'text' || b.type === 'citation' || b.type === 'error')
          .map(b =>
            b.type === 'text'
              ? b.text
              : b.type === 'citation'
                ? `引用 p${b.page}: ${b.quote}`
                : b.message,
          )
          .join('\n'),
        attachments = m.content.filter(b => b.type === 'attachment'),
        images = [];
      for (const a of attachments) {
        if (imageAllowed && imageIds.has(a.attachmentId)) {
          const resolved = await this.access.services.attachments.resolve(
            this.access.session.handle.docId,
            a.attachmentId,
          );
          if (resolved.available && resolved.url) {
            const response = await fetch(resolved.url, { signal });
            if (response.ok)
              images.push({
                data: await imageData(await response.blob()),
                mimeType: 'image/png' as const,
              });
          }
        }
      }
      const calls = m.content
        .filter(b => b.type === 'toolCall')
        .map(b => ({
          id: b.wireId ?? b.toolCallId,
          name: b.name,
          args: JSON.parse(b.argumentsJson),
        }));
      if (m.role !== 'tool')
        turns.push({
          role: m.role,
          text:
            text +
            attachments.map(a => (a.text ? `\n区域文字 p${a.page}: ${a.text}` : '')).join(''),
          images,
          calls,
        });
      else
        for (const b of m.content)
          if (b.type === 'toolResult')
            turns.push({
              role: 'tool',
              text: b.resultJson,
              callId: b.wireId ?? b.toolCallId,
              toolName: m.content.find(v => v.type === 'text')?.text ?? 'document_tool',
              images,
            });
    }
    // Interrupted calls retain their pairing but are never replayed on recovery.
    const paired: Turn[] = [];
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      paired.push(turn);
      if (turn.role !== 'assistant') continue;
      for (const call of turn.calls ?? []) {
        let found = false;
        for (let j = i + 1; j < turns.length && turns[j].role === 'tool'; j++)
          if (turns[j].callId === call.id) found = true;
        if (!found)
          paired.push({
            role: 'tool',
            callId: call.id,
            toolName: call.name,
            text: '上次工具调用已中断，结果不可用；不自动重新执行。',
            isError: true,
          });
      }
    }
    const first = paired.findIndex(t => t.role === 'user');
    return first < 0 ? [] : paired.slice(first);
  }
  private async generate(
    conversation: Conversation,
    user: Message,
    branchId: string,
    runId: string,
    controller: AbortController,
  ) {
    let release: (() => void) | undefined, tools: DocumentTools | undefined;
    let c = { ...conversation, headId: user.id };
    const signal = controller.signal;
    try {
      signal.throwIfAborted();
      const slash = c.modelRef.indexOf('/'),
        provider = await this.access.services.llm.begin(
          this.access.session.handle.docId,
          c.modelRef.slice(0, slash),
          c.modelRef.slice(slash + 1),
          runId,
        ),
        model = provider.models.find(m => m.modelId === c.modelRef.slice(slash + 1))!;
      release = await runQueue.acquire(signal);
      signal.throwIfAborted();
      this.store.setState({ phase: 'running' });
      tools = new DocumentTools(
        this.access,
        runId,
        c.id,
        () => this.current!.id,
        canImage(provider, model),
      );
      const pageCount = this.access.session.store.getState().pageCount,
        pages = [];
      const ready = Object.keys(this.access.session.text?.store.getState().pages ?? {}).map(Number);
      const candidates =
        pageCount <= 5 ? Array.from({ length: pageCount }, (_, i) => i + 1) : ready.slice(0, 5);
      for (const page of candidates) pages.push(await tools.text(page, signal));
      const history = await this.hydrate(
          ancestorChain(this.store.getState().messages, user.id),
          canImage(provider, model),
          signal,
        ),
        data = documentContext(
          this.access.session.handle.fileName,
          pageCount,
          pages,
          model,
          user.content
            .filter(b => b.type === 'citation')
            .map(b => b.quote)
            .join('\n'),
        );
      const emit = async (event: LlmEvent) => {
        if (signal.aborted && !(event.type === 'toolEnd' && event.annotationIds?.length)) return;
        if (event.type === 'start') {
          const m: Message = {
            id: crypto.randomUUID(),
            conversationId: c.id,
            parentId: c.headId,
            branchId,
            role: 'assistant',
            createdAt: new Date().toISOString(),
            state: 'running',
            sequence: this.sequence(),
            content: [],
            modelRef: c.modelRef,
            runId,
          };
          this.current = m;
          c = { ...c, headId: m.id };
          this.update(m);
          this.store.setState(s => ({
            conversations: s.conversations.map(v =>
              v.id === c.id ? { ...v, headId: c.headId } : v,
            ),
          }));
          await this.persist(m, c);
        }
        if (event.type === 'delta' && this.current) {
          const b = this.current.content.find(b => b.type === 'text');
          if (b?.type === 'text') b.text += event.text;
          else this.current.content.push({ type: 'text', text: event.text });
          this.update(this.current);
          this.persistedBytes += new TextEncoder().encode(event.text).length;
          if (this.persistedBytes >= 32768) {
            this.persistedBytes = 0;
            await this.persist(this.current, c);
          } else this.schedule(c);
        }
        if (event.type === 'end') {
          if (this.checkpoint) {
            clearTimeout(this.checkpoint);
            this.checkpoint = undefined;
          }
          if (!this.current) {
            await emit({ type: 'start' });
          }
          if (!this.current) return;
          this.current.content = [
            { type: 'text', text: event.turn.text },
            ...(await Promise.all(
              (event.turn.calls ?? []).map(async call => ({
                type: 'toolCall' as const,
                toolCallId: await stableCallId(runId, call.id),
                wireId: call.id,
                name: call.name,
                argumentsJson: JSON.stringify(call.args),
              })),
            )),
          ];
          this.current.usage = event.usage;
          this.current.state = event.error ? 'failed' : 'completed';
          if (event.error)
            this.current.content.push({
              type: 'error',
              code: 'MODEL_ERROR',
              message: event.error.slice(0, 4096),
            });
          for (const { citation } of parseCitations(event.turn.text).slice(
            0,
            Math.max(0, 100 - this.current.content.length),
          )) {
            if (citation.page > pageCount) continue;
            try {
              const text = await tools!.text(citation.page, signal);
              let ranges: import('../contracts').TextRange[] | undefined;
              try {
                ranges = tools!.anchors.resolve(text, citation.quote, citation.anchorToken);
              } catch {}
              this.current.content.push({
                type: 'citation',
                ...citation,
                textRevision: text.textRevision,
                confirmed: !!ranges,
                ranges: ranges ?? [],
              });
            } catch {
              /* Unavailable references remain unconfirmed. */
            }
          }
          this.update(this.current);
          await this.persist(this.current, c);
        }
        if (event.type === 'toolStart') {
          this.store.setState(s => ({ tools: { ...s.tools, [event.id]: event.name } }));
        }
        if (event.type === 'toolEnd') {
          this.store.setState(s => ({
            tools: Object.fromEntries(Object.entries(s.tools).filter(([id]) => id !== event.id)),
          }));
          const m: Message = {
            id: crypto.randomUUID(),
            conversationId: c.id,
            parentId: c.headId,
            branchId,
            role: 'tool',
            createdAt: new Date().toISOString(),
            state: event.isError ? 'failed' : 'completed',
            sequence: this.sequence(),
            runId,
            content: [
              ...(event.attachment ? [event.attachment] : []),
              { type: 'text', text: event.name },
              {
                type: 'toolResult',
                toolCallId: await stableCallId(runId, event.id),
                wireId: event.id,
                resultJson: event.result.slice(0, 120000),
                ...(event.annotationIds ? { annotationIds: event.annotationIds } : {}),
              },
            ],
          };
          c = { ...c, headId: m.id };
          this.update(m);
          this.store.setState(s => ({
            conversations: s.conversations.map(v =>
              v.id === c.id ? { ...v, headId: c.headId } : v,
            ),
          }));
          await this.persist(m, c);
        }
      };
      await this.transport.run(
        { runId, provider, model, ...this.access.services.llm.channel(runId, signal), signal },
        history,
        data,
        tools.specs(),
        emit,
      );
    } catch (e) {
      if (this.current) {
        this.current.state = signal.aborted ? 'cancelled' : 'failed';
        if (!signal.aborted)
          this.current.content.push({
            type: 'error',
            code: e instanceof ServiceError ? e.code : 'MODEL_ERROR',
            message: String(e).slice(0, 4096),
          });
        this.update(this.current);
      }
      if (!signal.aborted) this.store.setState({ error: String(e) });
    } finally {
      if (this.checkpoint) {
        clearTimeout(this.checkpoint);
        this.checkpoint = undefined;
      }
      if (this.current) await this.persist(this.current, c);
      await this.pending;
      tools?.dispose();
      await this.access.services.llm.end(runId).catch(() => {});
      release?.();
    }
  }
  jump(value: Omit<Navigation, 'id'>) {
    this.store.setState({ navigation: { ...value, id: crypto.randomUUID() } });
  }
  source(conversationId: string, messageId: string) {
    void (async () => {
      if (!this.store.getState().conversations.some(c => c.id === conversationId)) {
        this.store.setState({ notice: '来源会话或消息已删除，标注仍保留' });
        return;
      }
      this.select(conversationId);
      await this.loadMore(true);
      while (
        !this.store
          .getState()
          .messages.some(m => m.id === messageId && m.conversationId === conversationId)
      ) {
        if (!(await this.loadMore())) break;
      }
      if (!this.store.getState().messages.some(m => m.id === messageId)) {
        this.store.setState({ notice: '来源消息已删除，标注仍保留' });
        return;
      }
      if (!this.visible().some(m => m.id === messageId)) await this.branch(messageId);
      this.store.setState({ focusMessage: messageId });
    })().catch(e => this.store.setState({ error: String(e) }));
  }
  async undo(ids: string[]) {
    const { session } = this.access,
      existing = session.store.getState().annotations.filter(a => ids.includes(a.id));
    if (!existing.length) {
      this.store.setState({ notice: '标注已撤销或删除' });
      return;
    }
    await session.execute(existing.map(a => ({ type: 'annotation.remove', id: a.id })));
  }
}
