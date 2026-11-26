import * as validators from './validators.js';
import schema from '../../../shared/contracts.schema.json';
export type * from './types';
import type { Command } from './types';

export class ServiceError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, message: string, retryable = false) { super(message); this.name = 'ServiceError'; this.code = code; this.retryable = retryable; }
}
type Schema = { $ref?: string; type?:string; anyOf?: Schema[]; properties?: Record<string, Schema>; items?: Schema; const?: unknown };
const definitions = schema.$defs as unknown as Record<string, Schema>;
const requireValue = (ok: unknown) => { if (!ok) throw new ServiceError('INVALID_PAYLOAD', '数据不符合协议'); };
export function validate<T>(name: string, value: unknown): T {
  const fn = (validators as Record<string,(value:unknown)=>boolean>)[name];
  requireValue(fn(value)); walk(definitions[name], value); semantic(name, value); return value as T;
}
function walk(s: Schema, value: any): void {
  if (s.$ref) { const name = s.$ref.split('/').at(-1)!; walk(definitions[name], value); semantic(name, value); return; }
  if (s.anyOf) {
    const selected = s.anyOf.find(option => matches(option, value));
    if (selected) walk(selected, value); return;
  }
  if (s.properties) for (const [key, child] of Object.entries(s.properties)) if (value[key] !== undefined) walk(child, value[key]);
  if (s.items) for (const item of value) walk(s.items, item);
}
function matches(s: Schema, value: any): boolean {
  if (s.$ref) return (validators as Record<string,(v:unknown)=>boolean>)[s.$ref.split('/').at(-1)!](value);
  if ('const' in s) return s.const === value;
  if (s.type === 'null') return value === null;
  if (s.properties) return value !== null && typeof value === 'object' && Object.entries(s.properties).every(([key,child]) => !('const' in child) || child.const === value[key]);
  return typeof value === s.type;
}
function semantic(name: string, v: any) {
  if (name === 'Box') requireValue(v[0] < v[2] && v[1] < v[3]);
  if (name === 'Quad') for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, k = (i + 2) % 4;
    requireValue((v[2*j]-v[2*i])*(v[2*k+1]-v[2*j+1])-(v[2*j+1]-v[2*i+1])*(v[2*k]-v[2*j]) > 0);
    requireValue(v[2*i+1] > v[1] || (v[2*i+1] === v[1] && v[2*i] >= v[0]));
  }
  if (name === 'Affine') requireValue(Math.abs(v[0]*v[3]-v[1]*v[2]) > 1e-12);
  if (name === 'TextRange') requireValue(v.start < v.end);
  if (name === 'DocHandle') requireValue(v.docHash === v.contentRevision);
  if (name === 'Annotation') {
    const fields: Record<string, string[]> = { highlight: ['quads','textAnchor'], underline: ['quads','textAnchor'], note: ['anchor'], freetext: ['text','fontSize','fontFamily','alignment'], ink: ['paths','width'], rect: ['strokeWidth'], arrow: ['from','to','strokeWidth','endStyle'] };
    for (const key of fields[v.type]) requireValue(key in v);
    if (v.quads) requireValue(v.quads.length); if (v.paths) requireValue(v.paths.length);
  }
  if (name === 'PageText') {
    const glyphs = new Set(v.glyphs.map((g: any) => g.id)), lines = new Set(v.lines.map((l: any) => l.id)); requireValue(glyphs.size === v.glyphs.length);
    const low = (offset: number) => offset > 0 && offset < v.text.length && v.text.charCodeAt(offset) >= 0xdc00 && v.text.charCodeAt(offset) <= 0xdfff;
    for (const item of [...v.spans, ...v.lines]) {
      requireValue(item.range.end <= v.text.length && !low(item.range.start) && !low(item.range.end));
      requireValue(item.glyphIds.every((id: string) => glyphs.has(id))); if (item.lineId) requireValue(lines.has(item.lineId));
    }
  }
  if (name === 'Provider') {
    let url: URL; try { url = new URL(v.baseUrl); } catch { throw new ServiceError('INVALID_PAYLOAD', '提供方地址无效'); }
    requireValue(!url.username && !url.password && !url.search && !url.hash && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))));
    requireValue(new Set(v.models.map((m:any)=>m.modelId)).size===v.models.length);
    requireValue(!/(?:^|\/)\.\.?(?:\/|$)|%|\\/.test(v.baseUrl.slice(v.baseUrl.indexOf('://')+3)));
  }
}
export function canonical(value: unknown): string {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new ServiceError('INVALID_PAYLOAD', '数值必须有限');
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}';
  const encoded = JSON.stringify(value); if (encoded === undefined) throw new ServiceError('INVALID_PAYLOAD', '不能序列化该值'); return encoded;
}
export async function payloadHash(docHash: string, command: Command): Promise<string> {
  validate('Command', command); validate('Hash', docHash);
  const bytes = new TextEncoder().encode(canonical({ schemaVersion: 1, docHash, command }));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
