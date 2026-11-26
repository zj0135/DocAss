import {useStore} from 'zustand';
import type {DocumentText} from './DocumentText';
import type {TextMode} from './text';
export function OcrPageStatus({controller,page}:{controller:DocumentText;page:number}){const value=useStore(controller.store,s=>s.pages[page]);return value&&(value.phase==='queued'||value.phase==='running')?<div className="absolute bottom-2 left-2 right-2 rounded bg-blue-50/95 text-blue-800 px-3 py-2 text-xs pointer-events-none" role="status">{value.phase==='running'?'本页正在识别文字…':'本页等待识别…'}</div>:null;}
export function OcrControls({controller,page,count,disabled}:{controller:DocumentText;page:number;count:number;disabled:boolean}){
 const state=useStore(controller.store),current=state.pages[page],active=Object.values(state.pages).filter(p=>p.phase==='queued'||p.phase==='running').length;
 const completed=Object.values(state.pages).filter(p=>p.phase==='ready'||p.phase==='empty').length;
 const fail=(e:unknown)=>{if(!(e instanceof DOMException&&e.name==='AbortError'))controller.store.setState(s=>({pages:{...s.pages,[page]:{...s.pages[page],mode:s.pages[page]?.mode??'auto',phase:'failed',error:e instanceof Error?e.message:String(e)}}}));};
 return <div className="flex items-center gap-3 px-4 py-1 border-b bg-white text-xs flex-wrap" aria-label="文字识别控制">
  <span>文字来源：{current?.source==='hybrid'?'混合':current?.source==='ocr'?'OCR':current?.source==='native'?'原生':'待判定'}</span>
  <label>本页模式 <select aria-label="本页文字模式" disabled={disabled} value={current?.mode??'auto'} onChange={e=>void controller.setMode(page,e.target.value as TextMode).catch(fail)}>{[['auto','自动'],['native','仅原生'],['ocr','仅 OCR'],['hybrid','原生与 OCR']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
  <button disabled={disabled} onClick={()=>void controller.recognize(page,0,true).catch(fail)}>重新识别本页</button>
  <button disabled={disabled||state.all} onClick={()=>void controller.all(count).catch(fail)}>识别全文</button>
  <span data-testid="ocr-coverage">文字就绪 {completed}/{count} 页 · 未就绪 {count-completed} 页</span>
  {(active>0||state.all)&&<><span role="status">{state.all?`全文识别 ${state.completed}/${state.total} 页`:'正在识别页面'}（当前推理不可立即中断）</span><button onClick={()=>controller.cancel()}>取消识别等待</button></>}
  {current?.phase==='cancelled'&&<span>已取消等待</span>}{current?.phase==='empty'&&<span>空白页 · 已检查</span>}
  {current?.dpi&&<span className="text-slate-500">{Math.round(current.dpi)} DPI · {current.cached?'缓存命中':current.device}</span>}
  {current?.error&&<span role="alert" className="text-red-700">{current.error}</span>}
  {Object.entries(state.pages).filter(([p,v])=>Number(p)!==page&&v.phase==='failed').map(([p,v])=><span key={p} role="alert" className="text-red-700">第 {p} 页识别失败：{v.error}</span>)}
 </div>;
}
