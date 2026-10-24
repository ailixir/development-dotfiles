#!/usr/bin/env python3
"""Produce off-tree review files only. No source mutation or runtime execution."""
from pathlib import Path
import difflib
import hashlib
import json
import re

OUT = Path(__file__).resolve().parent
ROOT = Path.cwd()
REL = Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
source = (ROOT / REL).read_text()
draft = source
changes = []
sites = [
    (1,'guided/runtime.js',99,'RUNTIME_TIMER'),
    (2,'guided/ownership.js',55,'OWNERSHIP_EXPIRY_TIMER'),
    (3,'guided/ownership.js',180,'OWNERSHIP_RENEW_FAILURE'),
    (4,'guided/ownership.js',219,'OWNERSHIP_CONTEXT_START_FAILURE'),
    (5,'guided/ownership.js',258,'OWNERSHIP_STOP_REQUEST'),
    (6,'guided/ownership.js',263,'OWNERSHIP_STOP_REQUEST'),
    (7,'guided/ownership.js',267,'OWNERSHIP_CLOSE'),
    (8,'guided/runtime.js',201,'BROWSER_LOSS'),
    (9,'guided/runtime.js',122,'START_CATCH'),
    (10,'guided/runtime.js',215,'START_CATCH'),
    (12,'guided/ownership.js',230,'OTHER'),
    (13,'guided/runtime.js',807,'OTHER'),
]
site_rows = []
for identifier, file, line, origin in sites:
    path = ROOT / 'studio-runner/dist' / file
    site_rows.append(dict(site=identifier,file=file,line=line,origin=origin,
        lineSha256=hashlib.sha256(path.read_text().splitlines()[line-1].encode()).hexdigest()))
files = ['guided/runtime.js','guided/ownership.js','run/browser.js','run/guidedBrowser.js','guided/contracts.js']
dist_hashes = {file:hashlib.sha256((ROOT/'studio-runner/dist'/file).read_bytes()).hexdigest() for file in files}
(OUT/'call-site-map.json').write_text(json.dumps(dict(schemaVersion=1,
    status='AUTHOR_REVIEWED_SOURCE_MAP_REQUIRES_INDEPENDENT_EXACT_DIFF_REVIEW',
    matching='nearest unique exact dist URL and line; no matching/ambiguous frame => OTHER; no raw stack exported',
    hashes=dist_hashes,sites=site_rows),indent=2)+'\n')
support = (OUT/'diagnostic-support.mjs').read_text()
support = support.replace('__DIAG_ROOT__','%s').replace('__DIAG_SITES__',json.dumps(site_rows,separators=(',',':'))).replace('__DIAG_HASHES__',json.dumps(dist_hashes,separators=(',',':')))
# Java text blocks must preserve JS backslashes; no runtime helper import is added.
support = support.replace('\\','\\\\')
helper = '\n  private static String p4StartupDiagnosticSupport(String root) throws Exception {\n    return """\n'+support+'"""\n        .formatted(JSON.writeValueAsString(root));\n  }\n\n'

def replace(old, new):
    global draft
    assert draft.count(old)==1, ('anchor count',old[:100],draft.count(old))
    draft = draft.replace(old,new,1)
    changes.append((old,new))

replace('  private static String p4GuidedRevocationObservers() throws Exception {',helper+'  private static String p4GuidedRevocationObservers() throws Exception {')
replace('    return p4RevocationScalarSupport(1)\n        + """','    return p4RevocationScalarSupport(1)\n        + p4StartupDiagnosticSupport(root)\n        + """')
replace('RevRuntime.prototype.start=function(...args){const \\\nresult=Reflect.apply(revStart,this,args),mode=revMode();',
'''RevRuntime.prototype.start=function(...args){const diag=diagBeforeStart(this), \\
result=Reflect.apply(revStart,this,args),mode=revMode();
  diagStartSettled(diag,result);''')
