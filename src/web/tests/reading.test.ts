import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type { PageInfo,PageText,Quad } from '../src/contracts';
import type { NativePage } from '../src/documents/types';
import {point,inverse,viewport,compose,rasterToPage,backingScale,imagePixelsToPage} from '../src/documents/geometry';
import {buildPageText,boundaries,rangeQuads,copyText} from '../src/text/model';
import {searchPage,SearchController} from '../src/text/search';
import {HitIndex,selectedRange} from '../src/text/selection';
import {ByteLru,RenderQueue,CanvasBudget} from '../src/documents/resources';
const native=JSON.parse(readFileSync('../../artifacts/reading/native-pages.json','utf8')) as NativePage[];
describe('production native geometry and text',()=>{
  it('builds schema-valid grapheme spans and finds all independent Chinese rows',async()=>{
    const page=await buildPageText(native[0]);expect(page.quality).toBe('verified');expect(page.lines.length).toBe(20);
    expect(searchPage(page,'中文').length).toBe(20);
    for(const span of page.spans){expect(boundaries(page.text)).toContain(span.range.start);expect(boundaries(page.text)).toContain(span.range.end);}
    expect(page.spans.some(s=>s.kind==='lineBreak'&&s.glyphIds.length===0)).toBe(true);
    const glyph=page.glyphs[0],center:[number,number]=[(glyph.quad[0]+glyph.quad[2])/2,(glyph.quad[1]+glyph.quad[5])/2];expect(new HitIndex(page).hit(center)).toBeLessThanOrEqual(1);
    expect(rangeQuads(page,[{start:0,end:2}])).toHaveLength(2);
    expect((await buildPageText(native[0])).textRevision).toBe(page.textRevision);
    const bad=await buildPageText({...native[0],status:'unreliable'});expect(bad.quality).toBe('unavailable');expect(bad.textRevision).not.toBe(page.textRevision);
    expect(searchPage(bad,'中文')).toEqual([]);
  });
  it('retains TJ positioning, RTL and vertical order without measurement',async()=>{
    const tj=await buildPageText(native[9]);expect(tj.glyphs.map(g=>g.baseline)).toEqual(native[9].glyphs.map(g=>g.baseline));
    const vertical=await buildPageText(native[8]);expect(vertical.lines.every(l=>l.direction==='ttb')).toBe(true);expect(vertical.text.split('\n')[0]).toBe('竖排文字测试');
    const fake={...native[0],glyphs:native[0].glyphs.slice(0,3).map((g,i)=>({...g,text:['א','ב','ג'][i]}))};const rtl=await buildPageText(fake);expect(rtl.lines[0].direction).toBe('rtl');expect(rtl.text).toBe('גבא');
  });
  it('copies independently authored mixed prose and positive Unicode',async()=>{
    const truth=JSON.parse(readFileSync('../../docs/fixtures/generated/native-truth.json','utf8'));
    for(const index of [0,1,3,4,5]){const page=await buildPageText(native[index]);expect(page.text).toBe(truth.texts[index].text.trimEnd());}
    const pages=JSON.parse(readFileSync('../../artifacts/reading/unicode-pages.json','utf8')) as NativePage[],unicodeTruth=JSON.parse(readFileSync('../../docs/fixtures/generated/unicode-positive-truth.json','utf8'));
    for(let i=0;i<pages.length;i++){const page=await buildPageText(pages[i]);expect(page.text).toBe(unicodeTruth[i].text);}
  });
  it('handles ligatures, emoji, combining glyphs, NFKC and range reverse mapping',async()=>{
    const raw={...native[0],glyphs:native[0].glyphs.slice(0,5).map((g,i)=>({...g,text:['ﬃ','😀','e','\u0301','Ａ'][i]}))};
    const page=await buildPageText(raw);expect(page.text).toContain('e\u0301');expect(page.spans.some(s=>s.glyphIds.length===2)).toBe(true);
    expect(searchPage(page,'FFI')).toHaveLength(1);expect(searchPage(page,'a')).toHaveLength(1);expect(searchPage(page,'é')).toHaveLength(1);
    const hit=searchPage(page,'ffi')[0];expect(hit.ranges).toEqual([{start:0,end:1}]);expect(hit.quads).toHaveLength(1);
    const copied=copyText([{page,range:{start:2,end:3}}]);expect(copied).toBe('😀');
  });
  it('copies cross-page ranges, joins soft lines, preserves hard hyphens and invalidates revisions',async()=>{
    const first=await buildPageText(native[0]),second={...first,page:2,textRevision:'b'.repeat(64)};
    const selection={anchor:{page:2,offset:2},focus:{page:1,offset:0},revisions:{1:first.textRevision,2:second.textRevision}};
    expect(selectedRange(selection,first)).toEqual({start:0,end:first.text.length});expect(selectedRange(selection,{...second,textRevision:'c'.repeat(64)})).toBeUndefined();
    const text='中文\n文档\nsoft\nwrap hard-\nword soft\u00ad\nbreak';
    expect(copyText([{page:{...first,text},range:{start:0,end:text.length}}])).toBe('中文文档 soft wrap hard-\nword softbreak');
    expect(searchPage({...first,text:'Alpha\n beta Ａ ﬃ'},'ALPHA beta')).toHaveLength(1);
  });
});
describe('coordinates and budgets',()=>{
  it('matches the independently implemented PDF.js viewport for real CropBox and UserUnit pages',async()=>{
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task=getDocument({data:new Uint8Array(readFileSync('../../docs/fixtures/generated/native-matrix.pdf'))});
    try{const pdf=await task.promise;for(const number of [1,4,5,6]){const page=await pdf.getPage(number);for(const rotation of [0,90,180,270]){const actual=viewport(native[number-1].pageInfo,1.31,rotation),expected=page.getViewport({scale:1.31*96/72,rotation:(page.rotate+rotation)%360});actual.transform.forEach((v,i)=>expect(v).toBeCloseTo(expected.transform[i],8));expect(actual.width).toBeCloseTo(expected.width,8);expect(actual.height).toBeCloseTo(expected.height,8);}}}finally{await task.destroy();}
  });
  it('round-trips every rotation, DPR, crop offset and UserUnit with separate raster matrix',()=>{
    for(const rotate of [0,90,180,270] as const)for(const dpr of [1,1.25,1.5,2])for(const userUnit of [1,2])for(const rotation of [0,90,180,270]){
      const info:PageInfo={page:1,pageBox:[40,80,540,760],rotate,userUnit,width:500*userUnit,height:680*userUnit};const m=viewport(info,1.73,rotation).transform;const p:[number,number]=[123.45,678.9];
      expect(point(inverse(m),point(m,p))[0]).toBeCloseTo(p[0],8);expect(point(inverse(m),point(m,p))[1]).toBeCloseTo(p[1],8);
      const raster=compose([dpr,0,0,dpr,0,0],m);const back=point(rasterToPage(info,1.73,rotation,dpr),point(raster,p));expect(back[0]).toBeCloseTo(p[0],8);expect(back[1]).toBeCloseTo(p[1],8);
      const image=imagePixelsToPage(info,1000,1360);expect(point(image,[0,0])).toEqual([40,760]);
    }
  });
  it('bounds oversized canvases and evicts text LRU by bytes',()=>{
    const scale=backingScale(40000,30000,2);expect(40000*scale).toBeLessThanOrEqual(16384);expect(40000*30000*scale*scale).toBeLessThanOrEqual(16*1024*1024+1);
    const cache=new ByteLru<string,number>(10);cache.set('a',1,6);cache.set('b',2,6);expect(cache.get('a')).toBeUndefined();expect(cache.bytes).toBe(6);
    const canvas={width:0,height:0} as HTMLCanvasElement,budget=new CanvasBudget(16);expect(budget.allocate(canvas,2,2)).toBe(true);expect(budget.allocate({} as HTMLCanvasElement,1,1)).toBe(false);budget.release(canvas);expect(budget.bytes).toBe(0);
  });
  it('queues at most two renders, one thumbnail; cancelled queued work never runs',async()=>{
    const queue=new RenderQueue(),abort=new AbortController();let running=0,max=0,thumbs=0,maxThumbs=0;const order:number[]=[];
    const tasks=Array.from({length:8},(_,i)=>queue.schedule(async()=>{running++;max=Math.max(max,running);if(i>3){thumbs++;maxThumbs=Math.max(maxThumbs,thumbs);}order.push(i);await new Promise(r=>setTimeout(r,5));running--;if(i>3)thumbs--;},i<4?0:100,abort.signal,i>3));await Promise.all(tasks);expect(max).toBe(2);expect(maxThumbs).toBe(1);expect(order.slice(0,4)).toEqual([0,1,2,3]);
  });
  it('debounces 200 ms and drops all superseded search jobs',async()=>{
    vi.useFakeTimers();const controller=new SearchController(),updates:string[]=[];const page=await buildPageText(native[0]);
    controller.run('中文',2,async()=>{await new Promise(r=>setTimeout(r,100));return page;},hits=>updates.push(hits.length?'old':'empty'));
    await vi.advanceTimersByTimeAsync(210);controller.run('no-match',1,async()=>page,()=>updates.push('new'));await vi.advanceTimersByTimeAsync(500);expect(updates).not.toContain('old');expect(updates.at(-1)).toBe('new');controller.cancel();vi.useRealTimers();
  });
});
