import pathlib,json,re,hashlib,collections,datetime
root=pathlib.Path.cwd();q=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/left-drafts-rereview');base=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early');D=base/'left-data-draft'/'resume2';M=base/'left-main-draft';dm=json.loads((D/'manifest.json').read_text());mm=json.loads((M/'manifest.json').read_text());sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest();checks={};details={};allrows=dm['files']+mm['files'];overlay={x['path']:(None if x['operation']=='delete' else (D if x in dm['files'] else M)/'repo'/x['path']) for x in allrows}
checks['SixteenUniqueExactOwnedPaths']=len(allrows)==len(overlay)==16;checks['All16CurrentPreimagesAndCandidatesMatch']=all(sha(x['path'])==x['beforeSha256'] and (x['operation']=='delete' or sha(overlay[x['path']])==x['afterSha256']) for x in allrows)
for package in [D,M]:checks[package.name+'ChecksumsMatch']=all(sha(package/line.split('  ',1)[1])==line.split('  ',1)[0] for line in (package/'SHA256SUMS').read_text().splitlines())
# Apply unified hunks only to in-memory original strings, including the one deletion.
combined=(D/'left-data-draft.patch').read_text()+(M/'left-main-draft.patch').read_text();lines=combined.splitlines(keepends=True);i=0;reconstructed=[]
while i<len(lines):
 if not lines[i].startswith('--- '):i+=1;continue
 oldpath=lines[i][4:].strip().removeprefix('a/');newpath=lines[i+1][4:].strip();p=oldpath if newpath=='/dev/null' else newpath.removeprefix('b/');old=pathlib.Path(oldpath).read_text().splitlines(keepends=True);out=[];cur=0;i+=2
 while i<len(lines) and not lines[i].startswith('--- '):
  h=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',lines[i])
  if not h:i+=1;continue
  pos=int(h[1])-1 if int(h[2] or 1) else int(h[1]);out.extend(old[cur:pos]);cur=pos;i+=1
  while i<len(lines) and not lines[i].startswith(('@@ ','--- ')):
   s=lines[i]
   if s.startswith(' '):assert old[cur]==s[1:];out.append(s[1:]);cur+=1
   elif s.startswith('-'):assert old[cur]==s[1:];cur+=1
   elif s.startswith('+'):out.append(s[1:])
   elif s.startswith('\\ No newline'):pass
   else:break
   i+=1
 out.extend(old[cur:]);b=''.join(out).encode();expected=b'' if overlay[p] is None else overlay[p].read_bytes();reconstructed.append({'path':p,'deletion':overlay[p] is None,'exact':b==expected,'reconstructedSha256':hashlib.sha256(b).hexdigest()})
checks['Combined16PathPatchReconstructsExactOutputs']=len(reconstructed)==16 and all(x['exact'] for x in reconstructed);details['patchReconstruction']=reconstructed;details['combinedPatchSha256']=hashlib.sha256(combined.encode()).hexdigest()
# Java lexical mask preserves offsets for delimiter/parameter inspection, not a Java compiler.
def mask(s):
 pat=r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|/\*[\s\S]*?\*/|//[^\n]*'
 return re.sub(pat,lambda m:''.join('\n' if c=='\n' else ' ' for c in m[0]),s)
def body(s,name):
 t=mask(s);matches=list(re.finditer(r'\b'+re.escape(name)+r'\s*\(',t));
 for h in matches:
  line=t.rfind('\n',0,h.start())+1
  if not re.search(r'\b(?:public|private|protected|void)\b',t[line:h.start()]):continue
  j=h.end();depth=1
  while depth:depth+=(t[j]=='(')-(t[j]==')');j+=1
  brace=t.find('{',j)
  if brace<0:continue
  depth=1;k=brace+1
  while depth:depth+=(t[k]=='{')-(t[k]=='}');k+=1
  return s[line:k]
 raise ValueError(name)
def testnames(s):return re.findall(r'@Test\s+(?:public\s+)?void\s+(\w+)\s*\(',mask(s))
details['namedTestDeltas']=[]
for x in dm['files']:
 old=pathlib.Path(x['path']).read_text();new='' if x['operation']=='delete' else overlay[x['path']].read_text();a=testnames(old);b=testnames(new);details['namedTestDeltas'].append({'path':x['path'],'before':a,'after':b,'drops':list((collections.Counter(a)-collections.Counter(b)).elements()),'adds':list((collections.Counter(b)-collections.Counter(a)).elements()),'changedRetainedBodies':[n for n in a if n in b and body(old,n)!=body(new,n)]})
