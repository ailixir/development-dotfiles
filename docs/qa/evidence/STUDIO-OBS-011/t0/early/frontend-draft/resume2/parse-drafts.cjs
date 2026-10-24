// Static parsing only. Does not import, compile, emit or execute product modules.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require(path.resolve('frontend/node_modules/typescript'));
const root = process.cwd();
const out = path.join(root, 'docs/qa/evidence/STUDIO-OBS-011/t0/early/frontend-draft/resume2');
const manifest = JSON.parse(fs.readFileSync(path.join(out, 'copy-back-manifest.json'), 'utf8'));
const parse = (file) => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const parsed = manifest.entries.filter(e => /\.tsx?$/.test(e.path)).map(e => ({path:e.path, source:parse(path.join(out,'repo',e.path))}));
const failures = parsed.flatMap(({path: file,source}) => source.parseDiagnostics.map(d => ({file, code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')})));
function record(sf,name) {
  let result;
  function visit(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name) {
      let init=n.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init=init.expression;
      if (!ts.isObjectLiteralExpression(init)) throw Error(name+' is not an object');
      result=init;
    }
    ts.forEachChild(n,visit);
  }
  visit(sf); if (!result) throw Error('missing '+name);
  return new Map(result.properties.map(p => [p.name.getText(sf),p.initializer]));
}
const g='frontend/src/components/studio/guided/';
const original=parse(path.join(root,g,'guidedNarratives.ts'));
const runtime=parse(path.join(out,'repo',g,'guidedNarratives.ts'));
const registry=parse(path.join(out,'repo',g,'guidedCopySources.test-support.ts'));
const before=record(original,'GUIDED_COPY');
const after=record(runtime,'GUIDED_COPY');
const metadata=record(registry,'GUIDED_COPY_SOURCES');
const props=(obj,sf)=>new Map(obj.properties.map(p=>[p.name.getText(sf),p.initializer.getText(sf)]));
const rows=[];
for (const [key,obj] of before) {
  const old=props(obj,original), now=props(after.get(key),runtime), moved=props(metadata.get(key),registry);
  rows.push({key,templateExact:old.get('template')===now.get('template'),runtimeOnlyTemplate:now.size===1,metadataExact:[...old].filter(([p])=>p!=='template').every(([p,value])=>moved.get(p)===value),metadataFieldSetExact:JSON.stringify([...old.keys()].filter(p=>p!=='template'))===JSON.stringify([...moved.keys()])});
}
function testNames(sf) {
  const names=[];
  function visit(n) {
    if(ts.isCallExpression(n) && n.arguments.length && ts.isStringLiteral(n.arguments[0]) && ['it','test'].includes(n.expression.getText(sf))) names.push(n.arguments[0].text);
    ts.forEachChild(n,visit);
  }
  visit(sf);return names;
}
const nameMaps=parsed.filter(e=>e.path.endsWith('.test.ts')||e.path.endsWith('.test.tsx')).map(({path:file,source})=>{
  const old=testNames(parse(path.join(root,file))), now=testNames(source);
  return {file,beforeNames:old,afterNames:now,drops:old.filter(n=>!now.includes(n)),additions:now.filter(n=>!old.includes(n))};
});
const result={status:'STATIC_PARSE_ONLY_NO_TYPECHECK_NO_TEST_NO_BUILD',parserVersion:ts.version,syntaxDiagnostics:failures,keysExact:JSON.stringify([...before.keys()])===JSON.stringify([...after.keys()])&&JSON.stringify([...before.keys()])===JSON.stringify([...metadata.keys()]),copyRows:rows,testNames:nameMaps,assertedNoProductExecution:true};
fs.writeFileSync(path.join(out,'ast-static-evidence.json'),JSON.stringify(result,null,2)+'\n');
if (failures.length || !result.keysExact || rows.some(r=>!r.templateExact||!r.runtimeOnlyTemplate||!r.metadataExact||!r.metadataFieldSetExact)) process.exitCode=1;
console.log(JSON.stringify({syntaxDiagnostics:failures.length,copyKeys:rows.length,templatesAndMetadataExact:rows.every(r=>r.templateExact&&r.runtimeOnlyTemplate&&r.metadataExact&&r.metadataFieldSetExact),testNameChanges:nameMaps.map(m=>({file:m.file,drops:m.drops,additions:m.additions}))},null,2));
