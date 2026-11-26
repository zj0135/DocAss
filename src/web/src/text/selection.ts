import type { PageText,Point,TextRange } from '../contracts';
import { snap } from './model';
export type TextPosition={page:number;offset:number};
export type Selection={anchor:TextPosition;focus:TextPosition;revisions:Record<number,string>};
export function selectedRange(selection:Selection,page:PageText):TextRange|undefined{
  let {anchor,focus}=selection;if(anchor.page>focus.page||anchor.page===focus.page&&anchor.offset>focus.offset)[anchor,focus]=[focus,anchor];
  if(page.page<anchor.page||page.page>focus.page||selection.revisions[page.page]&&selection.revisions[page.page]!==page.textRevision)return;
  return {start:page.page===anchor.page?anchor.offset:0,end:page.page===focus.page?focus.offset:page.text.length};
}
export class HitIndex {
  private page:PageText;private glyphs:Map<string,PageText['glyphs'][number]>;
  constructor(page:PageText){this.page=page;this.glyphs=new Map(page.glyphs.map(g=>[g.id,g]));}
  hit([x,y]:Point):number{
    const distance=(q:number[])=>{const xs=[q[0],q[2],q[4],q[6]],ys=[q[1],q[3],q[5],q[7]];return Math.max(Math.min(...xs)-x,0,x-Math.max(...xs))**2+Math.max(Math.min(...ys)-y,0,y-Math.max(...ys))**2;};
    const line=this.page.lines.reduce<PageText['lines'][number]|undefined>((best,l)=>!best||distance(l.quad)<distance(best.quad)?l:best,undefined);if(!line)return 0;
    const candidates=line.glyphIds.map(id=>this.glyphs.get(id)!).filter(Boolean);const glyph=candidates.reduce((a,b)=>distance(a.quad)<=distance(b.quad)?a:b);
    if(!glyph)return line.range.start;
    const spans=this.page.spans.filter(s=>s.glyphIds.includes(glyph.id)),start=Math.min(...spans.map(s=>s.range.start)),end=Math.max(...spans.map(s=>s.range.end));
    const b=glyph.baseline,dx=b[2]-b[0],dy=b[3]-b[1];
    const t=line.direction==='ttb'?(Math.max(glyph.quad[1],glyph.quad[3],glyph.quad[5],glyph.quad[7])-y)/(Math.max(glyph.quad[1],glyph.quad[3],glyph.quad[5],glyph.quad[7])-Math.min(glyph.quad[1],glyph.quad[3],glyph.quad[5],glyph.quad[7])):((x-b[0])*dx+(y-b[1])*dy)/(dx*dx+dy*dy||1);
    const after=line.direction==='rtl'?t<.5:t>=.5;return snap(this.page.text,after?end:start,after);
  }
}
