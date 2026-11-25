// Optional recording utility. Install the versions below in a temporary directory,
// then pass its node_modules directory. No provider makes a network request.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const directory=path.resolve(process.argv[2]??'node_modules');
const cases=[['openai','7.59.0','index.mjs'],['@anthropic-ai/sdk','0.129.0','index.mjs'],['@google/genai','2.32.0','dist/web/index.mjs']];
const records=[];
for(const[name,version,entry]of cases){
 const root=path.join(directory,name),metadata=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));if(metadata.version!==version)throw Error(`${name} version mismatch`);
 let headers=[];const fakeFetch=async(input,init)=>{const request=new Request(input,init);headers=[...request.headers.keys()].sort();return new Response('data: {"candidates":[]}\n\n',{headers:{'Content-Type':'text/event-stream'}});};
 const previous=globalThis.fetch;globalThis.fetch=fakeFetch;
 try{
  const sdk=await import(pathToFileURL(path.join(root,entry)).href);
  if(name==='openai'){const client=new sdk.default({apiKey:'fixture-only',dangerouslyAllowBrowser:true,fetch:fakeFetch});await client.chat.completions.create({model:'fixture',messages:[],stream:true});}
  else if(name==='@anthropic-ai/sdk'){const client=new sdk.default({apiKey:'fixture-only',dangerouslyAllowBrowser:true,fetch:fakeFetch});await client.messages.create({model:'fixture',messages:[],max_tokens:1,stream:true});}
  else {const client=new sdk.GoogleGenAI({apiKey:'fixture-only'});await client.models.generateContentStream({model:'fixture',contents:'fixture'});}
 }finally{globalThis.fetch=previous;}
 if(!headers.length)throw Error(`No request captured: ${name}`);
 records.push({name,version,entrySha256:createHash('sha256').update(await readFile(path.join(root,entry))).digest('hex'),headers});
}
await writeFile(new URL('../../src/shared/sdk-header-fixtures.json',import.meta.url),JSON.stringify(records,null,2)+'\n');console.log(records);
