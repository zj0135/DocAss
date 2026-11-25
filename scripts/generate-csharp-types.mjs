import {readFileSync,writeFileSync} from 'node:fs';
const defs=JSON.parse(readFileSync('src/shared/contracts.schema.json','utf8')).$defs;
const scalar=name=>['Id','Hash'].includes(name)?'string':['Box','Quad','Affine','Point'].includes(name)?'double[]':defs[name]?.anyOf?'JsonElement':name==='CommitCommand'?'CommitCommandDto':name;
const type=s=>s.$ref?scalar(s.$ref.split('/').at(-1)):s.anyOf?'JsonElement':s.type==='array'?type(s.items)+'[]':s.type==='object'?'JsonElement':s.type==='integer'?'long':s.type==='number'?'double':s.type==='boolean'?'bool':s.type==='string'?'string':s.const!==undefined?typeof s.const==='number'?'int':typeof s.const==='boolean'?'bool':'string':s.enum?typeof s.enum[0]==='number'?'int':'string':'JsonElement';
let output='// Generated from the shared schema. Validate before deserializing wire data.\n#nullable enable\nusing System.Text.Json;\nusing System.Text.Json.Serialization;\nnamespace DocAss.Host.Contracts;\n';
for(const [name,s]of Object.entries(defs)){
 if(!s.properties||['DocHandle','CommitResult'].includes(name))continue;
 output+=`public sealed record ${scalar(name)}\n{\n`;
 for(const [key,value]of Object.entries(s.properties)){const optional=!s.required.includes(key);output+=`${optional?'    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]\n':''}    public ${type(value)}${optional?'?':''} ${key[0].toUpperCase()+key.slice(1)} { get; init; } = default!;\n`;}
 output+='}\n';
}
writeFileSync('src/host/DocAss.Host/Contracts/Models.g.cs',output);
