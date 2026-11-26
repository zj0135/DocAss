import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent,RefObject} from 'react';
import {useStore} from 'zustand';
import type {Annotation,PageInfo,Point,Box,Mutation,PageText} from '../contracts';
import type {DocSession} from '../state/DocSession';
import type {AppServices} from '../services/AppServices';
import type {Selection} from '../text/selection';
import {selectedRange} from '../text/selection';
import {appStore} from '../state/appStore';
import {clientToPage,viewport} from '../documents/geometry';
import {baseAnnotation,bounds,hitAnnotation,simplify,textAnnotation,textType,transformAnnotation} from './model';
import type {Tool,ToolStyle} from './model';

type Gesture={pointer:number;page:number;start:Point;points:Point[];original?:Annotation;mode:'draw'|'move'|'resize'|'erase';erase:Set<string>;preview?:Annotation;scale:number};
let preferenceWrites:Promise<void>=Promise.resolve();
export function useAnnotations(session:DocSession,services:AppServices,scroller:RefObject<HTMLDivElement|null>,infos:Record<number,PageInfo>,scale:number,rotation:number,notice:(s:string)=>void){
  const state=useStore(session.store),settings=useStore(appStore,s=>s.settings),gesture=useRef<Gesture|undefined>(undefined),[preview,setPreview]=useState<Annotation>();
  const reanchor=useRef<string|undefined>(undefined);
  const editable=state.access==='edit'&&state.closeState==='open'&&state.saveState!=='error';
  const style:ToolStyle=state.styles[state.tool]??settings.toolPreferences?.find(p=>p.tool===state.tool)??{color:settings.color,strokeWidth:settings.strokeWidth,opacity:state.tool==='highlight'?.35:1};
  const fail=(e:unknown)=>notice(e instanceof Error?e.message:String(e));
  const cancel=()=>{const id=gesture.current?.pointer;gesture.current=undefined;setPreview(undefined);if(id!==undefined&&scroller.current?.hasPointerCapture(id))scroller.current.releasePointerCapture(id);session.store.setState({toolPhase:state.tool==='select'?'idle':'armed'});};
  useEffect(()=>{const blur=()=>cancel();window.addEventListener('blur',blur);return()=>{window.removeEventListener('blur',blur);gesture.current=undefined;session.store.setState({toolPhase:session.store.getState().tool==='select'?'idle':'armed'});};},[state.tool]);
  const pick=(x:number,y:number,fixedPage?:number)=>{const el=scroller.current;if(!el)return;const pageElement=fixedPage?el.querySelector<HTMLElement>(`[data-page="${fixedPage}"]`):Array.from(el.querySelectorAll<HTMLElement>('[data-page]')).find(e=>{const r=e.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;});if(!pageElement)return;const page=Number(pageElement.dataset.page),info=infos[page];if(!info)return;const p=clientToPage(info,scale,rotation,pageElement.getBoundingClientRect(),x,y);const b=info.pageBox;return {page,p:[Math.max(b[0],Math.min(b[2],p[0])),Math.max(b[1],Math.min(b[3],p[1]))] as Point,unit:Math.hypot(...viewport(info,scale,rotation).transform.slice(0,2))};};
  const setTool=(tool:Tool)=>{cancel();reanchor.current=undefined;session.store.setState({tool,toolPhase:tool==='select'?'idle':'armed'});};
  const setStyle=(change:Partial<ToolStyle>)=>{const tool=state.tool,next={...style,...change};session.store.setState(s=>({styles:{...s.styles,[tool]:next}}));preferenceWrites=preferenceWrites.then(async()=>{const current=appStore.getState().settings;const settings=await services.settings.update({...current,toolPreferences:[...(current.toolPreferences??[]).filter(p=>p.tool!==tool),{tool,...next}]});appStore.setState({settings});}).catch(fail);};
  const down=(e:ReactPointerEvent<HTMLDivElement>)=>{
    if(e.button!==0||!editable||state.editor)return false;const found=pick(e.clientX,e.clientY);if(!found)return false;const {page,p,unit}=found;
    if(state.tool==='highlight'||state.tool==='underline')return false;
    const hit=[...state.annotations].reverse().find(a=>a.page===page&&hitAnnotation(a,p,5/unit));
    if(state.tool==='select'){
      if(!hit){session.store.setState({selectedId:undefined});return false;}
      session.store.setState({selectedId:hit.id});if(textType(hit))return true;
      if(e.detail>=2&&(hit.type==='note'||hit.type==='freetext')){session.store.setState({editor:{annotation:hit,isNew:false,text:hit.type==='note'?hit.contents??'':hit.text??''}});return true;}
      const resize=Math.hypot(p[0]-hit.rect[2],p[1]-hit.rect[1])<10/unit;
      gesture.current={pointer:e.pointerId,page,start:p,points:[p],original:hit,mode:resize?'resize':'move',erase:new Set(),scale:unit};
    }else if(state.tool==='note'||state.tool==='freetext'){
      const type=state.tool,rect:Box=[p[0],p[1]- (type==='note'?18:70),p[0]+(type==='note'?20:180),p[1]];
      const annotation={...baseAnnotation(session.handle.docHash,page,type,rect,settings.author,style),...(type==='note'?{anchor:p,contents:''}:{text:'',fontSize:14,fontFamily:'sans-serif',alignment:'left' as const})};session.store.setState({editor:{annotation,isNew:true,text:''},selectedId:undefined});return true;
    }else gesture.current={pointer:e.pointerId,page,start:p,points:[p],mode:state.tool==='eraser'?'erase':'draw',erase:new Set(hit&&!textType(hit)?[hit.id]:[]),scale:unit};
    e.currentTarget.setPointerCapture(e.pointerId);session.store.setState({toolPhase:'dragging'});return true;
  };
  const move=(e:ReactPointerEvent<HTMLDivElement>)=>{
    const g=gesture.current;if(!g||g.pointer!==e.pointerId)return false;const found=pick(e.clientX,e.clientY,g.page);if(!found)return true;const {p}=found;
    if(g.mode==='erase'){for(const a of state.annotations)if(a.page===g.page&&!textType(a)&&hitAnnotation(a,p,8/g.scale))g.erase.add(a.id);return true;}
    if(g.original){const r=g.original.rect,dx=p[0]-g.start[0],dy=p[1]-g.start[1],rect:Box=g.mode==='move'?[r[0]+dx,r[1]+dy,r[2]+dx,r[3]+dy]:[r[0],Math.min(p[1],r[3]-1),Math.max(p[0],r[0]+1),r[3]];g.preview=transformAnnotation(g.original,rect);}
    else {const events=e.nativeEvent.getCoalescedEvents?.()??[];for(const v of events){const f=pick(v.clientX,v.clientY,g.page);if(f)g.points.push(f.p);}g.points.push(p);if(g.points.length>10000)g.points=simplify(g.points,.2/g.scale);
      const type=state.tool as 'ink'|'rect'|'arrow',rect=bounds(type==='ink'?g.points:[g.start,p]);g.preview={...baseAnnotation(session.handle.docHash,g.page,type,rect,settings.author,style),...(type==='ink'?{paths:[g.points],width:style.strokeWidth}:type==='arrow'?{from:g.start,to:p,strokeWidth:style.strokeWidth,endStyle:'arrow' as const}:{strokeWidth:style.strokeWidth})};}
    setPreview(g.preview);return true;
  };
  const up=(e:ReactPointerEvent<HTMLDivElement>)=>{
    const g=gesture.current;if(!g||g.pointer!==e.pointerId)return false;move(e);let mutations:Mutation[]=[];
    if(g.mode==='erase')mutations=[...g.erase].map(id=>({type:'annotation.remove',id}));
    else if(g.preview){const a=g.preview;if(a.type==='ink')a.paths=a.paths!.map(p=>simplify(p,.5/g.scale));if(!g.original||JSON.stringify(a.rect)!==JSON.stringify(g.original.rect))mutations=[{type:'annotation.put',value:a}];}
    cancel();session.store.setState({toolPhase:'commit'});void session.execute(mutations).catch(fail).finally(()=>session.store.setState({toolPhase:state.tool==='select'?'idle':'armed'}));return true;
  };
  const annotate=async(selection:Selection|undefined,getText:(page:number,signal:AbortSignal)=>Promise<PageText>,type:'highlight'|'underline')=>{
    if(!selection||!editable)return;const groupId=crypto.randomUUID(),values:Annotation[]=[];const abort=new AbortController();
    for(let p=Math.min(selection.anchor.page,selection.focus.page);p<=Math.max(selection.anchor.page,selection.focus.page);p++){const text=await getText(p,abort.signal),range=selectedRange(selection,text);if(!range||text.quality==='unavailable')throw Error('选区文字变化或含不可靠页面，请重新选择');const value=textAnnotation(session.handle.docHash,text,range,type,settings.author,{...style,opacity:type==='highlight'?.35:1},groupId);if(value)values.push(value);if(values.length>200)throw Error('一次最多标注 200 页');}
    if(!values.length)return;const target=state.annotations.find(a=>a.id===reanchor.current);const changes:Mutation[]=target?state.annotations.filter(a=>a.id===target.id||target.groupId&&a.groupId===target.groupId).map(a=>({type:'annotation.remove',id:a.id})):[];
    changes.push(...values.map(value=>({type:'annotation.put' as const,value})));await session.execute(changes);session.store.setState({selectedId:values[0].id});reanchor.current=undefined;
  };
  return {state,style,editable,preview,setTool,setStyle,down,move,up,cancel,annotate,fail,reanchor,gesture,select:(id:string)=>session.store.setState({selectedId:id}),edit:(a:Annotation)=>session.store.setState({editor:{annotation:a,isNew:false,text:a.type==='freetext'?a.text??'':a.contents??''}})};
}
