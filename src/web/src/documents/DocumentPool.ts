import type { DocumentSource,PagedDocument,PasswordPrompt } from './types';
import { PdfJsDocument,resetPdfWorker } from './PdfJsDocument';
import { ImageDocument } from './ImageDocument';
type Entry={source:()=>Promise<DocumentSource>;document?:PagedDocument;pins:number;last:number;closed:boolean};
export class DocumentPool {
  private entries=new Map<string,Entry>();private serial:Promise<unknown>=Promise.resolve();private waiters=new Set<()=>void>();
  get activeCount(){return [...this.entries.values()].filter(e=>e.document&&e.pins>=0).length;}
  register(id:string,source:()=>Promise<DocumentSource>){if(!this.entries.has(id))this.entries.set(id,{source,pins:0,last:0,closed:false});}
  private exclusive<T>(action:()=>Promise<T>):Promise<T>{const result=this.serial.then(action);this.serial=result.catch(()=>{});return result;}
  async acquire(id:string,prompt:PasswordPrompt,signal:AbortSignal):Promise<{document:PagedDocument;release:()=>void}>{
    for(;;){
      signal.throwIfAborted();
      const result=await this.exclusive(async()=>{
        const e=this.entries.get(id);if(!e||e.closed)throw new Error('文档已关闭');signal.throwIfAborted();
        if(!e.document){
          if(this.activeCount>=3){const victim=[...this.entries.values()].filter(v=>v.document&&v.pins===0).sort((a,b)=>a.last-b.last)[0];if(!victim)return null;await victim.document!.destroy();victim.document=undefined;}
          const source=await e.source();e.document=source.kind==='pdf'?await PdfJsDocument.open(source,prompt,signal):await ImageDocument.open(source,signal);
        }
        e.pins++;e.last=performance.now();let released=false;
        return {document:e.document,release:()=>{if(released)return;released=true;e.pins--;e.last=performance.now();for(const wake of this.waiters)wake();}};
      });
      if(result)return result;
      await new Promise<void>((resolve,reject)=>{const wake=()=>{cleanup();resolve();};const abort=()=>{cleanup();reject(new DOMException('已取消','AbortError'));};const cleanup=()=>{this.waiters.delete(wake);signal.removeEventListener('abort',abort);};this.waiters.add(wake);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();else if([...this.entries.values()].some(e=>e.document&&e.pins===0))wake();});
    }
  }
  async close(id:string){await this.exclusive(async()=>{const e=this.entries.get(id);if(e){e.closed=true;await e.document?.destroy();this.entries.delete(id);}for(const wake of this.waiters)wake();});}
  async recover(){await this.exclusive(async()=>{for(const e of this.entries.values()){await e.document?.destroy().catch(()=>{});e.document=undefined;}await resetPdfWorker();});}
}
