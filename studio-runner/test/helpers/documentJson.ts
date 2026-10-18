/** Strict bounded JSON for inert test documents. Product wire parsing remains integer-only. */
export function parseDocumentJson(bytes:Uint8Array,maxBytes:number):unknown {
  if(bytes.byteLength>maxBytes)throw new Error('DOCUMENT_JSON');
  try{
    const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);let index=0,nodes=0;
    const whitespace=():void=>{while(/[\x20\t\r\n]/u.test(text[index]??'x'))index++;};
    const string=():string=>{
      const start=index++;
      while(index<text.length){const character=text[index++];if(character==='\\'){index++;continue;}if(character==='"'){const result=JSON.parse(text.slice(start,index)) as string;if(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(result))throw new Error();return result;}}
      throw new Error();
    };
    const value=(depth:number):unknown=>{
      if(depth>64||++nodes>4000000)throw new Error();whitespace();const character=text[index];
      if(character==='"')return string();
      if(character==='{'){
        index++;whitespace();const result:Record<string,unknown>={};if(text[index]==='}'){index++;return result;}
        for(;;){whitespace();if(text[index]!=='"')throw new Error();const key=string();if(Object.hasOwn(result,key))throw new Error();whitespace();if(text[index++]!==':')throw new Error();Object.defineProperty(result,key,{value:value(depth+1),enumerable:true,writable:true,configurable:true});whitespace();const separator=text[index++];if(separator==='}')return result;if(separator!==',')throw new Error();}
      }
      if(character==='['){index++;whitespace();const result:unknown[]=[];if(text[index]===']'){index++;return result;}for(;;){result.push(value(depth+1));whitespace();const separator=text[index++];if(separator===']')return result;if(separator!==',')throw new Error();}}
      for(const [literal,result]of [['true',true],['false',false],['null',null]]as const)if(text.startsWith(literal,index)){index+=literal.length;return result;}
      const match=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(text.slice(index));if(!match)throw new Error();index+=match[0].length;const result=Number(match[0]);if(!Number.isFinite(result))throw new Error();return result;
    };
    const result=value(0);whitespace();if(index!==text.length)throw new Error();return result;
  }catch{throw new Error('DOCUMENT_JSON');}
}
