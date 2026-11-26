import { ServiceError, payloadHash, validate } from '../contracts';
import type { Command, CommitCommand, CommitResult, DocHandle, Settings, Provider } from '../contracts';
import type { AppServices, Bootstrap, Capabilities, DocumentState } from './AppServices';
import type { DocumentSource, RecentDocument } from '../documents/types';

export const defaultSettings: Settings = { revision: 0, author: '浏览器用户', chatWidth: 440, sidePanel: 'none', tool: 'select', color: '#3B82F6', strokeWidth: 2, opacity: .5, window: { left: 80, top: 80, width: 1280, height: 800, maximized: false } };
const unsupported = async (): Promise<never> => { throw new ServiceError('UNCONFIGURED', '此功能需要桌面服务'); };
type SavedDoc = { handle: DocHandle; state: DocumentState; effects: Record<string, unknown>;pageCount?:number;migrations?:Record<string,string> };
type SavedOperation = { hash: string; result: CommitResult };
function request<T>(value: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); }); }
function done(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(new ServiceError('STORAGE_FAILED', '浏览器存储失败，未确认保存', true)); }); }
export async function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new ServiceError('CANCELLED', '操作已取消');
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new ServiceError('CANCELLED', '操作已取消')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, {once:true});
  });
}
export class BrowserServices implements AppServices {
  readonly capabilities: Capabilities = { desktop: false, window: false, persistentStorage: true, credentials: false, nativeText: false, ocr: false, llm: false };
  private database: Promise<IDBDatabase>;
  private handles = new Map<string, DocHandle>();
  private lifetime = new AbortController();
  private sources = new Map<string,DocumentSource>();
  constructor(name = 'docass-v1') {
    this.database = new Promise((resolve, reject) => {
      const open = indexedDB.open(name, 2);
      open.onupgradeneeded = () => { for (const store of ['settings','documents','operations','providers','files','recent']) if(!open.result.objectStoreNames.contains(store))open.result.createObjectStore(store); };
      open.onsuccess = () => { open.result.onversionchange = () => open.result.close(); resolve(open.result); };
      open.onerror = () => reject(new ServiceError('STORAGE_FAILED', '无法打开浏览器存储'));
      open.onblocked = () => reject(new ServiceError('STORAGE_FAILED', '请关闭其他标签后重试'));
    });
  }
  private resolve(id: string) { const handle = this.handles.get(id); if (!handle) throw new ServiceError('DOCUMENT_CLOSED', '文档已关闭'); return handle; }
  private async read<T>(store: string, key: string): Promise<T | undefined> { const db = await this.database; return request(db.transaction(store).objectStore(store).get(key)); }
  async bootstrap(): Promise<Bootstrap> { return { version: '0.3.0', capabilities: this.capabilities, settings: await this.settings.get(), window: { maximized: false }, documents: [] }; }
  documents: AppServices['documents'] = {
    loaded:async(id,pageCount)=>{const handle=this.resolve(id),db=await this.database,tx=db.transaction('documents','readwrite'),completion=done(tx),store=tx.objectStore('documents'),doc=await request<SavedDoc>(store.get(handle.docHash));doc.pageCount=pageCount;store.put(doc,handle.docHash);await completion;},
    checkSource:async()=>({changed:false,missing:false}),openVersion:unsupported,migrationInfo:unsupported,
    open: async (file,signal)=>{
      if(!file)return null;
      if(!/\.(pdf|png|jpe?g|bmp)$/i.test(file.name))throw new ServiceError('UNSUPPORTED_FORMAT','支持 PDF、PNG、JPEG 和 BMP 文件');
      if(file.size===0||file.size>1024**3)throw new ServiceError('FILE_TOO_LARGE','文件为空或超过 1 GiB 上限');
      signal?.throwIfAborted();const bytes=await file.arrayBuffer();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      signal?.throwIfAborted();
      let handle=[...this.handles.values()].find(h=>h.docHash===hash);
      handle??=validate<DocHandle>('DocHandle',{docId:crypto.randomUUID(),docHash:hash,fileName:file.name,kind:/\.pdf$/i.test(file.name)?'pdf':'image',byteLength:file.size,access:'edit',contentRevision:hash});
      const db=await this.database,tx=db.transaction(['documents','files','recent'],'readwrite'),completion=done(tx),docs=tx.objectStore('documents');
      if(!await request(docs.get(hash)))docs.put({handle,state:{documentRevision:0,annotations:[],conversations:[],messages:[]},effects:{}} satisfies SavedDoc,hash);
      tx.objectStore('files').put(file,hash);tx.objectStore('recent').put({docHash:hash,fileName:file.name,openedAt:new Date().toISOString()} satisfies RecentDocument,hash);
      await completion;signal?.throwIfAborted();this.handles.set(handle.docId,handle);if(!this.sources.has(handle.docId))this.sources.set(handle.docId,{kind:handle.kind,blob:file});
      return {status:'ready',openId:handle.docId,fileName:handle.fileName,handle,pageCount:0};
    },
    unlock: unsupported,
    cancelOpen: async()=>{},
    recent: async()=>{const db=await this.database;return (await request<RecentDocument[]>(db.transaction('recent').objectStore('recent').getAll())).sort((a,b)=>b.openedAt.localeCompare(a.openedAt)).slice(0,20);},
    openRecent: async(hash,signal)=>{validate('Hash',hash);const blob=await this.read<Blob>('files',hash),recent=await this.read<RecentDocument>('recent',hash);if(!blob||!recent)throw new ServiceError('FILE_MISSING','浏览器中的文件已清理，请重新选择');return (await this.documents.open(new File([blob],recent.fileName),signal))!;},
    source: async id=>{this.resolve(id);const source=this.sources.get(id);if(!source)throw new ServiceError('DOCUMENT_CLOSED','文件不可用');return source;},
    drop: ()=>{},
    subscribe: ()=>()=>{},
    openFixture: async (name, signal) => {
      await abortableDelay(40, signal);
      const hash = (name === 'report' ? 'a' : 'b').repeat(64);
      for (const handle of this.handles.values()) if (handle.docHash === hash) return handle;
      const handle = validate<DocHandle>('DocHandle', { docId: crypto.randomUUID(), docHash: hash, fileName: name === 'report' ? '示例经营报告.pdf' : '示例合同.pdf', kind: 'pdf', byteLength: 0, access: 'edit', contentRevision: hash });
      const db = await this.database; const tx = db.transaction('documents', 'readwrite'); const completion = done(tx); const store = tx.objectStore('documents');
      const current = await request<SavedDoc | undefined>(store.get(hash));
      if (!current) store.put({ handle, state: { documentRevision: 0, annotations: [], conversations: [], messages: [] }, effects: {} } satisfies SavedDoc, hash);
      await completion; if (signal?.aborted) throw new ServiceError('CANCELLED', '已取消打开'); this.handles.set(handle.docId, handle); return handle;
    },
    close: async id => { this.resolve(id); this.handles.delete(id); this.sources.delete(id); },
    reacquire: async id => ({ handle: this.resolve(id), documentRevision: (await this.persistence.read(id)).documentRevision }),
  };
  text = { getNative:unsupported,getPage: unsupported };
  clipboard = {write:async(_docId:string,text:string)=>navigator.clipboard.writeText(text)};
  ocr:AppServices['ocr'] = { start: unsupported,upload:unsupported,status:unsupported,result:unsupported,unsubscribe:async()=>{},subscribe:()=>()=>{},getOverride:async()=> 'auto',setOverride:unsupported,clearCache:unsupported };
  persistence: AppServices['persistence'] = {
    messages:async(id,conversationId,before)=>(await this.persistence.read(id)).messages.filter(m=>m.conversationId===conversationId&&m.sequence<before).sort((a,b)=>a.sequence-b.sequence).slice(-50),
    commit: async (payload: CommitCommand) => {
      validate('CommitCommand', payload); const handle = this.resolve(payload.docId);
      if (handle.access !== 'edit') throw new ServiceError('READ_ONLY', '文档当前只读');
      const digest = await payloadHash(handle.docHash, payload.command);
      if (digest !== payload.payloadHash) throw new ServiceError('HASH_MISMATCH', '提交内容校验失败');
      const db = await this.database; const tx = db.transaction(['documents','operations'], 'readwrite');
      const completion = done(tx); completion.catch(() => {});
      try {
        const operations = tx.objectStore('operations'), docs = tx.objectStore('documents'), key = handle.docHash + ':' + payload.operationId;
        const previous = await request<SavedOperation | undefined>(operations.get(key));
        if (previous) { if (previous.hash !== digest) throw new ServiceError('OPERATION_CONFLICT', '同一操作编号不能用于其他内容'); await completion; return previous.result; }
        const doc = (await request<SavedDoc>(docs.get(handle.docHash)))!;
        if (doc.state.documentRevision !== payload.expectedRevision) throw new ServiceError('REVISION_CONFLICT', '文档已更新，请重新读取', true);
        applyCommand(doc, payload.command); doc.state.documentRevision++;
        const result = { operationId: payload.operationId, committedRevision: doc.state.documentRevision, payloadHash: digest };
        docs.put(doc, handle.docHash); operations.put({ hash: digest, result }, key); await completion; return result;
      } catch (error) { try { tx.abort(); } catch { /* The transaction may already have aborted. */ } await completion.catch(() => {}); throw error; }
    },
    getOperation: async (id, operation) => { validate('Id', operation); const doc = this.resolve(id); return (await this.read<SavedOperation>('operations', doc.docHash + ':' + operation))?.result ?? null; },
    read: async id => { const doc = this.resolve(id); return structuredClone((await this.read<SavedDoc>('documents', doc.docHash))!.state); },
  };
  settings: AppServices['settings'] = {
    get: async () => validate<Settings>('Settings', await this.read('settings', 'app') ?? structuredClone(defaultSettings)),
    update: async value => {
      validate('Settings', value); const db = await this.database, tx = db.transaction('settings', 'readwrite'), completion = done(tx); completion.catch(() => {});
      const store = tx.objectStore('settings'); const old = (await request<Settings | undefined>(store.get('app'))) ?? defaultSettings;
      if (old.revision !== value.revision) { tx.abort(); await completion.catch(() => {}); throw new ServiceError('REVISION_CONFLICT', '设置已更新，请重新读取', true); }
      const next = { ...value, revision: value.revision + 1 }; store.put(next, 'app'); await completion; return next;
    },
  };
  providers: AppServices['providers'] = {
    testDraft:unsupported,
    list: async () => { const db = await this.database; return request(db.transaction('providers').objectStore('providers').getAll()); },
    save: async (provider: Provider, key?: string) => {
      if (key) throw new ServiceError('UNCONFIGURED', '浏览器模式不保存 API 密钥，请使用桌面应用'); validate('Provider', provider);
      const db = await this.database, tx = db.transaction('providers', 'readwrite'), completion = done(tx), store=tx.objectStore('providers');
      if(provider.isDefault)for(const previous of await request<Provider[]>(store.getAll()))store.put({...previous,isDefault:false},previous.id);
      store.put({ ...provider, hasKey: false }, provider.id); await completion;
    },
    delete: async id => { validate('Id', id); const db = await this.database, tx = db.transaction('providers', 'readwrite'), completion = done(tx); tx.objectStore('providers').delete(id); await completion; },
  };
  attachments = { begin: unsupported, upload: unsupported, commit: unsupported, resolve: async () => ({available:false}) };
  llm:AppServices['llm']={begin:unsupported,end:async()=>{},channel:()=>{throw new ServiceError('UNCONFIGURED','真实模型服务需要桌面应用');}};
  window = { minimize: unsupported, maximize: unsupported, requestClose: unsupported, subscribe: (_fn: (maximized: boolean) => void) => () => {},onClosing:(_fn:(id:string)=>void)=>()=>{},onCloseCancelled:(_fn:()=>void)=>()=>{},closeReady:unsupported };
  async fixtureReply(id: string, signal: AbortSignal, onChunk: (text: string) => void) {
    this.resolve(id); const linked = AbortSignal.any([signal, this.lifetime.signal]);
    for (const text of ['这是示例回复。', '内容用于验证分段显示。', '可以随时停止。', '示例结束。']) { await abortableDelay(120, linked); this.resolve(id); if (!linked.aborted) onChunk(text); }
  }
  dispose() { this.lifetime.abort(); this.handles.clear(); void this.database.then(db => db.close()); }
}
function applyCommand(doc: SavedDoc, command: Command) {
  for (const mutation of command.mutations) {
    if(mutation.type==='migration.decision'){doc.migrations??={};doc.migrations[mutation.value.oldHash]=mutation.value.decision;continue;}
    if (mutation.type === 'effect.put') { const v = mutation.value, key = `${v.conversationId}/${v.runId}/${v.toolCallId}`; if (doc.effects[key]) throw new ServiceError('OPERATION_CONFLICT', '工具效果已提交'); if (!doc.state.conversations.some(c => c.id === v.conversationId) || v.annotationIds.some(id => !doc.state.annotations.some(a => a.id === id))) throw new ServiceError('INVALID_PAYLOAD', '工具引用无效'); doc.effects[key] = v; continue; }
    const kind = mutation.type.split('.')[0] as 'annotation'|'conversation'|'message';
    const key = { annotation: 'annotations', conversation: 'conversations', message: 'messages' }[kind] as 'annotations'|'conversations'|'messages';
    const list: any[] = doc.state[key];
    if ('value' in mutation) {
      const v = mutation.value;
      if ('docHash' in v && (v.docHash !== doc.handle.docHash || v.page > (doc.pageCount??12)&&v.migrationState!=='needsReview')) throw new ServiceError('INVALID_PAYLOAD', '标注文档或页码无效');
      if ('conversationId' in v && !doc.state.conversations.some(c => c.id === v.conversationId)) throw new ServiceError('INVALID_PAYLOAD', '会话不存在');
      if ('content' in v && v.content.some(b => b.type === 'attachment')) throw new ServiceError('UNCONFIGURED', '浏览器示例暂不保存附件');
      const index = list.findIndex(item => item.id === v.id); if (index < 0) list.push(v); else list[index] = v;
    } else { const index = list.findIndex(item => item.id === mutation.id); if (index >= 0) list.splice(index, 1); if (kind === 'conversation') doc.state.messages = doc.state.messages.filter(m => m.conversationId !== mutation.id); }
  }
}
