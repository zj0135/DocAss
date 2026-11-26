import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
const root=new URL('./generated/',import.meta.url);await mkdir(root,{recursive:true});
const scan=await readFile(new URL('./generated/ocr-english.png',import.meta.url));
const reports=[];
for(const count of [300,500]){
 const doc=await PDFDocument.create();doc.setCreationDate(new Date('2026-11-26T00:00:00Z'));doc.setModificationDate(new Date('2026-11-26T00:00:00Z'));const font=await doc.embedFont(StandardFonts.Helvetica),image=await doc.embedPng(scan);
 for(let i=1;i<=count;i++){const p=doc.addPage([595,842]);p.drawText(`DocAss integration page ${i}`,{x:36,y:800,size:16,font});for(let j=0;j<22;j++)p.drawText(`Page ${i} paragraph ${j+1}: document evidence, reading and annotation acceptance.`,{x:36,y:760-j*18,size:10,font});p.drawImage(image,{x:36,y:40,width:260,height:250});p.drawRectangle({x:330,y:70,width:180,height:180,color:rgb(.8,.9,1)});p.drawText(`REFERENCE-${i}`,{x:350,y:140,size:14,font});}
 const bytes=await doc.save({useObjectStreams:false}),name=`integration-${count}.pdf`;await writeFile(new URL(name,root),bytes);reports.push({name,pages:count,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
for(let i=1;i<=10;i++){const doc=await PDFDocument.create();doc.setCreationDate(new Date('2026-11-26T00:00:00Z'));doc.setModificationDate(new Date('2026-11-26T00:00:00Z'));for(let p=1;p<=3;p++)doc.addPage([595,842]).drawText(`Document ${i} independent evidence page ${p}`,{x:40,y:760,size:16});await writeFile(new URL(`tab-${i}.pdf`,root),await doc.save());}
const scanned=await PDFDocument.create();scanned.setCreationDate(new Date('2026-11-26T00:00:00Z'));scanned.setModificationDate(new Date('2026-11-26T00:00:00Z'));const image=await scanned.embedPng(scan);for(let page=0;page<300;page++)scanned.addPage([595.08,842.04]).drawImage(image,{x:0,y:0,width:595.08,height:842.04});await writeFile(new URL('integration-scanned-300.pdf',root),await scanned.save({useObjectStreams:false}));
for(const name of [...Array.from({length:10},(_,i)=>`tab-${i+1}.pdf`),'integration-scanned-300.pdf']){const bytes=await readFile(new URL(name,root));reports.push({name,pages:name.startsWith('tab-')?3:300,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(new URL('integration-manifest.json',root),JSON.stringify({source:'Independent deterministic DocAss text and raster fixture; no user data',files:reports},null,2));console.log(reports);
