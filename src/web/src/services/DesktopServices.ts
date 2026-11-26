import { Webview2Transport } from '../bridge/webview2Transport';
import { ServiceError, validate } from '../contracts';
import type {
  CommitCommand,
  CommitResult,
  DocHandle,
  NativePage,
  OcrResult,
  OcrStart,
  OcrStatus,
  OcrTicket,
  Settings,
} from '../contracts';
import type { OpenResult } from '../documents/types';
import { buildPageText } from '../text/model';
import type {
  AppServices,
  Bootstrap,
  Capabilities,
  DocumentState,
  IAttachmentsService,
  IClipboardService,
  IDiagnosticsService,
  IDocumentsService,
  ILlmService,
  IOcrService,
  IPersistenceService,
  IProvidersService,
  ISettingsService,
  ITextService,
  IWindowService,
} from './AppServices';

export class DesktopServices implements AppServices {
  readonly capabilities: Capabilities = {
    desktop: true,
    window: true,
    persistentStorage: true,
    credentials: true,
    nativeText: true,
    ocr: true,
    llm: true,
  };

  private transport: Webview2Transport;
  private local?: Bootstrap['loopback'];

  constructor(transport: Webview2Transport) {
    this.transport = transport;
  }

  async bootstrap(): Promise<Bootstrap> {
    const result = await this.transport.request<Bootstrap>('app.bootstrap');
    validate('Settings', result.settings);
    this.local = result.loopback;
    return result;
  }

  diagnostics: IDiagnosticsService = {
    info: () => this.transport.request('app.info', {}),
    openLogs: () => this.transport.request('app.openLogs', {}),
    openLicenses: () => this.transport.request('app.openLicenses', {}),
  };

  documents: IDocumentsService = {
    loaded: async () => {},
    checkSource: docId => this.transport.request('doc.checkSource', { docId }, undefined, 120000),
    openVersion: docId => this.transport.request('doc.openVersion', { docId }, undefined, 120000),
    migrationInfo: (docId, oldHash) =>
      this.transport.request('doc.migrationInfo', { docId, oldHash }, undefined, 120000),
    open: (_file, signal) => this.transport.request('doc.open', {}, signal, 120000),
    unlock: (openId, password, signal) =>
      this.transport.request('doc.unlock', { openId, password }, signal, 120000),
    cancelOpen: openId => this.transport.request('doc.cancelOpen', { openId }),
    recent: () => this.transport.request('doc.recent'),
    openRecent: (docHash, signal) =>
      this.transport.request('doc.openRecent', { docHash }, signal, 120000),
    source: async docId => {
      const info = await this.transport.request<OpenResult>('doc.info', { docId });
      const { password } = await this.transport.request<{ password?: string }>('doc.password', {
        docId,
      });
      return {
        kind: info.handle!.kind,
        url: `/_host/doc/${docId}/${info.image ? 'image' : 'bytes'}`,
        image: info.image,
        password,
      };
    },
    drop: files =>
      window.chrome?.webview?.postMessageWithAdditionalObjects?.({ type: 'docass.files' }, files),
    subscribe: (onOpen, onError) =>
      this.transport.subscribe(event => {
        if (event.topic === 'doc.opened') onOpen(event.payload as OpenResult);
        if (event.topic === 'doc.openFailed')
          onError((event.payload as { message: string }).message);
      }),
    openFixture: async name =>
      validate<DocHandle>('DocHandle', await this.transport.request('doc.openFixture', { name })),
    close: docId => this.transport.request('doc.close', { docId }),
    reacquire: docId =>
      this.transport.request<{ handle: DocHandle; documentRevision: number }>('doc.reacquire', {
        docId,
      }),
  };

