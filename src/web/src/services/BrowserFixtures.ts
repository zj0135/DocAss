import type {AppServices} from './AppServices';
import type {Provider,NativePage,OcrTicket,OcrResult} from '../contracts';
import {ServiceError} from '../contracts';
import {buildPageText} from '../text/model';
import {abortableDelay} from './BrowserServices';
function events(api: string, text = '第一段中文：测试', tool = false) {
  const call = { id: 'call_fixture', name: 'get_document_info', arguments: '{}' };
  if (api === 'openai-completions')
    return [
      ...(tool
        ? [
            { choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: call.id, type: 'function', function: { name: call.name, arguments: '{' } }] }, finish_reason: null }] },
            { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] }, finish_reason: null }] },
          ]
        : [...text].map(t => ({ choices: [{ index: 0, delta: { content: t }, finish_reason: null }] }))),
      { choices: [{ index: 0, delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 6 } },
      '[DONE]',
    ].map(v => (typeof v === 'string' ? `data: ${v}\n\n` : `data: ${JSON.stringify(v)}\n\n`));
  if (api === 'anthropic-messages') {
    const values = [
      { type: 'message_start', message: { id: 'msg_fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], stop_reason: null, usage: { input_tokens: 12, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: tool ? { type: 'tool_use', id: call.id, name: call.name, input: {} } : { type: 'text', text: '' } },
      ...(tool ? ['{', '}'].map(t => ({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: t } })) : [...text].map(t => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }))),
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 6 } },
      { type: 'message_stop' },
    ];
    return values.map(v => `event: ${v.type}\ndata: ${JSON.stringify(v)}\n\n`);
  }
  if (api === 'google-generative-ai')
    return (tool
      ? [{ candidates: [{ content: { role: 'model', parts: [{ functionCall: { id: call.id, name: call.name, args: {} } }] }, finishReason: 'STOP', index: 0 }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 6, totalTokenCount: 18 } }]
      : [...text].map((t, i) => ({ candidates: [{ content: { role: 'model', parts: [{ text: t }] }, ...(i === text.length - 1 ? { finishReason: 'STOP' } : {}), index: 0 }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: i + 1, totalTokenCount: 12 + i + 1 } }))
    ).map(v => `data: ${JSON.stringify(v)}\n\n`);
  if (api === 'openai-responses') {
    const item = tool ? { type: 'function_call', id: 'fc_fixture', call_id: call.id, name: call.name, arguments: '' } : { type: 'message', id: 'msg_fixture', role: 'assistant', content: [], status: 'in_progress' };
    const final = tool ? { ...item, arguments: '{}', status: 'completed' } : { ...item, content: [{ type: 'output_text', text, annotations: [] }], status: 'completed' };
    const values = [
      { type: 'response.created', response: { id: 'resp_fixture', model: 'fixture', status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item },
      ...(tool
        ? ['{', '}'].map(t => ({ type: 'response.function_call_arguments.delta', item_id: item.id, output_index: 0, delta: t }))
        : [
            { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
            ...[...text].map(t => ({ type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: t })),
            { type: 'response.output_text.done', item_id: item.id, output_index: 0, content_index: 0, text },
          ]),
      { type: 'response.output_item.done', output_index: 0, item: final },
      { type: 'response.completed', response: { id: 'resp_fixture', model: 'fixture', status: 'completed', output: [final], usage: { input_tokens: 12, output_tokens: 6, total_tokens: 18, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } },
    ];
    return values.map(v => `event: ${v.type}\ndata: ${JSON.stringify(v)}\n\n`);
  }
  throw Error('unsupported fixture API');
}

export function fixturePdf(label:string){const words=`DocAss ${label} fixture evidence`,stream=`BT /F1 14 Tf 36 740 Td (${words}) Tj ET`,objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];let text='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(text.length);text+=`${i+1} 0 obj\n${o}\nendobj\n`;});const at=text.length;text+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${at}\n%%EOF`;return new File([text],`browser-${label}-fixture.pdf`,{type:'application/pdf'});}
export function installBrowserFixtures(services:AppServices){
 const known=new Map<string,string>(),handles=new Map<string,string>(),tickets=new Map<string,{ticket:OcrTicket;raster:import('../contracts').OcrRaster;cancelled:boolean;started:number}>(),runDocs=new Map<string,string>();
 const files={report:fixturePdf('report'),contract:fixturePdf('contract')};
 const ready=Promise.all(Object.entries(files).map(async([name,file])=>{const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');known.set(hash,name);}));
 const open=services.documents.open,openRecent=services.documents.openRecent;
 services.documents.open=async(...args)=>{await ready;const result=await open(...args);if(result?.handle){const kind=known.get(result.handle.docHash);if(kind)handles.set(result.handle.docId,kind);}return result;};
 services.documents.openRecent=async(...args)=>{await ready;const result=await openRecent(...args);if(result.handle){const kind=known.get(result.handle.docHash);if(kind)handles.set(result.handle.docId,kind);}return result;};
 services.documents.openFixture=async(name,signal)=>(await services.documents.open(files[name],signal))!.handle!;
 const requireFixture=(id:string)=>{const kind=handles.get(id);if(!kind)throw new ServiceError('UNCONFIGURED','此文件的精确文字、OCR 和模型功能需要桌面服务；固定样本仅用于开发验收');return kind;};
 const native=async(id:string,page:number):Promise<NativePage>=>{const kind=requireFixture(id);if(page!==1)throw Error('页码超出范围');const state=await services.documents.source(id),bytes=await state.blob!.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join(''),value=`DocAss ${kind} fixture evidence`;return {docId:id,jobId:crypto.randomUUID(),contentRevision:hash,pageGeneration:0,status:kind==='contract'?'unreliable':'ready',pageInfo:{page:1,pageBox:[0,0,595,842],width:595,height:842,rotate:0,userUnit:1},glyphs:[...value].map((text,i)=>({id:'f0000000-0000-4000-8000-'+String(i).padStart(12,'0'),text,quad:[36+i*8.4,737,44.4+i*8.4,737,44.4+i*8.4,751,36+i*8.4,751],baseline:[36+i*8.4,740,44.4+i*8.4,740],source:'native'})),profileFingerprint:'a'.repeat(64),hasImages:kind==='contract'};};
 services.capabilities.nativeText=services.capabilities.ocr=services.capabilities.llm=true;
 services.text={getNative:native,getPage:async(id,page)=>buildPageText(await native(id,page))};
 const profile={fingerprint:'b'.repeat(64),modelHash:'c'.repeat(64),modelTier:'Small' as const,backend:'Cpu' as const,engineVersion:'browser-fixture',preprocessing:'fixture-v1'};
 services.ocr={...services.ocr,start:async r=>{const n=await native(r.docId,r.page),ticket:OcrTicket={docId:r.docId,jobId:crypto.randomUUID(),subscriptionId:crypto.randomUUID(),page:r.page,contentRevision:n.contentRevision,pageGeneration:0,profile,needsRaster:false};tickets.set(ticket.subscriptionId,{ticket,raster:r.raster,cancelled:false,started:performance.now()});return ticket;},status:async t=>{const s=tickets.get(t.subscriptionId);return {...t,phase:!s||s.cancelled?'cancelled':performance.now()-s.started>200?'completed':'running',nativeRunning:false,completedPages:1,totalPages:1};},result:async t=>{const state=tickets.get(t.subscriptionId);if(!state||state.cancelled)throw new ServiceError('CANCELLED','样本识别已取消');const n=await native(t.docId,t.page);return {docId:t.docId,jobId:t.jobId,contentRevision:t.contentRevision,pageGeneration:t.pageGeneration,profile:t.profile,raster:state.raster,lines:[{text:n.glyphs.map(g=>g.text).join(''),glyphs:n.glyphs.map(g=>({...g,source:'ocr' as const}))}],empty:false,device:'浏览器固定 OCR 样本',fallback:false,cached:false,elapsedMs:200} satisfies OcrResult;},unsubscribe:async t=>{const s=tickets.get(t.subscriptionId);if(s)s.cancelled=true;},clearCache:async()=>({removedBytes:0}),setOverride:async()=>{}};
 const provider:Provider={id:'f0000000-0000-4000-8000-000000000001',name:'浏览器合成上游',api:'openai-completions',baseUrl:'http://127.0.0.1:1',isDefault:true,imageAllowed:true,hasKey:false,models:[{modelId:'fixture',input:['text','image'],contextWindow:32768,maxOutputTokens:256}]};
 const list=services.providers.list;services.providers.list=async()=>[provider,...await list()];
 services.llm={begin:async(docId,_provider,_model,runId)=>{requireFixture(docId);runDocs.set(runId,docId);return structuredClone(provider);},end:async runId=>{runDocs.delete(runId);},channel:(runId,signal)=>({baseUrl:'http://127.0.0.1:1/fixture',fetch:async(input,init)=>{const request=new Request(input,init),body=await request.text();if(!runDocs.has(runId))throw Error('样本任务已结束');if(body.includes('fixture-error'))return new Response(JSON.stringify({error:{message:'显式合成网络失败'}}),{status:503});const chunks=events('openai-completions','浏览器样本回答 [[p1|fixture evidence]]');let i=0;return new Response(new ReadableStream({async pull(controller){try{await abortableDelay(100,signal);if(i<chunks.length)controller.enqueue(new TextEncoder().encode(chunks[i++]));else controller.close();}catch(e){controller.error(e);}}}),{headers:{'content-type':'text/event-stream'}});}})};
}
