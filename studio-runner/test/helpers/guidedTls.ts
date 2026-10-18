import { readFileSync } from 'node:fs';
import { X509Certificate, sign } from 'node:crypto';
import { request } from 'node:https';
export const testKey=readFileSync(new URL('../fixtures/guided-tls/key.fixture',import.meta.url));
export const testCert=readFileSync(new URL('../fixtures/guided-tls/cert.fixture',import.meta.url));
export const testTls={key:testKey,cert:testCert,ca:testCert};
export const testFingerprint=new X509Certificate(testCert).fingerprint256;
export const jwtPolicy={issuer:'fixture-issuer',subject:'controller',publicKey:testCert.toString()};
export function jwt(overrides:Record<string,unknown>={}):string {
  const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');const now=Math.floor(Date.now()/1000);
  const payload=Buffer.from(JSON.stringify({iss:'fixture-issuer',sub:'controller',aud:'studio-guided-runner',role:'backend-controller',iat:now,exp:now+180,...overrides})).toString('base64url');
  const body=`${header}.${payload}`;return `${body}.${sign('RSA-SHA256',Buffer.from(body),testKey).toString('base64url')}`;
}
export function post(port:number,path:string,body:unknown,options:{token?:string;fence?:number|null;certificate?:boolean;key?:string;raw?:Buffer}={}):Promise<{status:number;body:unknown}> {
  return new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path,method:'POST',...(options.certificate===false?{ca:testCert}:testTls),headers:{authorization:`Bearer ${options.token??jwt()}`,'content-type':'application/json','idempotency-key':options.key??'request',...(options.fence===null?{}:{'x-owner-fence':String(options.fence??1)})}},res=>{let data='';res.on('data',(b:Buffer)=>{data+=b.toString();});res.on('end',()=>{resolve({status:res.statusCode??0,body:JSON.parse(data) as unknown});});});req.on('error',reject);req.end(options.raw??JSON.stringify(body));
  });
}

/** The listener settings a test runner is built with: the fixture pair, pinned to the fixture certificate itself. */
export const testListener={tls:testTls,controllerCertificateFingerprint256:testFingerprint};
/** `fetch` over the one TLS listener, presenting the pinned test controller certificate. */
export function secureFetch(url:string,init:{method:string;headers:Record<string,string>;body:string|ArrayBuffer}):Promise<{status:number;json():Promise<unknown>;text():Promise<string>}> {
  return new Promise((resolve,reject)=>{
    const body=typeof init.body==='string'?Buffer.from(init.body):Buffer.from(init.body);
    const req=request(url,{method:init.method,headers:{...init.headers,'content-length':String(body.length)},...testTls},res=>{const chunks:Buffer[]=[];res.on('data',(chunk:Buffer)=>chunks.push(chunk));res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');resolve({status:res.statusCode??0,json:()=>Promise.resolve(JSON.parse(text) as unknown),text:()=>Promise.resolve(text)});});});
    req.on('error',reject);req.end(body);
  });
}
