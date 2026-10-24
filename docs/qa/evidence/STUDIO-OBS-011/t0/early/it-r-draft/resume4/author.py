"""Off-tree original-only IT-R authoring. No Java/Node/tool execution or live source reads."""
from pathlib import Path
import json,re,csv,hashlib,difflib
from inspect_loops import SRC,MASK,PAIRS,mask_java
OUT=Path(__file__).resolve().parent
REL=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
LOOPS=json.loads((OUT/'loop-sites.json').read_text())
ROWS=list(csv.DictReader((OUT/'sleep-table.tsv').open(),delimiter='\t'))

def replace_tokens(text, bindings):
    mask=mask_java(text);edits=[]
    for m in re.finditer(r'\b[A-Za-z_$][\w$]*\b',mask):
        if m[0] in bindings and (m.start()==0 or mask[m.start()-1]!='.'):
            edits.append((m.start(),m.end(),bindings[m[0]]))
    for a,b,value in reversed(edits):text=text[:a]+value+text[b:]
    return text

def scope(position):
    return max((i for i in PAIRS if i<position and MASK[i]=='{' and PAIRS[i]>position),default=0)

class_scopes=set()
for match in re.finditer(r'\b(?:class|record|enum)\s+\w+[^;{]*\{',MASK):
    class_scopes.add(MASK.index('{',match.start(),match.end()))
DECL=re.compile(r'(?m)^[ \t]*(?:final\s+)?(?P<type>[\w.$]+(?:<[^;\n=()]*>)?(?:\[\])?)\s+(?P<name>\w+)\s*(?P<op>=|;|:)')
DECLARATIONS=[]
for match in DECL.finditer(MASK):
    name=match['name'];type_=SRC[match.start('type'):match.end('type')]
    if type_ in ('return','throw','case','package','import','else'):continue
    DECLARATIONS.append(dict(name=name,type=type_,op=match['op'],start=match.start(),
                             scope=scope(match.start()),end=match.end()))

def capture_info(loop):
    a=loop['start'];body=loop['body'];bm=mask_java(body);cm=mask_java(loop['condition'])
    local={m['name'] for m in DECL.finditer(bm)}
    # for/catch bindings declared inside the condition are local too.
    local.update(re.findall(r'\b(?:for|catch)\s*\([^;:]*?\b(\w+)\s*[:)]',bm))
    visible={}
    for decl in DECLARATIONS:
        if decl['start']<a and decl['scope'] not in class_scopes and PAIRS.get(decl['scope'],0)>a:
            visible[decl['name']]=decl
    used={m[0] for m in re.finditer(r'\b\w+\b',bm+' '+cm)}-local
    written=set(re.findall(r'(?<![\w.])(\w+)\s*(?:=(?!=)|\+\+|--|[+&|^*/%-]=)',bm))-local
    return {k:v for k,v in visible.items() if k in used},written

def remove_control(body,identifier):
    bm=mask_java(body)
    # Preserve inner-loop break/continue and nested-lambda return semantics.
    pairs={};stack=[]
    for i,c in enumerate(bm):
        if c in '({[':stack.append((c,i))
        elif c in ')}]':
            _,j=stack.pop();pairs[j]=i;pairs[i]=j
    inner=[];lambdas=[]
    for m in re.finditer(r'\b(?:for|while)\s*\(',bm):
        p=bm.index('(',m.start());e=pairs[p];n=e+1
        while n<len(bm) and bm[n].isspace():n+=1
        if n<len(bm) and bm[n]=='{':inner.append((n,pairs[n]))
    for m in re.finditer(r'->\s*\{',bm):
        p=bm.index('{',m.start());lambdas.append((p,pairs[p]))
    edits=[];method_returns=False;return_value=False
    for m in re.finditer(r'\b(break|continue|return)\b',bm):
        if any(a<m.start()<b for a,b in lambdas):continue
        kind=m[1]
        if kind!='return' and any(a<m.start()<b for a,b in inner):continue
        end=bm.index(';',m.end())+1
        if kind=='break':text=f'itr{identifier}.terminal = true; return true;'
        elif kind=='continue':text='return false;'
        else:
            method_returns=True;value=body[m.end():end-1].strip()
            return_value|=bool(value)
            text=(f'itr{identifier}.returnedValue = {value}; ' if value else '')+f'itr{identifier}.methodReturned = true; itr{identifier}.terminal = true; return true;'
        edits.append((m.start(),end,text))
    for a,b,text in reversed(edits):body=body[:a]+text+body[b:]
    return body,method_returns,return_value

