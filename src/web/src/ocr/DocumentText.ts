import {createStore} from 'zustand/vanilla';
import type {DocHandle,NativePage,PageText,OcrTicket,OcrResult} from '../contracts';
import type {AppServices} from '../services/AppServices';
import type {DocumentPool} from '../documents/DocumentPool';
import type {PasswordPrompt} from '../documents/types';
import {ByteLru} from '../documents/resources';
import {buildPageText} from '../text/model';
import {classify,composeText} from './text';
import type {TextMode} from './text';
import {planRaster,renderRaster} from './raster';
import {appStore} from '../state/appStore';
type PageState={phase:'pending'|'queued'|'running'|'ready'|'empty'|'failed'|'cancelled';mode:TextMode;source?:PageText['source'];error?:string;dpi?:number;device?:string;cached?:boolean};
const cache=new ByteLru<string,{native:NativePage;text:PageText}>(96*1024*1024);
const wait=(signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{const done=()=>{signal.removeEventListener('abort',cancel);resolve();},timer=setTimeout(done,150),cancel=()=>{clearTimeout(timer);reject(new DOMException('已取消','AbortError'));};signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();});
export class DocumentText {
 readonly store=createStore<{version:number;pages:Record<number,PageState>;all:boolean;completed:number;total:number}>(()=>({version:0,pages:{},all:false,completed:0,total:0}));
 private pending=new Map<number,{abort:AbortController;promise:Promise<PageText>;epoch:number}>();private epochs=new Map<number,number>();private allAbort?:AbortController;
 private lifetime=new AbortController();private nativeVersions=new Map<number,number>();private profile='';private nativePending=new Map<number,Promise<{native:NativePage;text:PageText}>>();private off:()=>void;
 readonly handle:DocHandle;private services:AppServices;private pool:DocumentPool;private prompt:PasswordPrompt;
 constructor(handle:DocHandle,services:AppServices,pool:DocumentPool,prompt:PasswordPrompt){this.handle=handle;this.services=services;this.pool=pool;this.prompt=prompt;this.profile=this.settingsKey();this.off=appStore.subscribe(()=>{const key=this.settingsKey();if(key!==this.profile){this.profile=key;this.cancel();this.nativePending.clear();for(const page of Object.keys(this.store.getState().pages))cache.delete(this.key(Number(page)));this.store.setState(s=>({pages:{},version:s.version+1}));}});}
 private settingsKey(){const o=appStore.getState().settings.ocr;return `${o?.modelTier??'Small'}:${o?.backend??'Auto'}`;}
 private key(page:number){return this.handle.docId+':'+page;}
 private update(page:number,value:Partial<PageState>,changed=false){this.store.setState(s=>({pages:{...s.pages,[page]:{...(s.pages[page]??{phase:'pending',mode:'auto'}),...value}},version:s.version+(changed?1:0)}));}
 async getPage(page:number,signal:AbortSignal):Promise<PageText>{const value=await this.native(page,signal);signal.throwIfAborted();return value.text;}
 private async native(page:number,signal:AbortSignal){const key=this.key(page),saved=cache.get(key);if(saved)return saved;
   let task=this.nativePending.get(page);if(!task){const profile=this.profile,version=this.nativeVersions.get(page)??0;task=(async()=>{let native:NativePage;try{native=await this.services.text.getNative(this.handle.docId,page,this.lifetime.signal);}catch{this.lifetime.signal.throwIfAborted();const lease=await this.pool.acquire(this.handle.docId,this.prompt,this.lifetime.signal);try{native={docId:this.handle.docId,jobId:crypto.randomUUID(),contentRevision:this.handle.contentRevision,pageGeneration:0,status:'failed',pageInfo:await lease.document.getPageInfo(page),glyphs:[],profileFingerprint:'0'.repeat(64),hasImages:true};}finally{lease.release();}}const mode=await this.services.ocr.getOverride(this.handle.docId,page);let text=await buildPageText(native);const type=classify(native,mode);if(type!=='native')text={...text,quality:'unavailable'};this.lifetime.signal.throwIfAborted();if(profile!==this.profile||version!==(this.nativeVersions.get(page)??0))throw new DOMException('文字配置已改变','AbortError');const value={native,text};cache.set(key,value,JSON.stringify(value).length*2);this.update(page,{mode,phase:type==='native'?'ready':'pending',source:type==='native'?'native':undefined});return value;})().finally(()=>{if(this.nativePending.get(page)===task)this.nativePending.delete(page);});this.nativePending.set(page,task);}const value=await task;signal.throwIfAborted();return value;
 }
 recognize(page:number,priority=1,force=false):Promise<PageText>{
   if(!force&&this.pending.has(page))return this.pending.get(page)!.promise;
   if(force)this.cancelPage(page);const abort=new AbortController(),epoch=(this.epochs.get(page)??0)+1;this.epochs.set(page,epoch);
   const promise=this.run(page,priority,force,abort.signal,epoch).finally(()=>{if(this.pending.get(page)?.epoch===epoch)this.pending.delete(page);});this.pending.set(page,{abort,promise,epoch});return promise;
 }
 private async run(page:number,priority:number,force:boolean,signal:AbortSignal,epoch:number):Promise<PageText>{let ticket:OcrTicket|undefined;let release:(()=>void)|undefined;
   try{const original=await this.native(page,signal),mode=this.store.getState().pages[page].mode;const classified=classify(original.native,mode),type=force&&classified==='native'?'ocr':classified;
     if(!force&&(type==='native'||original.text.quality!=='unavailable'))return original.text;
     this.update(page,{phase:'queued',error:undefined});const lease=await this.pool.acquire(this.handle.docId,this.prompt,signal);release=lease.release;
     const info=await lease.document.getPageInfo(page);signal.throwIfAborted();const source=this.handle.kind==='image'?await this.services.documents.source(this.handle.docId):undefined;signal.throwIfAborted();
     const image=source?.image?{width:source.image.pixelWidth,height:source.image.pixelHeight}:undefined;if(this.handle.kind==='image'&&!image)throw Error('图片规范像素信息缺失');
     const raster=planRaster(info,image);ticket=await this.services.ocr.start({docId:this.handle.docId,page,raster,priority,force});
     signal.throwIfAborted();if(ticket.contentRevision!==this.handle.contentRevision)throw Error('OCR 文件版本变化');
     if(ticket.needsRaster){const blob=await renderRaster(lease.document,raster,signal);await this.services.ocr.upload(ticket,blob,signal);}release();release=undefined;
     for(;;){signal.throwIfAborted();const status=await this.services.ocr.status(ticket);signal.throwIfAborted();if(this.epochs.get(page)!==epoch||status.pageGeneration!==ticket.pageGeneration||status.profile.fingerprint!==ticket.profile.fingerprint||status.phase==='cancelled')throw new DOMException('旧 OCR 任务已取消','AbortError');
       if(status.phase==='failed')throw Error(status.error??'识别失败');if(status.phase==='completed')break;this.update(page,{phase:status.phase==='running'?'running':'queued',dpi:raster.dpi});await wait(signal);}
     const result:OcrResult=await this.services.ocr.result(ticket,signal);signal.throwIfAborted();if(this.epochs.get(page)!==epoch||result.pageGeneration!==ticket.pageGeneration||result.jobId!==ticket.jobId||result.contentRevision!==this.handle.contentRevision||result.profile.fingerprint!==ticket.profile.fingerprint)throw new DOMException('旧识别结果已丢弃','AbortError');
     const native=await buildPageText(original.native),text=await composeText(native,result,type==='hybrid'?'hybrid':'ocr');signal.throwIfAborted();if(this.epochs.get(page)!==epoch)throw new DOMException('已取消','AbortError');cache.set(this.key(page),{native:original.native,text},JSON.stringify({native:original.native,text}).length*2);
     this.update(page,{phase:result.empty?'empty':'ready',source:text.source,dpi:result.raster.dpi,device:result.device,cached:result.cached},true);return text;
   }catch(e){if(this.epochs.get(page)===epoch)this.update(page,{phase:signal.aborted||e instanceof DOMException&&e.name==='AbortError'?'cancelled':'failed',error:signal.aborted?undefined:e instanceof Error?e.message:String(e)});throw e;}
   finally{release?.();if(ticket)await this.services.ocr.unsubscribe(ticket).catch(()=>{});}
 }
 cancelPage(page:number){const job=this.pending.get(page);job?.abort.abort();this.pending.delete(page);this.epochs.set(page,(this.epochs.get(page)??0)+1);if(job)this.update(page,{phase:'cancelled',error:undefined});}
 cancel(){this.allAbort?.abort();this.allAbort=undefined;for(const page of this.pending.keys())this.cancelPage(page);this.store.setState({all:false});}
 async all(count:number){this.allAbort?.abort();const abort=new AbortController();this.allAbort=abort;this.store.setState({all:true,completed:0,total:count});try{for(let page=1;page<=count;page++){abort.signal.throwIfAborted();try{await this.recognize(page,3);}catch{if(abort.signal.aborted)break;}if(!abort.signal.aborted)this.store.setState({completed:page});}}finally{if(this.allAbort===abort){this.allAbort=undefined;this.store.setState({all:false});}}}
 async setMode(page:number,mode:TextMode){this.cancelPage(page);this.nativeVersions.set(page,(this.nativeVersions.get(page)??0)+1);this.nativePending.delete(page);await this.services.ocr.setOverride(this.handle.docId,page,mode);cache.delete(this.key(page));this.update(page,{mode,phase:'pending'},true);await this.native(page,new AbortController().signal);if(mode!=='native')await this.recognize(page,0);else this.store.setState(s=>({version:s.version+1}));}
 dispose(){this.lifetime.abort();this.cancel();this.off();for(const page of Object.keys(this.store.getState().pages))cache.delete(this.key(Number(page)));}
}
