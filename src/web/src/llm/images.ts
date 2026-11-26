import type {Box} from '../contracts';
import type {PagedDocument} from '../documents/types';
import {viewport,point} from '../documents/geometry';
export async function cropPage(document:PagedDocument,page:number,rect:Box|undefined,maxEdge:number,signal:AbortSignal){
 const info=await document.getPageInfo(page),box=rect??info.pageBox;
 if(box.some(v=>!Number.isFinite(v))||box[0]<info.pageBox[0]||box[1]<info.pageBox[1]||box[2]>info.pageBox[2]||box[3]>info.pageBox[3]||box[0]>=box[2]||box[1]>=box[3])throw Error('区域必须位于页面内');
 const base=viewport(info,1,0),scale=Math.min(200/96,maxEdge/Math.max(base.width,base.height),Math.sqrt(12000000/(base.width*base.height)));
 const canvas=window.document.createElement('canvas'),view=viewport(info,scale,0);canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
 const crop=window.document.createElement('canvas');
 try{await document.render(page,canvas,scale,0,1,signal);signal.throwIfAborted();const corners=[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]].map(p=>point(view.transform,p as [number,number])),x=Math.max(0,Math.floor(Math.min(...corners.map(p=>p[0])))),y=Math.max(0,Math.floor(Math.min(...corners.map(p=>p[1])))),right=Math.min(canvas.width,Math.ceil(Math.max(...corners.map(p=>p[0])))),bottom=Math.min(canvas.height,Math.ceil(Math.max(...corners.map(p=>p[1]))));crop.width=Math.max(1,right-x);crop.height=Math.max(1,bottom-y);crop.getContext('2d')!.drawImage(canvas,x,y,crop.width,crop.height,0,0,crop.width,crop.height);const blob=await new Promise<Blob>((resolve,reject)=>crop.toBlob(b=>b?resolve(b):reject(Error('无法生成截图')),'image/png'));signal.throwIfAborted();if(blob.size>8*1024*1024)throw Error('图像超过8MiB，请缩小区域');return {blob,rect:box,scale};}
 finally{canvas.width=canvas.height=crop.width=crop.height=0;}
}
export async function imageData(blob:Blob):Promise<string>{const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
