import type {PageText,TextRange} from '../contracts';
export type Citation={page:number;quote:string;anchorToken?:string};
export function parseCitations(value:string):{start:number;end:number;citation:Citation}[]{const output:{start:number;end:number;citation:Citation}[]=[];const regex=/\[\[p([1-9]\d{0,5})\|([^\]\r\n]{1,2000}?)\]\]/g;for(const match of value.matchAll(regex)){if(output.length>=100)break;output.push({start:match.index!,end:match.index!+match[0].length,citation:{page:Number(match[1]),quote:match[2].split('|@')[0],...(match[2].includes('|@')?{anchorToken:match[2].slice(match[2].lastIndexOf('|@')+2)}:{})}});}return output;}
export function quoteRanges(text:PageText,quote:string):TextRange[]{if(!quote||text.quality==='unavailable')return [];const output:TextRange[]=[];let offset=0;while(output.length<100){const start=text.text.indexOf(quote,offset);if(start<0)break;output.push({start,end:start+quote.length});offset=start+1;}return output;}
export function verifiedCitationRanges(text:PageText,citation:{quote:string;textRevision?:string;ranges?:TextRange[];confirmed?:boolean}):TextRange[]|undefined {
 if(citation.confirmed===false||text.quality==='unavailable'||citation.textRevision&&citation.textRevision!==text.textRevision)return;
 if(citation.ranges?.length)return citation.ranges.every(r=>Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end>r.start&&r.end<=text.text.length)&&citation.ranges.map(r=>text.text.slice(r.start,r.end)).join('')===citation.quote?citation.ranges:undefined;
 const matches=quoteRanges(text,citation.quote);return matches.length===1?matches:undefined;
}
export class AnchorRegistry {
 private tokens=new Map<string,{hash:string;page:number;revision:string;ranges:TextRange[];quote:string}>();
 private hash:string;constructor(hash:string){this.hash=hash;}
 issue(text:PageText,ranges:TextRange[]){const token=crypto.randomUUID();this.tokens.set(token,{hash:this.hash,page:text.page,revision:text.textRevision,ranges:structuredClone(ranges),quote:ranges.map(r=>text.text.slice(r.start,r.end)).join('')});return token;}
 resolve(text:PageText,quote:string,token?:string){if(token){const v=this.tokens.get(token);if(!v||v.hash!==this.hash||v.page!==text.page||v.revision!==text.textRevision||v.quote!==quote)throw Error('ANCHOR_INVALID：引用凭证伪造、过期或不属于当前文档');return v.ranges;}const matches=quoteRanges(text,quote);return matches.length===1?matches:undefined;}
 clear(){this.tokens.clear();}
}
