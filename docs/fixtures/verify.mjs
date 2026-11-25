import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {getDocument,PasswordResponses} from 'pdfjs-dist/legacy/build/pdf.mjs';
const root=import.meta.dirname,out=new URL('./generated/',import.meta.url);
const before=await readFile(new URL('manifest.json',out),'utf8');
execFileSync(process.execPath,[root+'/generate.mjs'],{stdio:'inherit',windowsHide:true});
assert.equal(await readFile(new URL('manifest.json',out),'utf8'),before,'all fixture hashes reproduce');
const manifest=JSON.parse(before),truth=JSON.parse(await readFile(new URL('native-truth.json',out)));
assert.ok(truth.truth.filter(g=>!g.missingGlyph).length>=1000);
assert.ok(manifest.manualOcrGlyphs>=100);
const load=async(file,password)=>{const task=getDocument({data:new Uint8Array(await readFile(new URL(file,out))),password,verbosity:0});try{const doc=await task.promise;doc.dispose=()=>task.destroy();return doc;}catch(error){await task.destroy();throw error;}};
await assert.rejects(()=>load('password.pdf'),e=>e.code===PasswordResponses.NEED_PASSWORD);
await assert.rejects(()=>load('password.pdf','wrong'),e=>e.code===PasswordResponses.INCORRECT_PASSWORD);
const encrypted=await load('password.pdf','fixture-reader');assert.equal(encrypted.numPages,1);await encrypted.dispose();
const summaries=[];
for(const [file,pages]of [['native-matrix.pdf',10],['unicode-positive.pdf',3],['performance-300.pdf',300],['performance-500.pdf',500],['scanned.pdf',1],['mixed.pdf',1],['blank.pdf',1]]) {
 const doc=await load(file);assert.equal(doc.numPages,pages);const page=await doc.getPage(1),text=(await page.getTextContent()).items.filter(v=>'str'in v).map(v=>v.str).join('');summaries.push({file,pages,textLength:text.length});
 if(['scanned.pdf','blank.pdf'].includes(file))assert.equal(text.length,0);if(file==='mixed.pdf')assert.match(text,/Native header/);await doc.dispose();
}
await assert.rejects(()=>load('broken.pdf'));
const summary={ok:true,reproducible:true,geometryGlyphs:manifest.nonWhitespaceGlyphs-manifest.missingGlyphs,manualOcrGlyphs:manifest.manualOcrGlyphs,passwordPdf:true,unicodePositive:true,summaries};
await writeFile(new URL('../../artifacts/fixture-verification.json',import.meta.url),JSON.stringify(summary,null,2));console.log(summary);
