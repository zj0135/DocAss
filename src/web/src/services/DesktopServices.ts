import { Webview2Transport } from '../bridge/webview2Transport';
import { ServiceError, validate } from '../contracts';
import type { Settings, DocHandle, CommitResult } from '../contracts';
import type { AppServices, Bootstrap, Capabilities, DocumentState } from './AppServices';
import type { OpenResult, NativePage } from '../documents/types';
import { buildPageText } from '../text/model';

export class DesktopServices implements AppServices {
  readonly capabilities: Capabilities = { desktop: true, window: true, persistentStorage: true, credentials: true, nativeText: true, ocr: false, llm: false };
  private transport: Webview2Transport;
  private local?: Bootstrap['loopback'];
  constructor(transport: Webview2Transport) { this.transport = transport; }
  async bootstrap() { const result = await this.transport.request<Bootstrap>('app.bootstrap'); validate('Settings', result.settings); this.local = result.loopback; return result; }
  documents: AppServices['documents'] = {
    loaded:async()=>{},checkSource:docId=>this.transport.request('doc.checkSource',{docId},undefined,120000),openVersion:docId=>this.transport.request('doc.openVersion',{docId},undefined,120000),migrationInfo:(docId,oldHash)=>this.transport.request('doc.migrationInfo',{docId,oldHash},undefined,120000),
    open: (_file,signal) => this.transport.request('doc.open',{},signal,120000),
    unlock: (openId,password,signal)=>this.transport.request('doc.unlock',{openId,password},signal,120000),
    cancelOpen: openId=>this.transport.request('doc.cancelOpen',{openId}),
    recent: ()=>this.transport.request('doc.recent'),
    openRecent: (docHash,signal)=>this.transport.request('doc.openRecent',{docHash},signal,120000),
    source: async docId=>{const info=await this.transport.request<OpenResult>('doc.info',{docId});const {password}=await this.transport.request<{password?:string}>('doc.password',{docId});return {kind:info.handle!.kind,url:`/_host/doc/${docId}/${info.image?'image':'bytes'}`,image:info.image,password};},
    drop: files=>window.chrome?.webview?.postMessageWithAdditionalObjects?.({type:'docass.files'},files),
    subscribe: (onOpen,onError)=>this.transport.subscribe(event=>{if(event.topic==='doc.opened')onOpen(event.payload as OpenResult);if(event.topic==='doc.openFailed')onError((event.payload as {message:string}).message);}),
    openFixture: async name => validate<DocHandle>('DocHandle', await this.transport.request('doc.openFixture', {name})),
    close: docId => this.transport.request('doc.close', { docId }),
    reacquire: docId => this.transport.request<{handle:DocHandle;documentRevision:number}>('doc.reacquire', { docId }),
  };
  text: AppServices['text'] = { getPage: async (docId,page,signal) => {
    const jobId=crypto.randomUUID();validate('Id',docId);
    const cancel=()=>{void this.transport.request('text.cancel',{docId,jobId}).catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
    try {const response=await fetch(`/_host/doc/${docId}/text/${page}/${jobId}`,{signal});const result=await response.json();if(!response.ok)throw new ServiceError(result.code??'TEXT_UNRELIABLE',result.message??'文字提取失败');const raw=result as NativePage;if(raw.docId!==docId||raw.jobId!==jobId||raw.pageInfo.page!==page)throw new Error('文字任务版本不匹配');return await buildPageText(raw);}
    finally {signal?.removeEventListener('abort',cancel);}
  } };
  ocr: AppServices['ocr'] = { start: async () => { throw new ServiceError('UNCONFIGURED', '识别服务尚未就绪'); } };
  clipboard: AppServices['clipboard'] = {write:async(docId,text)=>{
    validate('Id',docId);const response=await fetch(`/_host/doc/${docId}/clipboard`,{method:'POST',headers:{'Content-Type':'text/plain'},body:text});if(!response.ok)throw new ServiceError('CLIPBOARD_FAILED','无法写入剪贴板，请重试');
  }};
  persistence: AppServices['persistence'] = {
    commit: async command => validate<CommitResult>('CommitResult', await this.transport.request('store.commit', validate('CommitCommand', command))),
    getOperation: (docId, operationId) => this.transport.request('store.getOperation', {docId,operationId}),
    read: docId => this.transport.request<DocumentState>('store.snapshot',{docId}),
  };
  settings: AppServices['settings'] = { get: () => this.transport.request<Settings>('settings.get'), update: settings => this.transport.request<Settings>('settings.update', validate('Settings', settings)) };
  providers: AppServices['providers'] = { list: () => this.transport.request('providers.list'), save: (provider, replacementKey, deleteKey = false) => this.transport.request('providers.save', {provider:validate('Provider',provider),replacementKey:replacementKey ?? null,deleteKey}), delete: id => this.transport.request('providers.delete',{id}) };
  attachments: AppServices['attachments'] = {
    begin: async docId => (await this.transport.request<{uploadId:string}>('attachment.begin',{docId})).uploadId,
    upload: async (docId, id, blob, signal) => { validate('Id', docId); validate('Id', id); const response = await fetch(`/_host/doc/${docId}/attachments/${id}`,{method:'PUT',headers:{'Content-Type':'image/png'},body:blob,signal}); if (!response.ok) throw new ServiceError('STORAGE_FAILED','附件上传失败'); },
    commit: async (docId, uploadId) => (await this.transport.request<{attachmentId:string}>('attachment.commit',{docId,uploadId})).attachmentId,
    resolve: (docId, attachmentId) => this.transport.request('attachment.resolve',{docId,attachmentId}),
  };
  window: AppServices['window'] = { minimize: () => this.transport.request('window.minimize'), maximize: () => this.transport.request('window.maximize'), requestClose: () => this.transport.request('window.requestClose'), subscribe: fn => this.transport.subscribe(event => { if (event.topic === 'window.stateChanged') fn((event.payload as {maximized:boolean}).maximized); }),onClosing:fn=>this.transport.subscribe(event=>{if(event.topic==='window.closeRequested')fn((event.payload as {requestId:string}).requestId);}),onCloseCancelled:fn=>this.transport.subscribe(event=>{if(event.topic==='window.closeCancelled')fn();}),closeReady:(requestId,ready)=>this.transport.request('window.closeReady',{requestId,ready}) };
  async fixtureReply(_docId: string, signal: AbortSignal, onChunk: (text: string) => void) {
    if (!this.local) throw new ServiceError('UNCONFIGURED','本机通道尚未就绪');
    const id = crypto.randomUUID(); const cancel = () => { void this.transport.request('stream.cancel',{requestId:id}).catch(() => {}); };
    signal.addEventListener('abort', cancel, {once:true});
    try {
      const response = await fetch(this.local.origin+'/fixture/stream',{method:'POST',headers:{'Content-Type':'application/json','X-DocAss-Session':this.local.token,'X-Request-Id':id},body:'{}',signal});
      if (!response.ok || !response.body) throw new ServiceError('NETWORK','无法连接本机通道');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      try { for (;;) { const {done,value} = await reader.read(); if (done) break; buffer += decoder.decode(value,{stream:true}); let end: number; while ((end = buffer.indexOf('\n\n')) >= 0) { const item = buffer.slice(0,end); buffer = buffer.slice(end+2); if (!item.startsWith('data: ') || item === 'data: [DONE]') continue; if (!signal.aborted) onChunk(JSON.parse(item.slice(6)).text); } } } finally { reader.releaseLock(); }
    } finally { signal.removeEventListener('abort',cancel); }
  }
  dispose() { this.local = undefined; this.transport.dispose(); }
}
