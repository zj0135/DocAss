import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Webview2Transport} from '../src/bridge/webview2Transport';
class Port {
 sent:any[]=[];listeners=new Set<(e:{data:unknown})=>void>();
 postMessage(value:unknown){this.sent.push(value);}
 addEventListener(_type:string,fn:(e:{data:unknown})=>void){this.listeners.add(fn);}
 removeEventListener(_type:string,fn:(e:{data:unknown})=>void){this.listeners.delete(fn);}
 reply(message:any){for(const fn of this.listeners)fn({data:message});}
}
beforeEach(()=>{vi.stubGlobal('window',{addEventListener(){},removeEventListener(){}});});afterEach(()=>vi.unstubAllGlobals());
it('correlates 100 reversed responses',async()=>{const port=new Port(),transport=new Webview2Transport(port);const requests=Array.from({length:100},(_,i)=>transport.request('test.echo',{i}));for(const m of [...port.sent].reverse())port.reply({v:1,kind:'res',id:m.id,ok:true,result:m.params.i});expect(await Promise.all(requests)).toEqual(Array.from({length:100},(_,i)=>i));expect(transport.pendingCount).toBe(0);transport.dispose();});
it('cleans timed out, cancelled and reloaded requests and ignores old responses',async()=>{const p=new Port(),t=new Webview2Transport(p);await expect(t.request('test.echo',{},undefined,5)).rejects.toMatchObject({code:'TIMEOUT'});expect(t.pendingCount).toBe(0);const old=t.request('test.echo');const rejection=expect(old).rejects.toMatchObject({code:'CANCELLED'});const id=p.sent.at(-1).id;t.reset();await rejection;const fresh=t.request('test.echo');p.reply({v:1,kind:'res',id,ok:true,result:'old'});expect(t.pendingCount).toBe(1);p.reply({v:1,kind:'res',id:p.sent.at(-1).id,ok:true,result:'fresh'});expect(await fresh).toBe('fresh');t.dispose();});
it('reports gaps and ignores duplicate events',()=>{const p=new Port(),t=new Webview2Transport(p),seen:boolean[]=[];t.subscribe((_,gap)=>seen.push(gap));for(const seq of [1,3,3])p.reply({v:1,kind:'event',topic:'window.stateChanged',seq,payload:{}});expect(seen).toEqual([false,true]);t.dispose();});
