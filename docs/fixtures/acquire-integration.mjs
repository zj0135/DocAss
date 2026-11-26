import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Git blob IDs pin original upstream bytes; no recognition output is used as truth.
const samples=[
 {repo:'tesseract-ocr/test',blob:'adac046dba073285f945446d5ad557894da82c9b',file:'phototest.tif',source:'testing/phototest.tif',license:'Apache-2.0'},
 {repo:'tesseract-ocr/test',blob:'02d3a77cbb52326e0a1e5eef78f8e28f20eb122b',file:'phototest.txt',source:'testing/phototest.txt',license:'Apache-2.0'},
 {repo:'PaddlePaddle/PaddleOCR',blob:'ed91b8c5ca2a348fe7b138e83114ff81ecb107de',file:'11.jpg',source:'release/2.7/doc/imgs/11.jpg',license:'Apache-2.0 repository sample; product image is supplemental, not a scanned-page corpus'},
 {repo:'PaddlePaddle/PaddleOCR',blob:'3cd2e79182045726c46c68673fc0998fae927d17',file:'12.jpg',source:'release/2.7/doc/imgs/12.jpg',license:'Apache-2.0 repository sample; outdoor photo is supplemental, not a scanned-page corpus'}
];
const root=new URL('./downloads/real-ocr/',import.meta.url);await mkdir(root,{recursive:true});const report=[];
for(const item of samples){let error;for(let attempt=0;attempt<3;attempt++)try{
 const target=new URL(item.file,root),gitHash=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');let bytes=await readFile(target).catch(()=>null);
 if(!bytes||gitHash(bytes)!==item.blob){const response=await fetch(`https://api.github.com/repos/${item.repo}/git/blobs/${item.blob}`,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('HTTP '+response.status);const value=await response.json();bytes=Buffer.from(value.content,'base64');if(gitHash(bytes)!==item.blob)throw Error('Git blob hash mismatch');await writeFile(target,bytes);}
 report.push({...item,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});error=undefined;break;
}catch(e){error=e;}if(error)throw error;}
await writeFile(new URL('manifest.json',root),JSON.stringify(report,null,2));console.log(report.map(r=>({file:r.file,bytes:r.bytes,sha256:r.sha256})));
// Historical NIST publication, used only as a real PDF extraction fixture.
// The official PDF includes a withdrawal notice; it is not current security advice.
const publication={file:'nist-ir8286.pdf',source:'https://nvlpubs.nist.gov/nistpubs/ir/2020/NIST.IR.8286.pdf',sha256:'a4df1552e1241cfa581e5e2b4005a72591314620fc955648aae0b0a73e717265',license:'https://www.nist.gov/open/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series-publications'};
const target=new URL('./downloads/'+publication.file,import.meta.url),hash=bytes=>createHash('sha256').update(bytes).digest('hex');let bytes=await readFile(target).catch(()=>null);
if(!bytes||hash(bytes)!==publication.sha256){const response=await fetch(publication.source,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('NIST HTTP '+response.status);bytes=Buffer.from(await response.arrayBuffer());if(hash(bytes)!==publication.sha256)throw Error('NIST fixture changed; inspect upstream bytes before updating the pin');await writeFile(target,bytes);}
await writeFile(new URL('./downloads/nist-manifest.json',import.meta.url),JSON.stringify({...publication,bytes:bytes.length},null,2));console.log({file:publication.file,bytes:bytes.length,sha256:publication.sha256});
