import type {
  Annotation,
  CommitCommand,
  CommitResult,
  Conversation,
  DocHandle,
  Message,
  NativePage,
  OcrResult,
  OcrStart,
  OcrStatus,
  OcrTicket,
  PageInfo,
  PageText,
  Provider,
  Settings,
} from '../contracts';
import type { DocumentSource, OpenResult, RecentDocument } from '../documents/types';

export interface Capabilities {
  desktop: boolean;
  window: boolean;
  persistentStorage: boolean;
  credentials: boolean;
  nativeText: boolean;
  ocr: boolean;
  llm: boolean;
}

export interface Bootstrap {
  version: string;
  capabilities: Capabilities;
  settings: Settings;
  window: { maximized: boolean };
  documents?: DocHandle[];
  readOnly?: boolean;
  fixturesEnabled?: boolean;
  loopback?: { origin: string; token: string };
}

export interface DocumentState {
  documentRevision: number;
  annotations: Annotation[];
  conversations: Conversation[];
  messages: Message[];
}

export interface IDiagnosticsService {
  info(): Promise<{ version: string; runtime: string; licenses: string[] }>;
  openLogs(): Promise<void>;
  openLicenses(): Promise<void>;
}

export interface IDocumentsService {
  loaded(docId: string, pageCount: number): Promise<void>;
  checkSource(docId: string): Promise<{ changed: boolean; missing: boolean }>;
  openVersion(docId: string): Promise<void>;
  migrationInfo(
    docId: string,
    oldHash: string,
  ): Promise<{ annotations: Annotation[]; pages: PageInfo[]; decision?: string }>;
  open(file?: File, signal?: AbortSignal): Promise<OpenResult | null>;
  unlock(openId: string, password: string, signal?: AbortSignal): Promise<OpenResult>;
  cancelOpen(openId: string): Promise<void>;
  recent(): Promise<RecentDocument[]>;
  openRecent(hash: string, signal?: AbortSignal): Promise<OpenResult>;
  source(docId: string): Promise<DocumentSource>;
  drop(files: File[]): void;
  subscribe(onOpen: (result: OpenResult) => void, onError: (message: string) => void): () => void;
  openFixture(name: 'report' | 'contract', signal?: AbortSignal): Promise<DocHandle>;
  close(docId: string): Promise<void>;
  reacquire(docId: string): Promise<{ handle: DocHandle; documentRevision: number }>;
}

export interface ITextService {
  getNative(docId: string, page: number, signal?: AbortSignal): Promise<NativePage>;
  getPage(docId: string, page: number, signal?: AbortSignal): Promise<PageText>;
}

export interface IClipboardService {
  write(docId: string, text: string): Promise<void>;
}

export interface IOcrService {
  start(request: OcrStart, signal?: AbortSignal): Promise<OcrTicket>;
  upload(ticket: OcrTicket, blob: Blob, signal?: AbortSignal): Promise<void>;
  status(ticket: OcrTicket): Promise<OcrStatus>;
  result(ticket: OcrTicket, signal?: AbortSignal): Promise<OcrResult>;
  unsubscribe(ticket: OcrTicket): Promise<void>;
  subscribe(fn: (status: OcrStatus) => void): () => void;
  getOverride(docId: string, page: number): Promise<'auto' | 'native' | 'ocr' | 'hybrid'>;
  setOverride(
    docId: string,
    page: number,
    mode: 'auto' | 'native' | 'ocr' | 'hybrid',
  ): Promise<void>;
  clearCache(): Promise<{ removedBytes: number }>;
}

export interface IPersistenceService {
  commit(command: CommitCommand): Promise<CommitResult>;
  getOperation(docId: string, operationId: string): Promise<CommitResult | null>;
  read(docId: string): Promise<DocumentState>;
  messages(docId: string, conversationId: string, before: number): Promise<Message[]>;
}

export interface IProvidersService {
  list(): Promise<Provider[]>;
  save(provider: Provider, replacementKey?: string, deleteKey?: boolean): Promise<void>;
  delete(id: string): Promise<void>;
  testDraft(
    provider: Provider,
    replacementKey?: string,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; message: string }>;
}

export interface ILlmService {
  begin(docId: string, providerId: string, modelId: string, runId: string): Promise<Provider>;
  end(runId: string): Promise<void>;
  channel(
    runId: string,
    signal: AbortSignal,
  ): {
    baseUrl: string;
    fetch: typeof fetch;
  };
}

export interface IAttachmentsService {
  begin(docId: string): Promise<string>;
  upload(docId: string, uploadId: string, blob: Blob, signal?: AbortSignal): Promise<void>;
  commit(docId: string, uploadId: string): Promise<string>;
  resolve(docId: string, attachmentId: string): Promise<{ available: boolean; url?: string }>;
}

export interface ISettingsService {
  get(): Promise<Settings>;
  update(settings: Settings): Promise<Settings>;
}

export interface IWindowService {
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  requestClose(): Promise<void>;
  subscribe(fn: (maximized: boolean) => void): () => void;
  onClosing(fn: (requestId: string) => void): () => void;
  onCloseCancelled(fn: () => void): () => void;
  closeReady(requestId: string, ready: boolean): Promise<void>;
}

export interface AppServices {
  capabilities: Capabilities;
  diagnostics: IDiagnosticsService;
  documents: IDocumentsService;
  text: ITextService;
  clipboard: IClipboardService;
  ocr: IOcrService;
  persistence: IPersistenceService;
  providers: IProvidersService;
  llm: ILlmService;
  attachments: IAttachmentsService;
  settings: ISettingsService;
  window: IWindowService;
  bootstrap(): Promise<Bootstrap>;
  fixtureReply(docId: string, signal: AbortSignal, onChunk: (text: string) => void): Promise<void>;
  dispose(): void;
}
