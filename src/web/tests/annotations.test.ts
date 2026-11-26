import 'fake-indexeddb/auto';
import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {BrowserServices} from '../src/services/BrowserServices';
import {DocSession} from '../src/state/DocSession';
import {validate} from '../src/contracts';
import type {Annotation,CommitCommand,PageText,Point} from '../src/contracts';
import {baseAnnotation,textAnnotation,simplify,segmentDistance,transformAnnotation,hitAnnotation} from '../src/annotations/model';
import {buildPageText} from '../src/text/model';
import {planMigration} from '../src/annotations/migration';
const native=JSON.parse(readFileSync('../../artifacts/reading/native-pages.json','utf8'));
const style={color:'#3355FF',strokeWidth:2,opacity:.5};
async function setup(){const services=new BrowserServices(crypto.randomUUID()),session=new DocSession(await services.documents.openFixture('report'),services);await session.restore();return {services,session};}
const rect=(session:DocSession,page=1):Annotation=>({...baseAnnotation(session.handle.docHash,page,'rect',[10,20,80,90],'测试作者',style),strokeWidth:2});
it('rejects missing subtype data, nonfinite coordinates and empty anchors; geometric text cannot move',async()=>{
 const {session,services}=await setup(),a=rect(session);expect(()=>validate('Annotation',{...a,rect:[0,0,Infinity,2]})).toThrow();expect(()=>validate('Annotation',{...a,type:'arrow'})).toThrow();expect(()=>validate('Annotation',{...a,type:'ink',paths:[],width:2})).toThrow();
 const page=await buildPageText(native[0]);expect(textAnnotation(a.docHash,page,{start:0,end:0},'highlight','作者',style)).toBeUndefined();const text=textAnnotation(a.docHash,page,{start:0,end:3},'highlight','作者',style)!;expect(()=>transformAnnotation(text,[1,1,20,20])).toThrow();expect(hitAnnotation(text,[text.rect[0]+1,text.rect[1]+1],2)).toBe(true);services.dispose();
});
it('commits cross-page groups atomically and undo/redo use new operation ids; reopen preserves exact quads',async()=>{
 const {session,services}=await setup(),page=await buildPageText(native[0]),group=crypto.randomUUID();const a=textAnnotation(session.handle.docHash,page,{start:0,end:3},'highlight','甲',style,group)!,b=textAnnotation(session.handle.docHash,{...page,page:2,source:'hybrid'},{start:1,end:4},'underline','甲',style,group)!;
 const calls=vi.spyOn(services.persistence,'commit');await session.execute([a,b].map(value=>({type:'annotation.put',value})));expect(session.store.getState().annotations).toHaveLength(2);await session.undo();expect(session.store.getState().annotations).toHaveLength(0);await session.redo();expect(session.store.getState().annotations.map(a=>a.quads)).toEqual([a.quads,b.quads]);expect(new Set(calls.mock.calls.map(([p])=>p.operationId)).size).toBe(3);expect(calls.mock.calls[0][0].command.mutations).toHaveLength(2);
 const previous=session.store.getState().annotations[0].revision;await session.undo();await session.redo();expect(session.store.getState().annotations[0].revision).toBeGreaterThan(previous);
 await session.close();const opened=new DocSession(await services.documents.openFixture('report'),services);await opened.restore();expect(opened.store.getState().annotations[1].textAnchor?.source).toBe('hybrid');expect(opened.store.getState().annotations[0].quads).toEqual(a.quads);services.dispose();
});
it('caps history at 200 per tab and a move is one reversible command',async()=>{
 const {session,services}=await setup(),other=new DocSession(await services.documents.openFixture('contract'),services),a=rect(session);await session.put(a);
 for(let i=0;i<205;i++)await session.put({...a,rect:[10+i,20,80+i,90]});expect(session.store.getState().undoCount).toBe(200);expect(other.store.getState().undoCount).toBe(0);await session.undo();expect(session.store.getState().annotations[0].rect[0]).toBe(213);await session.redo();expect(session.store.getState().annotations[0].rect[0]).toBe(214);services.dispose();
});
it('retains optimistic queued edits on disk failure and retries the exact lost-ack operation',async()=>{
 const {session,services}=await setup(),original=services.persistence.commit,seen:CommitCommand[]=[];let fail=true;
 vi.spyOn(services.persistence,'commit').mockImplementation(async p=>{seen.push(structuredClone(p));const result=await original(p);if(fail)throw Error('lost ack');return result;});
 const a=rect(session),b=rect(session,2),p=session.put(a).catch(()=>{}),q=session.put(b).catch(()=>{});await Promise.all([p,q]);expect(session.store.getState().annotations).toHaveLength(2);expect(session.store.getState().saveState).toBe('error');await expect(session.close()).rejects.toThrow();expect(session.store.getState().closeState).toBe('blocked');session.cancelClose();fail=false;await session.retry();expect(seen[0]).toEqual(seen[1]);expect((await services.persistence.read(session.handle.docId)).annotations).toHaveLength(2);expect(session.store.getState().saveState).toBe('saved');await session.close();services.dispose();
});
it('five-second writes keep close pending, reject new commands and merge repeated close calls',async()=>{
 const {session,services}=await setup(),original=services.persistence.commit;vi.useFakeTimers();vi.spyOn(services.persistence,'commit').mockImplementation(async p=>{await new Promise(r=>setTimeout(r,5000));return original(p);});
 const commit=session.put(rect(session));await vi.advanceTimersByTimeAsync(10);const closing=session.close();expect(session.close()).toBe(closing);await vi.advanceTimersByTimeAsync(4900);expect(session.store.getState().saveState).toBe('saving');expect(session.store.getState().closeState).toBe('closing');await expect(session.put(rect(session))).rejects.toMatchObject({code:'BUSY'});await vi.advanceTimersByTimeAsync(200);vi.useRealTimers();await commit;await closing;expect(session.store.getState().closeState).toBe('closed');services.dispose();
});
it('discard requires an explicit call and preserves acknowledged state; unfinished editor blocks close',async()=>{
 const {session,services}=await setup(),a=rect(session);await session.put(a);session.store.setState({editor:{annotation:{...a,type:'freetext',text:'',fontSize:14,fontFamily:'sans-serif',alignment:'left'},isNew:true,text:'未确认文字'}});await expect(session.prepareClose()).rejects.toThrow();session.cancelClose();expect(session.store.getState().editor?.text).toBe('未确认文字');await session.discard();expect(session.store.getState().editor).toBeUndefined();expect(session.store.getState().annotations).toHaveLength(1);services.dispose();
});
it('RDP keeps every sampled point within half a CSS pixel at multiple zooms and transforms all geometry',()=>{
 const points:Point[]=Array.from({length:200},(_,i)=>[i/2,Math.sin(i/9)*8]);for(const scale of [.5,1,2,4]){const simple=simplify(points,.5/scale);expect(simple.length).toBeLessThan(points.length);for(const p of points)expect(Math.min(...simple.slice(1).map((q,i)=>segmentDistance(p,simple[i],q)))*scale).toBeLessThanOrEqual(.50001);}
 const a={...baseAnnotation('a'.repeat(64),1,'arrow',[0,0,10,10],'a',style),from:[0,0] as Point,to:[10,10] as Point,strokeWidth:2,endStyle:'arrow' as const};expect(transformAnnotation(a,[10,20,30,50]).to).toEqual([30,50]);
});
it('migration locates unique quote+context, preserves groups, refuses ambiguity, changed geometry and missing pages',async()=>{
 const {session,services}=await setup(),text=await buildPageText(native[0]),group=crypto.randomUUID(),a=textAnnotation(session.handle.docHash,text,{start:0,end:3},'highlight','a',style,group)!;
 const unique:PageText={...text,text:text.text.slice(0,16),spans:text.spans.filter(s=>s.range.end<=16),lines:[text.lines[0]]};const anchor={...a,textAnchor:{...a.textAnchor!,prefix:'',suffix:''}};
 const items=await planMigration([anchor,{...rect(session),groupId:group},{...rect(session,3),groupId:group}], [native[0].pageInfo], 'b'.repeat(64),1,async()=>({...native[0].pageInfo,pageBox:[0,0,100,200]}),async()=>unique,new AbortController().signal);
 expect(items.map(i=>i.status)).toEqual(['located','review','missing']);expect(items[0].annotation.docHash).toBe('b'.repeat(64));expect(items[0].annotation.groupId).toBe(items[1].annotation.groupId);expect(items[0].annotation.groupId).not.toBe(group);expect(a.docHash).toBe(session.handle.docHash);
 const ambiguous=await planMigration([anchor],[], 'b'.repeat(64),1,async()=>native[0].pageInfo,async()=>text,new AbortController().signal);expect(ambiguous[0].candidates).toBe(20);expect(ambiguous[0].status).toBe('review');services.dispose();
});
