import 'fake-indexeddb/auto';
import {readFileSync,writeFileSync} from 'node:fs';
import {it,expect,vi} from 'vitest';
import type {NativePage,PageInfo,Glyph,OcrResult,OcrTicket,OcrStatus} from '../src/contracts';
import {planRaster} from '../src/ocr/raster';
import {classify,composeText,duplicate} from '../src/ocr/text';
import {buildPageText} from '../src/text/model';
import {point} from '../src/documents/geometry';
import {BrowserServices} from '../src/services/BrowserServices';
import {DocumentText} from '../src/ocr/DocumentText';
import {searchPage} from '../src/text/search';
import {HitIndex} from '../src/text/selection';
import type {DocumentPool} from '../src/documents/DocumentPool';
const hash='a'.repeat(64),info:PageInfo={page:1,pageBox:[20,30,620,830],width:600,height:800,rotate:0,userUnit:1};
const glyph=(text:string,x=50,y=700):Glyph=>({id:crypto.randomUUID(),text,quad:[x,y,x+10,y,x+10,y+15,x,y+15],baseline:[x,y,x+10,y],source:'native'});
const raw=(glyphs:Glyph[]=[],hasImages=false):NativePage=>({docId:crypto.randomUUID(),jobId:crypto.randomUUID(),contentRevision:hash,pageGeneration:0,status:glyphs.length?'ready':'unreliable',pageInfo:info,glyphs,profileFingerprint:hash,hasImages});
const result=(glyphs:Glyph[],generation=1):OcrResult=>({docId:crypto.randomUUID(),jobId:crypto.randomUUID(),contentRevision:hash,pageGeneration:generation,profile:{fingerprint:hash,modelHash:hash,modelTier:'Small',backend:'Cpu',engineVersion:'2.0.0',preprocessing:'v1'},raster:planRaster(info),lines:[{text:glyphs.map(g=>g.text).join(''),glyphs:glyphs.map(g=>({...g,source:'ocr'}))}],empty:!glyphs.length,device:'CPU',fallback:false,cached:false,elapsedMs:1});
it('classifies sparse images, empty pages, unreliable glyphs and valid PUA without guessing image coverage',()=>{
 expect(classify(raw())).toBe('ocr');expect(classify(raw([glyph('42')],true))).toBe('hybrid');expect(classify(raw([glyph('42')]))).toBe('native');expect(classify(raw([glyph('\ue000')]))).toBe('native');expect(classify({...raw([glyph('text')]),status:'failed'})).toBe('ocr');expect(classify(raw(),'native')).toBe('native');expect(classify(raw(Array.from({length:45},()=>glyph('字'))), 'ocr')).toBe('ocr');
});
it('plans independent 200 DPI rasters and lowers huge pages within 12M pixels, including crop/rotate/UserUnit',()=>{
 for(const rotate of [0,90,180,270] as const){const p={...info,rotate,userUnit:2,width:(rotate%180?800:600)*2,height:(rotate%180?600:800)*2},r=planRaster(p);expect(r.width*r.height).toBeLessThanOrEqual(12000000);const corners=[[0,0],[r.width,0],[0,r.height],[r.width,r.height]].map(v=>point(r.rasterToPage,v as [number,number]));expect(Math.min(...corners.map(p=>p[0]))).toBeCloseTo(20,0);expect(Math.max(...corners.map(p=>p[0]))).toBeCloseTo(620,0);expect(Math.min(...corners.map(p=>p[1]))).toBeCloseTo(30,0);}
 const big=planRaster({...info,pageBox:[0,0,2400,3200],width:2400,height:3200});expect(big.dpi).toBeLessThan(200);expect(big.width*big.height).toBeLessThanOrEqual(12000000);
 const image=planRaster(info,{width:800,height:1200});expect(point(image.rasterToPage,[0,0])).toEqual([20,830]);expect(point(image.rasterToPage,[800,1200])).toEqual([620,30]);
});
it('hybrid removes only matching overlapping characters and keeps body text on the same line',async()=>{
 const a=glyph('4',50),b=glyph('2',60),native=await buildPageText(raw([a,b],true));const merged=await composeText(native,result([a,b,glyph(' 正文',80)]),'hybrid');expect(merged.text.match(/42/g)).toHaveLength(1);expect(merged.text).toContain('正文');expect(merged.source).toBe('hybrid');expect(merged.quality).toBe('approximate');expect(searchPage(merged,'正文')).toHaveLength(1);expect(duplicate({...a,text:'5'},a)).toBe(false);expect(duplicate({...a,quad:[500,700,510,700,510,715,500,715]},a)).toBe(false);
 const vertical=glyph('竖');vertical.baseline=[50,715,50,700];const page=await composeText(await buildPageText(raw()),result([vertical]),'ocr');expect(page.lines[0].direction).toBe('ttb');expect(page.spans[0].glyphIds).toHaveLength(1);
 const unreliable=await composeText({...native,quality:'unavailable'},result([a,b]),'hybrid');expect(unreliable.text).toBe('42');
});
async function fixture(){const services=new BrowserServices(crypto.randomUUID()),handle=await services.documents.openFixture('report');const native={...raw(),docId:handle.docId,contentRevision:handle.docHash};services.text.getNative=vi.fn(async()=>native);services.ocr.getOverride=vi.fn(async()=> 'auto');const pool={acquire:async()=>({document:{getPageInfo:async()=>info},release:()=>{}})} as unknown as DocumentPool;let generation=0;
 services.ocr.start=vi.fn(async request=>({docId:handle.docId,jobId:crypto.randomUUID(),subscriptionId:crypto.randomUUID(),page:1,contentRevision:handle.docHash,pageGeneration:request.force?++generation:generation,profile:result([]).profile,needsRaster:false}));services.ocr.unsubscribe=vi.fn(async()=>{});services.ocr.status=vi.fn(async t=>({...t,phase:'completed',nativeRunning:false,completedPages:1,totalPages:1}));
 return {services,handle,controller:new DocumentText(handle,services,pool,async()=> '')};}
