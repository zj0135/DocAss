import { Webview2Transport } from '../bridge/webview2Transport';
import { ServiceError, validate } from '../contracts';
import type { Settings, DocHandle, CommitResult } from '../contracts';
import type { AppServices, Bootstrap, Capabilities, DocumentState } from './AppServices';

export class DesktopServices implements AppServices {
  readonly capabilities: Capabilities = { desktop: true, window: true, persistentStorage: true, credentials: true, nativeText: false, ocr: false, llm: false };
  private transport: Webview2Transport;
  private local?: Bootstrap['loopback'];
  constructor(transport: Webview2Transport) { this.transport = transport; }
  async bootstrap() { const result = await this.transport.request<Bootstrap>('app.bootstrap'); validate('Settings', result.settings); this.local = result.loopback; return result; }
  documents: AppServices['documents'] = {
    openFixture: async name => validate<DocHandle>('DocHandle', await this.transport.request('doc.openFixture', {name})),
    close: docId => this.transport.request('doc.close', { docId }),
    reacquire: docId => this.transport.request<{handle:DocHandle;documentRevision:number}>('doc.reacquire', { docId }),
  };
  text: AppServices['text'] = { getPage: async () => { throw new ServiceError('UNCONFIGURED', '文字服务尚未就绪'); } };
  ocr: AppServices['ocr'] = { start: async () => { throw new ServiceError('UNCONFIGURED', '识别服务尚未就绪'); } };
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
  window: AppServices['window'] = { minimize: () => this.transport.request('window.minimize'), maximize: () => this.transport.request('window.maximize'), requestClose: () => this.transport.request('window.requestClose'), subscribe: fn => this.transport.subscribe(event => { if (event.topic === 'window.stateChanged') fn((event.payload as {maximized:boolean}).maximized); }) };
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
