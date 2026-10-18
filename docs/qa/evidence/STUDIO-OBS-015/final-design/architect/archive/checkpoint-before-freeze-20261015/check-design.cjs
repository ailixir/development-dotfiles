// Pure design-schema/vector checks only; no application imports, build, database or browser.
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto'); const Ajv = require('ajv');
const dir = __dirname; const root = path.resolve(dir, '../../../../../..');
const ajv = new Ajv({strict:false, allErrors:true});
try {require('ajv-formats')(ajv);} catch { for (const name of ['uuid','uri','date-time']) ajv.addFormat(name,true); }
const contracts=path.join(root,'docs/specs/studio-observed-authoring/contracts/v3');
for(const name of fs.readdirSync(contracts).filter(n=>n.endsWith('.schema.json'))){const value=JSON.parse(fs.readFileSync(path.join(contracts,name)));if(value.$id)ajv.addSchema(value);}
const schema=JSON.parse(fs.readFileSync(path.join(dir,'interfaces.schema.json')));ajv.addSchema(schema);
const fixtures=JSON.parse(fs.readFileSync(path.join(dir,'fixtures.json')));const errors=[];
for(const test of fixtures.schemaCases){const validate=ajv.compile({$ref:schema.$id+'#/definitions/'+test.definition});const ok=validate(test.value);if(ok!==test.valid)errors.push({name:test.name,expected:test.valid,actual:ok,errors:validate.errors});}
function canonical(v){if(v===null||typeof v==='boolean')return JSON.stringify(v);if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))throw Error('number');return String(v);}if(typeof v==='string')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>{if(!/^[\x20-\x7e]*$/.test(k))throw Error('key');return JSON.stringify(k)+':'+canonical(v[k]);}).join(',')+'}';}
const hash=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
for(const test of fixtures.canonicalVectors){const text=canonical(test.input);if(text!==test.canonical||Buffer.from(text).toString('hex')!==test.canonicalUtf8Hex||hash(test.input)!==test.sha256)errors.push({vector:test.name});}
const {base,edit4}=fixtures.tenStepChain;const equal=[];const changed=[];
for(let i=0;i<10;i++){for(const rows of [base,edit4]){const row=rows[i];if(hash(row.stepInput)!==row.chain.stepInputHash||hash(row.chain)!==row.snapshot.inputChain||hash(row.learnedContent)!==row.snapshot.learnedStepHash||hash(row.snapshot)!==row.snapshotHash)errors.push({chain:i});if(i>0&&row.chain.previous!==hash(rows[i-1].chain))errors.push({chainPrevious:i});}if(base[i].snapshotHash===edit4[i].snapshotHash)equal.push(i+1);else changed.push(i+1);}
if(JSON.stringify(equal)!=='[1,2,3]')errors.push({equal});
const find=n=>fixtures.canonicalVectors.find(v=>v.name===n);
if(find('producer-before-consumer-deletion').sha256!==find('producer-after-last-consumer-deletion').sha256)errors.push({producerHash:false});
if(find('consumer-before-deletion').sha256===find('consumer-after-edge-removal').sha256)errors.push({consumerHash:false});
const ordered=find('utf8-reference-order-BMP-before-astral').input.map(x=>x.referenceId);if(Buffer.compare(Buffer.from(ordered[0]),Buffer.from(ordered[1]))>=0)errors.push({unicodeOrder:false});
const result={kind:'DESIGN_CHECK_ONLY',applicationTestsRun:0,generatedAt:new Date().toISOString(),schemaCases:fixtures.schemaCases.length,canonicalVectors:fixtures.canonicalVectors.length,tenStepEqual:equal,tenStepChanged:changed,errors,status:errors.length?'FAIL':'PASS'};
fs.writeFileSync(path.join(dir,'design-check-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));process.exitCode=errors.length?1:0;
