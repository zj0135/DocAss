import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {PDFDocument,PDFName,PDFNumber,degrees} from 'pdf-lib';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'docs/fixtures/generated'),samples=path.join(root,'artifacts/ocr-samples');
execFileSync(path.join(root,'src/host/DocAss.Host/bin/Release/net11.0-windows/win-x64/DocAss.Host.exe'),['--generate-ocr-samples',samples],{windowsHide:true});await mkdir(out,{recursive:true});
const english=await readFile(path.join(samples,'ocr-english.png'));
for(const [file,count] of [['ocr-reading.pdf',3],['ocr-geometry.pdf',4]]){
 const doc=await PDFDocument.create();doc.setCreationDate(new Date('2026-11-26T00:00:00Z'));doc.setModificationDate(new Date('2026-11-26T00:00:00Z'));const png=await doc.embedPng(english);
 for(let i=0;i<count;i++){const page=doc.addPage(i===3?[2400,3200]:[595.08,842.04]);if(!(file==='ocr-reading.pdf'&&i===2))page.drawImage(png,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});if(file==='ocr-reading.pdf'&&i===1)page.drawText('42',{x:20,y:820,size:12});if(file==='ocr-geometry.pdf'){if(i===0)page.setRotation(degrees(90));if(i===1)page.setCropBox(20,40,550,780);if(i===2)page.node.set(PDFName.of('UserUnit'),PDFNumber.of(2));}}
 await writeFile(path.join(out,file),await doc.save({useObjectStreams:false}));
}
for(const name of ['english','chinese'])await writeFile(path.join(out,'ocr-'+name+'.png'),await readFile(path.join(samples,'ocr-'+name+'.png')));
const truth=JSON.parse(await readFile(path.join(samples,'ocr-synthetic-truth.json'),'utf8'));
const acceptance=await PDFDocument.create();acceptance.setCreationDate(new Date('2026-11-26T00:00:00Z'));acceptance.setModificationDate(new Date('2026-11-26T00:00:00Z'));
for(const item of truth.pages){const bytes=await readFile(path.join(samples,item.image)),image=await acceptance.embedPng(bytes);acceptance.addPage([truth.width*72/truth.dpi,truth.height*72/truth.dpi]).drawImage(image,{x:0,y:0,width:truth.width*72/truth.dpi,height:truth.height*72/truth.dpi});await writeFile(path.join(out,item.image),bytes);}
await writeFile(path.join(out,'ocr-acceptance.pdf'),await acceptance.save({useObjectStreams:false}));await writeFile(path.join(out,'ocr-synthetic-truth.json'),JSON.stringify(truth,null,2)+'\n');
console.log('Generated OCR reading, geometry and language fixtures. Raster truth originates in Verification/OcrSamples.cs, never in OCR output.');
