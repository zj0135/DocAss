import { useState,useEffect } from 'react';
import type { PagedDocument } from './types';
import type { PageInfo } from '../contracts';
import { PageView } from './PageView';
export function Thumbnails({document,current,onSelect}:{document:PagedDocument;current:number;onSelect:(page:number)=>void}){
  const [top,setTop]=useState(0),[infos,setInfos]=useState<Record<number,PageInfo>>({});
  const first=Math.max(1,Math.floor(top/230)-1),last=Math.min(document.pageCount,first+7);
  useEffect(()=>{let active=true;void(async()=>{for(let page=first;page<=last;page++){const info=await document.getPageInfo(page);if(active)setInfos(old=>({...old,[page]:info}));}})().catch(()=>{});return()=>{active=false;};},[first,last,document]);
  return <aside aria-label="缩略图" className="w-[220px] shrink-0 bg-white border-r overflow-auto" onScroll={e=>setTop(e.currentTarget.scrollTop)}><div style={{height:document.pageCount*230,position:'relative'}}>
    {Array.from({length:last-first+1},(_,i)=>first+i).map(page=>{const info=infos[page];return <button key={page} aria-label={`跳转第 ${page} 页`} onClick={()=>onSelect(page)} style={{position:'absolute',top:(page-1)*230,left:15,width:190,height:225,border:page===current?'2px solid #3b82f6':'2px solid transparent',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:8}}>
      {info&&<PageView document={document} info={info} scale={180/Math.max(info.width,info.height)*72/96} rotation={0} dpr={1} priority={100+page} thumbnail/>}<span className="text-xs text-slate-500">{page}</span>
    </button>;})}
  </div></aside>;
}
