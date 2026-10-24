from pathlib import Path
import re,json,hashlib,difflib,textwrap
O=Path(__file__).resolve().parent
ROOT=Path.cwd()
NAMES=['GuidedServiceTransportFaultIT','GuidedPlanningIntegrationTest','SecretUseAuditIT','GuidedPublicationRaceTest','GuidedFocusMutationJoinedIT','GuidedEvidencePendingAppendJoinedIT']
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
def mask(s):
 return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/',lambda m:''.join('\n' if c=='\n' else ' ' for c in m[0]),s)
def span(s,needle):
 assert s.count(needle)==1,(needle,s.count(needle))
 start=s.index(needle); end=s.index('{',start); m=mask(s);d=1;i=end+1
 while d:
  if m[i]=='{':d+=1
  elif m[i]=='}':d-=1
  i+=1
 return start,end,i
records=[]
def convert(s,needle,key,deadline,interval,fields='',pre='',body_transform=lambda x:x,guard_transform=lambda x:x,post='',rethrow='Exception',before_guard=''):
 a,b,c=span(s,needle); old=s[a:c]; indent=s[s.rfind('\n',0,a)+1:a];assert indent.strip()==''
 cond=s[a+len('while ('):b].rstrip(); assert cond.endswith(')');cond=cond[:-1]
 body=s[b+1:c-1]
 body=body_transform(body)
 # Replace only the original polling sleep with its original interruption boundary.
 sleep=re.search(r'Thread\.sleep\([^;]+\);',body)
 if sleep:
  line_indent=body[body.rfind('\n',0,sleep.start())+1:sleep.start()]
  replacement=('if (Thread.interrupted()) {\n'+line_indent+'  throw new InterruptedException();\n'+line_indent+'}\n'+line_indent+'slept = true;\n'+line_indent+'return false;')
  body=body[:sleep.start()]+replacement+body[sleep.end():]
 else: assert 'return false;' in body
 # Move body into local check; original statement order remains unchanged.
 body='\n'+textwrap.indent(textwrap.dedent(body).strip(),'      ')+'\n'
 fieldlines='\n'.join('  '+x for x in fields.split('\n')) if fields else ''
 cls='ItsPoll'+key
 fail=('''if (poll.failure instanceof InterruptedException interrupted) {
  throw interrupted;
}
if (poll.failure instanceof RuntimeException exception) {
  throw exception;
}''' if rethrow=='InterruptedException' else '''if (poll.failure instanceof Exception exception) {
  throw exception;
}''')+'''
if (poll.failure instanceof Error error) {
  throw error;
}'''
 out=pre+f'''class {cls} {{
  Throwable failure;
  boolean slept;
  boolean initialAwaitTick = true;
{fieldlines}

  boolean step() {{
    try {{
      if (slept && Thread.interrupted()) {{
        throw new InterruptedException();
      }}
{textwrap.indent(before_guard,'      ')}
      if (!({guard_transform(cond)})) {{
        return true;
      }}{body}
    }} catch (Throwable caught) {{
      failure = caught;
      return true;
    }}
  }}
}}
var poll = new {cls}();
if (!poll.step()) {{
  try {{
    org.awaitility.Awaitility.await()
        .alias("IT-S {key}")
        .pollInSameThread()
        .dontCatchUncaughtExceptions()
        .pollDelay(java.time.Duration.ZERO)
        .pollInterval(java.time.Duration.ofMillis({interval}))
        .atMost(java.time.Duration.ofNanos(Math.max(1L, {deadline} - System.nanoTime())))
        .until(
            () -> {{
              if (poll.initialAwaitTick) {{
                poll.initialAwaitTick = false;
                return false;
              }}
              return poll.step();
            }});
  }} catch (org.awaitility.core.ConditionTimeoutException itsTimeout) {{
    // Preserve the original last guard/observation and its assertion/error mapping.
    poll.step();
  }}
}}
{fail}
{post}'''.rstrip()
 # block scopes isolate poll local names at repeated sites; pre/post stay inside block.
 out=re.sub(r'\bpoll\b','itsPoll',out)
 out='{\n'+ '\n'.join('  '+line for line in out.splitlines())+'\n}'
 out=('\n'+indent).join(out.split('\n'))
 out='\n'.join(line.rstrip() for line in out.split('\n'))
 records.append(dict(id=key,originalLoop=old,replacement=out,intervalMs=interval,absoluteDeadline=deadline,oldSha256=sha(old),newSha256=sha(out)))
 return s[:a]+out+s[c:]

