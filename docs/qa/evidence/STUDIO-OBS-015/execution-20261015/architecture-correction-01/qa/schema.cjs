// Independent design schema checks only; no application imports or services.
const fs=require('node:fs'),path=require('node:path'),Ajv=require('ajv');
const base=path.dirname(__dirname),root=path.resolve(base,'../../../../../..');
const read=p=>JSON.parse(fs.readFileSync(p));
const ajv=new Ajv({strict:false,allErrors:true});require('ajv-formats')(ajv);
const contracts=path.join(root,'docs/specs/studio-observed-authoring/contracts/v3');
for(const filename of fs.readdirSync(contracts).filter(n=>n.endsWith('.schema.json'))){const s=read(path.join(contracts,filename));if(s.$id)ajv.addSchema(s);}
const schema=read(path.join(base,'interfaces.schema.json'));ajv.addSchema(schema);
const validate=ajv.compile({$ref:schema.$id+'#/definitions/CorrectedValidationBasis'}),fixture=read(path.join(base,'fixtures.json'));
const cases=[];
for(const positive of fixture.positives)cases.push({name:positive.name,kind:'positive',schemaValid:validate(positive.basis),errors:validate.errors});
for(const negative of fixture.semanticNegatives)cases.push({name:negative.name,kind:'negative-input-shape',schemaValid:validate(negative.basis),errors:validate.errors});
const additional=[];const sample=fixture.positives[0].basis,clone=x=>JSON.parse(JSON.stringify(x));
function test(name,mutate){const value=clone(sample);mutate(value);const valid=validate(value);additional.push({name,expected:false,actual:valid,ok:!valid});}
test('claimed-current-snapshot-output-refused',b=>b.snapshotEvidence.current.stepSnapshotHashes={});
test('private-variable-value-refused',b=>b.snapshotEvidence.current.authoredDeclarations[0].value='private-canary');
test('unknown-authoring-context-key-refused',b=>b.snapshotEvidence.current.authoring.steps[0].context.pageSource='private-canary');
test('claimed-input-chain-refused',b=>b.snapshotEvidence.current.inputChain='f'.repeat(64));
test('recursive-base-basis-refused',b=>b.snapshotEvidence.pastValidationBasis={});
test('missing-current-source-refused',b=>delete b.snapshotEvidence.current.authoring);
test('numeric-authored-timestamp-refused',b=>b.snapshotEvidence.current.authoring.steps[0].context.evidenceReferences=[{id:'00000000-0000-4000-8000-000000000001',revision:1,source:'supplied',csiId:'CSI-123',environment:'test',route:'/',state:'test',stepId:'00000000-0000-4000-8000-000000000001',capturedAt:1234,completeness:'complete',hash:'f'.repeat(64)}]);
const errors=[...cases.filter(c=>c.kind==='positive'&&!c.schemaValid),...additional.filter(c=>!c.ok)];
const result={classification:'INDEPENDENT_SYNTHETIC_CLOSED_SCHEMA_ONLY',createdAt:new Date().toISOString(),cases,additional,errors,status:errors.length?'FAIL':'PASS',applicationTestsExecuted:0,databaseCommandsExecuted:0,browserCommandsExecuted:0};
fs.writeFileSync(path.join(__dirname,'schema-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,positiveSchemas:4,negativeShapeInputs:16,additionalClosedNegatives:additional.length,errors},null,2));process.exitCode=errors.length?1:0;
