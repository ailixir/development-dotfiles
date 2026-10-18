import {describe,expect,it} from 'vitest';
import schemas from '../../src/guided/schemas.json' with {type:'json'};
import {auditSchemaBundle,validate} from '../../src/guided/contracts.js';
describe('schema declaration inventory versus instance progress',()=>{
  it('loads the actual frozen guided bundle including replay operation Step inventory',()=>{expect(()=>auditSchemaBundle(schemas)).not.toThrow();});
  it('audits definitions independently without treating declarations as value traversal',()=>{
    const root={$id:'https://schema.test/operation',type:'object',properties:{kind:{const:'click'}},definitions:{Step:{type:'object',properties:{operations:{type:'array',items:{$ref:'https://schema.test/operation'}}}}}};
    expect(()=>auditSchemaBundle({root})).not.toThrow();
  });
  it.each([{$ref:'#/definitions/self',definitions:{self:{$ref:'#/definitions/self'}}},{allOf:[{$ref:'https://schema.test/root'}]}, {dependencies:{present:{$ref:'https://schema.test/root'}}},{not:{$ref:'https://schema.test/root'}}])('refuses genuinely non-progressing evaluation %#',mutation=>{expect(()=>auditSchemaBundle({root:{$id:'https://schema.test/root',...mutation}})).toThrow('SCHEMA_CONFIGURATION');});
  it('still audits unused declarations for unknown or unresolved constraints',()=>{for(const definition of [{unknownKeyword:true},{$ref:'#/definitions/missing'}])expect(()=>auditSchemaBundle({root:{$id:'https://schema.test/root',definitions:{unused:definition}}})).toThrow('SCHEMA_CONFIGURATION');});
  it('refuses recursive supplied data at the wire depth ceiling before canonicalization',()=>{const cyclic:{self?:unknown}={};cyclic.self=cyclic;expect(()=>validate('runner-context',cyclic)).toThrow('SCHEMA');let nested:unknown={};for(let i=0;i<65;i++)nested={child:nested};expect(()=>validate('runner-context',nested)).toThrow('SCHEMA');});
});