  text: ITextService = {
    getPage: async (id, page, signal) => buildPageText(await this.text.getNative(id, page, signal)),
    getNative: async (docId, page, signal) => {
      const jobId = crypto.randomUUID();
      validate('Id', docId);
      const cancel = () => {
        void this.transport.request('text.cancel', { docId, jobId }).catch(() => {});
      };
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        const response = await fetch(`/_host/doc/${docId}/text/${page}/${jobId}`, { signal });
        const result = await response.json();
        if (!response.ok) {
          throw new ServiceError(
            result.code ?? 'TEXT_UNRELIABLE',
            result.message ?? '文字提取失败',
          );
        }
        const raw = validate<NativePage>('NativePage', result);
        if (raw.docId !== docId || raw.jobId !== jobId || raw.pageInfo.page !== page) {
          throw new Error('文字任务版本不匹配');
        }
        return raw;
      } finally {
        signal?.removeEventListener('abort', cancel);
      }
    },
  };

  ocr: IOcrService = {
    start: async (request: OcrStart, signal?: AbortSignal) =>
      validate<OcrTicket>(
        'OcrTicket',
        await this.transport.request('ocr.start', request, signal, 120000),
      ),
    upload: async (ticket: OcrTicket, blob: Blob, signal?: AbortSignal) => {
      const response = await fetch(`/_host/doc/${ticket.docId}/ocr/${ticket.jobId}/raster`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: blob,
        signal,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new ServiceError(error.code ?? 'OCR_UPLOAD', error.message ?? '识别图像上传失败');
      }
    },
    status: async (ticket: OcrTicket) =>
      validate<OcrStatus>(
        'OcrStatus',
        await this.transport.request('ocr.status', {
          docId: ticket.docId,
          jobId: ticket.jobId,
          subscriptionId: ticket.subscriptionId,
        }),
      ),
    result: async (ticket: OcrTicket, signal?: AbortSignal) => {
      const response = await fetch(
        `/_host/doc/${ticket.docId}/ocr/${ticket.jobId}/result/${ticket.subscriptionId}`,
        { signal },
      );
      const value = await response.json();
      if (!response.ok) {
        throw new ServiceError(value.code ?? 'OCR_FAILED', value.message ?? '识别结果不可用');
      }
      return validate<OcrResult>('OcrResult', value);
    },
    unsubscribe: (ticket: OcrTicket) =>
      this.transport.request('ocr.unsubscribe', {
        docId: ticket.docId,
        subscriptionId: ticket.subscriptionId,
      }),
    subscribe: fn =>
      this.transport.subscribe(event => {
        if (event.topic === 'ocr.changed') {
          fn(validate<OcrStatus>('OcrStatus', event.payload));
        }
      }),
    getOverride: (docId, page) => this.transport.request('ocr.getOverride', { docId, page }),
    setOverride: (docId, page, mode) =>
      this.transport.request('ocr.setOverride', { docId, page, mode }),
    clearCache: () => this.transport.request('ocr.clearCache'),
  };

  clipboard: IClipboardService = {
    write: async (docId, text) => {
      validate('Id', docId);
      const response = await fetch(`/_host/doc/${docId}/clipboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      });
      if (!response.ok) {
        throw new ServiceError('CLIPBOARD_FAILED', '无法写入剪贴板，请重试');
      }
    },
  };

  persistence: IPersistenceService = {
    commit: async (command: CommitCommand) => {
      validate('CommitCommand', command);
      const response = await fetch(`/_host/doc/${command.docId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      const value = await response.json();
      if (!response.ok) {
        throw new ServiceError(
          value.code ?? value.error?.code ?? 'STORAGE_FAILED',
          value.message ?? value.error?.message ?? '保存失败',
          true,
        );
      }
      return validate<CommitResult>('CommitResult', value);
    },
    getOperation: (docId, operationId) =>
      this.transport.request('store.getOperation', { docId, operationId }),
    read: async docId => {
      validate('Id', docId);
      const response = await fetch(`/_host/doc/${docId}/snapshot`);
      if (!response.ok) {
        throw new ServiceError('STORAGE_FAILED', '无法读取文档记录');
      }
      return (await response.json()) as DocumentState;
    },
    messages: async (docId, conversationId, before) => {
      validate('Id', docId);
      validate('Id', conversationId);
      const response = await fetch(
        `/_host/doc/${docId}/conversation/${conversationId}/messages/${before}`,
      );
      if (!response.ok) {
        throw new ServiceError('STORAGE_FAILED', '无法读取会话记录');
      }
      return response.json();
    },
  };

  settings: ISettingsService = {
    get: () => this.transport.request<Settings>('settings.get'),
    update: settings =>
      this.transport.request<Settings>('settings.update', validate('Settings', settings)),
  };

  providers: IProvidersService = {
    list: () => this.transport.request('providers.list'),
    save: (provider, replacementKey, deleteKey = false) =>
      this.transport.request('providers.save', {
        provider: validate('Provider', provider),
        replacementKey: replacementKey ?? null,
        deleteKey,
      }),
    delete: id => this.transport.request('providers.delete', { id }),
    testDraft: (provider, replacementKey, signal) =>
      this.transport.request(
        'providers.testDraft',
        {
          provider: validate('Provider', provider),
          replacementKey: replacementKey ?? null,
        },
        signal,
        17000,
      ),
  };

  llm: ILlmService = {
    begin: (docId, providerId, modelId, runId) =>
      this.transport.request('llm.begin', { docId, providerId, modelId, runId }),
    end: runId => this.transport.request('llm.end', { runId }),
    channel: (runId, signal) => {
      if (!this.local) throw new ServiceError('UNCONFIGURED', '本机模型通道不可用');
      validate('Id', runId);
      const local = this.local;
      const baseUrl = local.origin + '/llm/' + runId;
      return {
        baseUrl,
        fetch: async (input, init) => {
          const original = new Request(input, init);
          const url = new URL(original.url);
          if (url.origin !== local.origin || !url.pathname.startsWith('/llm/' + runId + '/')) {
            throw new ServiceError('FORBIDDEN', '模型请求必须通过本机通道');
          }
          signal.throwIfAborted();
          const requestId = crypto.randomUUID();
          const cancel = () => {
            void this.transport.request('stream.cancel', { requestId }).catch(() => {});
          };
          signal.addEventListener('abort', cancel, { once: true });
          const headers = new Headers({
            'Content-Type': 'application/json',
            'X-DocAss-Session': local.token,
            'X-Request-Id': requestId,
          });
          try {
            const response = await fetch(url, {
              method: 'POST',
              headers,
              body: await original.arrayBuffer(),
              signal,
              credentials: 'omit',
              redirect: 'error',
            });
            if (!response.ok) {
              const error = await response.json();
              throw new ServiceError(error.code ?? 'NETWORK', error.message ?? '模型请求失败');
            }
            if (!response.body) {
              signal.removeEventListener('abort', cancel);
              return response;
            }
            const reader = response.body.getReader();
            return new Response(
              new ReadableStream({
                async pull(controller) {
                  try {
                    const value = await reader.read();
                    if (value.done) {
                      signal.removeEventListener('abort', cancel);
                      controller.close();
                    } else {
                      controller.enqueue(value.value);
                    }
                  } catch (e) {
                    signal.removeEventListener('abort', cancel);
                    controller.error(e);
                  }
                },
                async cancel() {
                  signal.removeEventListener('abort', cancel);
                  cancel();
                  await reader.cancel();
                },
              }),
              { status: response.status, headers: response.headers },
            );
          } catch (e) {
            signal.removeEventListener('abort', cancel);
            throw e;
          }
        },
      };
    },
  };

  attachments: IAttachmentsService = {
    begin: async docId =>
      (await this.transport.request<{ uploadId: string }>('attachment.begin', { docId })).uploadId,
    upload: async (docId, id, blob, signal) => {
      validate('Id', docId);
      validate('Id', id);
      const response = await fetch(`/_host/doc/${docId}/attachments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: blob,
        signal,
      });
      if (!response.ok) throw new ServiceError('STORAGE_FAILED', '附件上传失败');
    },
    commit: async (docId, uploadId) =>
      (
        await this.transport.request<{ attachmentId: string }>('attachment.commit', {
          docId,
          uploadId,
        })
      ).attachmentId,
    resolve: (docId, attachmentId) =>
      this.transport.request('attachment.resolve', { docId, attachmentId }),
  };

  window: IWindowService = {
    minimize: () => this.transport.request('window.minimize'),
    maximize: () => this.transport.request('window.maximize'),
    requestClose: () => this.transport.request('window.requestClose'),
    subscribe: fn =>
      this.transport.subscribe(event => {
        if (event.topic === 'window.stateChanged') {
          fn((event.payload as { maximized: boolean }).maximized);
        }
      }),
    onClosing: fn =>
      this.transport.subscribe(event => {
        if (event.topic === 'window.closeRequested') {
          fn((event.payload as { requestId: string }).requestId);
        }
      }),
    onCloseCancelled: fn =>
      this.transport.subscribe(event => {
        if (event.topic === 'window.closeCancelled') fn();
      }),
    closeReady: (requestId, ready) =>
      this.transport.request('window.closeReady', { requestId, ready }),
  };

  async fixtureReply(
    _docId: string,
    signal: AbortSignal,
    onChunk: (text: string) => void,
  ): Promise<void> {
    if (!this.local) throw new ServiceError('UNCONFIGURED', '本机通道尚未就绪');
    const id = crypto.randomUUID();
    const cancel = () => {
      void this.transport.request('stream.cancel', { requestId: id }).catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const response = await fetch(this.local.origin + '/fixture/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DocAss-Session': this.local.token,
          'X-Request-Id': id,
        },
        body: '{}',
        signal,
      });
      if (!response.ok || !response.body) throw new ServiceError('NETWORK', '无法连接本机通道');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end: number;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const item = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (!item.startsWith('data: ') || item === 'data: [DONE]') continue;
            if (!signal.aborted) onChunk(JSON.parse(item.slice(6)).text);
          }
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }

  dispose(): void {
    this.local = undefined;
    this.transport.dispose();
  }
}
