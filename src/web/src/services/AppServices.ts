import type { CommitCommand, CommitResult, DocHandle, Settings, Provider, PageText, Job, Annotation, Conversation, Message } from '../contracts';

export type Capabilities = { desktop: boolean; window: boolean; persistentStorage: boolean; credentials: boolean; nativeText: boolean; ocr: boolean; llm: boolean };
export type Bootstrap = { version: string; capabilities: Capabilities; settings: Settings; window: { maximized: boolean }; documents?: DocHandle[]; readOnly?: boolean; fixturesEnabled?: boolean; loopback?: { origin: string; token: string } };
export type DocumentState = { documentRevision: number; annotations: Annotation[]; conversations: Conversation[]; messages: Message[] };
export interface AppServices {
  readonly capabilities: Capabilities;
  bootstrap(): Promise<Bootstrap>;
  documents: { openFixture(name: 'report' | 'contract', signal?: AbortSignal): Promise<DocHandle>; close(docId: string): Promise<void>; reacquire(docId: string): Promise<{ handle: DocHandle; documentRevision: number }> };
  text: { getPage(docId: string, page: number, signal?: AbortSignal): Promise<PageText> };
  ocr: { start(docId: string, page: number, signal?: AbortSignal): Promise<Job> };
  persistence: { commit(command: CommitCommand): Promise<CommitResult>; getOperation(docId: string, operationId: string): Promise<CommitResult | null>; read(docId: string): Promise<DocumentState> };
  providers: { list(): Promise<Provider[]>; save(provider: Provider, replacementKey?: string, deleteKey?: boolean): Promise<void>; delete(id: string): Promise<void> };
  attachments: { begin(docId: string): Promise<string>; upload(docId: string, uploadId: string, blob: Blob, signal?: AbortSignal): Promise<void>; commit(docId: string, uploadId: string): Promise<string>; resolve(docId: string, attachmentId: string): Promise<{available:boolean;url?:string}> };
  settings: { get(): Promise<Settings>; update(settings: Settings): Promise<Settings> };
  window: { minimize(): Promise<void>; maximize(): Promise<void>; requestClose(): Promise<void>; subscribe(fn: (maximized: boolean) => void): () => void };
  fixtureReply(docId: string, signal: AbortSignal, onChunk: (text: string) => void): Promise<void>;
  dispose(): void;
}
