import hashlib,json,os,sys
status=1
record={"kind":"SOURCE05_BUFFER_BOOTSTRAP","qualified":False,"NFact":False,"credit":False,"helper":{"pid":os.getpid(),"ppid":os.getppid(),"start":None,"fullFingerprint":None,"completionOwedToOuterTool":True}}
try:
 raw=sys.argv[1].encode("utf-8","strict");expected=sys.argv[2];count=sys.argv[3]
 if len(sys.argv)!=4 or len(raw)>1048576 or not count.isdecimal() or len(expected)!=64 or len(raw)!=int(count) or hashlib.sha256(raw).hexdigest()!=expected:raise ValueError()
 record.update(verificationExit=0,sha256=expected,bytes=len(raw));status=0
except BaseException:record.update(status="HOLD",stage="ENTRY_BUFFER",namespace="BOOTSTRAP_VALUE_ERROR",reason="BUFFER_INTEGRITY")
print(json.dumps(record,sort_keys=True,separators=(",",":")));sys.exit(status)
