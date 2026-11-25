import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
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

const Prototype = lazy(()=>import('./mock/PrototypeApp'));
export default function App() {
  if (new URLSearchParams(location.search).get('demo') === '1') return <Suspense fallback={<p>正在加载示例…</p>}><Prototype/></Suspense>;
  return <Workspace/>;
}
function Workspace() {
  const services = useMemo(createServices,[]), sessions = useMemo(()=>new Map<string,DocSession>(),[]);
  const state = useStore(appStore), [settingsOpen,setSettingsOpen] = useState(false), [maximized,setMaximized] = useState(false), [fixturesEnabled,setFixturesEnabled] = useState(!services.capabilities.desktop);
  const report = (error: unknown) => appStore.setState({error:error instanceof Error?error.message:String(error)});
  useEffect(()=>{
    let active = true;
    void services.bootstrap().then(data=>{if(active){appStore.setState({settings:data.settings,ready:true});setMaximized(data.window.maximized);setFixturesEnabled(!services.capabilities.desktop||data.fixturesEnabled===true);}}).catch(report);
    const unsubscribe=services.window.subscribe(setMaximized);
    return ()=>{active=false;unsubscribe();};
  },[services]);
  const openFixture = async (name: 'report'|'contract') => {
    try {
      const handle=await services.documents.openFixture(name);let session=sessions.get(handle.docId);
      if(!session){session=new DocSession(handle,services);await session.restore();sessions.set(handle.docId,session);}
      appStore.setState(current=>({tabs:current.tabs.some(t=>t.docId===handle.docId)?current.tabs:[...current.tabs,handle],activeDocId:handle.docId,error:undefined}));
    }catch(e){report(e);}
  };
  const closeTab=async (id:string)=>{try{await sessions.get(id)?.close();sessions.delete(id);appStore.setState(s=>({tabs:s.tabs.filter(t=>t.docId!==id),activeDocId:s.activeDocId===id?s.tabs.find(t=>t.docId!==id)?.docId??'':s.activeDocId}));}catch(e){report(e);}};
  const tabs:DocTab[]=state.tabs.map(h=>({id:h.docId,docHash:h.docHash,title:h.fileName,kind:h.kind,pageCount:12,currentPage:1,scale:1.25,rotation:0,textSource:'native'}));
  const session=sessions.get(state.activeDocId);
  return <div data-build-stamp={buildStamp} className="h-screen flex flex-col bg-[#f5f6f8] text-slate-800">
    <TitleBar tabs={tabs} activeTabId={state.activeDocId} onSelectTab={activeDocId=>appStore.setState({activeDocId})} onCloseTab={(id,e)=>{e.stopPropagation();void closeTab(id);}} onAddTab={()=>appStore.setState({error:'当前版本暂不支持打开本地文档。'})} onOpenSettings={()=>setSettingsOpen(true)} isMaximized={maximized} windowEnabled={services.capabilities.window} onToggleMaximize={()=>void services.window.maximize().catch(report)} onMinimize={()=>void services.window.minimize().catch(report)} onRequestClose={()=>void services.window.requestClose().catch(report)}/>
    {state.error&&<div role="alert" className="px-5 py-2 bg-amber-50 text-amber-900 text-sm">{state.error}<button className="ml-5" onClick={()=>appStore.setState({error:undefined})}>关闭提示</button></div>}
    {session?<SessionView key={session.handle.docId} session={session} services={services}/>:<main className="flex-1 flex flex-col items-center justify-center gap-5">
      <div className="w-20 h-20 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center"><FileText size={36}/></div>
      <h1 className="text-2xl font-semibold">欢迎使用 DocAss</h1><p className="text-sm text-slate-500">工作区中还没有文档</p>
      <div className="flex gap-4"><button className="bg-blue-600 text-white px-5 py-2 rounded-lg" onClick={()=>setSettingsOpen(true)}>应用设置</button><a className="border border-slate-300 px-5 py-2 rounded-lg" href="?demo=1">查看界面演示</a></div>
    </main>}
    {fixturesEnabled&&<div className="flex gap-4 justify-center p-3 border-t border-slate-200 text-xs text-slate-600"><span>文档示例</span><button onClick={()=>void openFixture('report')}>打开报告示例</button><button onClick={()=>void openFixture('contract')}>打开合同示例</button></div>}
    <footer className="px-4 py-2 border-t border-slate-200 text-xs text-slate-500">{state.ready?(services.capabilities.desktop?'桌面模式':'浏览器模式 · 示例内容保存在此浏览器中'):'正在连接…'}</footer>
    {settingsOpen&&<FoundationSettingsDialog services={services} initial={state.settings} onSaved={settings=>appStore.setState({settings})} onClose={()=>setSettingsOpen(false)}/>}
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
