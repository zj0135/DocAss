import 'fake-indexeddb/auto';
import {it,expect,vi} from 'vitest';
import {BrowserServices} from '../src/services/BrowserServices';
import {DocSession} from '../src/state/DocSession';
import {payloadHash} from '../src/contracts';
import type {Command} from '../src/contracts';
it('persists settings and documents across instances without default documents',async()=>{
 const name=crypto.randomUUID(),first=new BrowserServices(name);expect((await first.bootstrap()).documents).toEqual([]);
 const preferences=await first.settings.get();await first.settings.update({...preferences,author:'作者甲'});
 const doc=await first.documents.openFixture('report'),session=new DocSession(doc,first);await session.restore();
 await session.commit({type:'batch',mutations:[{type:'conversation.put',value:{id:crypto.randomUUID(),title:'持久化笔记',modelRef:'fixture',createdAt:'2026-11-25'}}]});await session.close();first.dispose();
 const second=new BrowserServices(name),reopened=await second.documents.openFixture('report');expect(reopened.docId).not.toBe(doc.docId);expect((await second.persistence.read(reopened.docId)).conversations[0].title).toBe('持久化笔记');expect((await second.settings.get()).author).toBe('作者甲');second.dispose();
});
it('keeps doc sessions isolated and stops late fixture output',async()=>{
 const services=new BrowserServices(crypto.randomUUID()),a=new DocSession(await services.documents.openFixture('report'),services),b=new DocSession(await services.documents.openFixture('contract'),services);
 a.store.setState({page:4,draft:'a'});expect(b.store.getState().page).toBe(1);expect(b.store.getState().draft).toBe('');
 const run=a.runFixture();await new Promise(r=>setTimeout(r,150));a.stop();const reply=a.store.getState().reply;await run;expect(a.store.getState().reply).toBe(reply);expect(reply).not.toContain('结束');expect(JSON.stringify(a.store.getState())).not.toContain('AbortController');await a.close();await b.close();services.dispose();
});
it('deduplicates across reopened capabilities, rejects spoofed hash and stale revisions',async()=>{
 const s=new BrowserServices(crypto.randomUUID()),doc=await s.documents.openFixture('report');
 const command:Command={type:'batch',mutations:[{type:'conversation.put',value:{id:crypto.randomUUID(),title:'one',modelRef:'fixture',createdAt:'2026-11-25'}}]};
 const p={schemaVersion:1 as const,operationId:crypto.randomUUID(),docId:doc.docId,expectedRevision:0,payloadHash:await payloadHash(doc.docHash,command),command};
 for(let i=0;i<100;i++)expect((await s.persistence.commit(p)).committedRevision).toBe(1);
 await s.documents.close(doc.docId);const next=await s.documents.openFixture('report');expect((await s.persistence.commit({...p,docId:next.docId})).committedRevision).toBe(1);
 await expect(s.persistence.commit({...p,docId:next.docId,operationId:crypto.randomUUID()})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 const changed=structuredClone(command);(changed.mutations[0] as any).value.title='spoof';await expect(s.persistence.commit({...p,docId:next.docId,command:changed})).rejects.toMatchObject({code:'HASH_MISMATCH'});s.dispose();
});
it('keeps read-only sessions uneditable until reacquired and restores the latest snapshot',async()=>{
 const services=new BrowserServices(crypto.randomUUID()),handle=await services.documents.openFixture('report');
 const session=new DocSession({...handle,access:'readOnly'},services);await session.restore();
 const command:Command={type:'batch',mutations:[{type:'conversation.put',value:{id:crypto.randomUUID(),title:'latest',modelRef:'fixture',createdAt:'2026-11-25'}}]};
 await expect(session.commit(command)).rejects.toMatchObject({code:'READ_ONLY'});expect((await services.persistence.read(handle.docId)).documentRevision).toBe(0);
 await services.persistence.commit({schemaVersion:1,docId:handle.docId,operationId:crypto.randomUUID(),expectedRevision:0,payloadHash:await payloadHash(handle.docHash,command),command});
 await session.reacquire();expect(session.store.getState().access).toBe('edit');expect(session.store.getState().documentRevision).toBe(1);
 const original=services.persistence.read;vi.spyOn(services.persistence,'read').mockImplementation(async id=>({...await original(id),documentRevision:3}));
 await session.commit(command);expect(session.store.getState().documentRevision).toBe(3);await session.close();services.dispose();
});
it('browser provider defaults remain unique in the same transaction',async()=>{
 const services=new BrowserServices(crypto.randomUUID());const provider={id:crypto.randomUUID(),name:'first',api:'openai-completions' as const,baseUrl:'https://example.com/v1',isDefault:true,imageAllowed:false,models:[],hasKey:false};
 await services.providers.save(provider);await services.providers.save({...provider,id:crypto.randomUUID(),name:'second'});const values=await services.providers.list();expect(values.filter(p=>p.isDefault).map(p=>p.name)).toEqual(['second']);services.dispose();
});
