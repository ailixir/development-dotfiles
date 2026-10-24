"""Pure verifier for the actual readonly Bash variable bytes; no eval/FS/process."""
import hashlib
import json
import re
class BindingError(ValueError):pass
def verify(buffer,expected_sha,expected_bytes,readonly,read_status):
    if type(buffer)is not str or '\x00' in buffer or type(expected_sha)is not str or re.fullmatch('[0-9a-f]{64}',expected_sha)is None or type(expected_bytes)is not int or not 0<=expected_bytes<=1048576 or readonly is not True or type(read_status)is not int or read_status!=1:raise BindingError('BUFFER_METADATA')
    raw=buffer.encode('utf-8','strict')
    if len(raw)!=expected_bytes or hashlib.sha256(raw).hexdigest()!=expected_sha:raise BindingError('BUFFER_INTEGRITY')
    return dict(bufferSha256=expected_sha,bufferBytes=len(raw),verificationExit=0,readEofStatus=1,readonly=True,evalOrPhaseAuthority=False)
def execute(argv):
    if type(argv)is not list or len(argv)!=5:raise BindingError('BUFFER_ARGUMENTS')
    sha,count,readonly,status,buffer=argv
    if re.fullmatch('[0-9]+',count)is None:raise BindingError('BUFFER_BYTECOUNT')
    return verify(buffer,sha,int(count),readonly=='readonly',int(status) if status in('0','1') else None)
if __name__=='__main__':raise SystemExit('HOLD: VERIFIED SAME-BUFFER LAUNCHER REQUIRED')
