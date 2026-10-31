// Regenerates catalog.json, backend-guided.yml and runner-extra.json in CHECKS_GATE_STACK_DIR (public values only).
// STUDIO-FLEX-001: the only navigation control is the allowed-domains list below (backend + runner).
import fs from 'node:fs';
import { assertFree, gatePorts } from './ports.mjs';import { coreDeclaration } from './core-declaration.mjs';import {execFileSync} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const S=process.env.CHECKS_GATE_STACK_DIR,R=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
if(!S){console.error('CHECKS_GATE_STACK_DIR is required');process.exit(2);}
const P=gatePorts();
try{await assertFree(['runner','connector'],P);}catch(e){console.error('[gen-config] '+e.message);process.exit(1);}
const IMAGE='549e74b321c4dbba636ec0e5c6cf91bd49af5979af016f299285f9de9bd8aadb'; // any 64-hex; pinned in catalog + runner env
const catalogJson=execFileSync('node',['scripts/print-observed-catalog.mjs',IMAGE],{cwd:process.env.CHECKS_GATE_RUNNER_DIR??R+'/studio-runner'}).toString().trim();
fs.writeFileSync(S+'/catalog.json',catalogJson+'\n');
const catalog=JSON.parse(catalogJson);
const DOMAINS='localhost,example.com,practicetestautomation.com';
const pub=fs.readFileSync(S+'/issuer/issuer.public.pem','utf8'),q=JSON.stringify;
fs.writeFileSync(S+'/backend-guided.yml',`# Local guided-bridge overlay for the release-gate stack (written outside the repo). No secrets: public key, catalog.
studio:
  navigation:
    allowed-domains: ${q(DOMAINS)}
    allow-all-domains: true
  guided-authoring:
    runner-origin: ${q('https://127.0.0.1:'+P.runner)}
    controller-token-file: ${q(S+'/tokens/runner-controller.jwt')}
    service-public-key: ${q(pub)}
    service-issuer: "local-ux-issuer"
    connector:
      port: ${P.connector}
    translation:
      enabled: true
      worker-id: "local-ux-worker"
      controller-origin: "https://127.0.0.1:${P.connector}"
      controller-token-file: ${q(S+'/tokens/translation-controller.jwt')}
      verify-steps: false
      call-seconds: 60
  observed-replay:
    catalog-json: ${q(JSON.stringify([catalog]))}
`,{mode:0o600});
fs.writeFileSync(S+'/runner-extra.json',JSON.stringify({
 STUDIO_RUNNER_INSTANCE_ID:'local-ux-runner',STUDIO_RUNNER_ALLOWED_DOMAINS:DOMAINS,STUDIO_RUNNER_GUIDED_ENABLED:'true',STUDIO_RUNNER_GUIDED_CAPACITY:'1',STUDIO_RUNNER_ALLOW_ALL_DOMAINS:'true',STUDIO_RUNNER_GUIDED_WORKER_ID:'local-ux-worker',
 STUDIO_RUNNER_GUIDED_JOURNAL_DIR:S+'/journal',STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER:'local-ux-issuer',STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT:'local-ux-controller',
 STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE:S+'/issuer/issuer.public.pem',STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL:'https://127.0.0.1:'+P.connector,
 STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE:S+'/tokens/worker-callback.jwt',STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED:'true',STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED:'true',
 STUDIO_RUNNER_OBSERVED_CATALOG_FILE:S+'/catalog.json',STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST:catalog.build.executableImageDigest,
 STUDIO_RUNNER_RECORDING_WIDTH:'1280',STUDIO_RUNNER_RECORDING_HEIGHT:'720'},null,1),{mode:0o600});
fs.writeFileSync(S+'/core-declaration.json',JSON.stringify(coreDeclaration(R),null,1)+'\n',{mode:0o600});
console.log('gen-config ok; catalog',catalogJson.slice(0,60));
