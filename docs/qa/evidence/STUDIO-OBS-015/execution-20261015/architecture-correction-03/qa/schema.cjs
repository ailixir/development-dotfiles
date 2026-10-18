// Independent design-only marker and unchanged public-wire compatibility checks.
const fs=require('node:fs'),path=require('node:path'),Ajv=require('ajv');
const base=path.dirname(__dirname),root=path.resolve(base,'../../../../../..'),read=p=>JSON.parse(fs.readFileSync(p));
const ajv=new Ajv({strict:false,allErrors:true});require('ajv-formats')(ajv);
const directory=path.join(root,'docs/specs/studio-observed-authoring/contracts/v3');
for(const file of fs.readdirSync(directory).filter(n=>n.endsWith('.schema.json'))){const value=read(path.join(directory,file));if(value.$id)ajv.addSchema(value);}
const marker=read(path.join(base,'interfaces.schema.json'));ajv.addSchema(marker);
const fixture=read(path.join(base,'fixtures.json')),ask=fixture.stateCases.find(c=>c.operation==='ask'),rows=[];
function check(name,ref,value,expected){const validate=ajv.compile({$ref:ref}),actual=validate(value);rows.push({name,expected,actual,ok:expected===actual});}
check('prefix-marker-pending',marker.$id,ask.marker,true);
check('prefix-marker-confirmed',marker.$id,{...ask.marker,status:'CONFIRMED'},true);
for(const field of ['clarificationId','status','prefixRequestDigest']){const x={...ask.marker};delete x[field];check('prefix-marker-requires-'+field,marker.$id,x,false);}
check('prefix-marker-rejects-consent-bool',marker.$id,{...ask.marker,confirmed:true},false);
check('prefix-marker-rejects-new-run-consent',marker.$id,{...ask.marker,status:'RUN_CLICKED'},false);
check('prefix-marker-rejects-opaque-nonhash-request',marker.$id,{...ask.marker,prefixRequestDigest:'old-session'},false);
const prefix='https://checks.citi.example/contracts/observed/v3/';
check('existing-observed-authored-confirmation-question',prefix+'clarification.schema.json',ask.question,true);
for(const [i,c]of fixture.timingCases.entries())for(const [j,t]of c.items.entries())check('existing-sixfield-timing-'+i+'-'+j,prefix+'action-timing.schema.json',t,true);
const session=read(path.join(directory,'session.schema.json'));
const states=session.properties.state.enum;
rows.push({name:'AWAITING_CLARIFICATION-already-public-state',expected:true,actual:states.includes('AWAITING_CLARIFICATION'),ok:states.includes('AWAITING_CLARIFICATION')});
const result={classification:'DESIGN_PRIVATE_MARKER_AND_EXISTING_PUBLIC_SCHEMA_ONLY',createdAt:new Date().toISOString(),cases:rows,errors:rows.filter(c=>!c.ok),status:rows.every(c=>c.ok)?'PASS':'FAIL',applicationTestsExecuted:0,databaseCommandsExecuted:0,browserCommandsExecuted:0,buildCommandsExecuted:0};
fs.writeFileSync(path.join(__dirname,'schema-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,cases:rows.length,errors:result.errors},null,2));process.exitCode=result.errors.length?1:0;
