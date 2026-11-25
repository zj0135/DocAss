import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {importManualOcr} from './manual-ocr.mjs';
import {PDFDocument,PDFName,PDFNumber,PDFArray,PDFOperator,beginText,endText,setFontAndSize,moveText,degrees} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'generated');await mkdir(out,{recursive:true});
const fontBytes=await readFile(path.join(root,'fonts/NotoSansCJKsc-Regular.otf'));
const sourceFont=fontkit.create(fontBytes),fontHash=createHash('sha256').update(fontBytes).digest('hex');
const doc=await PDFDocument.create();doc.registerFontkit(fontkit);doc.setCreationDate(new Date('2026-11-25T00:00:00Z'));doc.setModificationDate(new Date('2026-11-25T00:00:00Z'));doc.setProducer('DocAss deterministic fixtures v1');
const font=await doc.embedFont(fontBytes,{subset:true}),truth=[],texts=[];
const cases=[['chinese','中文文档标注测试数据页面坐标验证'],['mixed','DocAss 中文 PDF 123 ABC 数据'],['tj','ABCDEF'],['rotate','页面旋转测试 ABC'],['crop','CropBox 偏移测试'],['userunit','UserUnit 坐标测试'],['unicode','ofﬁce é 😀'],['rtl','אבג العربية'],['vertical','竖排文字测试']];
for(const [index,[name,sample]]of cases.entries()){
 const page=doc.addPage([595,842]);let pageText='';
 for(let row=0;row<12;row++){
  let x=name==='vertical'?100+row*30:60,y=name==='vertical'?760:760-row*42;const fontSize=14;
  for(const char of sample){
   const glyph=sourceFont.glyphForCodePoint(char.codePointAt(0)),bbox=glyph.bbox,scale=fontSize/sourceFont.unitsPerEm;
   page.drawText(char,{x,y,size:fontSize,font});
   if(!/\s/u.test(char))truth.push({case:name,page:index+1,text:char,utf16Start:pageText.length,utf16End:pageText.length+char.length,glyphId:glyph.id,missingGlyph:glyph.id===0,quad:[x+bbox.minX*scale,y+bbox.minY*scale,x+bbox.maxX*scale,y+bbox.minY*scale,x+bbox.maxX*scale,y+bbox.maxY*scale,x+bbox.minX*scale,y+bbox.maxY*scale],baseline:[x,y,x+glyph.advanceWidth*scale,y]});
   pageText+=char;
   if(name==='vertical')y-=24;else x+=glyph.advanceWidth*scale+(name==='tj'?(pageText.length%2===0?-3:3):0);
  }pageText+='\n';
 }
 if(name==='rotate')page.setRotation(degrees(90));if(name==='crop')page.setCropBox(40,80,500,680);if(name==='userunit')page.node.set(PDFName.of('UserUnit'),PDFNumber.of(2));
 texts.push({case:name,page:index+1,text:pageText});
}
// A true TJ operator counterexample with independently known advance and spacing.
const counter=doc.addPage([595,842]),items=PDFArray.withContext(doc.context);let x=50;const tj=[];
for(const [i,char]of [...'ABCDEF'].entries()) {const advance=sourceFont.glyphForCodePoint(char.codePointAt(0)).advanceWidth/sourceFont.unitsPerEm*20;items.push(font.encodeText(char));tj.push({char,start:x,advance});x+=advance;const adjustment=i%2===0?-180:180;items.push(PDFNumber.of(adjustment));x-=adjustment*20/1000;}
counter.pushOperators(beginText(),setFontAndSize(counter.node.newFontDictionary(font.name,font.ref),20),moveText(50,700),PDFOperator.of('TJ',[items]),endText());
await writeFile(path.join(out,'native-matrix.pdf'),await doc.save({useObjectStreams:false}));
await writeFile(path.join(out,'native-truth.json'),JSON.stringify({generator:'font design outlines + explicit placements, independent of PDF.js/PdfPig',fontHash,truth,texts},null,2));
await writeFile(path.join(out,'tj-counterexample.json'),JSON.stringify({page:10,size:20,glyphs:tj},null,2));
// Positive Unicode samples use fonts which actually contain the requested glyphs.
const unicode=await PDFDocument.create();unicode.registerFontkit(fontkit);unicode.setCreationDate(new Date('2026-11-25T00:00:00Z'));unicode.setModificationDate(new Date('2026-11-25T00:00:00Z'));
const unicodeTruth=[];
for(const [file,text,direction] of [['NotoSansHebrew-Regular.ttf','אבגדה שלום','rtl'],['NotoSansArabic-Regular.ttf','العربية مرحبا','rtl'],['NotoEmoji.ttf','😀😁😂😃😄','ltr']]) {
 const bytes=await readFile(path.join(root,'fonts',file));const design=fontkit.create(bytes),embedded=await unicode.embedFont(bytes,{subset:true}),page=unicode.addPage([595,842]);
 const run=design.layout(text),scale=24/design.unitsPerEm;let cursor=60;
 page.drawText(text,{x:60,y:700,size:24,font:embedded});
 const glyphs=run.glyphs.map((glyph,i)=>{const p=run.positions[i],b=glyph.bbox,x=cursor+p.xOffset*scale,y=700+p.yOffset*scale;cursor+=p.xAdvance*scale;return {glyphId:glyph.id,codePoints:glyph.codePoints,missingGlyph:glyph.id===0,quad:[x+b.minX*scale,y+b.minY*scale,x+b.maxX*scale,y+b.minY*scale,x+b.maxX*scale,y+b.maxY*scale,x+b.minX*scale,y+b.maxY*scale]};});
 if(glyphs.some(g=>g.missingGlyph))throw Error(`Missing positive Unicode glyph in ${file}`);
 unicodeTruth.push({file,fontHash:createHash('sha256').update(bytes).digest('hex'),text,direction,glyphs});
}
await writeFile(path.join(out,'unicode-positive.pdf'),await unicode.save({useObjectStreams:false}));await writeFile(path.join(out,'unicode-positive-truth.json'),JSON.stringify(unicodeTruth,null,2));
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return(crc^0xffffffff)>>>0;}
function chunk(type,bytes){const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(bytes.length);crc.writeUInt32BE(crc32(Buffer.concat([name,bytes])));return Buffer.concat([size,name,bytes,crc]);}
// Author-designed block glyphs: positions come from the source grid, never from OCR.
const patterns={A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110']};
const width=1000,height=1000,pixels=Buffer.alloc((width*3+1)*height,255),ocr=[];for(let y=0;y<height;y++)pixels[y*(width*3+1)]=0;
for(let i=0;i<120;i++){const char='ABCD'[i%4],left=30+(i%15)*64,top=30+Math.floor(i/15)*100,scale=7;for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(patterns[char][y][x]==='1')for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const offset=(top+y*scale+dy)*(width*3+1)+1+(left+x*scale+dx)*3;pixels.fill(0,offset,offset+3);}ocr.push({text:char,quad:[left,top,left+35,top,left+35,top+49,left,top+49]});}
const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);await writeFile(path.join(out,'ocr-grid.png'),png);await writeFile(path.join(out,'ocr-grid-truth.json'),JSON.stringify({source:'explicit author-designed bitmap grid',humanReviewed:false,glyphs:ocr},null,2));
for(const pages of [300,500]){const performance=await PDFDocument.create();performance.setCreationDate(new Date('2026-11-25T00:00:00Z'));performance.setModificationDate(new Date('2026-11-25T00:00:00Z'));for(let i=0;i<pages;i++){const page=performance.addPage([595,842]);page.drawText(`DocAss performance fixture page ${i+1}`,{x:36,y:790,size:14});}await writeFile(path.join(out,`performance-${pages}.pdf`),await performance.save({useObjectStreams:false}));}
for(const kind of ['scanned','mixed','blank']){const d=await PDFDocument.create();d.setCreationDate(new Date('2026-11-25T00:00:00Z'));d.setModificationDate(new Date('2026-11-25T00:00:00Z'));const p=d.addPage([595,842]);if(kind!=='blank'){const image=await d.embedPng(png);p.drawImage(image,{x:30,y:120,width:535,height:535});}if(kind==='mixed')p.drawText('Native header above scanned body',{x:30,y:790,size:14});await writeFile(path.join(out,kind+'.pdf'),await d.save({useObjectStreams:false}));}
await writeFile(path.join(out,'broken.pdf'),'%PDF-1.7\nintentionally truncated\n');
const qpdf=path.join(root,'downloads/qpdf/qpdf-12.3.2-msvc64/bin/qpdf.exe');
execFileSync(qpdf,['--static-id','--static-aes-iv','--encrypt','fixture-reader','fixture-owner','128','--use-aes=y','--',path.join(out,'mixed.pdf'),path.join(out,'password.pdf')],{windowsHide:true});
const manualOcrGlyphs=await importManualOcr(root,out);
const manifest=[];for(const file of (await readdir(out)).sort()){if(file==='manifest.json')continue;const bytes=await readFile(path.join(out,file));manifest.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(path.join(out,'manifest.json'),JSON.stringify({generatorVersion:2,fontHash,nonWhitespaceGlyphs:truth.length,missingGlyphs:truth.filter(g=>g.missingGlyph).length,ocrGlyphs:ocr.length,manualOcrGlyphs,files:manifest},null,2)+'\n');console.log(JSON.stringify({nonWhitespaceGlyphs:truth.length,missingGlyphs:truth.filter(g=>g.missingGlyph).length,ocrGlyphs:ocr.length,manualOcrGlyphs,files:manifest.length}));
