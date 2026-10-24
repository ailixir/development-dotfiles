"""Read cached primary class metadata only; never loads/runs Java or formatter code."""
from pathlib import Path
import hashlib,json,struct,zipfile
O=Path(__file__).resolve().parent
JAR=Path('/Users/brunobuger/.gradle/caches/modules-2/files-2.1/com.diffplug.spotless/spotless-plugin-gradle/6.25.0/837bfb4f743a2994c2b8d19872b4bd02fc2fe2b4/spotless-plugin-gradle-6.25.0.jar')
class Class:
 def __init__(self,raw):
  self.raw=raw;self.at=0
  assert self.u4()==0xcafebabe;self.u2();self.major=self.u2();count=self.u2();self.cp=[None]*count;i=1
  while i<count:
   tag=self.u1()
   if tag==1:self.cp[i]=('utf',self.take(self.u2()).decode('utf-8',errors='replace'))
   elif tag in {3,4}:self.cp[i]=(tag,self.take(4).hex())
   elif tag in {5,6}:self.cp[i]=(tag,self.take(8).hex());i+=1
   elif tag in {7,8,16,19,20}:self.cp[i]=(tag,self.u2())
   elif tag in {9,10,11,12,17,18}:self.cp[i]=(tag,self.u2(),self.u2())
   elif tag==15:self.cp[i]=(tag,self.u1(),self.u2())
   else:raise ValueError(tag)
   i+=1
  self.u2();self.this=self.u2();self.u2()
  for _ in range(self.u2()):self.u2()
  for _ in range(self.u2()):self.member(False)
  self.methods=[self.member(True) for _ in range(self.u2())]
 def take(self,n):b=self.raw[self.at:self.at+n];self.at+=n;return b
 def u1(self):return int.from_bytes(self.take(1),'big')
 def u2(self):return int.from_bytes(self.take(2),'big')
 def u4(self):return int.from_bytes(self.take(4),'big')
 def ref(self,i):
  value=self.cp[i]
  if value[0]=='utf':return value[1]
  if value[0] in {7,8,16,19,20}:return self.ref(value[1])
  if value[0] in {9,10,11}:return self.ref(value[1])+'.'+self.ref(value[2])
  if value[0]==12:return self.ref(value[1])+self.ref(value[2])
  return repr(value)
 def member(self,method):
  access=self.u2();name=self.ref(self.u2());desc=self.ref(self.u2());code=None
  for _ in range(self.u2()):
   attr=self.ref(self.u2());data=self.take(self.u4())
   if attr=='Code':code=data[8:8+int.from_bytes(data[4:8],'big')]
  return {'name':name,'descriptor':desc,'access':access,'code':code}
 def instructions(self,code):
  # Standard JVM operand widths; switch/wide lengths are parsed, never executed.
  widths={**{x:1 for x in [16,18,*range(21,26),*range(54,59),169,188]},**{x:2 for x in [17,19,20,132,*range(153,169),*range(178,185),187,189,192,193,198,199]},185:4,186:4,197:3,200:4,201:4}
  names={42:'aload_0',43:'aload_1',44:'aload_2',45:'aload_3',176:'areturn',177:'return',178:'getstatic',179:'putstatic',180:'getfield',181:'putfield',182:'invokevirtual',183:'invokespecial',184:'invokestatic',185:'invokeinterface',186:'invokedynamic',187:'new',189:'anewarray',192:'checkcast',18:'ldc',19:'ldc_w',1:'aconst_null',4:'iconst_1',3:'iconst_0',87:'pop',89:'dup',167:'goto'}
  out=[];at=0
  while at<len(code):
   start=at;op=code[at];at+=1;n=widths.get(op,0)
   if op in {170,171}:
    pad=(-at)%4;base=at+pad
    if op==170:n=pad+12+4*(int.from_bytes(code[base+8:base+12],'big',signed=True)-int.from_bytes(code[base+4:base+8],'big',signed=True)+1)
    else:n=pad+8+8*int.from_bytes(code[base+4:base+8],'big',signed=True)
   elif op==196:n=5 if code[at]==132 else 3
   operand=code[at:at+n];at+=n;row={'offset':start,'opcode':op,'op':names.get(op,'op_'+str(op))}
   if op in {*range(178,188),189,192,193,19,20}:row['reference']=self.ref(int.from_bytes(operand[:2],'big'))
   elif op==18:row['reference']=self.ref(operand[0])
   elif operand:row['operandHex']=operand.hex()
   out.append(row)
  assert at==len(code);return out
classes=['FormatExtension','JavaExtension','SpotlessExtension','SpotlessExtensionImpl','SpotlessTask','SpotlessTaskImpl','SpotlessApply','SpotlessApply$1']
report={'jarPath':str(JAR),'jarSha256':hashlib.sha256(JAR.read_bytes()).hexdigest(),'scope':'CACHED_PRIMARY_CLASS_METADATA_ONLY_NO_JAVA_EXECUTION','classes':{}}
with zipfile.ZipFile(JAR) as z:
 for cls in classes:
  path='com/diffplug/gradle/spotless/'+cls+'.class';raw=z.read(path);c=Class(raw)
  selected=[]
  for m in c.methods:
   if m['name'] in {'target','getTarget','setTarget','java','create','createFormat','setupTask','setup','createIndependentTask','registerTask','createTask','createFormatTasks','format','performAction','lambda$createFormatTasks$6','lambda$createFormatTasks$7','lambda$createFormatTasks$8','getOutputDirectory','getOutputDir','getInputChanges','getTarget','getOutputFile','visitFile','init','deletePreviousResult','lambda$performAction$0','lambda$deletePreviousResult$1'} or any(s in m['name'].lower() for s in ['target','setup','createtask','registertask']):
    selected.append({k:v for k,v in m.items() if k!='code'}|({'codeSha256':hashlib.sha256(m['code']).hexdigest(),'instructions':c.instructions(m['code'])} if m['code'] else {}))
  report['classes'][cls]={'entrySha256':hashlib.sha256(raw).hexdigest(),'methodSignatures':[m['name']+m['descriptor'] for m in c.methods],'selectedMethods':selected}
(O/'cache-metadata.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'jarSha256':report['jarSha256'],'classes':{name:[m['name']+m['descriptor'] for m in data['selectedMethods']] for name,data in report['classes'].items()},'javaExecution':False}))
