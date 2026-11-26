import { useEffect,useRef,useState } from 'react';
import type { PageInfo,Quad } from '../contracts';
import type { PagedDocument } from './types';
import { backingScale,quad,viewport } from './geometry';
import { pageCanvases,thumbnailCanvases,renderQueue } from './resources';
type Props={document:PagedDocument;info:PageInfo;scale:number;rotation:number;dpr:number;priority:number;selection?:Quad[];matches?:Quad[];current?:Quad[];thumbnail?:boolean;onRecover?:()=>void};
export function PageView({document,info,scale,rotation,dpr,priority,selection=[],matches=[],current=[],thumbnail=false,onRecover}:Props){
  const host=useRef<HTMLDivElement>(null),overlay=useRef<HTMLCanvasElement>(null),visible=useRef<HTMLCanvasElement|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const view=viewport(info,scale,rotation);
  useEffect(()=>{
    const controller=new AbortController(),budget=thumbnail?thumbnailCanvases:pageCanvases;
    let canvas:HTMLCanvasElement|null=null;
    const timer=setTimeout(()=>{void renderQueue.schedule(async()=>{
      controller.signal.throwIfAborted();canvas=window.document.createElement('canvas');
      const output=backingScale(view.width,view.height,dpr,Math.min(thumbnail?2*1024*1024:64*1024*1024,budget.available));
      if(!Number.isFinite(output)||output<=0)throw new Error('画布预算已满，请缩小或重试');
      const width=Math.max(1,Math.floor(view.width*output)),height=Math.max(1,Math.floor(view.height*output));
      if(!budget.allocate(canvas,width,height))throw new Error('画布预算已满，请缩小或重试');
      try{
        await document.render(info.page,canvas,scale,rotation,output,controller.signal);controller.signal.throwIfAborted();
        canvas.style.width='100%';canvas.style.height='100%';canvas.style.display='block';canvas.dataset.rendered='true';
        if(visible.current)budget.release(visible.current);host.current?.replaceChildren(canvas);visible.current=canvas;canvas=null;setError('');setRevision(v=>v+1);
      }finally{if(canvas){budget.release(canvas);canvas=null;}}
    },priority,controller.signal,thumbnail).catch(e=>{if(!controller.signal.aborted&&e?.name!=='RenderingCancelledException'){window.dispatchEvent(new CustomEvent('docass.renderError',{detail:{name:e?.name,message:e?.message}}));setError('页面渲染失败，可重试打开文档');}});},thumbnail?0:150);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[document,info,scale,rotation,dpr,thumbnail]);
  useEffect(()=>()=>{if(visible.current)(thumbnail?thumbnailCanvases:pageCanvases).release(visible.current);},[thumbnail]);
  useEffect(()=>{
    const canvas=overlay.current;if(!canvas||thumbnail)return;
    const output=backingScale(view.width,view.height,dpr,Math.min(64*1024*1024,pageCanvases.available+(canvas.width*canvas.height*4)));
    if(!pageCanvases.allocate(canvas,Math.max(1,Math.floor(view.width*output)),Math.max(1,Math.floor(view.height*output))))return;
    const ctx=canvas.getContext('2d')!;ctx.setTransform(output,0,0,output,0,0);
    const paint=(quads:Quad[],color:string)=>{ctx.fillStyle=color;for(const q of quads){const v=quad(view.transform,q);ctx.beginPath();ctx.moveTo(v[0],v[1]);for(let i=2;i<8;i+=2)ctx.lineTo(v[i],v[i+1]);ctx.closePath();ctx.fill();}};
    paint(matches,'rgba(250,204,21,.35)');paint(current,'rgba(249,115,22,.6)');paint(selection,'rgba(59,130,246,.32)');
    return ()=>pageCanvases.release(canvas);
  },[info,scale,rotation,dpr,selection,matches,current,revision,thumbnail]);
  return <div data-page={info.page} style={{width:view.width,height:view.height,position:'relative',background:'white',boxShadow:'0 2px 8px #0002'}}>
    <div ref={host} style={{width:'100%',height:'100%',pointerEvents:'none'}}/>
    {!thumbnail&&<canvas ref={overlay} data-overlay={info.page} style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}/>}
    {error&&<div role="alert" className="absolute inset-0 flex items-center justify-center text-red-700 text-sm" onPointerDown={e=>e.stopPropagation()}>{error}{onRecover&&<button className="ml-3 underline" onClick={onRecover}>重建阅读器</button>}</div>}
  </div>;
}
