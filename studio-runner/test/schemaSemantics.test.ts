import {afterAll,describe,expect,it,vi} from 'vitest';
const {schema}=vi.hoisted(()=>({schema:{$id:'https://checks.citi.example/contracts/observed/v3/semantics.schema.json',type:'object',additionalProperties:false,properties:{first:{type:'string'},second:{type:'string'},gate:{type:'boolean'},allow:{type:'boolean'},deny:{type:'boolean'},empty:{type:'boolean'},ids:{type:'array',contains:{type:'string',format:'uuid'}}},required:['ids'],dependencies:{allow:true,deny:false,empty:[],first:['second'],gate:{type:'object',properties:{second:{const:'allowed'}},required:['second']}}}}));
vi.mock('../src/guided/schemas.json',()=>({default:{'semantics.schema.json':schema}}));
vi.mock('../src/validator/observedSchemas.json',()=>({default:{semantics:schema}}));
import * as guided from '../src/guided/contracts.js';
import * as observed from '../src/validator/observedReferencePolicy.js';
afterAll(()=>{vi.doUnmock('../src/guided/schemas.json');vi.doUnmock('../src/validator/observedSchemas.json');});
const uuid='00000000-0000-4000-8000-000000000001';
for(const [name,validate]of [['guided',(value:unknown)=>guided.validate('semantics',value)],['observed',(value:unknown)=>observed.validateObserved('semantics',value)]]as const)describe(`${name} complete draft07 keyword semantics`,()=>{
  it('applies property dependencies by presence, including empty string',()=>{expect(()=>validate({ids:[uuid],first:''})).toThrow();expect(()=>validate({ids:[uuid],first:'',second:'value'})).not.toThrow();});
  it('applies schema dependencies to the entire instance, including a false trigger',()=>{expect(()=>validate({ids:[uuid],gate:false})).toThrow();expect(()=>validate({ids:[uuid],gate:false,second:'wrong'})).toThrow();expect(()=>validate({ids:[uuid],gate:false,second:'allowed'})).not.toThrow();expect(()=>validate({ids:[uuid],second:'wrong'})).not.toThrow();});
  it('requires one contains witness and validates every UUID lexeme exactly',()=>{expect(()=>validate({ids:[]})).toThrow();expect(()=>validate({ids:['missing']})).toThrow();expect(()=>validate({ids:['missing',uuid]})).not.toThrow();expect(()=>validate({ids:[uuid+'x']})).toThrow();expect(()=>validate({ids:['00000000000040008000000000000001']})).toThrow();});
  it('supports empty property dependencies and boolean schema dependencies',()=>{expect(()=>validate({ids:[uuid],empty:false,allow:false})).not.toThrow();expect(()=>validate({ids:[uuid],deny:false})).toThrow();});
  it('keeps closed shape refusal while checking new semantics',()=>{expect(()=>validate({ids:[uuid],trusted:true})).toThrow();});
});
describe('guided audit still refuses unsupported/malformed dependency schemas',()=>{
  it.each([{dependencies:{first:['second','second']}},{dependencies:{first:[1]}},{dependencies:{first:{$ref:'#/dependencies/first'}}},{dependencies:{first:{unknownKeyword:true}}},{properties:{id:{format:'unrecognized-format'}}}])('rejects malformed bundle %#',mutation=>{expect(()=>guided.auditSchemaBundle({root:{$id:schema.$id,...mutation}})).toThrow();});
});
