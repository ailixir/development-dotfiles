"""Static author evidence only. Never reads the live real ReplayIT or runs Java/Gradle/Node."""
from pathlib import Path
from collections import Counter
import re,json,hashlib,csv
from inspect_loops import SRC,mask_java
OUT=Path(__file__).resolve().parent
REL=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()

def assertions(source):
    masked=mask_java(source);result=[]
    for m in re.finditer(r'\b(?:assertThat|assertThatThrownBy|assertThatCode|assertThrows|assertTrue|assertFalse)\s*\(',masked):
        depth=0;i=m.start()
        while i<len(masked):
            c=masked[i]
            if c in '({[':depth+=1
            elif c in ')}]':depth-=1
            elif c==';' and depth<=0:break
            i+=1
        result.append(source[m.start():i+1])
    return result

def normalized(s):
    s=re.sub(r'itrRead\d{3}_(\w+)',r'\1',s)
    s=re.sub(r'itr\d{3}\.(\w+)',r'\1',s)
    s=s.replace('RECEIPTS.subList(itrRec0, RECEIPTS.size())','RECEIPTS')
    s=s.replace('VALUES.subList(itrVal0, VALUES.size())','VALUES')
    s=s.replace('VALUES.get(itrVal0)','VALUES.get(0)')
    s=re.sub(r'itrNav0\s*\+\s*([13])',r'\1',s)
    s=re.sub(r'itrRec0\s*\+\s*([13])',r'\1',s)
    return re.sub(r'\s+','',s)

def names(source):
    return re.findall(r'(?ms)^  @(?:org\.junit\.jupiter\.(?:params\.)?)?(?:Test|ParameterizedTest)\b.*?^  void (\w+)\(',source)

def sleep_calls(source):
    masked=mask_java(source);out=[]
    for m in re.finditer(r'\b(?:Thread|java\.util\.concurrent\.TimeUnit\.NANOSECONDS)\.sleep\s*\(',masked):
        p=masked.index('(',m.start());depth=1;i=p+1
        while depth:
            if masked[i]=='(':depth+=1
            elif masked[i]==')':depth-=1
            i+=1
        out.append(source[m.start():i+1])
    return out

rows=list(csv.DictReader((OUT.parent/'11-IT-R/sleep-table.tsv').open(),delimiter='\t'))
old_sleeps=sleep_calls(SRC);assert len(old_sleeps)==95
deliberate=[call for row,call in zip(rows,old_sleeps) if row['class']=='DELIBERATE']
old_asserts=Counter(normalized(a) for a in assertions(SRC))
old_textblocks=re.findall(r'""".*?"""',SRC,re.S)
results=[]
for stage in json.loads((OUT/'stages.json').read_text()):
    candidate=(OUT/'stages'/stage['stage']/'repo'/REL).read_text();assert sha(candidate)==stage['candidateSha256']
    observed=Counter(normalized(a) for a in assertions(candidate));missing=old_asserts-observed
    assert not missing,(stage['stage'],list(missing.items())[:10])
    assert names(SRC)==names(candidate)
    assert re.findall(r'""".*?"""',candidate,re.S)==old_textblocks
    # Lexical balance is static evidence, never a Java syntax/type check.
    masked=mask_java(candidate);stack=[]
    for character in masked:
        if character in '({[':stack.append(character)
        elif character in ')}]':assert stack and '({['.index(stack.pop())==')}]'.index(character)
    assert not stack
    assert 'awaitLast(' not in candidate and 'class Await ' not in candidate
    remaining=sleep_calls(candidate)
    expected=[call for row,call in zip(rows,old_sleeps) if row['class']=='DELIBERATE' or row['batch'] not in stage['batches'] or int(row['id']) in stage.get('carriedPollIds',[])]
    assert remaining==expected
    results.append({**stage,'orderedAnnotatedTestMethods':len(names(candidate)),
      'singleTestAnnotations':len(re.findall(r'(?m)^  @Test$',candidate)),
      'originalAssertionStatements':sum(old_asserts.values()),'originalAssertionsPreservedAfterTransparentAliasAndRelativeBaselineNormalization':True,
      'allEmbeddedTextBlocksByteIdentical':True,'embeddedTextBlockCount':len(old_textblocks),
      'sleepCallSequencePreservedForUnconvertedAndDeliberateRows':True,
      'lexicalDelimiterBalance':True,'javaCompilation':'NOT_RUN','runtimeProof':'NOT_RUN'})
assert sleep_calls((OUT/'stages/04-b4/repo'/REL).read_text())==deliberate
(OUT/'static-review.json').write_text(json.dumps({'schemaVersion':1,'scope':'AUTHOR_STATIC_ONLY_NO_JAVA_SYNTAX_TYPE_OR_RUNTIME_CLAIM',
  'verifiedBackupOriginalSha256':sha(SRC),'orderedOriginalAnnotatedTestNames':names(SRC),
  'stages':results},indent=2)+'\n')
print(json.dumps({'stages':len(results),'originalAssertions':sum(old_asserts.values()),'annotatedMethods':len(names(SRC)),
                  'singletons':len(re.findall(r'(?m)^  @Test$',SRC)),'deliberateCallsRetained':len(deliberate)}))
