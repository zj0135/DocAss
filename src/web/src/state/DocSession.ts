import { createStore } from 'zustand/vanilla';
import { payloadHash, ServiceError } from '../contracts';
import type { Command, CommitCommand, DocHandle } from '../contracts';
import type { AppServices, DocumentState } from '../services/AppServices';

export class DocSession {
  handle: DocHandle;
  readonly store = createStore<DocumentState & {access:DocHandle['access'];page:number;scale:number;rotation:number;draft:string;reply:string;running:boolean;saveState:'saved'|'saving'|'error';error?:string}>(() => ({access:'readOnly',documentRevision:0,annotations:[],conversations:[],messages:[],page:1,scale:1.25,rotation:0,draft:'',reply:'',running:false,saveState:'saved'}));
  private services: AppServices;
  private run?: AbortController;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  private failed?: CommitCommand;
  constructor(handle: DocHandle, services: AppServices) { this.handle = handle; this.services = services; this.store.setState({access:handle.access}); }
  async reacquire() {
    const {handle} = await this.services.documents.reacquire(this.handle.docId); this.handle = handle;
    await this.restore(); this.store.setState({access:handle.access,error:undefined});
  }
  async restore() { const state = await this.services.persistence.read(this.handle.docId); if (!this.closed) this.store.setState(state); }
  commit(command: Command): Promise<void> {
    const task = this.queue.then(async () => {
      if (this.closed) throw new Error('文档已关闭');
      if (this.handle.access !== 'edit') throw new ServiceError('READ_ONLY','文档当前只读');
      if (this.failed) throw new Error('请先重试未确认的保存');
      const payload: CommitCommand = {schemaVersion:1,docId:this.handle.docId,operationId:crypto.randomUUID(),expectedRevision:this.store.getState().documentRevision,payloadHash:await payloadHash(this.handle.docHash,command),command};
      await this.submit(payload);
    }); this.queue = task.catch(() => {}); return task;
  }
  private async submit(payload: CommitCommand) {
    this.store.setState({saveState:'saving',error:undefined});
    try { await this.services.persistence.commit(payload); this.failed = undefined; await this.restore(); this.store.setState({saveState:'saved'}); }
    catch (e) { this.failed = payload; this.store.setState({saveState:'error',error:e instanceof Error?e.message:String(e)}); throw e; }
  }
  retry(): Promise<void> { const task=this.queue.then(async()=>{if(this.failed)await this.submit(this.failed);});this.queue=task.catch(()=>{});return task; }
  async runFixture() {
    this.stop(); const run = new AbortController(); this.run = run; this.store.setState({running:true,reply:''});
    try { await this.services.fixtureReply(this.handle.docId,run.signal,text => { if (!this.closed && this.run === run && !run.signal.aborted) this.store.setState(s => ({reply:s.reply+text})); }); }
    catch (e) { if (!run.signal.aborted) this.store.setState({error:e instanceof Error?e.message:String(e)}); }
    finally { if (this.run === run && !this.closed) this.store.setState({running:false}); }
  }
  stop() { this.run?.abort(); this.run = undefined; this.store.setState({running:false}); }
  async close() { this.stop(); await this.queue; if (this.failed) throw new Error('仍有未保存的修改'); await this.services.documents.close(this.handle.docId); this.closed = true; }
}
