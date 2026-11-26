import type {Model,Provider,Content} from '../contracts';
export type ImageInput={data:string;mimeType:'image/png'};
export type Turn={role:'user'|'assistant'|'tool';text:string;images?:ImageInput[];calls?:{id:string;name:string;args:Record<string,unknown>}[];callId?:string;toolName?:string;isError?:boolean};
export type ToolOutput={text:string;image?:ImageInput;annotationIds?:string[];attachment?:Extract<Content,{type:'attachment'}>};
export type LlmEvent={type:'start'}|{type:'delta';text:string}|{type:'end';turn:Turn;usage:{inputTokens:number;outputTokens:number};error?:string}|{type:'toolStart';id:string;name:string;args:Record<string,unknown>}|{type:'toolEnd';id:string;name:string;result:string;annotationIds?:string[];attachment?:ToolOutput['attachment'];isError:boolean};
export type ToolSpec={name:string;description:string;parameters:object;execute:(id:string,args:Record<string,unknown>,signal:AbortSignal)=>Promise<ToolOutput>};
export type RunConfig={runId:string;provider:Provider;model:Model;baseUrl:string;fetch:typeof fetch;signal:AbortSignal};
export interface LlmTransport {run(config:RunConfig,history:Turn[],data:string,tools:ToolSpec[],onEvent:(event:LlmEvent)=>void|Promise<void>):Promise<void>}
export const canImage=(provider:Provider,model:Model)=>provider.imageAllowed&&model.input.includes('image');
