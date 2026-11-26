import {useEffect,useRef,useState} from 'react';
import {useStore} from 'zustand';
import type {Message,Content} from '../../contracts';
import type {ChatSession} from '../../llm/ChatSession';
import {ancestorChain} from '../../llm/context';
import {parseCitations} from '../../llm/citations';
import {AttachmentPreview} from './AttachmentPreview';
import {ToolRecord} from './ToolRecord';
import {CitationChip} from './CitationChip';
import {SafeMarkdown} from './SafeMarkdown';
const toolLabels:Record<string,string>={get_document_info:'读取文档信息',get_page_text:'读取页面文字',search_document:'搜索文档',get_page_image:'查看页面图像',get_region_image:'查看区域图像',list_annotations:'读取标注',create_annotation:'创建标注'};

export function LiveChatPanel({chat,width=380}:{chat:ChatSession;width?:number}){
 const state=useStore(chat.store),doc=useStore(chat.access.session.store),list=useRef<HTMLDivElement>(null),sticky=useRef(true),[limit,setLimit]=useState(50),[menu,setMenu]=useState(false),[rename,setRename]=useState('');
 const menuRef=useRef<HTMLDivElement>(null),menuButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!menu)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!e.isComposing){e.preventDefault();e.stopImmediatePropagation();setMenu(false);}};const outside=(e:PointerEvent)=>{if(!menuRef.current?.contains(e.target as Node)&&!menuButton.current?.contains(e.target as Node))setMenu(false);};window.addEventListener('keydown',key,true);window.addEventListener('pointerdown',outside);return()=>{window.removeEventListener('keydown',key,true);window.removeEventListener('pointerdown',outside);};},[menu]);
 const conversation=state.conversations.find(c=>c.id===state.activeId),messages=conversation?ancestorChain(state.messages,conversation.headId):[],branches=chat.branches();
 const fail=(e:unknown)=>chat.store.setState({error:String(e)});
 useEffect(()=>{void chat.refreshProviders().catch(fail);},[chat]);
 useEffect(()=>{if(sticky.current&&list.current)list.current.scrollTop=list.current.scrollHeight;},[state.messages,state.activeId]);
 useEffect(()=>{setLimit(50);sticky.current=true;},[state.activeId]);
 useEffect(()=>{if(state.focusMessage){setLimit(Number.MAX_SAFE_INTEGER);requestAnimationFrame(()=>list.current?.querySelector(`[data-message="${state.focusMessage}"]`)?.scrollIntoView({block:'center'}));}},[state.focusMessage]);
 const slash=conversation?.modelRef.indexOf('/')??-1,p=state.providers.find(p=>p.id===conversation?.modelRef.slice(0,slash)),model=p?.models.find(m=>m.modelId===conversation?.modelRef.slice(slash+1)),vision=!!p?.imageAllowed&&!!model?.input.includes('image');
 const send=()=>void chat.send().catch(fail),busy=state.phase!=='idle';
 return <aside aria-label="文档对话" data-testid="live-chat" style={{width,maxWidth:'calc(100vw - 48px)'}} className="shrink-0 border-l bg-white flex flex-col min-h-0">
  <header className="h-12 shrink-0 border-b flex items-center gap-2 px-3 text-sm"><button ref={menuButton} className="truncate flex-1 text-left" onClick={()=>{setMenu(!menu);setRename(conversation?.title??'');}}>{conversation?.title??'文档对话'} ▾</button><button disabled={busy||doc.access!=='edit'} onClick={()=>void chat.create().catch(fail)}>＋新建</button></header>
  {menu&&<div ref={menuRef} className="p-3 border-b space-y-2 text-xs"><select aria-label="选择会话" className="w-full" value={state.activeId} onChange={e=>{chat.select(e.target.value);setMenu(false);}}><option value="">选择会话</option>{state.conversations.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select>{conversation&&<><input aria-label="会话标题" className="settings-input" value={rename} onChange={e=>setRename(e.target.value)}/><div className="flex gap-3"><button onClick={()=>void chat.rename(rename).then(()=>setMenu(false)).catch(fail)}>重命名</button><button onClick={()=>{if(window.confirm('删除会话？已创建的标注会保留。'))void chat.remove().catch(fail);}}>删除会话</button></div></>}</div>}
  {branches.length>1&&<select aria-label="回答分支" className="text-xs p-2 border-b" value={conversation?.headId??''} onChange={e=>void chat.branch(e.target.value).catch(fail)}>{branches.map((m,i)=><option key={m.id} value={m.id}>分支 {i+1} · {m.createdAt.slice(11,19)}</option>)}</select>}
  <div ref={list} data-testid="chat-messages" className="flex-1 min-h-0 overflow-auto p-4 space-y-5" onScroll={e=>{const el=e.currentTarget;sticky.current=el.scrollHeight-el.scrollTop-el.clientHeight<60;}}>
   {!messages.length&&<p className="text-sm text-slate-500 mt-8">针对当前文档提问。可选中文字“问 AI”，或框选图表后添加附件。</p>}
   {(messages.length>=limit||messages[0]?.parentId)&&<button className="text-blue-600 text-xs" onClick={()=>void chat.loadMore().then(()=>setLimit(limit+50)).catch(fail)}>加载更早消息</button>}
   {messages.slice(-limit).map(m=><LiveMessage key={m.id} message={m} chat={chat} regenerate={()=>{const chain=ancestorChain(state.messages,m.id),user=chain.findLast(v=>v.role==='user');if(user)void chat.send(user.id).catch(fail);}} busy={busy}/>)}
  </div>
  {state.error&&<div role="alert" className="text-xs text-red-700 bg-red-50 p-2">{state.error}<button onClick={()=>chat.store.setState({error:undefined})} className="ml-2">关闭提示</button></div>}
  {state.notice&&<p role="status" className="text-xs text-amber-800 bg-amber-50 p-2">{state.notice}</p>}
  {!chat.access.services.capabilities.llm&&<p className="p-2 text-xs text-slate-500">真实模型请求需要桌面应用。</p>}
  <div className="p-3 border-t shrink-0 space-y-2">
   {state.quotes.map((q,i)=><div key={i} className="rounded bg-blue-50 px-2 py-1 text-xs flex gap-2"><button onClick={()=>chat.jump(q)} className="truncate flex-1 text-left">p{q.page} · {q.quote}</button><button aria-label={`移除引用 ${i+1}`} onClick={()=>chat.store.setState({quotes:state.quotes.filter((_,n)=>i!==n)})}>×</button></div>)}
   <div className="flex gap-2 overflow-auto">{state.attachments.map(a=><div key={a.attachmentId} className="w-28 shrink-0 text-xs border rounded p-1"><button onClick={()=>chat.jump({page:a.page!,rect:a.rect})}><AttachmentPreview services={chat.access.services} docId={chat.access.session.handle.docId} attachmentId={a.attachmentId}/></button><span>第 {a.page} 页区域</span><button aria-label="移除附件" className="float-right" onClick={()=>chat.store.setState({attachments:state.attachments.filter(v=>v.attachmentId!==a.attachmentId)})}>×</button>{!vision&&<p className="text-amber-700">{a.text?'仅发送区域文字':'无可读文字，需视觉模型'}</p>}</div>)}</div>
   <textarea aria-label="文档问题" placeholder="针对当前文档提问…" value={state.draft} disabled={doc.access!=='edit'} rows={3} className="w-full text-sm bg-slate-50 border rounded-xl p-2 resize-none" onChange={e=>chat.store.setState({draft:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>
   <div className="flex gap-2 items-center"><select aria-label="对话模型" className="text-xs flex-1 min-w-0" value={conversation?.modelRef??''} onFocus={()=>void chat.refreshProviders().catch(fail)} onChange={e=>void chat.model(e.target.value).catch(fail)}><option value="">选择模型</option>{conversation&&!model&&conversation.modelRef&&<option value={conversation.modelRef}>配置已删除</option>}{state.providers.flatMap(p=>p.models.map(m=><option key={`${p.id}/${m.modelId}`} value={`${p.id}/${m.modelId}`}>{p.name} / {m.modelId}</option>))}</select>{busy?<button className="bg-red-600 text-white px-3 py-1 rounded-lg text-sm" onClick={()=>chat.stop()}>{state.phase==='queued'?'取消排队':state.phase==='stopping'?'正在停止':'停止'}</button>:<button className="bg-blue-600 text-white px-3 py-1 rounded-lg text-sm disabled:opacity-40" disabled={doc.access!=='edit'||!chat.access.services.capabilities.llm||(!state.draft.trim()&&!state.attachments.length&&!state.quotes.length)} onClick={send}>发送</button>}</div>
  </div>
 </aside>;
}
function LiveMessage({message:m,chat,regenerate,busy}:{message:Message;chat:ChatSession;regenerate:()=>void;busy:boolean}){
 const progress=useStore(chat.store,s=>s.tools);const [expanded,setExpanded]=useState(false);const fail=(e:unknown)=>chat.store.setState({error:String(e)}),text=m.content.filter(b=>b.type==='text').map(b=>b.text).join('\n'),calls=m.content.filter(b=>b.type==='toolCall'),results=m.content.filter(b=>b.type==='toolResult');
 const render=(text:string)=>{const parts:React.ReactNode[]=[];let end=0;for(const item of parseCitations(text)){parts.push(text.slice(end,item.start));const saved=m.content.find((b):b is Extract<Content,{type:'citation'}>=>b.type==='citation'&&b.page===item.citation.page&&b.quote===item.citation.quote&&b.anchorToken===item.citation.anchorToken);parts.push(<CitationChip key={item.start} page={item.citation.page} label={item.citation.quote} onClick={()=>chat.jump({...item.citation,textRevision:saved?.textRevision,confirmed:saved?.confirmed===true,ranges:saved?.confirmed?saved.ranges:undefined})}/>);end=item.end;}parts.push(text.slice(end));return parts;};
 return <article data-message={m.id} className={`text-sm space-y-2 ${m.role==='user'?'ml-6 bg-blue-50 rounded-xl p-3':'border rounded-xl p-3'}`}>
  <div className="text-xs text-slate-400">{m.role==='user'?'你':m.role==='tool'?'文档工具':'文档助手'}{m.state==='running'?' · 生成中':m.state==='interrupted'?' · 上次生成已中断':m.state==='cancelled'?' · 已停止':m.state==='failed'?' · 失败':''}</div>
  {m.role!=='tool'&&<SafeMarkdown text={text} renderText={render}/>}
  {calls.length>3&&<button onClick={()=>setExpanded(!expanded)} className="text-xs text-slate-500">{expanded?'收起':`已调用 ${calls.length} 项工具`}</button>}
  {(calls.length<=3||expanded)&&calls.map(c=><ToolRecord key={c.toolCallId} tool={{id:c.toolCallId,text:toolLabels[c.name]??'文档操作',icon:'document',status:progress[c.wireId??c.toolCallId]?'pending':'completed'}}/>)}
  {results.map(r=><div key={r.toolCallId} className="text-xs space-y-2"><details><summary>{toolLabels[text]??'文档操作'} · {m.state==='failed'?'执行失败':'已完成'}</summary><pre className="whitespace-pre-wrap max-h-36 overflow-auto">{r.resultJson}</pre></details>{r.annotationIds?.map(id=>{const a=chat.access.session.store.getState().annotations.find(v=>v.id===id);return <button key={id} className="text-blue-600 mr-2" onClick={()=>a?chat.jump({page:a.page,annotationId:a.id,rect:a.rect}):chat.store.setState({notice:'关联标注已删除，工具记录仍保留'})}>{a?'跳转标注':'标注已删除'}</button>;})}{!!r.annotationIds?.length&&<button className="text-blue-600" onClick={()=>void chat.undo(r.annotationIds!).catch(fail)}>撤销这组标注</button>}</div>)}
  {m.content.filter(b=>b.type==='attachment').map(a=><div key={a.attachmentId}><button className="max-w-full" onClick={()=>chat.jump({page:a.page!,rect:a.rect})}><AttachmentPreview services={chat.access.services} docId={chat.access.session.handle.docId} attachmentId={a.attachmentId}/></button></div>)}
  {m.role==='user'&&m.content.filter(b=>b.type==='citation').map((b,i)=><button key={i} className="text-xs text-blue-700 block" onClick={()=>chat.jump(b)}>p{b.page} · {b.quote.slice(0,100)}</button>)}
  {m.content.filter(b=>b.type==='error').map((b,i)=><p key={i} role="alert" className="text-red-700 text-xs">{b.message}</p>)}
  {m.role==='assistant'&&m.state!=='running'&&<div className="flex gap-3 text-xs text-slate-500"><button onClick={()=>void chat.access.services.clipboard.write(chat.access.session.handle.docId,text).catch(fail)}>复制</button><button disabled={busy} onClick={regenerate}>{m.state==='failed'?'重试':'重新生成'}</button></div>}
 </article>;
}
