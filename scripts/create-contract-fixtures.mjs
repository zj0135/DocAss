import {writeFileSync} from 'node:fs';
const id='11111111-1111-4111-8111-111111111111', hash='a'.repeat(64), date='2026-11-25T00:00:00Z';
const box=[0,0,100,100],quad=[0,0,10,0,10,10,0,10];
const samples={
 DocHandle:{docId:id,docHash:hash,fileName:'example.pdf',kind:'pdf',byteLength:123,access:'edit',contentRevision:hash},
 PageInfo:{page:1,pageBox:box,rotate:90,userUnit:2,width:100,height:100},
 PageText:{page:1,pageBox:box,userUnit:1,textRevision:hash,source:'native',text:'😀',glyphs:[{id,text:'😀',quad,baseline:[0,0,10,0],source:'native'}],spans:[{range:{start:0,end:2},glyphIds:[id],kind:'glyph',lineId:id}],lines:[{id,range:{start:0,end:2},quad,direction:'ltr',glyphIds:[id]}],quality:'verified',profileFingerprint:hash},
 Annotation:{id,docHash:hash,page:1,type:'note',rect:[0,0,10,10],anchor:[0,0],color:'#3B82F6',opacity:0.5,author:'作者',createdAt:date,modifiedAt:date,revision:1,migrationState:'none'},
 Message:{id,conversationId:id,parentId:null,branchId:id,role:'assistant',createdAt:date,state:'completed',sequence:0,content:[{type:'text',text:'😀 hello'}]},
 Provider:{id,name:'fixture',api:'openai-completions',baseUrl:'https://example.com/v1',isDefault:false,imageAllowed:false,models:[{modelId:'test',input:['text'],contextWindow:4096,maxOutputTokens:256}],hasKey:false},
 Job:{jobId:id,docId:id,page:1,contentRevision:hash,textRevision:'b'.repeat(64),pageGeneration:2,phase:'running'},
 Command:{type:'batch',mutations:[{type:'conversation.put',value:{id,title:'test',modelRef:'fixture',createdAt:date}}]},
 CommitResult:{operationId:id,committedRevision:1,payloadHash:hash},
 Request:{v:1,kind:'req',id,method:'app.bootstrap',params:{}},
 Response:{v:1,kind:'res',id,ok:false,error:{code:'FORBIDDEN',message:'拒绝',retryable:false}},
 Box:box, Quad:quad, Affine:[2,0,0,3,7,11], TextRange:{start:0,end:2},
};
samples.CommitCommand={schemaVersion:1,operationId:id,docId:id,expectedRevision:0,payloadHash:hash,command:samples.Command};
const fixtures=Object.entries(samples).map(([schema,value])=>({name:`valid-${schema}`,schema,valid:true,value}));
function bad(schema,name,edit){const value=structuredClone(samples[schema]);edit(value);fixtures.push({name,schema,valid:false,value});}
bad('Request','unknown-version',v=>v.v=2);bad('Request','unknown-field',v=>v.secret='x');bad('DocHandle','path-id',v=>v.docId='../private');bad('DocHandle','content-identity',v=>v.contentRevision='b'.repeat(64));bad('PageInfo','page-zero',v=>v.page=0);bad('PageInfo','page-limit',v=>v.page=1000001);bad('PageInfo','coordinate-overflow',v=>v.pageBox[2]=1e300);bad('Annotation','long-author',v=>v.author='a'.repeat(257));bad('Annotation','missing-anchor',v=>delete v.anchor);bad('PageText','utf16-surrogate-split',v=>v.spans[0].range.end=1);bad('PageText','utf16-out-of-bounds',v=>v.spans[0].range.end=3);bad('Provider','unsafe-url',v=>v.baseUrl='http://evil.example');bad('Provider','url-credentials',v=>v.baseUrl='https://user:pass@example.com');
fixtures.push(...[{name:'crossed-quad',schema:'Quad',value:[0,0,10,10,10,0,0,10]},{name:'clockwise-quad',schema:'Quad',value:[0,0,0,10,10,10,10,0]},{name:'wrong-start',schema:'Quad',value:[10,0,10,10,0,10,0,0]},{name:'degenerate-box',schema:'Box',value:[0,0,0,10]},{name:'singular-affine',schema:'Affine',value:[1,1,1,1,0,0]}].map(f=>({...f,valid:false})));
writeFileSync('src/shared/contract-fixtures.json',JSON.stringify(fixtures,null,2)+'\n');