sources={}; originals={}; paths={}
for n in NAMES:
 p=next(Path('backend/src/test').rglob(n+'.java'));paths[n]=p;originals[n]=p.read_text()
 sources[n]=(O.parent/'gs-t-draft/repo'/p).read_text() if n==NAMES[0] else originals[n]
assert sha(sources[NAMES[0]])=='10d3706043430730edc921804dd1b8eb06a5326eb690f8c33f2571d7300fe1b5'
bases=sources.copy()
# Shared-body private helpers remain private; no new helper outside these owned files.
for n in [NAMES[1],NAMES[4],NAMES[5]]:
 s=sources[n];s=convert(s,'while (!condition.getAsBoolean() && System.nanoTime() < end)',n+'-condition','end',25);sources[n]=s
# V20 recording wait retains its detailed final diagnostic assertion verbatim.
sources[NAMES[5]]=convert(sources[NAMES[5]],'while (recordingRows(id) != 1 && System.nanoTime() < end)','Evidence-recording','end',50)
# Actual database lock observation on caller thread, no retry of mutation.
s=sources[NAMES[2]]
s=s.replace('      boolean waited = false;\n','')
s=convert(s,'while (System.nanoTime() < until)','Secret-terminal-row-lock','until',20,fields='boolean waited;',body_transform=lambda b:b.replace('          break;','          return true;'),post='waited = poll.waited;' if False else 'assertThat(poll.waited).isTrue();')
s=s.replace('      assertThat(waited).isTrue();\n','')
sources[NAMES[2]]=s
s=sources[NAMES[3]];s=s.replace('      boolean waiting = false;\n','')
s=convert(s,'while (System.nanoTime() < until && !waiting)','Race-publisher-row-lock','until',10,fields='boolean waiting;',post='assertThat(poll.waiting).as("actual publisher waits on PostgreSQL source row lock").isTrue();',body_transform=lambda b:b.replace('''        if (!waiting) {
          Thread.sleep(10);
        }''','''        if (waiting) {
          return true;
        }
        Thread.sleep(10);'''))
s=s.replace('      assertThat(waiting).as("actual publisher waits on PostgreSQL source row lock").isTrue();\n','');sources[NAMES[3]]=s
# Transport derives planner-issued GS-T candidate.
s=sources[NAMES[0]]
# result return is delayed only until the local step finishes; identical single returned row.
start=s.index('  private static Map<String, Object> awaitOwnRowBlocker(');end=s.index('  private static void assertNoInheritedLockDeadline',start)
part=s[start:end]
part=convert(part,'while (System.nanoTime() < until)','Transport-owned-row-lock','until',20,fields='Map<String, Object> result;',body_transform=lambda b:b.replace('return rows.getFirst();','result = rows.getFirst();\n        return true;'),post='if (poll.result != null) {\n  return poll.result;\n}',rethrow='InterruptedException')
s=s[:start]+part+s[end:]
# Two route idle loops have the same text; select by distinct containing method region.
needle='while (!route.idle() && System.nanoTime() < until)'
for k in ['Transport-route-idle-observe','Transport-route-idle-cleanup']:
 a=s.index(needle);b=s.index(needle,a+len(needle)) if k.endswith('observe') else -1
 if b>=0:
  # Temporarily sentinel the second identical loop, restoring byte-exact afterwards.
  sent='while (!route.idle() && System.nanoTime() < until /* later site */)'
  s=s[:b]+s[b:].replace(needle,sent,1)
  s=convert(s,needle,k,'until',20)
  s=s.replace(sent,needle,1)
 else:s=convert(s,needle,k,'until',20)
