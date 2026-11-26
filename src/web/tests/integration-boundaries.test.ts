import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {SafeMarkdown} from '../src/ui/chat/SafeMarkdown';
import {BrowserServices} from '../src/services/BrowserServices';
import {payloadHash} from '../src/contracts';
import {PiTransport} from '../src/llm/piAdapter';
import type {LlmEvent} from '../src/llm/types';
import type {Provider} from '../src/contracts';
// @ts-ignore shared fixture
import {events} from '../../../docs/fixtures/llm-protocols.mjs';
it('renders only a safe Markdown subset without HTML, remote images or active schemes',()=>{
 const html=renderToStaticMarkup(createElement(SafeMarkdown,{text:'<script>alert(1)</script> <img src="https://leak.invalid/pixel"> ![remote](https://leak.invalid/img) [bad](javascript:alert(1)) **bold** `code` [safe](https://example.com)'}));
 expect(html).not.toContain('<script');expect(html).not.toContain('<img');expect(html).not.toContain('href="javascript');expect(html).toContain('<strong>bold</strong>');expect(html).toContain('href="https://example.com"');expect(html).toContain('noopener');
});
it('an endless upstream cannot execute more than twelve tools',async()=>{
 const p:Provider={id:crypto.randomUUID(),name:'loop',api:'openai-completions',baseUrl:'https://never.invalid',isDefault:true,imageAllowed:false,hasKey:false,models:[{modelId:'fixture',input:['text'],contextWindow:65536,maxOutputTokens:128}]};let count=0,requests=0;const received:LlmEvent[]=[];
 await new PiTransport().run({provider:p,model:p.models[0],runId:crypto.randomUUID(),baseUrl:'http://127.0.0.1:1',signal:new AbortController().signal,fetch:async()=>{requests++;return new Response(events('openai-completions','',true).join('').replaceAll('call_info','call_'+requests),{headers:{'content-type':'text/event-stream'}});}},[{role:'user',text:'loop'}],'',[{name:'get_document_info',description:'test',parameters:{type:'object',properties:{}},execute:async()=>{count++;return {text:'bounded'};}}],e=>{received.push(e);});
 expect(count).toBe(12);expect(requests).toBeLessThanOrEqual(14);expect(received.some(e=>e.type==='toolEnd')).toBe(true);
});
it('IndexedDB attachments survive reload, enforce ownership, retain references and detect corruption',async()=>{
 const name=crypto.randomUUID(),service=new BrowserServices(name),a=await service.documents.openFixture('report'),b=await service.documents.openFixture('contract'),id=await service.attachments.begin(a.docId);const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
 await expect(service.attachments.commit(a.docId,id)).rejects.toThrow();await expect(service.attachments.upload(b.docId,id,new Blob([bytes],{type:'image/png'}))).rejects.toThrow();await service.attachments.upload(a.docId,id,new Blob([bytes],{type:'image/png'}));await service.attachments.commit(a.docId,id);
 const conversation=crypto.randomUUID(),message=crypto.randomUUID(),command={type:'batch' as const,mutations:[{type:'conversation.put' as const,value:{id:conversation,title:'attached',modelRef:'fixture',createdAt:'2026-11-26'}},{type:'message.put' as const,value:{id:message,conversationId:conversation,parentId:null,branchId:conversation,role:'user' as const,state:'completed' as const,sequence:0,createdAt:'2026-11-26',content:[{type:'attachment' as const,attachmentId:id}]}}]};await service.persistence.commit({schemaVersion:1,operationId:crypto.randomUUID(),docId:a.docId,expectedRevision:0,payloadHash:await payloadHash(a.docHash,command),command});service.dispose();
 const restored=new BrowserServices(name),opened=await restored.documents.openFixture('report');expect((await restored.persistence.read(opened.docId)).messages).toHaveLength(1);expect((await restored.attachments.resolve(opened.docId,id)).available).toBe(true);const other=await restored.documents.openFixture('contract');expect((await restored.attachments.resolve(other.docId,id)).available).toBe(false);
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const tx=db.transaction('attachments','readwrite');tx.objectStore('attachments').put({blob:new Blob(['corrupt']),digest:'0'.repeat(64)},opened.docHash+':'+id);await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();expect((await restored.attachments.resolve(opened.docId,id)).available).toBe(false);expect((await restored.persistence.read(opened.docId)).messages).toHaveLength(1);restored.dispose();
});
