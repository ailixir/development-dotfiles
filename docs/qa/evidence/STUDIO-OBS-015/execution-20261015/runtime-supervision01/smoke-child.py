import os
import sys
import time

if sys.argv[2] != "literal spaces ; $(never-run) `never-run`":
    raise SystemExit(91)
descriptor = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, "wb", buffering=0) as stream:
    stream.write(b"single fixture launch\n")
    os.fsync(stream.fileno())
print("Private framework smoke output", flush=True)
time.sleep(12)
raise SystemExit(7)
