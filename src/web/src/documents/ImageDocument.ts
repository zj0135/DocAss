import type { DocumentSource, PagedDocument } from './types';
import type { PageInfo } from '../contracts';
import { compose, imagePixelsToPage, viewport } from './geometry';
export class ImageDocument implements PagedDocument {
  readonly pageCount = 1;
  private bitmap: ImageBitmap;
  private info: PageInfo;
  private constructor(bitmap: ImageBitmap, info: PageInfo) {
    this.bitmap = bitmap;
    this.info = info;
  }
  static async open(source: DocumentSource, signal: AbortSignal) {
    const blob = source.blob ?? (await (await fetch(source.url!, { signal })).blob());
    const bitmap = await createImageBitmap(blob);
    if (signal.aborted) {
      bitmap.close();
      signal.throwIfAborted();
    }
    if (bitmap.width * bitmap.height > 64 * 1024 * 1024) {
      bitmap.close();
      throw new Error('图片超过 64M 像素上限');
    }
    const w = (bitmap.width * 72) / 96,
      h = (bitmap.height * 72) / 96;
    return new ImageDocument(
      bitmap,
      source.image?.pageInfo ?? {
        page: 1,
        pageBox: [0, 0, w, h],
        width: w,
        height: h,
        userUnit: 1,
        rotate: 0,
      },
    );
  }
  async getPageInfo(page: number) {
    if (page !== 1) throw new Error('页码超出范围');
    return this.info;
  }
  async getOutline() {
    return [];
  }
  async render(
    page: number,
    canvas: HTMLCanvasElement,
    scale: number,
    rotation: number,
    outputScale: number,
    signal: AbortSignal,
  ) {
    await this.getPageInfo(page);
    signal.throwIfAborted();
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);
    const m = compose(
      viewport(this.info, scale, rotation).transform,
      imagePixelsToPage(this.info, this.bitmap.width, this.bitmap.height),
    );
    ctx.transform(...m);
    ctx.drawImage(this.bitmap, 0, 0);
    ctx.restore();
  }
  async destroy() {
    this.bitmap.close();
  }
}
