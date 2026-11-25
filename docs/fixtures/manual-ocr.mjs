import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync,constants} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// The two requested tar members are complete within this pinned 4 MiB prefix.
// Never extract archive paths to the filesystem or infer polygons from OCR output.
export async function importManualOcr(root,out) {
 const prefix=await readFile(root+'/downloads/chars74k-prefix.tgz');
 assert.equal(createHash('sha256').update(prefix).digest('hex'),'fd2f59f9412c9d6cb238dde9f507f7a15dbec8d141885679bcaff72abc4b5cba');
 const tar=gunzipSync(prefix,{finishFlush:constants.Z_SYNC_FLUSH});
 const base='FullImagesAndAnnotations/FrontalImages/KannadaTables/frontal_0_kannada_table_synthetic';
 const names=[base+'.png',base+'__renamed_to_exclude_from_street_images_set.png.txt'];
 const files=new Map();let longName;
 for(let offset=0;offset+512<=tar.length;) {
   const header=tar.subarray(offset,offset+512),size=parseInt(header.subarray(124,136).toString().replace(/\0.*$/s,'').trim()||'0',8);
   if(!Number.isFinite(size)||offset+512+size>tar.length)break;
   const name=longName??header.subarray(0,100).toString().replace(/\0.*$/s,'');longName=undefined;
   const bytes=tar.subarray(offset+512,offset+512+size);
   if(header[156]===76)longName=bytes.toString().replace(/\0.*$/s,'');else if(names.includes(name))files.set(name,bytes);
   offset+=512+Math.ceil(size/512)*512;if(files.size===names.length)break;
 }
 assert.equal(files.size,2,'complete source image and annotations');
 const png=files.get(names[0]),annotations=files.get(names[1]),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 const glyphs=[];
 for(const [index,line] of annotations.toString('utf8').trim().split(/\r?\n/).entries()) {
   const [polygon,text,flag1,flag2]=line.split(';');
   const unique=[...new Set(polygon.split(',').filter(Boolean))].map(point=>point.split(':').map(Number));
   // Retain existing four-vertex annotations verbatim; do not turn irregular polygons into invented boxes.
   if(unique.length!==4||flag1!=='True'||flag2!=='True'||!text.trim())continue;
   if(unique.some(([x,y])=>!Number.isFinite(x+y)||x<0||y<0||x>width||y>height))continue;
   glyphs.push({sourceLine:index+1,text,quad:unique.flat()});
 }
 assert.ok(glyphs.length>=100,`only ${glyphs.length} original manual quads`);
 const selected=glyphs.slice(0,120);
 await writeFile(out+'/ocr-manual.png',png);
 const provenance={source:'Chars74K: de Campos, Babu and Varma, VISAPP 2009',sourceUrl:'https://teodecampos.github.io/chars74k/',annotationOrigin:'dataset volunteer annotations; no new human review claimed',subset:'Kannada printed character table; compound symbols are character instances',coordinateSystem:'original image pixels, original polygon order',width,height,sourceMembers:names,sourceImageSha256:createHash('sha256').update(png).digest('hex'),sourceAnnotationsSha256:createHash('sha256').update(annotations).digest('hex'),eligibleOriginalQuads:glyphs.length,glyphs:selected};
 await writeFile(out+'/ocr-manual-truth.json',JSON.stringify(provenance,null,2)+'\n');
 return selected.length;
}
