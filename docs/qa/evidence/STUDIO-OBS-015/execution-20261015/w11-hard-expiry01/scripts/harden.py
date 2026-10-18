import sys
P=sys.argv[1]
s=open(P).read()
def rep(a,b):
    global s
    assert s.count(a)==1,a[:70]
    s=s.replace(a,b)
rep("const CANARY='obs007-guided-renew-private';\n","""const CANARY='obs007-guided-renew-private';
// A Node timer can fire a little before Date.now() reaches its due time (a millisecond, stretched by however stale the loop clock was when it was armed).
// The hard-expiry stop is therefore asserted at the instant it happened, with this much allowance: far below the 100 ms claim margin and the seconds a premature stop would show.
const TIMER_EARLY_MS=10;
""")
rep("authorityStoppedAt:number|undefined,stopReason:string|undefined,","authorityStoppedAt:number|undefined,authorityStoppedWallMs:number|undefined,stopReason:string|undefined,")
rep("{authorityStoppedAt??=performance.now();stopReason??=reason;}","{authorityStoppedAt??=performance.now();authorityStoppedWallMs??=Date.now();stopReason??=reason;}")
rep("expect(Date.now()).toBeGreaterThanOrEqual(Date.parse(context.expiresAt));expect(stopReason).toBe('EXPIRED');","expect(authorityStoppedWallMs).toBeGreaterThanOrEqual(Date.parse(context.expiresAt)-TIMER_EARLY_MS);expect(stopReason).toBe('EXPIRED');")
open(P,'w').write(s)
