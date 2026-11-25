import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('detects the old proportional prefix-width counterexample',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../../../docs/fixtures/generated/tj-counterexample.json',import.meta.url),'utf8'));
 const glyphs=fixture.glyphs as {start:number;advance:number}[];
 const total=glyphs.reduce((sum,g)=>sum+g.advance,0),actualEnd=glyphs.at(-1)!.start+glyphs.at(-1)!.advance,span=actualEnd-glyphs[0].start;
 let prefix=0;const errors=glyphs.map(g=>{const predicted=glyphs[0].start+prefix/total*span;prefix+=g.advance;return Math.abs(predicted-g.start)/g.advance;});
 expect(Math.max(...errors)).toBeGreaterThan(.15);
});
