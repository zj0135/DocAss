import {cp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.dirname(require.resolve('pdfjs-dist/package.json'));
for(const folder of ['cmaps','standard_fonts','wasm','iccs']){
 const target=path.resolve(import.meta.dirname,'../src/web/public/pdfjs',folder);
 await mkdir(target,{recursive:true});await cp(path.join(root,folder),target,{recursive:true});
}
await cp(path.join(root,'LICENSE'),path.resolve(import.meta.dirname,'../src/web/public/pdfjs/LICENSE'));