replace('    if(selected)c5GrantRecord(args,false,error,performance.now()-started);throw error;}',
'''    if(selected)c5GrantRecord(args,false,error,performance.now()-started);
    diagGrant(args,false,error);throw error;}''')
replace('  if(selected)c5GrantRecord(args,true,null,performance.now()-started);',
'''  if(selected)c5GrantRecord(args,true,null,performance.now()-started);
  diagGrant(args,true,null);''')
replace('result=Reflect.apply(revInvalidate,this,args),mode=revMode();',
'''result=Reflect.apply(revInvalidate,this,args),mode=revMode();
  diagInvalidated(args[0]);''')
replace('  const result=Reflect.apply(revStop,this,args);',
'''  const diag=diagStopBegin(this,args[0]);
  const result=Reflect.apply(revStop,this,args);
  diagStopForwarded(diag,result);''')
replace('// S2 observes original operation completion only; no native/provider/model/callback call added.',
'''try{diagInstallOwnership();}catch{diagInstallationFailed=true;}

// S2 observes original operation completion only; no native/provider/model/callback call added.''')
# Final sink collection includes the new private ledger and sticky value-free marker.
# Existing native producer directory/files/oracles remain unchanged.
replace('    C5Capture capture = c5Capture;\n    if (capture != null) {\n      capture.collect(sinks);',
'''    Path startupDiagnostics = TEMP.resolve("p4-revocation-producers");
    if (Files.isDirectory(startupDiagnostics, java.nio.file.LinkOption.NOFOLLOW_LINKS)) {
      p4RequirePrivateProducerRoot(startupDiagnostics);
      try (var files = Files.list(startupDiagnostics)) {
        for (Path file : files.filter(path -> path.getFileName().toString()
            .startsWith("diag-start1-")).toList()) {
          assertThat(Files.isSymbolicLink(file)).isFalse();
          assertThat(Files.isRegularFile(file, java.nio.file.LinkOption.NOFOLLOW_LINKS)).isTrue();
          assertThat(file.toRealPath().getParent()).isEqualTo(startupDiagnostics.toRealPath());
          assertThat(Files.size(file)).isLessThanOrEqualTo(16384);
          assertThat(Files.getPosixFilePermissions(file)).isEqualTo(
              java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
          sinks.put("startup-diagnostic/" + file.getFileName(), Files.readAllBytes(file));
        }
      }
    }
    C5Capture capture = c5Capture;
    if (capture != null) {
      capture.collect(sinks);''')
target = OUT/'repo'/REL
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(draft)
# Decode only the embedded Java text-block syntax; parse-only Node check is separate.
def script_block(name):
    start=draft.index('private static String '+name+'(')
    opening=draft.index('"""',start)+3
    end=draft.index('"""',opening)
    text=draft[opening:end]
    if text.startswith('\n'): text=text[1:]
    text=text.replace('\\\n','')
    escapes={'n':'\n','r':'\r','t':'\t','b':'\b','f':'\f','"':'"','\\':'\\'}
    return re.sub(r'\\([nrtbf"\\])',lambda match:escapes[match[1]],text)
arguments=iter(['"state"','"failed"','"origin"','1','"root"','revMarker','revPublish','revCheckRoot();'])
scalar_script=re.sub(r'%[sd]',lambda match:next(arguments),script_block('p4RevocationScalarSupport'))
helper_script=script_block('p4StartupDiagnosticSupport').replace('%s','"file:///review-only/"')
arguments=iter(['"file:///review-only/guided/runtime.js"','"file:///review-only/guided/ownership.js"','"grant"'])
observer_script=re.sub(r'%s',lambda match:next(arguments),script_block('p4GuidedRevocationObservers'))
(OUT/'assembled-syntax-only.mjs').write_text(scalar_script+helper_script+observer_script)
patch = ''.join(difflib.unified_diff(source.splitlines(True),draft.splitlines(True),
    fromfile='a/'+str(REL),tofile='b/'+str(REL)))
