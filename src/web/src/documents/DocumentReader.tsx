import { useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import { useStore } from 'zustand';
import type { PageInfo,PageText,Quad } from '../contracts';
import type { DocSession } from '../state/DocSession';
import type { AppServices } from '../services/AppServices';
import type { PagedDocument,PasswordPrompt,OutlineEntry } from './types';
import type { DocumentPool } from './DocumentPool';
import { ByteLru } from './resources';
import { clientToPage,viewport,point } from './geometry';
import { PageView } from './PageView';
import { ThumbnailPanel } from '../ui/panels/ThumbnailPanel';
import { OutlinePanel } from '../ui/panels/OutlinePanel';
import { StatusBar } from '../ui/StatusBar';
import { FindBar } from '../ui/document/FindBar';
import { SearchController,searchPage } from '../text/search';
import type { SearchHit } from '../text/search';
import { copyText,rangeQuads,wordRange } from '../text/model';
import { HitIndex,selectedRange } from '../text/selection';
import type { Selection,TextPosition } from '../text/selection';
import {useAnnotations} from '../annotations/useAnnotations';
import {AnnotationToolbar,AnnotationInspector,AnnotationEditor} from '../annotations/AnnotationControls';
import {AnnotationPanel} from '../ui/panels/AnnotationPanel';
import {VersionNotice} from '../annotations/VersionNotice';
import {OcrControls,OcrPageStatus} from '../ocr/OcrControls';

const textCache=new ByteLru<string,PageText>(96*1024*1024);
const estimate:PageInfo={page:1,pageBox:[0,0,595,842],width:595,height:842,rotate:0,userUnit:1};
export function DocumentReader({session,services,pool,prompt}:{session:DocSession;services:AppServices;pool:DocumentPool;prompt:PasswordPrompt}){
  const state=useStore(session.store),[document,setDocument]=useState<PagedDocument>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const recover=useCallback(()=>{setError('');setDocument(undefined);void pool.recover().then(()=>setRetry(n=>n+1)).catch(()=>setError('阅读器重建失败，请关闭文档后重试。'));},[pool]);
  useEffect(()=>{const abort=new AbortController();let release:(()=>void)|undefined;
    void pool.acquire(session.handle.docId,prompt,abort.signal).then(lease=>{if(abort.signal.aborted){lease.release();return;}release=lease.release;setDocument(lease.document);session.store.setState({pageCount:lease.document.pageCount});},()=>{if(!abort.signal.aborted)setError('文档加载失败。可重建阅读器后重试。');});
    return ()=>{abort.abort();release?.();};
  },[session,pool,prompt,retry]);
  if(error)return <div className="p-8" role="alert">{error}<button onClick={recover}>重试</button></div>;
  if(!document)return <div className="p-8" role="status">正在加载文档…</div>;
  return <ReaderBody key={`${session.handle.docId}:${retry}`} session={session} services={services} document={document} page={state.page} recover={recover}/>;
}
function ReaderBody({session,services,document,recover}:{session:DocSession;services:AppServices;document:PagedDocument;page:number;recover:()=>void}){
  const state=useStore(session.store),scroller=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:900,height:700,dpr:devicePixelRatio}),[infos,setInfos]=useState<Record<number,PageInfo>>({}),[scroll,setScroll]=useState(0),[panel,setPanel]=useState<'none'|'thumbnails'|'outline'|'annotations'>('none'),[outline,setOutline]=useState<OutlineEntry[]>([]),[find,setFind]=useState(false),[query,setQuery]=useState(''),[hits,setHits]=useState<SearchHit[]>([]),[match,setMatch]=useState(0),[coverage,setCoverage]=useState({searched:0,unavailable:0}),[texts,setTexts]=useState<Record<number,PageText>>({}),[selection,setSelection]=useState<Selection>(),[notice,setNotice]=useState('');
  const search=useMemo(()=>new SearchController(),[]),drag=useRef<{pointer:number;x:number;y:number}|undefined>(undefined),selectionRef=useRef(selection),life=useRef(new AbortController()),layoutRef=useRef<{top:number;height:number}[]>([]),restoring=useRef(false),initial=useRef(true);
  const clicks=useRef({time:0,x:0,y:0,count:0});
  const hitIndexes=useMemo(()=>new Map(Object.values(texts).map(text=>[text.page,new HitIndex(text)])),[texts]);
  const stopDrag=useCallback((clear=false)=>{const pointer=drag.current?.pointer;drag.current=undefined;if(pointer!==undefined&&scroller.current?.hasPointerCapture(pointer))scroller.current.releasePointerCapture(pointer);if(clear)setSelection(undefined);},[]);
  const [counts,setCounts]=useState<number[]>([]),[currentHit,setCurrentHit]=useState<SearchHit>();
  const lastMatchJump=useRef('');
  const totalMatches=counts.reduce((a,b)=>a+b,0);
  selectionRef.current=selection;
  const info=infos[state.page]??infos[1]??estimate;
  const base=viewport(info,1,state.rotation);
  const scale=state.fit==='width'?(size.width-48)/base.width:state.fit==='page'?Math.min((size.width-48)/base.width,(size.height-40)/base.height):state.scale;
  const annotations=useAnnotations(session,services,scroller,infos,scale,state.rotation,setNotice);
  const selectedAnnotation=state.annotations.find(a=>a.id===state.selectedId);
  const [textVersion,setTextVersion]=useState(0);
  const [ocrProgress,setOcrProgress]=useState(session.text?.store.getState());
  useEffect(()=>session.text?.store.subscribe(next=>setOcrProgress(next)),[session]);
  useEffect(()=>session.text?.store.subscribe((next,old)=>{if(next.version!==old.version){setTextVersion(next.version);const selected=selectionRef.current;if(selected&&Object.keys(selected.revisions).some(p=>next.pages[Number(p)]!==old.pages[Number(p)]))stopDrag(true);}}),[session,stopDrag]);
  const layout=useMemo(()=>{let top=20;return Array.from({length:document.pageCount},(_,i)=>{const pageInfo=infos[i+1]??infos[1]??estimate;const v=viewport(pageInfo,scale,state.rotation),item={top,height:v.height,width:v.width};top+=v.height+20;return item;});},[document,infos,scale,state.rotation]);
  const firstVisible=Math.max(0,layout.findIndex(l=>l.top+l.height>=scroll)),lastVisible=Math.max(firstVisible,layout.findIndex(l=>l.top>scroll+size.height)===-1?layout.length-1:layout.findIndex(l=>l.top>scroll+size.height)-1);
  const start=Math.max(0,firstVisible-2),end=Math.min(document.pageCount-1,lastVisible+2),pages=Array.from({length:end-start+1},(_,i)=>start+i+1);
  useEffect(()=>{const element=scroller.current!;const resize=()=>setSize({width:element.clientWidth,height:element.clientHeight,dpr:devicePixelRatio});const observer=new ResizeObserver(resize);observer.observe(element);window.addEventListener('resize',resize);const timer=setInterval(()=>{if(devicePixelRatio!==size.dpr)resize();},500);resize();return()=>{observer.disconnect();window.removeEventListener('resize',resize);clearInterval(timer);};},[size.dpr]);
  useEffect(()=>{const abort=new AbortController();life.current=abort;return()=>{abort.abort();search.cancel();};},[search]);
  useEffect(()=>{let active=true;void document.getOutline().then(v=>{if(active)setOutline(v);}).catch(()=>{});return()=>{active=false;};},[document]);
  useEffect(()=>{let active=true;void(async()=>{const order=[...pages,...Array.from({length:document.pageCount},(_,i)=>i+1).filter(p=>!pages.includes(p))];for(const p of order){if(!active)return;if(infos[p])continue;const info=await document.getPageInfo(p);if(active)setInfos(old=>({...old,[p]:info}));if(p%10===0)await new Promise(r=>setTimeout(r,0));}})().catch(()=>{if(active)setNotice('部分页面尺寸加载失败');});return()=>{active=false;};},[document]);
  useLayoutEffect(()=>{
    const element=scroller.current;if(!element)return;let page=state.page,ratio=state.anchorRatio;
    if(!initial.current&&layoutRef.current.length){const old=layoutRef.current;const index=Math.max(0,old.findIndex(l=>l.top+l.height>=element.scrollTop));page=index+1;ratio=(element.scrollTop-old[index].top)/old[index].height;}
    const target=layout[Math.min(page-1,layout.length-1)];restoring.current=true;element.scrollTop=Math.max(0,target.top+ratio*target.height);setScroll(element.scrollTop);layoutRef.current=layout;initial.current=false;
    const frame=requestAnimationFrame(()=>{restoring.current=false;});return()=>cancelAnimationFrame(frame);
  },[layout,size.width,size.height,size.dpr]);
  const getText=useCallback(async(page:number,signal:AbortSignal)=>{if(session.text)return session.text.getPage(page,signal);const key=session.handle.docId+':'+page;let result=textCache.get(key);if(!result){result=await services.text.getPage(session.handle.docId,page,signal);signal.throwIfAborted();textCache.set(key,result,JSON.stringify(result).length*2);}return result;},[session,services,textVersion]);
  useEffect(()=>{const abort=new AbortController();if(!services.capabilities.nativeText)return;setTexts(old=>Object.fromEntries(Object.entries(old).filter(([page])=>pages.includes(Number(page)))));void(async()=>{for(const page of pages){try{const value=await getText(page,abort.signal);if(!abort.signal.aborted)setTexts(old=>({...old,[page]:value}));}catch{if(abort.signal.aborted)return;}}})();return()=>abort.abort();},[start,end,getText,services.capabilities.nativeText]);
  useEffect(()=>{if(!session.text||state.closeState!=='open')return;for(let page=firstVisible+1;page<=lastVisible+1;page++){const phase=session.text.store.getState().pages[page]?.phase;if(!phase||phase==='pending')void session.text.recognize(page,1).catch(()=>{});}},[firstVisible,lastVisible,textVersion,session,state.closeState]);
  useEffect(()=>{if(!query.trim()||!find){search.cancel();setHits([]);setCounts([]);setCurrentHit(undefined);setCoverage({searched:0,unavailable:0});return;}search.run(query,document.pageCount,getText,(_hits,searched,unavailable,_queryId,counts)=>{setCounts(counts);setCoverage({searched,unavailable});});return()=>search.cancel();},[query,find,document,getText,search]);
  const jump=useCallback((page:number)=>{if(!Number.isInteger(page)||page<1||page>document.pageCount){setNotice(`请输入 1–${document.pageCount} 之间的整数页码`);return;}const element=scroller.current;if(element){element.scrollTop=layout[page-1].top;setScroll(element.scrollTop);session.store.setState({page,anchorRatio:0});}},[document,layout,session]);
  const moveMatch=useCallback((delta:number)=>{if(!totalMatches)return;setMatch(old=>(old+delta+totalMatches)%totalMatches);},[totalMatches]);
  useEffect(()=>{
    if(!totalMatches){setHits([]);setCurrentHit(undefined);return;}
    const abort=new AbortController();let offset=match,page=1;for(;page<=counts.length;page++){if(offset<counts[page-1])break;offset-=counts[page-1];}
    void getText(page,abort.signal).then(text=>{if(abort.signal.aborted)return;const matches=searchPage(text,query);setHits(matches);const hit=matches[offset];setCurrentHit(hit);const key=query+':'+page+':'+offset;if(hit&&lastMatchJump.current!==key){lastMatchJump.current=key;jump(page);const q=hit.quads[0],pageInfo=infos[page];if(q&&pageInfo&&scroller.current){const [,y]=point(viewport(pageInfo,scale,state.rotation).transform,[(q[0]+q[2]+q[4]+q[6])/4,(q[1]+q[3]+q[5]+q[7])/4]);scroller.current.scrollTop=Math.max(0,layout[page-1].top+y-size.height*.3);}}}).catch(()=>{});
    return()=>abort.abort();
  },[match,totalMatches,query,getText]);
  useEffect(()=>{setMatch(0);},[query]);
  const copy=useCallback(async()=>{const current=selectionRef.current;if(!current)return;const values:string[]=[];let bytes=0;for(let page=Math.min(current.anchor.page,current.focus.page);page<=Math.max(current.anchor.page,current.focus.page);page++){const text=await getText(page,life.current.signal),range=selectedRange(current,text);if(text.quality==='unavailable'||!range){setNotice('选区文字已变化或含有不可靠页面，请重新选择');return;}const value=copyText([{page:text,range}]);bytes+=new TextEncoder().encode(value).length+(values.length?1:0);if(bytes>1024*1024){setNotice('选中文字超过 1 MiB，请缩小选区');return;}values.push(value);}const value=values.join('\n');if(value)await services.clipboard.write(session.handle.docId,value);},[getText,services,session]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{
    const input=e.target instanceof HTMLElement&&Boolean(e.target.closest('input,textarea,[contenteditable=true]'));
    if(e.defaultPrevented||e.isComposing||state.editor)return;
    if(!input&&annotations.editable&&(e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();void (e.key.toLowerCase()==='y'||e.shiftKey?session.redo():session.undo()).catch(annotations.fail);return;}
    if(!input&&annotations.editable&&e.key==='Delete'&&state.selectedId&&scroller.current?.contains(window.document.activeElement)){e.preventDefault();void session.remove(state.selectedId).catch(annotations.fail);return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();setFind(true);}
    else if(e.key==='F3'||find&&e.key==='Enter'&&input){e.preventDefault();moveMatch(e.shiftKey?-1:1);}
    else if(e.key==='Escape'){setFind(false);stopDrag(true);annotations.cancel();session.store.setState({selectedId:undefined});}
    else if(!input&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&selectionRef.current){e.preventDefault();void copy().catch(()=>setNotice('复制失败，请重试'));}
  };const blur=()=>{if(drag.current)stopDrag(true);};window.addEventListener('keydown',key);window.addEventListener('blur',blur);return()=>{window.removeEventListener('keydown',key);window.removeEventListener('blur',blur);};},[find,moveMatch,copy,stopDrag,state.selectedId,state.editor,annotations.editable]);
  const hit=useCallback((x:number,y:number):TextPosition|undefined=>{
    const element=scroller.current;if(!element)return;const bounds=element.getBoundingClientRect(),position=y-bounds.top+element.scrollTop;let index=layout.findIndex(l=>position<=l.top+l.height);if(index<0)index=layout.length-1;const page=index+1,text=texts[page],info=infos[page];if(!text||text.quality==='unavailable'||!info)return;
    const box=element.querySelector(`[data-page="${page}"]`)?.getBoundingClientRect();if(!box)return;return {page,offset:hitIndexes.get(page)!.hit(clientToPage(info,scale,state.rotation,box,x,y))};
  },[layout,texts,infos,scale,state.rotation,hitIndexes]);
  const extend=useCallback((x:number,y:number)=>{const position=hit(x,y);if(position)setSelection(old=>old?{...old,focus:position,revisions:{...old.revisions,[position.page]:texts[position.page].textRevision}}:old);},[hit,texts]);
  useEffect(()=>{let frame=0;const tick=()=>{const d=drag.current,element=scroller.current;if(d&&element){const b=element.getBoundingClientRect(),delta=d.y<b.top+45?-Math.min(24,(b.top+45-d.y)/2):d.y>b.bottom-45?Math.min(24,(d.y-b.bottom+45)/2):0;if(delta){element.scrollTop+=delta;extend(d.x,d.y);}}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[extend]);
  const visibleMatches=useMemo(()=>Object.fromEntries(Object.values(texts).map(text=>[text.page,find&&query?searchPage(text,query):[]])),[texts,find,query]);
  const copyPosition=useMemo(()=>{if(!selection)return {top:16,right:20};const page=selection.focus.page,text=texts[page],info=infos[page],item=layout[page-1];if(!text||!info||!item)return {top:16,right:20};const span=text.spans.find(s=>selection.focus.offset>s.range.start&&selection.focus.offset<=s.range.end),glyph=text.glyphs.find(g=>span?.glyphIds.includes(g.id));if(!glyph)return {top:16,right:20};const [,y]=point(viewport(info,scale,state.rotation).transform,[(glyph.quad[0]+glyph.quad[4])/2,(glyph.quad[1]+glyph.quad[5])/2]);const top=item.top+y-scroll;return {top:Math.max(8,Math.min(size.height-48,top>64?top-55:top+28)),right:20};},[selection,texts,infos,layout,scale,state.rotation,scroll,size.height]);
  const paint=(page:number,type:'selection'|'matches'|'current'):Quad[]=>{const text=texts[page];if(type==='selection'){const range=text&&selection&&selectedRange(selection,text);return range?rangeQuads(text,[range]):[];}if(type==='current')return currentHit?.page===page?currentHit.quads:[];return (visibleMatches[page]??hits.filter(h=>h.page===page)).filter(h=>!currentHit||h.page!==currentHit.page||h.ranges[0].start!==currentHit.ranges[0].start).flatMap(h=>h.quads);};
  const tab={id:session.handle.docId,docHash:session.handle.docHash,title:session.handle.fileName,kind:session.handle.kind,pageCount:document.pageCount,currentPage:state.page,scale,rotation:state.rotation,textSource:texts[state.page]?.source??'native' as const,ocrStatus:ocrProgress?{isRecognizing:ocrProgress.all||Object.values(ocrProgress.pages).some(p=>p.phase==='running'||p.phase==='queued'),currentPage:ocrProgress.all?ocrProgress.completed:Object.values(ocrProgress.pages).filter(p=>p.phase==='ready'||p.phase==='empty').length,totalPage:document.pageCount,unrecognizedPages:document.pageCount-Object.values(ocrProgress.pages).filter(p=>p.phase==='ready'||p.phase==='empty').length}:undefined};
  return <main className="flex-1 min-h-0 flex flex-col" data-reader="true" data-doc-hash={session.handle.docHash} data-page-count={document.pageCount} data-text-pages={Object.keys(texts).join(',')}>
    <VersionNotice session={session} services={services} document={document} getText={getText}/>
    <div className="h-11 flex items-center gap-3 px-4 bg-white border-b text-sm shrink-0">
      <button onClick={()=>setPanel(panel==='thumbnails'?'none':'thumbnails')}>缩略图</button><button onClick={()=>setPanel(panel==='outline'?'none':'outline')}>目录</button><button onClick={()=>setPanel(panel==='annotations'?'none':'annotations')}>标注</button><span className="h-5 border-l mx-1"/>
      <button onClick={()=>session.store.setState({fit:'width'})}>适合宽度</button><button onClick={()=>session.store.setState({fit:'page'})}>适合整页</button><button onClick={()=>session.store.setState({rotation:(state.rotation+90)%360})}>旋转</button><button onClick={()=>setFind(v=>!v)}>查找</button>
      <span className="ml-auto text-xs text-slate-500">{state.access==='readOnly'?'只读 · 其他窗口正在编辑':services.capabilities.nativeText?'可选择、复制与搜索已就绪文字':'精确文字选择与搜索需要桌面服务'}</span>
    </div>
    <AnnotationToolbar tool={state.tool} setTool={annotations.setTool} style={annotations.style} setStyle={annotations.setStyle} disabled={!annotations.editable} undo={()=>void session.undo().catch(annotations.fail)} redo={()=>void session.redo().catch(annotations.fail)} undoCount={state.undoCount} redoCount={state.redoCount}/>
    <div className="h-8 shrink-0 bg-blue-50 border-b">{selectedAnnotation&&annotations.editable?<AnnotationInspector annotation={selectedAnnotation} session={session} fail={annotations.fail} onEdit={()=>annotations.edit(selectedAnnotation)} onReanchor={()=>{annotations.setTool(selectedAnnotation.type==='underline'?'underline':'highlight');annotations.reanchor.current=selectedAnnotation.id;setSelection(undefined);setNotice('请重新拖选文字，完成后会替换原标注组');}}/>:<p className="px-4 py-2 text-xs text-slate-500">选择标注可编辑属性；拖动蓝色控制点可调整图形大小。</p>}</div>
    {state.saveState==='error'&&<div role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-700">保存失败，修改仍保留：{state.error}<button className="ml-4 underline" onClick={()=>void session.retry().catch(annotations.fail)}>重试保存</button></div>}
    {session.text&&<OcrControls controller={session.text} page={state.page} count={document.pageCount} disabled={state.closeState!=='open'}/>}
    {notice&&<div role="alert" className="bg-amber-50 px-4 py-1 text-xs">{notice}<button onClick={()=>setNotice('')} className="ml-3">关闭</button></div>}
    {texts[state.page]?.quality==='unavailable'&&<div className="bg-amber-50 px-4 py-1 text-xs">此页文字尚未就绪，可先阅读页面图像或启动 OCR。</div>}
    <div className="flex-1 min-h-0 flex relative">
      {panel==='annotations'&&<AnnotationPanel annotations={[]} documentAnnotations={state.annotations} pageCount={document.pageCount} selectedAnnotationId={state.selectedId} onSelectAnnotation={(id,page)=>{annotations.select(id);if(page<=document.pageCount)jump(page);}} onDeleteAnnotation={(id,e)=>{e.stopPropagation();if(annotations.editable)void session.remove(id).catch(annotations.fail);}} onClose={()=>setPanel('none')}/>}
      {panel==='thumbnails'&&<ThumbnailPanel document={document} pageCount={document.pageCount} currentPage={state.page} onSelectPage={jump} onClose={()=>setPanel('none')}/>}
      {panel==='outline'&&(outline.length?<OutlinePanel outline={outline} currentPage={state.page} onSelectPage={jump} onClose={()=>setPanel('none')}/>:<aside className="w-[220px] p-5 bg-white text-sm">此文档没有大纲</aside>)}
      <div className="flex-1 min-w-0 relative">
        <div ref={scroller} tabIndex={0} data-testid="reader-scroll" className="absolute inset-0 overflow-auto bg-[#e9ecf0] outline-none" style={{touchAction:'none',userSelect:'none'}} onScroll={e=>{const top=e.currentTarget.scrollTop;setScroll(top);if(!restoring.current){const index=Math.max(0,layout.findIndex(l=>l.top+l.height>=top));session.store.setState({page:index+1,anchorRatio:(top-layout[index].top)/layout[index].height});}}} onPointerDown={e=>{
          e.currentTarget.focus({preventScroll:true});if(annotations.down(e)){e.preventDefault();stopDrag(true);return;}if(state.tool!=='select'&&state.tool!=='highlight'&&state.tool!=='underline'||state.editor)return;
          if(e.button!==0)return;const pos=hit(e.clientX,e.clientY);if(!pos)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY};const text=texts[pos.page];
          const previous=clicks.current,now=performance.now(),count=now-previous.time<450&&Math.hypot(e.clientX-previous.x,e.clientY-previous.y)<5?previous.count%3+1:1;
          clicks.current={time:now,x:e.clientX,y:e.clientY,count};
          const range=count>=3?text.lines.find(l=>pos.offset>=l.range.start&&pos.offset<=l.range.end)?.range:count===2?wordRange(text.text,pos.offset):undefined;
          setSelection({anchor:{page:pos.page,offset:range?.start??pos.offset},focus:{page:pos.page,offset:range?.end??pos.offset},revisions:{[pos.page]:text.textRevision}});
        }} onPointerMove={e=>{if(annotations.move(e))return;if(drag.current?.pointer!==e.pointerId)return;drag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY};extend(e.clientX,e.clientY);}} onPointerUp={e=>{if(annotations.up(e))return;if(drag.current?.pointer===e.pointerId){stopDrag();setSelection(old=>old?{...old}:old);if(state.tool==='highlight'||state.tool==='underline')void annotations.annotate(selectionRef.current,getText,state.tool).then(()=>setSelection(undefined)).catch(annotations.fail);}}} onPointerCancel={()=>{stopDrag(true);annotations.cancel();}}>
          <div style={{position:'relative',height:layout.at(-1)!.top+Math.max(layout.at(-1)!.height+20,size.height),minWidth:Math.max(size.width,...layout.map(l=>l.width+40))}}>
            {pages.map(page=>{const item=layout[page-1],info=infos[page],values=state.annotations.filter(a=>a.page===page&&a.id!==annotations.preview?.id);if(annotations.preview?.page===page){const original=annotations.gesture.current?.original;if(original){const i=values.findIndex(a=>a.id===original.id);if(i>=0)values.splice(i,1);}values.push(annotations.preview);}return <div key={page} style={{position:'absolute',top:item.top,left:Math.max(20,(size.width-item.width)/2),width:item.width,height:item.height}}>{info&&<PageView document={document} info={info} scale={scale} rotation={state.rotation} dpr={size.dpr} priority={page>=firstVisible+1&&page<=lastVisible+1?0:10+Math.abs(page-state.page)} selection={paint(page,'selection')} matches={paint(page,'matches')} current={paint(page,'current')} onRecover={recover} annotations={values} selectedId={state.selectedId}/>}{session.text&&<OcrPageStatus controller={session.text} page={page}/>}</div>;})}
          </div>
        </div>
        <FindBar isOpen={find} onClose={()=>setFind(false)} currentMatchIndex={totalMatches?match+1:0} totalMatches={totalMatches} onNextMatch={()=>moveMatch(1)} onPrevMatch={()=>moveMatch(-1)} searchTerm={query} onSearchTermChange={setQuery}/>
        {find&&<div className="absolute right-5 top-16 bg-white border rounded px-3 py-1 text-xs" data-testid="search-coverage">已搜索 {coverage.searched}/{document.pageCount} 页 · 待识别 {coverage.unavailable} 页</div>}
        {selection&&!drag.current&&<div style={copyPosition} className="absolute bg-white border shadow rounded-lg px-4 py-2 text-sm flex gap-3"><button onClick={()=>void copy().catch(()=>setNotice('复制失败，请重试'))}>复制选中文字</button>{annotations.editable&&<><button onClick={()=>void annotations.annotate(selection,getText,'highlight').then(()=>setSelection(undefined)).catch(annotations.fail)}>高亮选中文字</button><button onClick={()=>void annotations.annotate(selection,getText,'underline').then(()=>setSelection(undefined)).catch(annotations.fail)}>下划线选中文字</button></>}</div>}
        {state.editor&&<AnnotationEditor key={state.editor.annotation.id} session={session} fail={annotations.fail}/>}
      </div>
    </div>
    <StatusBar activeTab={tab} onPageChange={jump} scale={scale} onScaleChange={scale=>session.store.setState({scale,fit:'manual'})} isSaved={!state.editor&&state.saveState==='saved'} saveState={state.saveState==='error'?'error':state.editor?'pending':state.saveState} onCancelOcr={()=>session.text?.cancel()}/>
  </main>;
}
