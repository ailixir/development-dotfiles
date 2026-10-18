from pathlib import Path
import struct,json,hashlib
BASE=Path(__file__).resolve().parents[2]/"execution/backend-final-clean-check-attempt01-prefixed-diagnostics"
# __file__ location is backend-remediation/checkstyle-correction; strict-qa root is parents[2].
CURRENT=Path.cwd()/"backend/build/classes/java/test"
def sha(b):return hashlib.sha256(b).hexdigest()
def normalize(b):
 pos=0
 def take(n):
  nonlocal pos
  value=b[pos:pos+n];pos+=n
  if len(value)!=n:raise ValueError("truncated class")
  return value
 def u2():return struct.unpack(">H",take(2))[0]
 def u4():return struct.unpack(">I",take(4))[0]
 prefix=take(8);count=u2();prefix+=struct.pack(">H",count);names={};i=1
 while i<count:
  tag=take(1);prefix+=tag;t=tag[0]
  if t==1:
   n=u2();value=take(n);prefix+=struct.pack(">H",n)+value;names[i]=value.decode("utf-8",errors="replace")
  elif t in (3,4):prefix+=take(4)
  elif t in (5,6):prefix+=take(8);i+=1
  elif t in (7,8,16,19,20):prefix+=take(2)
  elif t in (9,10,11,12,17,18):prefix+=take(4)
  elif t==15:prefix+=take(3)
  else:raise ValueError("unknownCPtag"+str(t))
  i+=1
 debug=[]
 def attrs(path):
  n=u2();values=[]
  for a in range(n):
   index=u2();size=u4();name=names[index]
   if name in ("LineNumberTable","SourceDebugExtension"):
    raw=take(size);debug.append({"path":path+"/"+name,"sha256":sha(raw),"bytes":size});continue
   if name=="Code":
    start=pos;header=take(4);length=u4();code=take(length);exceptions=u2();table=take(exceptions*8)
    raw=header+struct.pack(">I",length)+code+struct.pack(">H",exceptions)+table+attrs(path+"/Code")
    assert pos-start==size
   else:raw=take(size)
   values.append(struct.pack(">HI",index,len(raw))+raw)
  return struct.pack(">H",len(values))+b"".join(values)
 result=prefix+take(6);interfaces=u2();result+=struct.pack(">H",interfaces)+take(interfaces*2)
 for category in ("field","method"):
  n=u2();result+=struct.pack(">H",n)
  for i in range(n):
   header=take(6);_,nameIndex,descriptorIndex=struct.unpack(">HHH",header)
   result+=header+attrs(category+"/"+names[nameIndex]+names[descriptorIndex])
 result+=attrs("class");assert pos==len(b)
 return result,debug
rows=[]
for old in sorted(BASE.rglob("*.class")):
 marker="backend/build/classes/java/test/";relative=str(old).split(marker,1)[1];new=CURRENT/relative
 if not new.exists():raise ValueError("missing current class"+relative)
 ob=old.read_bytes();nb=new.read_bytes();on,od=normalize(ob);nn,nd=normalize(nb)
 rows.append({"class":relative,"oldSha256":sha(ob),"newSha256":sha(nb),"bytesIdentical":ob==nb,"executableAndNondiagnosticAttributesIdentical":on==nn,"oldNormalizedSha256":sha(on),"newNormalizedSha256":sha(nn),"oldDebugLineAttributes":od,"newDebugLineAttributes":nd})
out=Path(__file__).resolve().parent
report={"method":"Exact class binary comparison after recursively removing onlyLineNumberTable andSourceDebugExtension attributes; constantpool,Code instructions,exceptiontables,stackmaps,allannotations/bootstrap/class/field/method attrs otherwise retained verbatim.","oldArchive":str(BASE),"currentDirectory":str(CURRENT),"classes":rows,"classCount":len(rows),"allExecutableEqual":all(x["executableAndNondiagnosticAttributesIdentical"] for x in rows),"byteIdenticalCount":sum(x["bytesIdentical"] for x in rows),"debugOnlyDifferenceCount":sum(not x["bytesIdentical"] and x["executableAndNondiagnosticAttributesIdentical"] for x in rows),"notAFinalGateWaiver":True}
(out/"compiled-equivalence.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps({k:v for k,v in report.items() if k!="classes"},indent=2))
if not report["allExecutableEqual"]:raise SystemExit(1)
