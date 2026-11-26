import type { DocHandle, PageInfo } from '../contracts';
export type { NativePage } from '../contracts';
export type ImageInfo = { pixelWidth: number; pixelHeight: number; dpiX: number; dpiY: number; orientation: number; pageInfo: PageInfo };
export type OpenResult = { status: 'ready' | 'password-needed' | 'incorrect'; openId: string; fileName: string; handle?: DocHandle; pageCount: number; image?: ImageInfo;previousHash?:string };
export type RecentDocument = { docHash: string; fileName: string; openedAt: string };
export type DocumentSource = { url?: string; blob?: Blob; password?: string; image?: ImageInfo; kind: 'pdf' | 'image' };
export type OutlineEntry = { id: string; title: string; page: number; children?: OutlineEntry[] };
export interface PagedDocument {
  readonly pageCount: number;
  getPageInfo(page: number): Promise<PageInfo>;
  getOutline(): Promise<OutlineEntry[]>;
  render(page: number, canvas: HTMLCanvasElement, scale: number, rotation: number, outputScale: number, signal: AbortSignal): Promise<void>;
  destroy(): Promise<void>;
}
export type PasswordPrompt = (incorrect: boolean) => Promise<string>;
