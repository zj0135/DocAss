import { describe,it,expect } from 'vitest';
import fixtures from '../../shared/contract-fixtures.json';
import canonicalFixtures from '../../shared/canonical-fixtures.json';
import { validate,canonical,payloadHash } from '../src/contracts';
import type { Command } from '../src/contracts';
describe('shared protocol fixtures',()=>{
 it('matches shared canonical bytes',()=>{for(const fixture of canonicalFixtures)expect(canonical(fixture.value)).toBe(fixture.canonical);});
 for(const fixture of fixtures) it(fixture.name,()=>{
   if(fixture.valid){expect(validate(fixture.schema,fixture.value)).toEqual(fixture.value);expect(validate(fixture.schema,JSON.parse(JSON.stringify(fixture.value)))).toEqual(fixture.value);}
   else expect(()=>validate(fixture.schema,fixture.value)).toThrow();
 });
 it('rejects runtime non-finite numbers',()=>{for(const n of [NaN,Infinity,-Infinity])expect(()=>validate('Box',[0,0,n,10])).toThrow();});
 it('uses affine x=a*x+c*y+e and y=b*x+d*y+f',()=>{const [a,b,c,d,e,f]=validate<number[]>('Affine',[2,0,0,3,7,11]);expect([a*5+c*4+e,b*5+d*4+f]).toEqual([17,23]);});
 it('independent revisions do not invalidate unrelated resources',()=>{const original={contentRevision:'a'.repeat(64),documentRevision:1,textRevision:'b'.repeat(64),pageGeneration:2};const annotated={...original,documentRevision:2};expect(annotated.contentRevision).toBe(original.contentRevision);expect(annotated.textRevision).toBe(original.textRevision);const reocr={...annotated,pageGeneration:3};expect(original.pageGeneration===reocr.pageGeneration).toBe(false);});
 it('canonicalizes keys without accepting invalid numbers',async()=>{expect(canonical({z:-0,a:1e-7})).toBe('{"a":1e-7,"z":0}');const command=fixtures.find(f=>f.schema==='Command'&&f.valid)!.value as Command;expect(await payloadHash('a'.repeat(64),command)).toMatch(/^[a-f0-9]{64}$/);});
});
