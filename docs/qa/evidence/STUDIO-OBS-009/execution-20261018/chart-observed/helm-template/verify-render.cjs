const path='/Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner/node_modules/yaml';
const {parseAllDocuments}=require(path);
const fs=require('fs');
const assert=require('assert');
function docs(f){return parseAllDocuments(fs.readFileSync(f,'utf8')).map(d=>d.toJS()).filter(Boolean);}
const out=process.argv[2];
for (const name of ['uat-observed','uat-additional-backend-catalog','default-observed-on-not-uat','uat-validation-only','uat-replay-only']) {
  const ds=docs(`${out}/${name}.rendered.yaml`);
  const cm=ds.find(d=>d.kind==='ConfigMap'&&d.metadata.name.endsWith('-studio-observed-trust'));
  const catalog=JSON.parse(cm.data['catalog.json']);
  const policies=JSON.parse(cm.data['policies.json']);
  const runner=ds.find(d=>d.kind==='Deployment'&&d.metadata.name.endsWith('-studio-runner'));
  const c=runner.spec.template.spec.containers[0];
  const env=Object.fromEntries(c.env.filter(e=>e.value!==undefined).map(e=>[e.name,e.value]));
  assert.strictEqual(env.STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST,catalog.build.executableImageDigest);
  assert.ok(c.image.endsWith('@sha256:'+catalog.build.executableImageDigest), c.image);
  assert.deepStrictEqual(Object.keys(catalog).sort(),['build','profile']);
  const vol=runner.spec.template.spec.volumes.find(v=>v.name==='studio-observed-trust');
  const mount=c.volumeMounts.find(m=>m.name==='studio-observed-trust');
  assert.strictEqual(vol.configMap.name,cm.metadata.name);
  assert.strictEqual(vol.configMap.defaultMode,288);
  assert.strictEqual(mount.readOnly,true); assert.strictEqual(mount.subPath,undefined);
  assert.strictEqual(env.STUDIO_RUNNER_OBSERVED_CATALOG_FILE,mount.mountPath+'/catalog.json');
  assert.strictEqual(env.STUDIO_RUNNER_OBSERVED_POLICY_FILE,mount.mountPath+'/policies.json');
  assert.strictEqual(runner.spec.template.spec.containers.length,1);
  const secretsNow=runner.spec.template.spec.volumes.filter(v=>v.secret).length;
  for (const role of ['api','worker']) {
    const dep=ds.find(d=>d.kind==='Deployment'&&d.metadata.name.endsWith('-'+role));
    const pcm=ds.find(d=>d.kind==='ConfigMap'&&d.metadata.name.endsWith('-'+role+'-properties'));
    const props=require(path).parse(pcm.data['application.yaml']);
    const bc=JSON.parse(props['studio.observed-replay.catalog-json']);
    const bp=JSON.parse(props['studio.observed-replay.policies-json']);
    assert.deepStrictEqual(bc[0],catalog,'runner entry first');
    assert.deepStrictEqual(bp,policies);
    if(name==='uat-additional-backend-catalog'){assert.strictEqual(bc.length,2);assert.notDeepStrictEqual(bc[1],catalog);}else assert.strictEqual(bc.length,1);
  }
  console.log(name,'OK flags',env.STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED,env.STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED,'image',c.image.split('@')[1].slice(0,14)+'…','secretVolumes',secretsNow);
}
// off: default-runner-enabled
for (const name of ['default-runner-enabled','uat-observed-flags-off']) {
  const ds=docs(`${out}/${name}.rendered.yaml`);
  const runner=ds.find(d=>d.kind==='Deployment'&&d.metadata.name.endsWith('-studio-runner'));
  const c=runner.spec.template.spec.containers[0];
  const names=c.env.map(e=>e.name);
  const obs=c.env.filter(e=>e.name.includes('OBSERVED'));
  assert.deepStrictEqual(obs.map(e=>e.name+'='+e.value),['STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED=false','STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED=false']);
  assert.ok(!c.image.includes('@sha256'),c.image);
  assert.ok(!ds.some(d=>d.kind==='ConfigMap'&&d.metadata.name.includes('observed')));
  assert.ok(!runner.spec.template.spec.volumes.some(v=>v.name==='studio-observed-trust'));
  for (const role of ['api','worker']) {
    const pcm=ds.find(d=>d.kind==='ConfigMap'&&d.metadata.name.endsWith('-'+role+'-properties'));
    assert.ok(!pcm.data['application.yaml'].includes('observed-replay'));
  }
  console.log(name,'OK (flags false only; tag image; no ConfigMap; no volume; no backend props)',c.image);
}
