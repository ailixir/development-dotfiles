"""Pure accepted-GST06 prospective FOLD overlap proof. No product/native actions."""
from pathlib import Path
import ast,hashlib,json,re,stat
D=Path(__file__).resolve().parent;R=next(p for p in D.parents if (p/'AGENTS.md').is_file());T=R/'docs/qa/evidence/STUDIO-OBS-011/t0'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();read=lambda p:json.loads(p.read_text())
def main():
 i=read(D/'inputs.json');helper=R/i['pureHelper'];assert h(helper)==i['pureHelperSha256']
 nodes=[n for n in ast.parse(helper.read_text()).body if isinstance(n,ast.FunctionDef) and n.name in {'masked','method_span','methods','assertions','apply_strict'}];assert len(nodes)==5;s={'re':re};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<pure-lexical-source-definitions>','exec'),s)
 atomic=read(R/i['originalAtomicManifest']);assert h(R/i['originalAtomicManifest'])==i['originalAtomicManifestSha256'];overlay=read(D/'prospective-operation-overlay.json');rules=read(D/'type-port-map.json');assert h(D/'type-port-map.json')==i['originalTypePortMapSha256']
 assert h(T/'resume2-gst-unit06-closed-green-root-adoption.json')==i['acceptedGstRootAdoptionSha256'];assert h(T/'resume2-fold-lifecycle-owner-root-adoption.json')==i['lifecycleOwnerAdoptionSha256']
 assert len(atomic['operations'])==37 and overlay['prospectiveOperationCount']==38
 paths={x['path'] for x in overlay['overlapAndLifecyclePreviews']};assert overlay['unchangedOriginalOperationRecords']==[x for x in atomic['operations'] if x['path'] not in paths] and len(overlay['unchangedOriginalOperationRecords'])==35
 methods=assertions=0
 for row in overlay['overlapAndLifecyclePreviews']:
  source=row['path'];original=T/'runtime/obs011-gst-provisional-06/formatted-candidate-archive'/Path(source).name;candidate=D/'preview'/source
  assert h(original)==row['preimageSha256'] and h(candidate)==row['candidateSha256'];assert h(R/source)==row['preimageSha256'] and stat.S_IMODE((R/source).stat().st_mode)==stat.S_IMODE(candidate.stat().st_mode)==0o644
  a=original.read_text();b=candidate.read_text();mapped=a;ledger=[];rr=rules[:1] if source.endswith('GuidedLifecycleReasonIT.java') else rules
  for rule in rr:
   n=mapped.count(rule['before'])
   if n:mapped=mapped.replace(rule['before'],rule['after']);ledger.append({**rule,'replacements':n})
  assert mapped==b and ledger==row['typePortMapping']
  aa=s['methods'](a);bb=s['methods'](b);assert [(v['name'],v['annotation']) for v in aa]==[(v['name'],v['annotation']) for v in bb];methods+=len(aa)
  def port(v):
   for rule in rr:v=v.replace(rule['before'],rule['after'])
   return v
  assert all(port(x['body'])==y['body'] for x,y in zip(aa,bb))
  ax=s['assertions'](a);bx=s['assertions'](b);assert [port(v) for v in ax]==bx;assertions+=len(ax)
  assert h(D/row['patch'])==row['patchSha256'] and h(D/row['restorePatch'])==row['restorePatchSha256'];assert s['apply_strict'](a,(D/row['patch']).read_text())==b;assert s['apply_strict'](b,(D/row['restorePatch']).read_text())==a
  if source.endswith('GuidedLifecycleReasonIT.java'):assert len(ledger)==1 and ledger[0]['replacements']==1 and row['originalAtomicOperation'] is None
 assert methods==80 and assertions==813
 if (D/'manifest.json').exists():
  for x in read(D/'manifest.json')['files']:assert h(D/x['path'])==x['sha256']
 print(json.dumps({'status':'STATIC_CONTINGENT_FOLD_OVERLAP_PASS_NOT_RELEASED','methods':methods,'assertions':assertions,'allBodiesAndExpressionsExactModuloOnlyDeclaredTypePorts':True,'strictForwardReversePatches':True,'previews':3,'prospectiveOperations':38,'unchangedOriginalRecords':35,'actualSourceWritten':False,'nativeOrIRClockOrCredit':False}))
if __name__=='__main__':main()
