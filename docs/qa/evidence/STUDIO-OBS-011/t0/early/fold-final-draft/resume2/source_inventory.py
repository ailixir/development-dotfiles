"""Pure lexical source inventory. No filesystem access or entrypoint side effects.

Balanced annotation arguments, arbitrary qualified annotation chains and Java comments,
strings/chars/text blocks are handled without compiling or importing a QA entrypoint.
"""
import re, hashlib, json
TEST_KINDS={'Test','ParameterizedTest','RepeatedTest','TestFactory','TestTemplate'}
IDENT=re.compile(r'[A-Za-z_$][\w$]*')
NUMBER=re.compile(r'(?:0[xX][0-9A-Fa-f_]+|\d[\w.]*)')

def lex_java(s):
    out=[];i=0;n=len(s)
    while i<n:
        if s[i].isspace():i+=1;continue
        start=i
        if s.startswith('//',i):
            end=s.find('\n',i+2);i=n if end<0 else end;continue
        if s.startswith('/*',i):
            end=s.find('*/',i+2)
            if end<0:raise ValueError('Unclosed Java comment')
            i=end+2;continue
        if s.startswith('"""',i):
            i+=3
            while i<n:
                if s[i]=='\\':i+=2
                elif s.startswith('"""',i):i+=3;break
                else:i+=1
            else:raise ValueError('Unclosed Java text block')
        elif s[i] in ['"',"'"]:
            quote=s[i];i+=1
            while i<n:
                if s[i]=='\\':i+=2
                elif s[i]==quote:i+=1;break
                else:i+=1
            else:raise ValueError('Unclosed Java literal')
        else:
            match=IDENT.match(s,i) or NUMBER.match(s,i)
            i=match.end() if match else i+1
        out.append((s[start:i],start,i))
    return out

def token_pairs(ts):
    pairs={};stack=[]
    for i,(t,_,_) in enumerate(ts):
        if t in ['(','{','[']:stack.append((t,i))
        elif t in [')','}',']']:
            if not stack or stack[-1][0]!={')':'(',']':'[','}':'{'}[t]:raise ValueError('Unbalanced Java delimiters')
            _,a=stack.pop();pairs[a]=i
    if stack:raise ValueError('Unclosed Java delimiter')
    return pairs

def split_parameters(s):
    ts=lex_java(s);stack=[];parts=[];start=0;angles=0
    for t,a,b in ts:
        if t in ['(','{','[']:stack.append(t)
        elif t in [')','}',']']:stack.pop()
        elif not stack and t=='<':angles+=1
        elif not stack and t=='>':angles=max(0,angles-1)
        elif t==',' and not stack and not angles:parts.append(s[start:a].strip());start=b
    if s[start:].strip():parts.append(s[start:].strip())
    return parts

def scan_source(s,path='<memory>'):
    ts=lex_java(s);v=[x[0] for x in ts];pairs=token_pairs(ts)
    pkgmatch=re.search(r'(?m)^\s*package\s+([\w.]+)\s*;',s)
    pkg=pkgmatch[1] if pkgmatch else ''
    classes=[]
    for i,t in enumerate(v[:-1]):
        if t not in ['class','enum','record','interface'] or (i and v[i-1]=='.') or not IDENT.fullmatch(v[i+1]):continue
        j=i+2
        while j<len(v) and v[j] not in ['{',';']:
            if v[j] in ['(','[']:j=pairs[j]+1
            else:j+=1
        if j<len(v) and v[j]=='{':classes.append({'name':v[i+1],'begin':i,'open':j,'end':pairs[j],'declaration':s[ts[i][1]:ts[j][1]],'path':path})
    for c in classes:
        parents=sorted([p for p in classes if p['open']<c['begin']<p['end']],key=lambda p:p['begin'])
        c['binaryName']=(pkg+'.' if pkg else '')+'$'.join([p['name'] for p in parents]+[c['name']])
    def annotation(i):
        start=i;j=i+1
        if j>=len(v) or not IDENT.fullmatch(v[j]):return None,i+1
        names=[v[j]];j+=1
        while j+1<len(v) and v[j]=='.' and IDENT.fullmatch(v[j+1]):names.append(v[j+1]);j+=2
        args=''
        if j<len(v) and v[j]=='(':
            end=pairs[j];args=s[ts[j][2]:ts[end][1]];j=end+1
        text=s[ts[start][1]:ts[j-1][2]]
        return {'name':names[-1],'qualifiedName':'.'.join(names),'text':text,'argumentsText':args,'sha256':hashlib.sha256(text.encode()).hexdigest()},j
    rows=[];seen=set();modifiers={'public','protected','private','static','final','abstract','synchronized','native','strictfp','default'}
    for i,t in enumerate(v):
        if t!='@' or i in seen:continue
        annotations=[];j=i
        while j<len(v):
            if v[j]=='@':
                a,end=annotation(j);seen.update(range(j,end))
                if a:annotations.append(a)
                j=end
            elif v[j] in modifiers:j+=1
            else:break
        kinds=[a['name'] for a in annotations if a['name'] in TEST_KINDS]
        if not kinds:continue
        while j<len(v) and v[j]!='(':
            if v[j]=='@':
                a,end=annotation(j);seen.update(range(j,end))
                if a:annotations.append(a)
                j=end
            else:
                if v[j] in [';','{','}']:raise ValueError(('Test annotation without method',path,s[ts[i][1]:ts[j][2]]))
                j+=1
        if j>=len(v) or not IDENT.fullmatch(v[j-1]):raise ValueError(('Bad test signature',path))
        name=v[j-1];end=pairs[j];body=end+1
        while body<len(v) and v[body] not in ['{',';']:body+=1
        owners=sorted([c for c in classes if c['open']<i<c['end']],key=lambda c:c['begin'])
        if not owners:raise ValueError(('No declaring class',path,name))
        owner=owners[-1]['binaryName'];bodytext=s[ts[body][1]:ts[pairs[body]][2]] if v[body]=='{' else None
        parametertext=s[ts[j][2]:ts[end][1]]
        factories=[]
        for a in annotations:
            if a['name']=='MethodSource':
                refs=[json.loads(t) for t,_,_ in lex_java(a['argumentsText']) if t.startswith('"') and not t.startswith('"""')]
                factories=refs or [name]
        rows.append({'path':path,'class':owner,'method':name,'name':name,'kind':kinds[0],'line':s.count('\n',0,ts[i][1])+1,'signature':s[ts[j-1][1]:ts[body][1]],'parameterText':parametertext,'parameters':split_parameters(parametertext),'annotations':annotations,'factoryReferences':factories,'body':bodytext,'bodySha256':hashlib.sha256(bodytext.encode()).hexdigest() if bodytext else None,'declarationSha256':hashlib.sha256(s[ts[i][1]:ts[body][1]].encode()).hexdigest()})
    return {'path':path,'package':pkg,'classes':classes,'methods':rows}
