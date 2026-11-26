import type {OcrRaster,PageInfo} from '../contracts';
import type {PagedDocument} from '../documents/types';
import {inverse,viewport,imagePixelsToPage} from '../documents/geometry';
import {offscreenCanvases,withOffscreen} from '../documents/resources';
export function planRaster(info:PageInfo,image?:{width:number;height:number}):OcrRaster{
 const original=image??{width:info.width*200/72,height:info.height*200/72};
 const ratio=Math.min(1,Math.sqrt(11_980_000/(original.width*original.height)),16380/original.width,16380/original.height);
 const width=Math.ceil(original.width*ratio),height=Math.ceil(original.height*ratio),dpi=image?width*72/info.width:200*ratio;
 return {pageInfo:info,width,height,dpi,rasterToPage:image?imagePixelsToPage(info,width,height):inverse(viewport(info,dpi/96,0).transform),kind:image?'image':'pdf'};
}
// The shared gate bounds offscreen rendering and encoding across all document tabs.
export function renderRaster(document:PagedDocument,raster:OcrRaster,signal:AbortSignal):Promise<Blob>{
 return withOffscreen(signal,async()=>{const canvas=new OffscreenCanvas(1,1),tracked=canvas as unknown as HTMLCanvasElement;if(!offscreenCanvases.allocate(tracked,raster.width,raster.height))throw Error('离屏图像预算不足');try{const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);await document.render(raster.pageInfo.page,tracked,raster.dpi/96,0,1,signal);signal.throwIfAborted();const blob=await canvas.convertToBlob({type:'image/png'});if(blob.size>16*1024*1024)throw Error('识别栅格超过 16 MiB，请降低页面图像复杂度');return blob;}finally{offscreenCanvases.release(tracked);}});
}
