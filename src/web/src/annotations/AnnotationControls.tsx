import {useRef} from 'react';
import type {Annotation} from '../contracts';
import type {DocSession} from '../state/DocSession';
import type {Tool,ToolStyle} from './model';
import {textType} from './model';
import {StickyNoteCard} from '../ui/document/StickyNoteCard';

const tools:[Tool,string][]=[['select','选择'],['highlight','高亮'],['underline','下划线'],['note','便签'],['freetext','文字批注'],['ink','手绘'],['rect','矩形'],['arrow','箭头'],['eraser','橡皮擦']];
export function AnnotationToolbar({tool,setTool,style,setStyle,disabled,undo,redo,undoCount,redoCount}:{tool:Tool;setTool:(t:Tool)=>void;style:ToolStyle;setStyle:(s:Partial<ToolStyle>)=>void;disabled:boolean;undo:()=>void;redo:()=>void;undoCount:number;redoCount:number}){
  return <div className="flex flex-wrap items-center gap-1 px-3 py-1 bg-white border-b text-xs" aria-label="标注工具栏">{tools.map(([id,label])=><button key={id} aria-label={label+'工具'} aria-pressed={id===tool} disabled={disabled&&id!=='select'} className={`px-2 py-1 rounded disabled:opacity-40 ${id===tool?'bg-blue-100 text-blue-700':'hover:bg-slate-100'}`} onClick={()=>setTool(id)}>{label}</button>)}
    <label className="ml-2">颜色<input aria-label="工具颜色" type="color" value={style.color} onChange={e=>setStyle({color:e.target.value})} className="w-7 h-5 ml-1 align-middle"/></label>
    <label className="ml-2">线宽<select aria-label="工具线宽" value={style.strokeWidth} onChange={e=>setStyle({strokeWidth:Number(e.target.value)})}>{[1,2,3,5,8].map(v=><option key={v}>{v}</option>)}</select></label>
    <button className="ml-auto px-2 disabled:opacity-40" disabled={disabled||!undoCount} onClick={undo}>撤销</button><button className="px-2 disabled:opacity-40" disabled={disabled||!redoCount} onClick={redo}>重做</button>
  </div>;
}
export function AnnotationInspector({annotation:a,session,onEdit,onReanchor,fail}:{annotation:Annotation;session:DocSession;onEdit:()=>void;onReanchor:()=>void;fail:(e:unknown)=>void}){
  const update=(changes:Partial<Annotation>)=>void session.put({...a,...changes}).catch(fail);
  return <div className="flex flex-wrap gap-3 items-center px-4 py-1 border-b bg-blue-50 text-xs" aria-label="标注属性">
    <span>{tools.find(([id])=>id===a.type)?.[1]} · {a.author}</span><input aria-label="标注颜色" type="color" value={a.color} onChange={e=>update({color:e.target.value})} className="w-7 h-5"/>
    <label>不透明度<select aria-label="标注不透明度" value={a.opacity} onChange={e=>update({opacity:Number(e.target.value)})}>{[.2,.35,.5,.75,1].map(v=><option key={v} value={v}>{Math.round(v*100)}%</option>)}</select></label>
    <button onClick={onEdit}>编辑{a.type==='freetext'?'文字':'评论'}</button>{textType(a)&&<button onClick={onReanchor}>重新选择文字</button>}
    {!textType(a)&&a.migrationState==='needsReview'&&a.page<=session.store.getState().pageCount&&<button onClick={()=>update({migrationState:'confirmed'})}>确认当前位置</button>}
    <button className="text-red-700" onClick={()=>void session.remove(a.id).catch(fail)}>删除标注组</button>
  </div>;
}
export function AnnotationEditor({session,fail}:{session:DocSession;fail:(e:unknown)=>void}){
  const editor=session.store.getState().editor!,a=editor.annotation,composing=useRef(false);
  const change=(text:string)=>session.store.setState({editor:{...editor,text}});
  const cancel=()=>session.store.setState({editor:undefined});
  const save=()=>{if(composing.current)return;if(editor.isNew&&!editor.text.trim()){cancel();return;}const value={...a,...(a.type==='freetext'?{text:editor.text}:{contents:editor.text})};session.store.setState({editor:undefined});void session.put(value).catch(fail);};
  if(a.type==='note')return <div className="absolute inset-0 z-30 bg-black/10" onPointerDown={e=>e.stopPropagation()}><StickyNoteCard author={a.author} date={a.createdAt.slice(0,10)} content={editor.text} editImmediately controlledDraft={editor.text} onDraftChange={change} onUpdateContent={text=>{change(text);session.store.setState({editor:undefined});void session.put({...a,contents:text}).catch(fail);}} onDelete={()=>{cancel();if(!editor.isNew)void session.remove(a.id).catch(fail);}} onClose={save} onCancel={cancel} position={{x:24,y:24}}/></div>;
  return <div className="absolute inset-0 z-30 bg-black/10 flex items-start justify-center pt-8" onPointerDown={e=>e.stopPropagation()}>
    <div className="bg-white border rounded-lg shadow-xl w-96 p-4" role="dialog" aria-label="编辑批注">
      <p className="text-sm mb-2">{a.type==='freetext'?'文字批注':'标注评论'}</p>
      <textarea aria-label="批注内容" autoFocus className="border rounded p-2 w-full h-28 text-sm" maxLength={20000} value={editor.text} onChange={e=>change(e.target.value)} onCompositionStart={()=>composing.current=true} onCompositionEnd={()=>composing.current=false} onKeyDown={e=>{e.stopPropagation();if(e.nativeEvent.isComposing||composing.current)return;if(e.key==='Escape'){e.preventDefault();cancel();}if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();save();}}}/>
      {a.type==='freetext'&&<div className="flex gap-3 text-xs my-2"><label>字号<input aria-label="批注字号" type="number" min="6" max="96" className="w-14 border" value={a.fontSize} onChange={e=>session.store.setState({editor:{...editor,annotation:{...a,fontSize:Math.max(6,Math.min(96,Number(e.target.value)||14))}}})}/></label><select aria-label="批注字体" value={a.fontFamily} onChange={e=>session.store.setState({editor:{...editor,annotation:{...a,fontFamily:e.target.value}}})}><option value="sans-serif">无衬线</option><option value="serif">衬线</option></select><select aria-label="批注对齐" value={a.alignment} onChange={e=>session.store.setState({editor:{...editor,annotation:{...a,alignment:e.target.value as Annotation['alignment']}}})}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></div>}
      <div className="flex justify-end gap-4 text-sm"><button onClick={cancel}>取消编辑</button><button onClick={save} className="text-blue-700">保存批注</button></div>
    </div>
  </div>;
}
