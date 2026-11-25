import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const schema = JSON.parse(readFileSync('src/shared/contracts.schema.json', 'utf8'));
function type(s) {
  if (s.$ref) return s.$ref.split('/').at(-1);
  if (s.anyOf) return s.anyOf.map(type).join(' | ');
  if ('const' in s) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map(v => JSON.stringify(v)).join(' | ');
  if (s.type === 'object') return s.properties ? '{ ' + Object.entries(s.properties).map(([k, v]) => `${k}${s.required.includes(k) ? '' : '?'}: ${type(v)}`).join('; ') + ' }' : 'Record<string, unknown>';
  if (s.type === 'array') return s.minItems === s.maxItems ? '[' + Array(s.maxItems).fill(type(s.items)).join(', ') + ']' : `(${type(s.items)})[]`;
  return ({ integer: 'number', number: 'number', string: 'string', boolean: 'boolean', null: 'null' })[s.type] ?? 'unknown';
}
mkdirSync('src/web/src/contracts', {recursive:true});
writeFileSync('src/web/src/contracts/types.ts', '// Generated from src/shared/contracts.schema.json by scripts/generate-types.mjs.\n' + Object.entries(schema.$defs).map(([k,v])=>`export type ${k} = ${type(v)};`).join('\n') + '\n');
