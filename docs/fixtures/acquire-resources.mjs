// Run --record only when deliberately updating immutable upstream resource pins.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=import.meta.dirname,manifestPath=path.join(root,'resources.json');
const resources=JSON.parse(await readFile(manifestPath,'utf8'));
for(const item of resources){
 const target=path.join(root,item.file);await mkdir(path.dirname(target),{recursive:true});let bytes;
 try{bytes=await readFile(target);}catch{}
 const hash=value=>createHash('sha256').update(value).digest('hex');
 if(!bytes||!item.sha256||hash(bytes)!==item.sha256){
   if(process.platform==='win32') {
     execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'download-resource.ps1'),'-Uri',item.url,'-Output',target,'-PrefixBytes',String(item.prefixBytes??0)],{stdio:'inherit',windowsHide:true});bytes=await readFile(target);
   }else{const response=await fetch(item.url,{signal:AbortSignal.timeout(120000),headers:item.prefixBytes?{Range:`bytes=0-${item.prefixBytes-1}`}:{}});if(!response.ok)throw Error(`${response.status} ${item.url}`);if(item.prefixBytes){const reader=response.body.getReader(),chunks=[];let remaining=item.prefixBytes;while(remaining>0){const{done,value}=await reader.read();if(done)throw Error('Incomplete archive prefix');chunks.push(value.slice(0,remaining));remaining-=Math.min(remaining,value.length);}await reader.cancel();bytes=Buffer.concat(chunks);}else bytes=Buffer.from(await response.arrayBuffer());}
   if(item.sha256&&hash(bytes)!==item.sha256)throw Error(`Checksum mismatch: ${item.file}`);await writeFile(target,bytes);
 }
 if(!item.sha256){if(!process.argv.includes('--record'))throw Error(`Missing pin: ${item.file}`);item.sha256=hash(bytes);}
 console.log(item.file,bytes.length,item.sha256);
}
if(process.argv.includes('--record'))await writeFile(manifestPath,JSON.stringify(resources,null,2)+'\n');
if(process.platform==='win32'){
 const quote=text=>"'"+text.replaceAll("'","''")+"'";
 const target=path.join(root,'downloads/qpdf');
 execFileSync('powershell.exe',['-NoProfile','-Command',`$ProgressPreference='SilentlyContinue';Expand-Archive -LiteralPath ${quote(path.join(root,'downloads/qpdf.zip'))} -DestinationPath ${quote(target)} -Force`],{stdio:'inherit',windowsHide:true});
}
