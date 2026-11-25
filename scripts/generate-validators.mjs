import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(new URL('../src/web/package.json',import.meta.url));
const Ajv=require('ajv'), standalone=require('ajv/dist/standalone').default;
const schema=JSON.parse(readFileSync('src/shared/contracts.schema.json','utf8'));
const ajv=new Ajv({strict:false,code:{source:true,esm:true}});ajv.addSchema(schema);
const entries=Object.fromEntries(Object.keys(schema.$defs).map(name=>[name,schema.$id+'#/$defs/'+name]));
let code=standalone(ajv,entries),imports=[];
code=code.replace(/require\("([^"]+)"\)\.default/g,(_,path)=>{
 if(path==='ajv/dist/runtime/ucs2length') { imports.push('const unicodeLength = value => Array.from(value).length;'); return 'unicodeLength'; }
 throw new Error('Unexpected generated runtime dependency: '+path);
});
writeFileSync('src/web/src/contracts/validators.js','// Generated static validators. CSP never requires unsafe-eval.\n'+imports.join('\n')+'\n'+code+'\n');
writeFileSync('src/web/src/contracts/validators.d.ts',Object.keys(entries).map(name=>`export declare const ${name}: (value: unknown) => boolean;`).join('\n')+'\n');
