import {describe,expect,it} from 'vitest';
import {parseDocumentJson} from './helpers/documentJson.js';
import {parseWireJson} from '../src/guided/json.js';
const read=(text:string):unknown=>parseDocumentJson(Buffer.from(text),33554432);
describe('bounded inert test-document JSON reader',()=>{
  it('preserves deliberate fractional/exponent/negative-zero values while product wire parser refuses them',()=>{
    expect(read('{"time":100.5,"exponent":1e2}')).toEqual({time:100.5,exponent:100});expect(Object.is(read('-0'),-0)).toBe(true);
    for(const text of ['100.5','1e2','-0'])expect(()=>parseWireJson(Buffer.from(text))).toThrow('SCHEMA');
  });
  it.each(['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"nested":{"a":1,"a":2}}','1e9999','01','1.','NaN','{} {}','[1,]','{"a":1,}','"\\ud800"','\ufeff{}'])('rejects malformed document %s without echo',text=>{expect(()=>read(text)).toThrow('DOCUMENT_JSON');});
  it('rejects malformed UTF8, depth and independent bytes',()=>{expect(()=>parseDocumentJson(new Uint8Array([0xff,0xfe]),100)).toThrow();expect(()=>parseDocumentJson(Buffer.from('{"v":1}'),3)).toThrow();expect(()=>read('['.repeat(66)+'0'+']'.repeat(66))).toThrow();});
  it('retains dangerous-looking keys as own data without prototype mutation',()=>{const value=read('{"__proto__":{"polluted":true}}');expect(Object.getPrototypeOf(value)).toBe(Object.prototype);expect(Object.hasOwn(value as object,'__proto__')).toBe(true);expect(({} as Record<string,unknown>).polluted).toBeUndefined();});
});
