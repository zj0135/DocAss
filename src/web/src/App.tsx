import { lazy, Suspense, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useStore } from 'zustand';
import { FileText, Sparkles } from 'lucide-react';
import { createServices } from './services';
import { appStore, DocSession } from './state/appStore';
import { TitleBar } from './ui/TitleBar';
import { FoundationSettingsDialog } from './ui/settings/FoundationSettingsDialog';
import { AttachmentPreview } from './ui/chat/AttachmentPreview';
import type { AppServices } from './services/AppServices';
import type { DocTab } from './types';
import { buildStamp } from './buildStamp';
import { DocumentPool } from './documents/DocumentPool';
import { DocumentReader } from './documents/DocumentReader';
import type { OpenResult,RecentDocument } from './documents/types';

const Prototype = lazy(()=>import('./mock/PrototypeApp'));
export default function App() {
  if (new URLSearchParams(location.search).get('demo') === '1') return <Suspense fallback={<p>正在加载示例…</p>}><Prototype/></Suspense>;
  return <Workspace/>;
}
function Workspace() {
  const services = useMemo(createServices,[]), sessions = useMemo(()=>new Map<string,DocSession>(),[]);
  const pool=useMemo(()=>new DocumentPool(),[]),fileInput=useRef<HTMLInputElement>(null),openAbort=useRef<AbortController|null>(null);
  const [opening,setOpening]=useState(false),[recent,setRecent]=useState<RecentDocument[]>([]),[passwordRequest,setPasswordRequest]=useState<{incorrect:boolean;resolve:(value:string)=>void;reject:(error:Error)=>void}>(),[password,setPassword]=useState('');
  const prompt=useCallback((incorrect:boolean)=>new Promise<string>((resolve,reject)=>{setPassword('');setPasswordRequest({incorrect,resolve,reject});}),[]);
  const state = useStore(appStore), [settingsOpen,setSettingsOpen] = useState(false), [maximized,setMaximized] = useState(false), [fixturesEnabled,setFixturesEnabled] = useState(!services.capabilities.desktop);
  const report = (error: unknown) => appStore.setState({error:error instanceof Error?error.message:String(error)});
  useEffect(()=>{
    let active = true;
    void services.bootstrap().then(data=>{if(active){appStore.setState({settings:data.settings,ready:true});setMaximized(data.window.maximized);setFixturesEnabled(!services.capabilities.desktop||data.fixturesEnabled===true);void services.documents.recent().then(setRecent).catch(report);}}).catch(report);
    const unsubscribe=services.window.subscribe(setMaximized);
    return ()=>{active=false;unsubscribe();};
  },[services]);
  const adopt=useCallback(async(initial:OpenResult,signal:AbortSignal)=>{
    let result=initial;
    try{
      while(result.status!=='ready'){
        const password=await prompt(result.status==='incorrect');signal.throwIfAborted();result=await services.documents.unlock(result.openId,password,signal);
      }
      const handle=result.handle!;if(sessions.has(handle.docId)){appStore.setState({activeDocId:handle.docId});return;}
      pool.register(handle.docId,()=>services.documents.source(handle.docId));
      try{
        const lease=await pool.acquire(handle.docId,prompt,signal),count=lease.document.pageCount;lease.release();signal.throwIfAborted();
        const session=new DocSession(handle,services);await session.restore();signal.throwIfAborted();session.store.setState({pageCount:count});sessions.set(handle.docId,session);
        appStore.setState(s=>({tabs:[...s.tabs,handle],activeDocId:handle.docId,error:undefined}));setRecent(await services.documents.recent());
      }catch(e){await pool.close(handle.docId);await services.documents.close(handle.docId);throw e;}
    }catch(e){if(result.status!=='ready')await services.documents.cancelOpen(result.openId);throw e;}
  },[services,pool,sessions,prompt]);
  const open=async(file?:File,hash?:string)=>{
    if(openAbort.current)return;const abort=new AbortController();openAbort.current=abort;setOpening(true);
    try{const result=hash?await services.documents.openRecent(hash,abort.signal):await services.documents.open(file,abort.signal);if(result)await adopt(result,abort.signal);}
    catch(e){if(!abort.signal.aborted&&!(e instanceof DOMException&&e.name==='AbortError'))report(e);}
    finally{setOpening(false);openAbort.current=null;}
  };
  useEffect(()=>{let queue=Promise.resolve();return services.documents.subscribe(result=>{queue=queue.then(async()=>{const abort=new AbortController();openAbort.current=abort;setOpening(true);try{await adopt(result,abort.signal);}catch(e){if(!abort.signal.aborted&&!(e instanceof DOMException&&e.name==='AbortError'))report(e);}finally{openAbort.current=null;setOpening(false);}});},message=>report(new Error(message)));},[services,adopt]);
  const choose=()=>{if(services.capabilities.desktop)void open();else fileInput.current?.click();};
  const openFixture = async (name: 'report'|'contract') => {
    try {
      const handle=await services.documents.openFixture(name);let session=sessions.get(handle.docId);
      if(!session){session=new DocSession(handle,services);await session.restore();sessions.set(handle.docId,session);}
      appStore.setState(current=>({tabs:current.tabs.some(t=>t.docId===handle.docId)?current.tabs:[...current.tabs,handle],activeDocId:handle.docId,error:undefined}));
    }catch(e){report(e);}
  };
  const closeTab=async (id:string)=>{try{await sessions.get(id)?.close();await pool.close(id);sessions.delete(id);appStore.setState(s=>({tabs:s.tabs.filter(t=>t.docId!==id),activeDocId:s.activeDocId===id?s.tabs.find(t=>t.docId!==id)?.docId??'':s.activeDocId}));}catch(e){report(e);}};
  const tabs:DocTab[]=state.tabs.map(h=>({id:h.docId,docHash:h.docHash,title:h.fileName,kind:h.kind,pageCount:sessions.get(h.docId)?.store.getState().pageCount??1,currentPage:1,scale:1,rotation:0,textSource:'native'}));
  const session=sessions.get(state.activeDocId);
  return <div data-build-stamp={buildStamp} className="h-screen flex flex-col bg-[#f5f6f8] text-slate-800" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const files=Array.from(e.dataTransfer.files);if(services.capabilities.desktop)services.documents.drop(files);else void(async()=>{for(const file of files)await open(file);})();}}>
    <input ref={fileInput} data-testid="file-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.bmp" multiple hidden onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void(async()=>{for(const file of files)await open(file);})();}}/>
    <TitleBar tabs={tabs} activeTabId={state.activeDocId} onSelectTab={activeDocId=>appStore.setState({activeDocId})} onCloseTab={(id,e)=>{e.stopPropagation();void closeTab(id);}} onAddTab={choose} onOpenSettings={()=>setSettingsOpen(true)} isMaximized={maximized} windowEnabled={services.capabilities.window} onToggleMaximize={()=>void services.window.maximize().catch(report)} onMinimize={()=>void services.window.minimize().catch(report)} onRequestClose={()=>void services.window.requestClose().catch(report)}/>
    {state.error&&<div role="alert" className="px-5 py-2 bg-amber-50 text-amber-900 text-sm">{state.error}<button className="ml-5" onClick={()=>appStore.setState({error:undefined})}>关闭提示</button></div>}
    {opening&&<div role="status" className="px-5 py-2 text-sm">正在打开文件…<button className="ml-4" onClick={()=>{openAbort.current?.abort();passwordRequest?.reject(new DOMException('已取消','AbortError'));setPassword('');setPasswordRequest(undefined);}}>取消打开</button></div>}
    {session?(session.handle.byteLength===0?<SessionView key={session.handle.docId} session={session} services={services}/>:<DocumentReader key={session.handle.docId} session={session} services={services} pool={pool} prompt={prompt}/>):<main className="flex-1 flex flex-col items-center justify-center gap-5">
      <div className="w-20 h-20 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center"><FileText size={36}/></div>
      <h1 className="text-2xl font-semibold">欢迎使用 DocAss</h1><p className="text-sm text-slate-500">工作区中还没有文档</p>
      <div className="flex gap-4"><button className="bg-blue-600 text-white px-5 py-2 rounded-lg" onClick={choose}>打开文档</button><button className="border border-slate-300 px-5 py-2 rounded-lg" onClick={()=>setSettingsOpen(true)}>应用设置</button><a className="border border-slate-300 px-5 py-2 rounded-lg" href="?demo=1">查看界面演示</a></div>
      <p className="text-xs text-slate-500">支持 PDF、PNG、JPEG、BMP；也可将文件拖到窗口中</p>
      {recent.length>0&&<div className="w-96 max-h-52 overflow-auto"><h2 className="text-sm font-medium mb-2">最近打开</h2>{recent.map(item=><button key={item.docHash} className="block w-full text-left text-sm py-2 px-3 hover:bg-white rounded" onClick={()=>void open(undefined,item.docHash)}>{item.fileName}</button>)}</div>}
    </main>}
    {fixturesEnabled&&<div className="flex gap-4 justify-center p-3 border-t border-slate-200 text-xs text-slate-600"><span>文档示例</span><button onClick={()=>void openFixture('report')}>打开报告示例</button><button onClick={()=>void openFixture('contract')}>打开合同示例</button></div>}
    <footer className="px-4 py-2 border-t border-slate-200 text-xs text-slate-500">{state.ready?(services.capabilities.desktop?'桌面模式':'浏览器模式 · 示例内容保存在此浏览器中'):'正在连接…'}</footer>
    {settingsOpen&&<FoundationSettingsDialog services={services} initial={state.settings} onSaved={settings=>appStore.setState({settings})} onClose={()=>setSettingsOpen(false)}/>}
    {passwordRequest&&<div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center"><form role="dialog" aria-label="PDF 密码" className="bg-white rounded-xl shadow-xl p-6 w-96" onSubmit={e=>{e.preventDefault();passwordRequest.resolve(password);setPassword('');setPasswordRequest(undefined);}}><h2 className="font-semibold mb-3">输入 PDF 密码</h2>{passwordRequest.incorrect&&<p role="alert" className="text-red-600 text-sm mb-2">密码错误，请重试</p>}<input autoFocus type="password" autoComplete="off" aria-label="文档密码" className="settings-input w-full" value={password} onChange={e=>setPassword(e.target.value)}/><div className="flex justify-end gap-4 mt-4"><button type="button" onClick={()=>{passwordRequest.reject(new DOMException('已取消','AbortError'));setPassword('');setPasswordRequest(undefined);}}>取消</button><button type="submit" className="text-blue-600">解锁</button></div></form></div>}
  </div>;
}
function SessionView({session,services}:{session:DocSession;services:AppServices}) {
  const state=useStore(session.store);
  const saveDraft=async()=>{
    const id=crypto.randomUUID();await session.commit({type:'batch',mutations:[{type:'conversation.put',value:{id,title:state.draft||'示例笔记',modelRef:'fixture',createdAt:new Date().toISOString()}}]});
  };
  return <main className="flex-1 min-h-0 flex" data-access={state.access}>
    {state.access==='readOnly'&&<div className="p-4 text-amber-900"><p role="status">此文档由其他窗口编辑，当前为只读。</p><button onClick={()=>void session.reacquire().catch(error=>session.store.setState({error:String(error)}))}>重新取得编辑权限</button></div>}
    <section className="flex-1 overflow-auto p-8"><article className="mx-auto bg-white shadow-sm border border-slate-200 max-w-2xl p-12 min-h-[500px]"><p className="text-sm text-blue-600 mb-5">示例文档</p><h1 className="text-2xl font-semibold">{session.handle.fileName}</h1><p className="mt-8 leading-8">此示例用于体验文档切换、笔记保存和分段回复。每份文档拥有独立的状态；重新打开示例后，可以继续查看已保存的笔记。</p><div className="mt-6 flex gap-4 text-sm"><button onClick={()=>session.store.setState({page:Math.max(1,state.page-1)})}>上一页</button><span data-testid="page">第 {state.page} 页</span><button onClick={()=>session.store.setState({page:Math.min(12,state.page+1)})}>下一页</button></div></article></section>
    <aside className="w-[400px] max-w-[45vw] bg-white border-l border-slate-200 p-5 flex flex-col gap-4"><h2 className="font-semibold flex items-center gap-2"><Sparkles size={18}/>示例对话</h2><textarea disabled={state.access!=='edit'} aria-label="示例笔记" className="settings-input min-h-24" value={state.draft} onChange={e=>session.store.setState({draft:e.target.value})}/><button className="bg-blue-600 text-white py-2 rounded-lg" disabled={state.access!=='edit'} onClick={()=>void saveDraft().catch(()=>{})}>保存笔记</button><p role="status" className="text-xs">{state.saveState==='saved'?'已保存':state.saveState==='saving'?'保存中…':'保存失败'} · 版本 {state.documentRevision}</p>{state.error&&<p role="alert">{state.error}<button onClick={()=>void session.retry().catch(()=>{})}>重试</button></p>}<ul className="text-sm space-y-2 overflow-auto">{state.conversations.map(c=><li key={c.id}>{c.title}</li>)}</ul><button className="border border-slate-300 rounded-lg py-2" disabled={state.access!=='edit'} onClick={()=>state.running?session.stop():void session.runFixture()}>{state.running?'停止示例回复':'生成示例回复'}</button>{state.messages.map(message=><div key={message.id}>{message.content.map((block,index)=>block.type==='attachment'?<AttachmentPreview key={index} services={services} docId={session.handle.docId} attachmentId={block.attachmentId}/>:block.type==='text'?<p key={index}>{block.text}</p>:null)}</div>)}<p data-testid="fixture-reply" className="text-sm leading-7">{state.reply}</p></aside>
  </main>;
}