# Child marker read happens after each interval; initial marker read remains outside.
needle='while (!stageContent.equals(expectedStage)'
def stage_body(b):
 b=b.replace('        Thread.sleep(10);\n        stageContent = readStageOrEmpty(stageFile);','''        if (Thread.interrupted()) {
          throw new InterruptedException();
        }
        slept = true;
        return false;''')
 return b
# Stage uses an effectively-final process alias and local mutable content.
s=s.replace('      String stageContent = readStageOrEmpty(stageFile);','      String stageContent = readStageOrEmpty(stageFile);\n      Process itsStageChild = child;')
s=convert(s,needle,'Transport-controller-stage','stageDeadline',10,fields='String stageContent = readStageOrEmpty(stageFile);',body_transform=stage_body,guard_transform=lambda c:c.replace('child.isAlive()','itsStageChild.isAlive()'),post='stageContent = poll.stageContent;',before_guard='if (slept) {\n  stageContent = readStageOrEmpty(stageFile);\n}')
# Avoid a second initial read: initialize local state using captured first read.
s=s.replace('      String stageContent = readStageOrEmpty(stageFile);\n      Process itsStageChild = child;','      String initialStageContent = readStageOrEmpty(stageFile);\n      Process itsStageChild = child;\n      String stageContent;')
s=s.replace('String stageContent = readStageOrEmpty(stageFile);','String stageContent = initialStageContent;',1)
# Teardown helper preserves its own named AssertionError and 20s guard ordering.
s=convert(s,'while (!condition.getAsBoolean())','Transport-teardown','until',20,rethrow='InterruptedException')
# Exact actual stop closure assertions remain fail-fast inside the poll step.
a=s.index('  private static void awaitActualStop(');b=s.index('  private static void assertConsumedReleaseWithoutTerminalUsage',a);part=s[a:b]
part=convert(part,'while (System.nanoTime() < until)','Transport-actual-stop','until',20,fields='boolean completed;',body_transform=lambda x:x.replace('        return;','        completed = true;\n        return true;'),post='if (poll.completed) {\n  return;\n}')
s=s[:a]+part+s[b:];sources[NAMES[0]]=s
# Java identifiers contain only legal characters; aliases retain human-readable ids.
for n,s in sources.items():
 s=re.sub(r'ItsPoll[A-Za-z0-9_-]+',lambda m:re.sub('[^A-Za-z0-9_]','',m[0]),s)
 sources[n]=s
 target=O/'repo'/paths[n];target.parent.mkdir(parents=True,exist_ok=True);target.write_text(s)
 (O/'preimages'/paths[n]).parent.mkdir(parents=True,exist_ok=True);(O/'preimages'/paths[n]).write_text(bases[n])

def diff(a,b,p):return ''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='a/'+str(p),tofile='b/'+str(p)))
combined=[];incrementals=[];manifest=[]
for n in NAMES:
 p=paths[n];inc=diff(bases[n],sources[n],p);full=diff(originals[n],sources[n],p)
 (O/'patches').mkdir(exist_ok=True);(O/'patches'/f'{n}.incremental.patch').write_text(inc);(O/'patches'/f'{n}.from-s011.patch').write_text(full)
 combined.append(full);incrementals.append(inc)
 manifest.append(dict(path=str(p),actualS011Sha256=sha(originals[n]),preimageSha256=sha(bases[n]),candidateSha256=sha(sources[n]),incrementalPatchSha256=sha(inc),composedPatchSha256=sha(full),compileVerified=False,runtimeVerified=False))
(O/'it-s-incremental.patch').write_text(''.join(incrementals));(O/'it-s-from-s011.patch').write_text(''.join(combined))
(O/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(O/'loop-edits.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
