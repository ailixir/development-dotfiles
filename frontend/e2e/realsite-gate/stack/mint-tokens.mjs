// Local guided-bridge token issuer (replaces the out-of-repo U21 issuer for this laptop only).
// Mints the three short-lived RS256 service JWTs the guided hops need and refreshes them in place.
// usage: CHECKS_GATE_STACK_DIR=<dir> node mint-tokens.mjs once|serve
// Keys (issuer/) and token files (tokens/) live in CHECKS_GATE_STACK_DIR, outside the repository.
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {sign} from 'node:crypto';
import {join} from 'node:path';
const p=process.env.CHECKS_GATE_STACK_DIR;if(!p){console.error('CHECKS_GATE_STACK_DIR is required');process.exit(2);}process.umask(0o077);
const ISS='local-ux-issuer',CTRL='local-ux-controller',WORKER='local-ux-worker';
const key=readFileSync(join(p,'issuer/issuer.private.pem'));
const mode=process.argv[2]??'serve';
function mint(){
  for(const [file,sub,aud,role] of [
    ['runner-controller.jwt',CTRL,'studio-guided-runner','backend-controller'],
    ['translation-controller.jwt',CTRL,'studio-guided-controller','backend-controller'],
    ['worker-callback.jwt',WORKER,'studio-guided-controller','owning-worker']]){
    const now=Math.floor(Date.now()/1000),enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const body=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:ISS,sub,aud,role,iat:now,exp:now+240});
    const tmp=join(p,'tokens',file+'.tmp');
    writeFileSync(tmp,body+'.'+sign('RSA-SHA256',Buffer.from(body),key).toString('base64url'),{mode:0o600});
    renameSync(tmp,join(p,'tokens',file));
  }
}
mint();
if(mode==='serve'){
  const t=setInterval(mint,30000);
  for(const s of ['SIGTERM','SIGINT'])process.once(s,()=>{clearInterval(t);process.exit(0);});
  process.stdout.write('local guided token issuer serving\n');
}
