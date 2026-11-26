import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),directory=path.join(root,'artifacts/integration',new Date().toISOString().replaceAll(/[:.]/g,'-'));
await mkdir(directory,{recursive:true});const steps=[];
async function run(name,exe,args){const started=Date.now(),child=spawn(exe,args,{cwd:root,windowsHide:true,stdio:'inherit'});const exitCode=await new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('exit',resolve);});steps.push({name,exitCode,elapsedMs:Date.now()-started});return exitCode===0;}
const pnpm=(name,args)=>run(name,'cmd.exe',['/d','/s','/c','pnpm',...args]);
if(await pnpm('web build',['build'])&&await run('Release build','dotnet',['build','DocAss.sln','-c','Release','--no-restore'])){
 await pnpm('host tests',['test:host']);await pnpm('web tests',['test:web']);await pnpm('browser tests',['test:browser']);
 // Real window input and performance measurements must remain serial.
 for(const scenario of ['channel','reading','annotations','llm','agentIntegration','ocrBenchmark','performance'])await run(scenario,process.execPath,['scripts/verify-desktop.mjs','--skip-build','--case='+scenario]);
 await run('external OCR',path.join(root,'src/host/DocAss.Host/bin/Release/net11.0-windows/win-x64/DocAss.Host.exe'),['--verify-external-ocr',root,path.join(directory,'ocr')]);
}
const automationPassed=steps.every(s=>s.exitCode===0);await writeFile(path.join(directory,'summary.json'),JSON.stringify({automationPassed,acceptanceComplete:false,externalGates:['A55 human overlay review','A56 clear Chinese scan and human tilted/vertical character truth','A58 configured real provider smoke (separate explicit command)'],steps},null,2));console.log('Integration evidence:',directory);process.exitCode=automationPassed?0:1;
