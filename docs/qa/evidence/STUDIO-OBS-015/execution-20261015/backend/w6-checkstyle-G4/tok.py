import re,sys
sys.path.insert(0,sys.argv[0].rsplit('/',1)[0])
from braces import skip_ws_comments, skip_literal
def toks(t):
    out=[];i=0;n=len(t)
    while i<n:
        j=skip_ws_comments(t,i)
        if j!=i: i=j; continue
        k=skip_literal(t,i)
        if k!=i:
            out.append(('S' if t[i]=='"' else 'C', t[i:k])); i=k; continue
        m=re.match(r"[A-Za-z0-9_$]+|.",t[i:],re.S)
        out.append(('T',m.group(0))); i+=len(m.group(0))
    return out
def norm(ts):
    # drop braces added; merge adjacent string literals joined by +
    ts=[x for x in ts if x[1] not in('{','}')]
    out=[]
    i=0
    while i<len(ts):
        if ts[i][0]=='S':
            v=ts[i][1][1:-1]
            while i+2<len(ts) and ts[i+1][1]=='+' and ts[i+2][0]=='S':
                v+=ts[i+2][1][1:-1]; i+=2
            out.append(('S',v))
        else: out.append(ts[i])
        i+=1
    return out
import os
bad=0
for f in open(sys.argv[1]).read().split():
    a=norm(toks(open(sys.argv[2]+'/'+os.path.basename(f)).read()))
    b=norm(toks(open(f).read()))
    # also compare literal chars only for 'S'
    print(os.path.basename(f), 'IDENTICAL' if a==b else 'DIFF', len(a), len(b))
    if a!=b:
        bad+=1
        for k,(x,y) in enumerate(zip(a,b)):
            if x!=y: print(' first diff',k,x,y,a[k-3:k+3]); break
sys.exit(bad)
