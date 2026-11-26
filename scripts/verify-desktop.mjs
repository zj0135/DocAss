import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'artifacts','desktop',new Date().toISOString().replaceAll(/[:.]/g,'-'));
await mkdir(output,{recursive:true});
const command=async(exe,args)=>{const child=spawn(exe,args,{cwd:root,windowsHide:true,stdio:'inherit'});const code=await new Promise(r=>child.once('exit',r));if(code!==0)throw Error(`${exe} exited ${code}`);};
if(!process.argv.includes('--skip-build')) {
  await command('cmd.exe',['/d','/s','/c','pnpm build']);
  await command('dotnet',['build','DocAss.sln','-c','Release','--no-restore']);
  await command('dotnet',['build','src/host/DocAss.Host','-c','Debug','--no-restore']);
}
const exists=async file=>{try{await access(file);return true;}catch{return false;}};
const reports=[];
async function host(scenario,{dev=false,env={},onReady}={}) {
  const report=path.join(output,scenario+'.json');
  const published=process.argv.includes('--published');
  const exe=published?path.join(root,'artifacts/publish/win-x64/DocAss.Host.exe'):path.join(root,'src/host/DocAss.Host/bin',dev?'Debug':'Release','net11.0-windows/win-x64/DocAss.Host.exe');
  const child=spawn(exe,[...(dev?['--dev']:[]),'--verify',report,'--verify-case',scenario],{cwd:root,windowsHide:true,env:{...process.env,...env},stdio:'ignore'});
  const finished=new Promise(resolve=>child.once('exit',resolve));
  let exited=false;finished.then(()=>exited=true);
  try {
    if(onReady){for(let i=0;i<300&&!await exists(report+'.ready')&&!exited;i++)await delay(100);if(!await exists(report+'.ready'))throw Error('HMR host did not become ready');await onReady();}
    for(let i=0;i<(['annotations','ocr','ocrBenchmark','ocrSynthetic'].includes(scenario)?1800:550)&&!exited;i++)await delay(100);
    if(!exited)throw Error(`${scenario} timed out`);
    const exitCode=await finished;if(exitCode!==0)throw Error(`${scenario} exited ${exitCode}; see ${report}`);
    const result=JSON.parse(await readFile(report,'utf8'));reports.push({scenario,...result});console.log(scenario,JSON.stringify(result));
    if(!result.ok)throw Error(`${scenario} failed; see ${report}`);
    if(result.loopbackOrigin){let closed=false;try{await fetch(result.loopbackOrigin,{signal:AbortSignal.timeout(1000)});}catch{closed=true;}if(!closed)throw Error('Loopback remained open after exit');}
  }finally{if(!exited)child.kill();}
}
let vite;const stamp=path.join(root,'src/web/src/buildStamp.ts');const original=await readFile(stamp);
const only=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
try {
  for(const scenario of (only==='ocrBenchmark'||only==='ocrSynthetic'?[only]:['channel','native','reading','annotations','ocr','closeButton','altF4','runtimeMissing','devUnavailable','hmr'])) {
    if(only&&only!==scenario)continue;
    if(scenario==='runtimeMissing'){const empty=path.join(output,'missing-runtime');await mkdir(empty);await host(scenario,{env:{WEBVIEW2_BROWSER_EXECUTABLE_FOLDER:empty}});}
    else if(scenario==='devUnavailable')await host(scenario,{dev:true});
    else if(scenario==='hmr') {
      vite=spawn(process.execPath,['src/web/node_modules/vite/bin/vite.js','--config','src/web/vite.config.ts','--host','localhost','--port','5173','--strictPort','src/web'],{cwd:root,windowsHide:true,stdio:'ignore'});
      for(let i=0;i<100;i++){try{if((await fetch('http://localhost:5173')).ok)break;}catch{}await delay(100);}
      await host(scenario,{dev:true,onReady:()=>writeFile(stamp,"export const buildStamp = 'acceptance-hmr-update';\n")});
    } else await host(scenario);
  }
  await writeFile(path.join(output,'summary.json'),JSON.stringify({ok:true,reports},null,2));console.log('Desktop acceptance reports:',output);
}finally{await writeFile(stamp,original);vite?.kill();}
