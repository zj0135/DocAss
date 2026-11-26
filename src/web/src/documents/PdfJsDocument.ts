import { getDocument, GlobalWorkerOptions, PDFWorker, AnnotationMode } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PageInfo } from '../contracts';
import type { DocumentSource, PagedDocument, PasswordPrompt, OutlineEntry } from './types';
GlobalWorkerOptions.workerSrc=workerUrl;
let sharedWorker:PDFWorker|undefined;
export async function resetPdfWorker(){sharedWorker?.destroy();sharedWorker=undefined;}
export class PdfJsDocument implements PagedDocument {
  readonly pageCount:number;private pdf:PDFDocumentProxy;
  private constructor(pdf:PDFDocumentProxy){this.pdf=pdf;this.pageCount=pdf.numPages;}
  static async open(source:DocumentSource,prompt:PasswordPrompt,signal:AbortSignal){
    signal.throwIfAborted();sharedWorker??=new PDFWorker();
    const task=getDocument({...(source.url?{url:source.url}:{data:new Uint8Array(await source.blob!.arrayBuffer())}),password:source.password,worker:sharedWorker,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',iccUrl:'/pdfjs/iccs/',enableXfa:false,disableAutoFetch:true,disableStream:true,rangeChunkSize:65536});
    const cancel=()=>{void task.destroy().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
    task.onPassword=(update:(password:string)=>void,reason:number)=>{void prompt(reason===2).then(password=>{source.password=password;if(!signal.aborted)update(password);},cancel);};
    try{const pdf=await task.promise;signal.throwIfAborted();return new PdfJsDocument(pdf);}catch(e){await task.destroy().catch(()=>{});throw e;}finally{signal.removeEventListener('abort',cancel);}
  }
  async getPageInfo(page:number):Promise<PageInfo>{const p=await this.pdf.getPage(page);const v=p.getViewport({scale:1});return {page,pageBox:p.view as PageInfo['pageBox'],rotate:p.rotate as PageInfo['rotate'],userUnit:p.userUnit,width:v.width,height:v.height};}
  async getOutline():Promise<OutlineEntry[]>{
    const entries=await this.pdf.getOutline();
    const visit=async(items:NonNullable<typeof entries>,prefix=''):Promise<OutlineEntry[]>=>Promise.all(items.map(async(item,i)=>{
      const dest=typeof item.dest==='string'?await this.pdf.getDestination(item.dest):item.dest;let page=1;
      if(dest?.[0]!=null)try{page=typeof dest[0]==='number'?dest[0]+1:await this.pdf.getPageIndex(dest[0])+1;}catch{/* Invalid destinations stay on the first page. */}
      return {id:`${prefix}${i}`,title:item.title,page:Math.max(1,Math.min(this.pageCount,page)),children:await visit(item.items,`${prefix}${i}-`)};
    }));return visit(entries??[]);
  }
  async render(page:number,canvas:HTMLCanvasElement,scale:number,rotation:number,outputScale:number,signal:AbortSignal){
    const p=await this.pdf.getPage(page);signal.throwIfAborted();
    const task=p.render({canvas,viewport:p.getViewport({scale:scale*96/72,rotation:(p.rotate+rotation)%360}),transform:[outputScale,0,0,outputScale,0,0],annotationMode:AnnotationMode.ENABLE});
    const cancel=()=>task.cancel();signal.addEventListener('abort',cancel,{once:true});
    try{await task.promise;signal.throwIfAborted();}finally{signal.removeEventListener('abort',cancel);p.cleanup();}
  }
  async destroy(){await this.pdf.loadingTask.destroy();}
}