checks['DataNamedSourceMethodCounts80to78']=sum(len(x['before']) for x in details['namedTestDeltas'])==80 and sum(len(x['after']) for x in details['namedTestDeltas'])==78
checks['PrefixOnlyP3ExistingMethodChanged']=next(x for x in details['namedTestDeltas'] if x['path'].endswith('GuidedReplayingPrefixMigrationIT.java'))['changedRetainedBodies']==['publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys']
fixture='backend/src/test/java/com/citi/put/checks/studio/support/GuidedPublicationEvidenceFixture.java';old=pathlib.Path(fixture).read_text();new=overlay[fixture].read_text();checks['SharedBootstrapExact']=body(old,'captureSharedBootstrap')==body(new,'captureSharedBootstrap');idx=lambda s:s.index('  private static boolean contains(');checks['FixtureHelpersFromContainsExact']=old[idx(old):]==new[idx(new):]
start=json.loads(pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/start-capture.json').read_text());migrations=[x for x in start['files'] if x['path'].startswith('backend/src/main/resources/db/migration/')];checks['All22MigrationsMatchS011']=len(migrations)==22 and all(sha(x['path'])==x['sha256'] for x in migrations) and not any('/db/migration/' in x for x in overlay);details['migrationHashes']=migrations
# Global broad matcher against actual and candidate overlays, excluding no extra source paths.
broad=re.compile('HistoricalV18|requireV18|historicalV18|HistoricalFault|probeHistoricalAdapter|changedHistoricalCommand|historicalRows|verifyHistorical|readHistoricalV18|historical-v18');v18=re.compile('HistoricalV18|requireV18|historicalV18|HistoricalFault|probeHistoricalAdapter|changedHistoricalCommand|historicalRows|readHistoricalV18|historical-v18');before=[];after=[];vbefore=[];vafter=[];sources={str(p):p.read_text() for p in pathlib.Path('backend/src').rglob('*') if p.is_file() and p.suffix in ['.java','.sql','.yml','.xml','.properties']}
for p,s in sources.items():
 n=overlay[p].read_text() if p in overlay and overlay[p] is not None else '' if p in overlay else s
 for string,rows,pattern in [(s,before,broad),(n,after,broad),(s,vbefore,v18),(n,vafter,v18)]:
  rows.extend({'path':p,'line':i,'text':line} for i,line in enumerate(string.splitlines(),1) if pattern.search(line))
allow=json.loads(pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/left-v20-allowed-matches.json').read_text());checks['Broad78toExact4AllowedMatches']=len(before)==78 and after==[{k:x[k] for k in ['path','line','text']} for x in allow['matches']];checks['AllowedV20FileAnd4LineHashesMatch']=all(sha(x['path'])==allow['sourceSha256'] and hashlib.sha256(x['text'].encode()).hexdigest()==x['lineSha256'] for x in allow['matches']);checks['V18Specific70toZero']=len(vbefore)==70 and not vafter;details['broadAfter']=after;details['specificCounts']=[len(vbefore),len(vafter)]
# Eight retired-name hits include literals/reflective lookup strings; retain their positive controls.
names=['isCanonical','updateAuthoring','allocationIds','isApiAssigned','providerName','getSecretName','pollIntervalOrDefault','readIntervalOrDefault'];hits={}
for name in names:
 hits[name]=[{'path':p,'line':i,'text':line} for p,s in sources.items() for i,line in enumerate(s.splitlines(),1) if re.search(r'\b'+name+r'\b',line)]
checks['EightNamesOnlyOneOriginalDeclarationEach']=all(len(x)==1 for x in hits.values());checks['EightNamesAbsentFromCandidateSourceOverlay']=all(not any(re.search(r'\b'+n+r'\b',overlay[p].read_text() if p in overlay and overlay[p] is not None else '' if p in overlay else s) for p,s in sources.items()) for n in names);details['retiredNamesBefore']=hits
# Positional constructions, including fully qualified and nested forms.
def constructions(candidate):
 rows=[]
 for p,s in sources.items():
  if not p.endswith('.java'):continue
  if candidate and p in overlay:s='' if overlay[p] is None else overlay[p].read_text()
  t=mask(s)
  for h in re.finditer(r'\bnew\s+([\w.]+)\s*\(',t):
   typ=h[1]
   if not (typ.endswith('StudioExecutionProperties') or typ.endswith('StudioExecutionProperties.Dispatcher') or typ.endswith('StudioExecutionProperties.Sse') or p.endswith('/StudioExecutionProperties.java') and typ in ['Dispatcher','Sse']):continue
   start=h.end();j=start;depth=1;commas=0
   while depth:
    c=t[j]
    if c=='(':depth+=1
    elif c==')':depth-=1
    elif c==',' and depth==1:commas+=1
    j+=1
   rows.append({'path':p,'type':typ,'arity':commas+1 if t[start:j-1].strip() else 0,'arguments':s[start:j-1]})
 return rows
cb=constructions(False);ca=constructions(True);details['constructionsBefore']=cb;details['constructionsAfter']=ca;checks['All27Constructions3AuthorizedArityChanges']=len(cb)==len(ca)==27 and [(a['path'],a['type'],a['arity'],b['arity']) for a,b in zip(cb,ca) if a['arity']!=b['arity']]==[('backend/src/main/java/com/citi/put/checks/studio/StudioExecutionProperties.java','Dispatcher',5,4),('backend/src/main/java/com/citi/put/checks/studio/StudioExecutionProperties.java','Sse',8,7),('backend/src/test/java/com/citi/put/checks/studio/dispatch/StudioKillSwitchWiringTest.java','StudioExecutionProperties.Dispatcher',5,4)]
kill='backend/src/test/java/com/citi/put/checks/studio/dispatch/StudioKillSwitchWiringTest.java';checks['KillSwitchOnlyFinalNestedNullRemoved']=overlay[kill].read_text()==pathlib.Path(kill).read_text().replace('new StudioExecutionProperties.Dispatcher(false, null, null, null, null)','new StudioExecutionProperties.Dispatcher(false, null, null, null)')
checks['UnchangedOuterConstructionArgumentsExceptC6NestedRename']=all(a['arguments']==b['arguments'] or (a['path']==kill and a['type']=='StudioExecutionProperties' and b['arguments']==a['arguments'].replace('new StudioExecutionProperties.Dispatcher(false, null, null, null, null)','new StudioExecutionProperties.Dispatcher(false, null, null, null)')) for a,b in zip(cb,ca) if a['type'].endswith('StudioExecutionProperties'))
# No application YAML change except removed dead leaf; protected blocks then follow by exact equality.
yaml='backend/src/main/resources/application.yml';checks['YAMLOnlyDeadLeafRemoved']=overlay[yaml].read_text()==pathlib.Path(yaml).read_text().replace('      read-interval: ${STUDIO_SSE_READ_INTERVAL:750ms}\n','')
secret='backend/src/main/java/com/citi/put/checks/studio/secrets/StudioSecretsService.java';checks['SecretExecutableBytesConstant4096Preserved']=mask(pathlib.Path(secret).read_text()).split()==mask(overlay[secret].read_text()).split() and 'static final int MAX_VALUE_LENGTH = 4096;' in overlay[secret].read_text()
service='backend/src/main/java/com/citi/put/checks/studio/StudioService.java';old=pathlib.Path(service).read_text();alias=body(old,'updateAuthoring');needle='  /** Alias matching the existing update naming used by repository/service callers. */\n  @Transactional\n'+alias+'\n\n';checks['StudioServiceOnlyExactAliasCommentRemoved']=overlay[service].read_text()==old.replace(needle,'')
# Check exactly two obsolete rules and all retained floor declarations.
gradle='backend/build.gradle.kts';old=pathlib.Path(gradle).read_text();new=overlay[gradle].read_text();details['coverageFloorsBefore']=re.findall(r'minimum = "([.0-9]+)"',old);details['coverageFloorsAfter']=re.findall(r'minimum = "([.0-9]+)"',new);checks['RemainingCoverageFloors70andFour75']=details['coverageFloorsAfter']==['0.70','0.75','0.75','0.75','0.75'];expected=old
for marker in ['        // Story 10.5 AC-15:','        // Story 10.9 AC-23:']:
 a=expected.index(marker);r=expected.index('        rule {',a);brace=expected.index('{',r);masktext=mask(expected);j=brace+1;depth=1
 while depth:depth+=(masktext[j]=='{')-(masktext[j]=='}');j+=1
 expected=expected[:a]+expected[j+1:]
checks['GradleOnlyTwoRetiredRulesAndTheirCommentsRemoved']=new==expected
prior=D.parent; priorQa=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/left-drafts'); pub='repo/backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationMigrationTest.java';a=(prior/pub).read_text();b=(D/pub).read_text();expiryStart=a.index(',\n                        \"UPDATE studio_guided_sessions SET expires_at=');end=a.index(')) {',expiryStart);withoutOldExpiry=a[:expiryStart]+a[end:];sqlStart=b.index('                // J8 SQL tier:');sqlEnd=b.index('                // A transaction-local receipt trigger',sqlStart);tier=b[sqlStart:sqlEnd];withoutNewTier=b[:sqlStart]+b[sqlEnd:]
checks['CorrectionOnlyExpiryLoopRemovalAndSeparateSQLTier']=withoutOldExpiry==withoutNewTier
checks['SQLTierNoWriterCallAndRollbackBeforeUpdate']='publications.commit(' not in tier and tier.index('t.setRollbackOnly();')<tier.index('db.jdbc.update(')
checks['SQLTierPinsExactTypedCauseStateMessageRollback']=all(x in tier for x in ['org.springframework.dao.DataAccessException.class','getMostSpecificCause()','org.postgresql.util.PSQLException.class','sql.getSQLState()).isEqualTo(\"P0001\")','sql.getServerErrorMessage()).isNotNull()','sql.getServerErrorMessage().getMessage())','isEqualTo(\"guided identity is immutable\")','commandRows(db.jdbc, command)','isEqualTo(before)'])
checks['OtherFourDataPathsUnchangedFromReviewedDraft']=all(x['operation']=='delete' or (D/'repo'/x['path']).read_bytes()==(prior/'repo'/x['path']).read_bytes() for x in dm['files'] if not x['path'].endswith('/GuidedPublicationMigrationTest.java'))
checks['FiveMutantsByteExactAndUnexecuted']=len(json.loads((D/'mutants/manifest.json').read_text())['mutants'])==5 and all((D/'mutants'/x.name).read_bytes()==x.read_bytes() for x in (prior/'mutants').glob('*.patch')) and all(not x['executed'] for x in json.loads((D/'mutants/manifest.json').read_text())['mutants'])
checks['OriginalDataDraftChecksumsPreserved']=all(sha(prior/line.split('  ',1)[1])==line.split('  ',1)[0] for line in (prior/'SHA256SUMS').read_text().splitlines())
checks['OriginalQAReviewAllChecksumsPreserved']=all(sha(priorQa/line.split('  ',1)[1])==line.split('  ',1)[0] for line in (priorQa/'SHA256SUMS').read_text().splitlines())
checks['OriginalDataMainReviewNamedHashesPreserved']=sha(prior/'manifest.json')=='3c7b6fdcd526c85427f4540127d92cc24a55a00eec0421ce756765fb2505e1b2' and sha(M/'manifest.json')=='174b5d34348b86f97762aa70a75e5c8682509708a9232aaf6fffbde213c9f9ea' and sha(priorQa/'review.md')=='ec6e8645291f8c1521aea5c023ffcaef3410513fc1b519b8b48401667c06dbb5'
checks['CurrentOwnedPreimagesStillS011']=all({r['path']:r['sha256'] for r in start['files']}[x['path']]==x['beforeSha256'] for x in allrows)
checks['SpecifiedCorrectionArtifactHashesMatch']=sha(D/'receipt.md')=='f9142788af183fd600df24f1e705582a7d08baf867d47c5d0633d996f6ca222b' and sha(D/'manifest.json')=='b2674b841e45cc2d91d3b11d522741002b4c4cbf9a9d6c7677918a8badb63066' and sha(D/'left-data-draft.patch')=='0566bcf43e01f923b2f5e8e48e75eabe07354b91c48dccad7777f5c8f5a00e50'
checks['CombinedAtomicPatchExactExpectedHash']=details['combinedPatchSha256']=='ae8c32ab789eee4cb38d049b636dc171d1194908acd0da003a03905e664c8c01'
details['correctedSQLTierSource']=tier

mods={str(p):sha(p) for p in [D/'manifest.json',D/'left-data-draft.patch',M/'manifest.json',M/'left-main-draft.patch',pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v7.json'),pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/left-v20-allowed-matches.json')]};details['artifactHashes']=mods;details['noCompilationOrMutationProof']=True
(q/'static-evidence.json').write_text(json.dumps({'artifact':'independent-LEFT-static-review','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':checks,'allStaticChecksPassed':all(checks.values()),'details':details,'sourceWrites':False,'compilerTestsBuildsRun':False,'gitWrites':False,'diagnosticHandleTouched':False},indent=2)+'\n');print(json.dumps({'checks':checks,'allStaticChecksPassed':all(checks.values()),'artifactHashes':mods},indent=2))