(OUT/'diag-start1.patch').write_text(patch)
ordered = lambda text: re.findall(r'(?m)^  void (\w+)\(',text)
assert ordered(source)==ordered(draft)
tests = lambda text: re.findall(r'(?ms)^  @(?:Test|ParameterizedTest)\b.*?^  void (\w+)\(',text)
assert tests(source)==tests(draft)
# Every old Java assertion line remains present in order. New confinement assertions are additional.
original_asserts = re.findall(r'(?m)^.*\b(?:assertThat|assertThatThrownBy|assertThatCode|assertThrows)\(.*$',source)
new_asserts = re.findall(r'(?m)^.*\b(?:assertThat|assertThatThrownBy|assertThatCode|assertThrows)\(.*$',draft)
it=iter(new_asserts)
assert all(any(new==old for new in it) for old in original_asserts)
for symbol in ['revStarted=true;revRuntimes.set(runtime,mode);',
               'if(!runtime.accepting||revStarted)throw new Error(\'OWNER\');',
               'if(mode.c6===4)hooks.beforeSecretFill=value=>',
               'const originalStop = this.stop(\'CONTEXT_LOST\');']:
    # Last symbol belongs to production runtime and is checked through freeze, not ReplayIT.
    if symbol in source: assert source.count(symbol)==draft.count(symbol)
counts={name:dict(before=source.count(name),after=draft.count(name)) for name in [
    'Reflect.apply(revStart,this,args)','Reflect.apply(revStop,this,args)',
    'Reflect.apply(revCheck,this,args)','Reflect.apply(revInvalidate,this,args)',
    'revRuntimes.set(','revRuntimes.delete(','cleanupUnconfirmed',
    "new Error('C6_RELEASED '",'UNKNOWN_OUTCOME','p3AttemptTeardown(']}
assert all(value['before']==value['after'] for name,value in counts.items() if name!='UNKNOWN_OUTCOME')
reconstructed=draft
for old,new in reversed(changes):
    assert reconstructed.count(new)==1
    reconstructed=reconstructed.replace(new,old,1)
assert reconstructed==source
frozen=json.loads((OUT/'frozen-before.json').read_text())['files']
changed=[row['path'] for row in frozen if hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest()!=row['sha256']]
assert not changed, changed
(OUT/'static-review.json').write_text(json.dumps(dict(schemaVersion=1,
    scope='static author checks only; no compile/format/test/runtime proof',
    orderedMethodNames=ordered(source),orderedNamesPreserved=True,
    orderedAnnotatedTestNames=tests(source),orderedAnnotatedTestNamesPreserved=True,
    originalAssertionLines=len(original_asserts),originalAssertionsPreservedInOrder=True,
    removingOnlyDeclaredDiagnosticChangesReconstructsOriginalByteForByte=True,
    authoritativeBlockSymbolCounts=counts,frozenFilesChecked=len(frozen),frozenFilesChanged=changed,
    fullClassRuntime='NOT_RUN_NOT_AUTHORIZED',independentReview='REQUIRED'),indent=2)+'\n')
manifest=[]
for path in sorted(OUT.rglob('*')):
    if path.is_file() and path.name not in ['manifest.json']:
        manifest.append(dict(path=str(path.relative_to(OUT)),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size))
(OUT/'manifest.json').write_text(json.dumps(dict(schemaVersion=1,sourceSha256=hashlib.sha256(source.encode()).hexdigest(),
    candidateSha256=hashlib.sha256(draft.encode()).hexdigest(),patchSha256=hashlib.sha256(patch.encode()).hexdigest(),files=manifest),indent=2)+'\n')
print(json.dumps(dict(candidate=str(target.relative_to(ROOT)),patchSha256=hashlib.sha256(patch.encode()).hexdigest(),
    frozenFilesUnchanged=len(frozen),testMethodsPreserved=len(ordered(source)),assertionLinesPreserved=len(original_asserts))))