CAPTURE_REVIEW=[]
def convert(loop):
    n=loop['ids'][0];identifier=f'{n:03d}';state=f'itr{identifier}'
    body=loop['body'];condition=loop['condition']
    captures,written=capture_info(loop)
    bindings={};fields=[];initial=[];restore=[];reads=[]
    for name,decl in captures.items():
        if name in written:
            if decl['type']=='var':raise ValueError(('mutable var needs concrete type',n,name))
            fields.append(decl['type']+' '+name+';')
            if decl['op']=='=':initial.append(f'{state}.{name} = {name};')
            restore.append(f'{name} = {state}.{name};')
            bindings[name]=f'{state}.{name}'
        else:
            reads.append(f'final var itrRead{identifier}_{name} = {name};')
            bindings[name]=f'itrRead{identifier}_{name}'
    interval=int(re.search(r'Thread\.sleep\((\d+)\)',body)[1])
    debt=f'{state}.intervalOwed = true; {state}.owedUntil = System.nanoTime() + Duration.ofMillis({interval}).toNanos();'
    # Each original sleep edge records exactly one owed interval, including branches/continue.
    body=re.sub(r'Thread\.sleep\(\d+\);',debt,body)
    body,method_returns,return_value=remove_control(body,identifier)
    if method_returns:fields.append('boolean methodReturned;')
    if return_value:
        assert n==73;fields.append('ObjectNode returnedValue;')
    body=replace_tokens(body,bindings);condition=replace_tokens(condition,bindings)
    deadline=re.search(r'System\.nanoTime\(\)\s*<\s*(\w+)',loop['condition'])
    if deadline:deadline=deadline[1]
    else:
        assert n in [29,31,32,33,84],n
        deadline='until' if n==29 else 'deadline' if n==84 else 'end'
    deadline_value=bindings.get(deadline,deadline)
    fields+=['boolean firstIteration = true;','boolean terminal;','boolean intervalOwed;',
             'long owedUntil;','Exception firstException;','Error firstError;']
    terminal=f'{{ {state}.terminal = true; return true; }}'
    guard=(f'if (!{state}.firstIteration && !({condition})) {terminal}' if loop['kind']=='do'
           else f'if (!({condition})) {terminal}')
    # These are the only leading-sleep sites: owed read precedes the next original guard.
    if n in [83,86]:
        read=body[body.index(';',body.index('owedUntil'))+1:].strip()
        step=f'''if ({state}.intervalOwed) {{
          if (Thread.interrupted()) throw new InterruptedException();
          if (System.nanoTime() < {state}.owedUntil) return false;
          {state}.intervalOwed = false;
          {read}
        }}
        {guard}
        {debt}
        return false;'''
    else:
        tail=f'if (!{state}.intervalOwed && !({condition})) {terminal} return false;' if n==5 else 'return false;'
        step=f'''if ({state}.intervalOwed) {{
          if (Thread.interrupted()) throw new InterruptedException();
          if (System.nanoTime() < {state}.owedUntil) return false;
          {state}.intervalOwed = false;
        }}
        {guard}
        {state}.firstIteration = false;
        {body.strip()}
        {tail}'''
    latch_exception=f'''if ({state}.firstException == null && {state}.firstError == null) {{
            {state}.firstException = itrFailure{identifier}; {state}.terminal = true;
          }}'''
    latch_error=f'''if ({state}.firstException == null && {state}.firstError == null) {{
            {state}.firstError = itrFailure{identifier}; {state}.terminal = true;
          }}'''
    result=f'''{{
      // IT-R POLL {','.join(map(str,loop['ids']))}: exact original transitions; one old interval owed at most.
      {' '.join(reads)}
      class ItrState{identifier} {{ {' '.join(fields)} }}
      final var {state} = new ItrState{identifier}();
      {' '.join(initial)}
      java.util.concurrent.Callable<Boolean> itrPoll{identifier} = () -> {{
        if ({state}.firstException != null) throw {state}.firstException;
        if ({state}.firstError != null) throw {state}.firstError;
        if ({state}.terminal) return true;
        try {{
        {step}
        }} catch (Exception itrFailure{identifier}) {{
          {latch_exception}
          throw {state}.firstException;
        }} catch (Error itrFailure{identifier}) {{
          {latch_error}
          throw {state}.firstError;
        }}
      }};
      try {{
        while (!{state}.terminal) {{
          // First invocation is manual. Reentry serves only the original pending transition.
          boolean itrDone{identifier} = itrPoll{identifier}.call();
          if (itrDone{identifier}) break;
          if (Thread.interrupted()) throw new InterruptedException();
          long itrNow{identifier} = System.nanoTime();
          long itrRemaining{identifier} = {deadline_value} - itrNow{identifier};
          long itrOwed{identifier} = {state}.intervalOwed ? {state}.owedUntil - itrNow{identifier} : 0;
          // Semantic deadline is unchanged. Only the already-entered old interval may extend this bound.
          long itrBound{identifier} = Math.max(itrRemaining{identifier}, itrOwed{identifier});
          if (itrBound{identifier} > 0) {{
            final boolean[] itrFirstTick{identifier} = {{true}};
            try {{
              org.awaitility.Awaitility.await("ReplayIT POLL {','.join(map(str,loop['ids']))}")
                  .atMost(Duration.ofNanos(itrBound{identifier}))
                  .pollInterval(Duration.ofMillis({interval})).pollDelay(Duration.ZERO)
                  .pollInSameThread().dontCatchUncaughtExceptions().ignoreNoExceptions()
                  .until(() -> {{
                    try {{
                    if ({state}.firstException != null) throw {state}.firstException;
                    if ({state}.firstError != null) throw {state}.firstError;
                    if ({state}.terminal) return true;
                    if (Thread.interrupted()) throw new InterruptedException();
                    if (itrFirstTick{identifier}[0]) {{
                      itrFirstTick{identifier}[0] = false;
                      return false; // Cached tick: no second immediate condition/read/effect.
                    }}
                    boolean itrObserved{identifier} = itrPoll{identifier}.call();
                    if (!itrObserved{identifier} && Thread.interrupted()) throw new InterruptedException();
                    return itrObserved{identifier};
                    }} catch (Exception itrFailure{identifier}) {{
                      {latch_exception}
                      if ({state}.firstError != null) throw {state}.firstError;
                      throw {state}.firstException;
                    }} catch (Error itrFailure{identifier}) {{
                      {latch_error}
                      if ({state}.firstException != null) throw {state}.firstException;
                      throw {state}.firstError;
                    }}
                  }});
            }} catch (org.awaitility.core.ConditionTimeoutException itrTimeout{identifier}) {{
              if ({state}.firstException != null) throw {state}.firstException;
              if ({state}.firstError != null) throw {state}.firstError;
              // A late terminal outcome wins. Otherwise next driver step preserves old guard/body order.
            }}
          }}
          // Includes bound<=0/no-Await: no silent pending exit, synthetic timeout, or terminal replay.
        }}
      }} catch (Exception itrFailure{identifier}) {{
        {latch_exception}
        if ({state}.firstError != null) throw {state}.firstError;
        throw {state}.firstException;
      }} catch (Error itrFailure{identifier}) {{
        {latch_error}
        if ({state}.firstException != null) throw {state}.firstException;
        throw {state}.firstError;
      }} finally {{
        {' '.join(restore)}
      }}
      {('if ('+state+'.methodReturned) return'+(' '+state+'.returnedValue' if return_value else '')+';') if method_returns else ''}
    }}'''
    CAPTURE_REVIEW.append(dict(ids=loop['ids'],batch=loop['rows'][0]['batch'],deadline=deadline,
      intervalMs=interval,reads=list(captures),writes=sorted(written&captures.keys()),
      methodReturn=method_returns,valueReturn=return_value,leadingSleep=n in [83,86],
      conditionalSleep=n==5,guardKind=loop['kind'],semanticDeadlineExpression=deadline_value,
      owedIntervalBound='max(original deadline remaining, already-owed single interval remaining)',
      finalTransition='same original step, guarded by terminal/first-failure and interval debt'))
    return result

if __name__=='__main__':
    outputs=[]
    for loop in LOOPS:
        outputs.append(dict(ids=loop['ids'],source=loop['source'],replacement=convert(loop)))
    (OUT/'poll-edits.json').write_text(json.dumps(outputs,indent=2)+'\n')
    (OUT/'poll-capture-review.json').write_text(json.dumps(CAPTURE_REVIEW,indent=2)+'\n')
    print(json.dumps({'authoredLoops':len(outputs),'captured':len(CAPTURE_REVIEW)}))
