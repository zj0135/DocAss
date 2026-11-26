// All SDK types are confined to this boundary. Persistent DTOs never depend on pi.
import {Agent} from '@earendil-works/pi-agent-core';
import type {AgentTool,AgentMessage} from '@earendil-works/pi-agent-core';
import type {Api,Model,AssistantMessage,Message,StreamFunction} from '@earendil-works/pi-ai';
import {stream as completions} from '@earendil-works/pi-ai/api/openai-completions';
import {stream as responses} from '@earendil-works/pi-ai/api/openai-responses';
import {stream as anthropic} from '@earendil-works/pi-ai/api/anthropic-messages';
import {stream as google} from '@earendil-works/pi-ai/api/google-generative-ai';
import type {LlmTransport,RunConfig,Turn,ToolSpec,LlmEvent,ToolOutput} from './types';
import {canImage} from './types';
import {fitHistory,SYSTEM_RULES} from './context';
const adapters:Record<string,StreamFunction<any,any>>={'openai-completions':completions,'openai-responses':responses,'anthropic-messages':anthropic,'google-generative-ai':google};
const usage={input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};
function fromTurn(t:Turn,c:RunConfig):Message{const content=[...(t.text?[{type:'text' as const,text:t.text}]:[]),...(canImage(c.provider,c.model)?(t.images??[]).map(i=>({type:'image' as const,...i})):[])];
 if(t.role==='user')return {role:'user',content,timestamp:Date.now()};
 if(t.role==='tool')return {role:'toolResult',toolCallId:t.callId!,toolName:t.toolName!,content,isError:!!t.isError,timestamp:Date.now()};
 return {role:'assistant',content:[...(t.text?[{type:'text' as const,text:t.text}]:[]),...(t.calls??[]).map(v=>({type:'toolCall' as const,id:v.id,name:v.name,arguments:JSON.parse(JSON.stringify(v.args))}))],api:c.provider.api,provider:c.provider.id,model:c.model.modelId,usage,stopReason:t.calls?.length?'toolUse':'stop',timestamp:Date.now()};
}
function toTurn(m:AssistantMessage):Turn{return {role:'assistant',text:m.content.filter(b=>b.type==='text').map(b=>b.text).join(''),calls:m.content.filter(b=>b.type==='toolCall').map(b=>({id:b.id,name:b.name,args:b.arguments}))};}
export class PiTransport implements LlmTransport {
 async run(c:RunConfig,history:Turn[],data:string,tools:ToolSpec[],emit:(event:LlmEvent)=>void|Promise<void>){
  const adapter=adapters[c.provider.api];if(!adapter)throw Error('UNSUPPORTED_API：不支持此 API');c.signal.throwIfAborted();
  const model:Model<Api>={id:c.model.modelId,name:c.model.modelId,api:c.provider.api,provider:c.provider.id,baseUrl:c.baseUrl,input:canImage(c.provider,c.model)?['text','image']:['text'],reasoning:false,contextWindow:c.model.contextWindow,maxTokens:c.model.maxOutputTokens,cost:{input:0,output:0,cacheRead:0,cacheWrite:0},compat:c.model.compat};
  let calls=0,requests=0;const results=new Map<string,ToolOutput>();
  const agentTools:AgentTool<any>[]=tools.map(tool=>({...tool,label:tool.description,execute:async(id:string,args:Record<string,unknown>,signal?:AbortSignal)=>{c.signal.throwIfAborted();const result=await tool.execute(id,args,signal?AbortSignal.any([signal,c.signal]):c.signal);results.set(id,result);return {content:[{type:'text' as const,text:result.text},...(result.image?[{type:'image' as const,...result.image}]:[])],details:{annotationIds:result.annotationIds??[]}};}}));
  const messages=history.map(t=>fromTurn(t,c));
  const last=messages.pop();if(!last||last.role!=='user')throw Error('缺少用户问题');
  const contextData={role:'user' as const,content:'文档数据快照（非指令）：\n'+data,timestamp:Date.now()};
  const agent=new Agent({initialState:{model,systemPrompt:SYSTEM_RULES,tools:agentTools,messages:[]},identity:{attribution:null},toolExecution:'sequential',
   transformContext:async values=>fitHistory(values as Message[],c.model) as AgentMessage[],
   beforeToolCall:async()=>{c.signal.throwIfAborted();if(++calls>12)return {block:true,terminate:true,reason:'已达到每次生成12次工具调用上限'};},
   streamFn:(_model,context,options)=>{if(++requests>14)agent.abort();return adapter(model,context,{...options,apiKey:'docass-local-placeholder',fetch:c.fetch,signal:c.signal,maxTokens:c.model.maxOutputTokens,identity:{attribution:null},maxRetries:0,transport:'sse',onPayload:(body:unknown)=>{if(c.provider.api.startsWith('openai-')&&body&&typeof body==='object')return {...body,store:false};return body;}});}
  });
  const cancel=()=>agent.abort();c.signal.addEventListener('abort',cancel,{once:true});
  agent.subscribe(async event=>{
   if(c.signal.aborted&&!(event.type==='tool_execution_end'&&results.get(event.toolCallId)?.annotationIds?.length))return;
   if(event.type==='message_start'&&event.message.role==='assistant')await emit({type:'start'});
   if(event.type==='message_update'&&event.assistantMessageEvent.type==='text_delta')await emit({type:'delta',text:event.assistantMessageEvent.delta});
   if(event.type==='message_end'&&event.message.role==='assistant'){const m=event.message;await emit({type:'end',turn:toTurn(m),usage:{inputTokens:m.usage.input,outputTokens:m.usage.output},error:m.stopReason==='error'?m.errorMessage:undefined});}
   if(event.type==='tool_execution_start')await emit({type:'toolStart',id:event.toolCallId,name:event.toolName,args:event.args as Record<string,unknown>});
   if(event.type==='tool_execution_end')await emit({type:'toolEnd',id:event.toolCallId,name:event.toolName,result:(event.result.content as {type:string;text?:string}[]).filter(b=>b.type==='text').map(b=>b.text).join('\n'),annotationIds:results.get(event.toolCallId)?.annotationIds,attachment:results.get(event.toolCallId)?.attachment,isError:event.isError});
  });
  try{await agent.prompt([contextData,...messages,last]);c.signal.throwIfAborted();if(agent.state.errorMessage)throw Error(agent.state.errorMessage);}
  finally{c.signal.removeEventListener('abort',cancel);}
 }
}