it('recognizes an empty page once and keeps native pages out of the OCR queue',async()=>{
 const {services,handle,controller}=await fixture();services.ocr.result=vi.fn(async t=>({...result([]),docId:handle.docId,jobId:t.jobId,contentRevision:handle.docHash,pageGeneration:t.pageGeneration}));await controller.recognize(1);await controller.recognize(1);expect(services.ocr.start).toHaveBeenCalledTimes(1);expect(controller.store.getState().pages[1].phase).toBe('empty');controller.dispose();services.dispose();
 const other=await fixture();other.services.text.getNative=vi.fn(async()=>({...raw([glyph('native')]),docId:other.handle.docId,contentRevision:other.handle.docHash}));await other.controller.recognize(1);expect(other.services.ocr.start).not.toHaveBeenCalled();other.controller.dispose();other.services.dispose();
});
it('late same-profile results cannot replace a newer request and cancellation updates immediately',async()=>{
 const {services,handle,controller}=await fixture();const deliveries:{ticket:OcrTicket;resolve:(r:OcrResult)=>void}[]=[];services.ocr.result=vi.fn(t=>new Promise(resolve=>deliveries.push({ticket:t,resolve})));
 const until=async(count:number)=>{for(let i=0;deliveries.length<count&&i<100;i++)await new Promise(r=>setTimeout(r,5));expect(deliveries).toHaveLength(count);};
 const old=controller.recognize(1,0,true).catch(e=>e);await until(1);controller.cancelPage(1);expect(controller.store.getState().pages[1].phase).toBe('cancelled');const fresh=controller.recognize(1,0,true);await until(2);
 const deliver=(i:number,text:string)=>{const t=deliveries[i].ticket;deliveries[i].resolve({...result([glyph(text)]),docId:handle.docId,jobId:t.jobId,contentRevision:handle.docHash,pageGeneration:t.pageGeneration});};deliver(1,'new');await fresh;deliver(0,'old');await old;expect((await controller.getPage(1,new AbortController().signal)).text).toBe('new');expect(services.ocr.unsubscribe).toHaveBeenCalledTimes(2);controller.dispose();services.dispose();
});
it('re-recognition preserves both automatic and explicit hybrid native text',async()=>{
 for(const mode of ['auto','hybrid'] as const){const {services,handle,controller}=await fixture();
  services.ocr.getOverride=vi.fn(async()=>mode);services.text.getNative=vi.fn(async()=>({...raw([glyph('42',50,780)],true),docId:handle.docId,contentRevision:handle.docHash}));
  services.ocr.result=vi.fn(async t=>({...result([glyph('body',50,600)]),docId:handle.docId,jobId:t.jobId,contentRevision:handle.docHash,pageGeneration:t.pageGeneration}));
  await controller.recognize(1);const page=await controller.recognize(1,0,true);expect(page.source).toBe('hybrid');expect(page.text).toContain('42');expect(page.text).toContain('body');expect(services.ocr.start).toHaveBeenCalledTimes(2);controller.dispose();services.dispose();
 }
});
it('a status response arriving after cancel cannot restore a running indicator',async()=>{
 const {services,controller}=await fixture();let deliver:(()=>void)|undefined;
 services.ocr.status=vi.fn(t=>new Promise<OcrStatus>(resolve=>{deliver=()=>resolve({...t,phase:'running',nativeRunning:true,completedPages:0,totalPages:1});}));
 const pending=controller.recognize(1).catch(e=>e);for(let i=0;!deliver&&i<100;i++)await new Promise(r=>setTimeout(r,5));expect(deliver).toBeDefined();controller.cancelPage(1);deliver!();await pending;
 expect(controller.store.getState().pages[1].phase).toBe('cancelled');expect(services.ocr.unsubscribe).toHaveBeenCalledTimes(1);controller.dispose();services.dispose();
});
it('cancelling an agent OCR subscription preserves the reader subscription and rejects its late result',async()=>{
 const {services,handle,controller}=await fixture(),deliveries:{ticket:OcrTicket;resolve:(r:OcrResult)=>void}[]=[];
 services.ocr.result=vi.fn(t=>new Promise(resolve=>deliveries.push({ticket:t,resolve})));
 const reader=controller.recognize(1);await vi.waitFor(()=>expect(deliveries).toHaveLength(1));const abort=new AbortController(),agent=controller.recognizeForRun(1,abort.signal),rejected=expect(agent).rejects.toThrow();await vi.waitFor(()=>expect(deliveries).toHaveLength(2));abort.abort();
 const cancelled=vi.mocked(services.ocr.unsubscribe).mock.calls.map(([t])=>t.subscriptionId);expect(cancelled).toContain(deliveries[1].ticket.subscriptionId);expect(cancelled).not.toContain(deliveries[0].ticket.subscriptionId);
 const deliver=(index:number,value:string)=>{const t=deliveries[index].ticket;deliveries[index].resolve({...result([glyph(value)]),docId:handle.docId,jobId:t.jobId,contentRevision:handle.docHash,pageGeneration:t.pageGeneration});};deliver(1,'late agent');await rejected;deliver(0,'reader result');await reader;expect((await controller.getPage(1,new AbortController().signal)).text).toBe('reader result');controller.dispose();services.dispose();
});
it('hybrid deduplicates the real shifted CTC header span while preserving same-line scan text and distant numbers',async()=>{
 // Observed PdfPig ink and OCR estimate boxes for the generated mixed PDF, not quality ground truth.
 const box=(text:string,q:Glyph['quad'],baseline:Glyph['baseline']):Glyph=>({...glyph(text),quad:q,baseline});
 const native=await buildPageText(raw([box('4',[20.3,820,26.276,820,26.276,828.436,20.3,828.436],[20,820,26.672,820]),box('2',[26.984,820,32.756,820,32.756,828.436,26.984,828.436],[26.672,820,33.344,820])],true));
 const four=box('4',[23.0544,815.76,27.1152,815.76,27.1152,832.32,23.0544,832.32],[23.0544,815.76,27.1152,815.76]),two=box('2',[27.1152,815.76,31.176,815.76,31.176,832.32,27.1152,832.32],[27.1152,815.76,31.176,815.76]);
 expect(duplicate(four,native.glyphs[0])).toBe(false);const merged=await composeText(native,result([four,two,glyph(' body',50,820),glyph(' 42',200,820)]),'hybrid');
 expect(merged.text.match(/42/g)).toHaveLength(2);expect(merged.text).toContain('body');expect(merged.glyphs.some(g=>g.id===four.id||g.id===two.id)).toBe(false);expect(merged.glyphs.some(g=>g.text===' 42')).toBe(true);
});
it('upright vertical OCR columns read right to left despite small top-edge differences',async()=>{
 const cell=(text:string,x:number,y:number):Glyph=>({...glyph(text,x,y),baseline:[x+10,y,x+10,y+15],source:'ocr'});
 const left=[cell('左',50,701),cell('侧',50,680)],right=[cell('右',90,700),cell('侧',90,679)];
 const page=await composeText(await buildPageText(raw()),{...result([]),lines:[{text:'左侧',glyphs:left},{text:'右侧',glyphs:right}]},'ocr');expect(page.text).toBe('右侧\n左侧');
 const hits=new HitIndex(page);expect(hits.hit([95,713])).toBe(0);expect(hits.hit([95,680])).toBe(2);
});
it('real synthetic OCR outputs preserve the independently authored text and reading order',async()=>{
 const root=new URL('../../../artifacts/ocr-samples/',import.meta.url);const truth=JSON.parse(readFileSync(new URL('ocr-synthetic-truth.json',root),'utf8')) as {pages:{category:string;characters:{text:string}[]}[]};const report=[];
 for(const sample of truth.pages){const recognized=JSON.parse(readFileSync(new URL(sample.category+'-result.json',root),'utf8')) as OcrResult;
  const native=await buildPageText({...raw(),pageInfo:recognized.raster.pageInfo});const page=await composeText(native,recognized,'ocr');const expected=sample.characters.map(c=>c.text).join(''),actual=page.text.replace(/\s/gu,'');
  report.push({category:sample.category,characters:expected.length,exactMatch:expected===actual,text:actual});
 }
 writeFileSync(new URL('synthetic-text.json',root),JSON.stringify(report,null,2));for(const result of report)expect(result.exactMatch,result.category).toBe(true);
});
