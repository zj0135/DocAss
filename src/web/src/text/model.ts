import { validate } from '../contracts';
import type { Glyph,PageText,Quad,TextLine,TextSpan,TextRange } from '../contracts';
import type { NativePage } from '../documents/types';
export const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});
const words=new Intl.Segmenter(undefined,{granularity:'word'});
export function boundaries(text:string){return [...graphemes.segment(text)].map(s=>s.index).concat(text.length);}
export function snap(text:string,offset:number,end=false){const b=boundaries(text);return end?b.find(x=>x>=offset)??text.length:b.filter(x=>x<=offset).at(-1)??0;}
export function wordRange(text:string,offset:number):TextRange{const part=[...words.segment(text)].find(s=>offset>=s.index&&offset<s.index+s.segment.length);return part?{start:part.index,end:part.index+part.segment.length}:{start:0,end:text.length};}
function box(glyphs:Glyph[]):Quad {const x=glyphs.flatMap(g=>[g.quad[0],g.quad[2],g.quad[4],g.quad[6]]),y=glyphs.flatMap(g=>[g.quad[1],g.quad[3],g.quad[5],g.quad[7]]),x0=Math.min(...x),x1=Math.max(...x),y0=Math.min(...y),y1=Math.max(...y);return [x0,y0,x1,y0,x1,y1,x0,y1];}
const center=(g:Glyph)=>[(g.quad[0]+g.quad[2]+g.quad[4]+g.quad[6])/4,(g.quad[1]+g.quad[3]+g.quad[5]+g.quad[7])/4];
const height=(g:Glyph)=>Math.max(.01,Math.max(g.quad[1],g.quad[3],g.quad[5],g.quad[7])-Math.min(g.quad[1],g.quad[3],g.quad[5],g.quad[7]));
const rtl=(s:string)=>/[\u0590-\u08ff]/u.test(s);
const cjk=(s:string)=>/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(s);
async function hash(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function buildPageText(raw:NativePage):Promise<PageText>{
  validate('NativePage',raw);
  validate('PageInfo',raw.pageInfo);raw.glyphs.forEach(g=>validate('Glyph',g));
  // Geometric clustering in unrotated page space. Detect upright vertical runs
  // before horizontal baselines; no width measurement or second text source is used.
  const groups:Glyph[][]=[],remaining=new Set(raw.glyphs);
  const sorted=[...raw.glyphs].sort((a,b)=>center(a)[0]-center(b)[0]||center(b)[1]-center(a)[1]);
  for(const g of sorted){if(!remaining.has(g)||!cjk(g.text))continue;const col=sorted.filter(v=>remaining.has(v)&&cjk(v.text)&&Math.abs(center(v)[0]-center(g)[0])<height(g)*.3).sort((a,b)=>center(b)[1]-center(a)[1]);
    // A true upright vertical run has close consecutive origins and no competing
    // same-baseline neighbors. Wide leading in horizontal prose is not vertical.
    if(col.length>=3&&col.slice(1).every((v,i)=>{const gap=center(col[i])[1]-center(v)[1];return gap>height(v)*.7&&gap<height(v)*2.2;})&&!raw.glyphs.some(v=>v!==g&&Math.abs(v.baseline[1]-g.baseline[1])<1&&Math.abs(v.baseline[0]-g.baseline[0])<height(g)*1.5)) {groups.push(col);col.forEach(v=>remaining.delete(v));}
  }
  for(const g of [...remaining].sort((a,b)=>b.baseline[1]-a.baseline[1]||a.baseline[0]-b.baseline[0])){
    const angle=Math.atan2(g.baseline[3]-g.baseline[1],g.baseline[2]-g.baseline[0]);
    const line=groups.find(line=>{const a=line[0],other=Math.atan2(a.baseline[3]-a.baseline[1],a.baseline[2]-a.baseline[0]);return Math.abs(angle-other)<.08&&Math.abs(-(g.baseline[0]-a.baseline[0])*Math.sin(angle)+(g.baseline[1]-a.baseline[1])*Math.cos(angle))<Math.max(height(g),height(a))*.3;});
    if(line)line.push(g);else groups.push([g]);
  }
  groups.sort((a,b)=>Math.max(...b.map(g=>center(g)[1]))-Math.max(...a.map(g=>center(g)[1]))||center(a[0])[0]-center(b[0])[0]);
  let text='';const spans:TextSpan[]=[],lines:TextLine[]=[];
  for(const group of groups){
    const vertical=group.length>2&&group.every(g=>Math.abs(center(g)[0]-center(group[0])[0])<height(g)*.3)&&Math.max(...group.map(g=>center(g)[1]))-Math.min(...group.map(g=>center(g)[1]))>height(group[0])*2;
    const direction:TextLine['direction']=vertical?'ttb':group.filter(g=>rtl(g.text)).length>group.length/2?'rtl':'ltr';
    const a=group[0],angle=Math.atan2(a.baseline[3]-a.baseline[1],a.baseline[2]-a.baseline[0]);
    const projection=(g:Glyph)=>(g.baseline[0]+g.baseline[2])/2*Math.cos(angle)+(g.baseline[1]+g.baseline[3])/2*Math.sin(angle);
    group.sort((a,b)=>vertical?center(b)[1]-center(a)[1]:(direction==='rtl'?-1:1)*(projection(a)-projection(b)));
    const id=group[0].id,start=text.length;
    const append=(s:string,glyphIds:string[],kind:TextSpan['kind'])=>{const start=text.length;text+=s;spans.push({range:{start,end:text.length},glyphIds,kind,lineId:id});};
    for(let i=0;i<group.length;i++){
      const g=group[i],prev=group[i-1];
      if(prev&&!vertical){
        const low=Math.min(projection(prev),projection(g)),high=Math.max(projection(prev),projection(g));
        const explicit=(raw.spaces??[]).filter(s=>{const b=s.baseline,t=(b[0]+b[2])/2*Math.cos(angle)+(b[1]+b[3])/2*Math.sin(angle);return t>low&&t<high&&Math.abs(-(b[0]-g.baseline[0])*Math.sin(angle)+(b[1]-g.baseline[1])*Math.cos(angle))<height(g)*.3;});
        const gap=direction==='rtl'?prev.baseline[0]-g.baseline[2]:g.baseline[0]-prev.baseline[2];
        if(explicit.length)append(explicit.map(s=>s.text.replace(/[\r\n]/g,' ')).join(''),[],'space');
        else if(gap>Math.min(height(g),height(prev))*.4&&!cjk(prev.text)&&!cjk(g.text))append(' ',[],'space');
      }
      append(g.text,[g.id],'glyph');
    }
    lines.push({id,range:{start,end:text.length},quad:box(group),direction,glyphIds:group.map(g=>g.id)});
    if(group!==groups.at(-1))append('\n',[],'lineBreak');
  }
  // Merge spans at grapheme boundaries, including a base + separate combining glyph.
  const merged:TextSpan[]=[];
  let spanIndex=0;
  for(const segment of graphemes.segment(text)){
    const start=segment.index,end=start+segment.segment.length;
    while(spanIndex<spans.length&&spans[spanIndex].range.end<=start)spanIndex++;
    const parts:TextSpan[]=[];for(let i=spanIndex;i<spans.length&&spans[i].range.start<end;i++)parts.push(spans[i]);
    const glyphIds=[...new Set(parts.flatMap(s=>s.glyphIds))];merged.push({range:{start,end},glyphIds,kind:glyphIds.length?'glyph':segment.segment==='\n'?'lineBreak':'space',lineId:parts[0].lineId});
  }
  const fingerprint=await hash(raw.profileFingerprint+':lines-graphemes-v1');
  const result:PageText={page:raw.pageInfo.page,pageBox:raw.pageInfo.pageBox,userUnit:raw.pageInfo.userUnit,textRevision:await hash(JSON.stringify({text,glyphs:raw.glyphs,spans:merged,lines,profile:fingerprint,status:raw.status})),source:'native',text,glyphs:raw.glyphs,spans:merged,lines,quality:raw.status==='ready'?'verified':'unavailable',profileFingerprint:fingerprint};
  return validate<PageText>('PageText',result);
}
export function rangeQuads(page:PageText,ranges:TextRange[]){const ids=new Set(page.spans.filter(s=>ranges.some(r=>s.range.start<r.end&&s.range.end>r.start)).flatMap(s=>s.glyphIds));return page.glyphs.filter(g=>ids.has(g.id)).map(g=>g.quad);}
export function copyText(pages:{page:PageText;range:TextRange}[]){return pages.map(({page,range})=>page.text.slice(snap(page.text,range.start),snap(page.text,range.end,true)).replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\n(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu,'$1').replace(/([\p{L}\p{N}])\n(?=[\p{L}\p{N}])/gu,'$1 ').replace(/\u00ad\n(?=\p{L})/gu,'')).join('\n');}
