"""Read installed Awaitility classfile metadata/bytecode using Python only; no JVM/tool execution."""
from pathlib import Path
import json,zipfile,struct,hashlib
OUT=Path(__file__).resolve().parent
JAR=next(Path('/Users/brunobuger/.gradle/caches/modules-2/files-2.1/org.awaitility/awaitility/4.2.2').rglob('awaitility-4.2.2.jar'))

def inspect(data):
    o=8;n=struct.unpack_from('>H',data,o)[0];o+=2;pool={};i=1
    while i<n:
        tag=data[o];o+=1
        if tag==1:
            length=struct.unpack_from('>H',data,o)[0];o+=2;pool[i]=('utf8',data[o:o+length].decode());o+=length
        elif tag in (3,4):pool[i]=('number',);o+=4
        elif tag in (5,6):pool[i]=('number',);o+=8;i+=1
        elif tag in (7,8,16,19,20):pool[i]=(tag,struct.unpack_from('>H',data,o)[0]);o+=2
        elif tag in (9,10,11,12,17,18):pool[i]=(tag,*struct.unpack_from('>HH',data,o));o+=4
        elif tag==15:pool[i]=(tag,*struct.unpack_from('>BH',data,o));o+=3
        else:raise ValueError(tag)
        i+=1
    def text(index):
        entry=pool[index]
        if entry[0]=='utf8':return entry[1]
        if entry[0] in (7,8,16,19,20):return text(entry[1])
        if entry[0]==12:return text(entry[1])+text(entry[2])
        if entry[0] in (9,10,11):return text(entry[1])+'.'+text(entry[2])
        return 'DYNAMIC'
    o+=6;n=struct.unpack_from('>H',data,o)[0];o+=2+2*n;methods={}
    for section in ('fields','methods'):
        n=struct.unpack_from('>H',data,o)[0];o+=2
        for _ in range(n):
            _,name,descriptor,attrs=struct.unpack_from('>HHHH',data,o);o+=8;item={'descriptor':text(descriptor)}
            for __ in range(attrs):
                attribute,length=struct.unpack_from('>HI',data,o);o+=6;payload=data[o:o+length];o+=length
                if text(attribute)!='Code':continue
                code_size=struct.unpack_from('>I',payload,4)[0];code=payload[8:8+code_size]
                e=8+code_size;count=struct.unpack_from('>H',payload,e)[0];e+=2
                item['catchTypes']=[]
                for ___ in range(count):
                    start,end,handler,catch=struct.unpack_from('>HHHH',payload,e);e+=8
                    item['catchTypes'].append({'start':start,'end':end,'handler':handler,'type':text(catch) if catch else 'FINALLY'})
                calls=[];i=0;throws=0
                operand2={17,19,20,132,*range(153,169),178,179,180,181,182,183,184,187,189,192,193,198,199}
                operand1={16,18,*range(21,26),*range(54,59),169,188}
                while i<len(code):
                    op=code[i];size=1
                    if op in operand2:size=3
                    elif op in operand1:size=2
                    elif op in (185,186):size=5
                    elif op in (200,201):size=5
                    elif op==197:size=4
                    elif op==196:size=6 if code[i+1]==132 else 4
                    elif op in (170,171):
                        at=i+1
                        while at%4:at+=1
                        if op==170:
                            _,low,high=struct.unpack_from('>iii',code,at);size=at-i+12+4*(high-low+1)
                        else:
                            _,pairs=struct.unpack_from('>ii',code,at);size=at-i+8+8*pairs
                    if op in (182,183,184,185,186):calls.append({'offset':i,'target':text(struct.unpack_from('>H',code,i+1)[0])})
                    if op==191:throws+=1
                    i+=size
                assert i==len(code)
                item.update(calls=calls,athrowCount=throws,codeHex=code.hex() if len(code)<32 else None)
            if section=='methods':methods.setdefault(text(name),[]).append(item)
    return methods

with zipfile.ZipFile(JAR) as archive:
    names=['ConditionFactory','ConditionAwaiter','ConditionAwaiter$ConditionPoller','CheckedExceptionRethrower','Uninterruptibles','SameThreadExecutorService']
    result={}
    for name in names:
        data=archive.read('org/awaitility/core/'+name+'.class')
        result[name]={'sha256':hashlib.sha256(data).hexdigest(),'methods':inspect(data)}
required=['atMost','pollInterval','pollDelay','pollInSameThread','dontCatchUncaughtExceptions','ignoreNoExceptions','until']
assert all(name in result['ConditionFactory']['methods'] for name in required)
report={'version':'4.2.2','inspection':'Python ZIP/classfile parsing only; no JVM/javap/Gradle/test execution',
 'jarSha256':hashlib.sha256(JAR.read_bytes()).hexdigest(),'classes':result,
 'interpretation':['Uninterruptibles.sleepUninterruptibly catches InterruptedException and restores interrupt status; a wait must explicitly preserve old Thread.sleep behavior.',
 'ConditionPoller captures non-ignored throwables and ConditionAwaiter invokes CheckedExceptionRethrower.safeRethrow; safeRethrow0 bytecode is aload_0,athrow (2abf), preserving checked throwable identity/type.',
 'Every authored wait uses pollInSameThread, dontCatchUncaughtExceptions and ignoreNoExceptions; only original site-specific exception catches remain.',
 'Bytecode source evidence supports the design; it is not runtime execution evidence or a proof of exact scheduling equivalence.']}
assert any(m.get('codeHex')=='2abf' for m in result['CheckedExceptionRethrower']['methods']['safeRethrow0'])
(OUT/'awaitility-source-bytecode.json').write_text(json.dumps(report,indent=2)+'\n')
print('Installed Awaitility metadata and checked-throwable rethrow bytecode inspected without JVM execution.')
