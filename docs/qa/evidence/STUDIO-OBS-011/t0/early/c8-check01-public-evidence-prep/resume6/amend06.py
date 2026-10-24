"""Inactive06 source amendment from immutable05; no runtime action."""
from pathlib import Path
P=Path(__file__).absolute().parent
assert P.name=='resume6'
f=P/'public_observation_unit.py';s=f.read_text()
at=s.index('class Custody:')
s=s[:at]+'''RETAINED_OWNERSHIP = []


class Ownership:
    """Invocation-wide strong owners and per-acquisition, non-retryable close tokens."""
    def __init__(self):
        self.owners, self.tokens, self.references = [], [], []

    def owner(self, obj):
        if not any(x is obj for x in self.owners):
            self.owners.append(obj)

    def acquire(self, owner, fd, closer, kind):
        token = dict(number=len(self.tokens)+1, owner=owner, fd=fd, closer=closer,
                     kind=kind, state='OPEN', handle=None)
        self.tokens.append(token)
        return token

    def transfer(self, token, handle, closer):
        need(token['state'] in ('OPEN','TRANSFERRED'), 'OWNERSHIP_TRANSFER_STATE')
        token.update(state='TRANSFERRED', handle=handle, closer=closer)

    def close(self, token):
        if token['state'] == 'CLOSED':
            return
        need(token['state'] in ('OPEN','TRANSFERRED'), 'UNKNOWN_CLOSE_NEVER_RETRY')
        # UNKNOWN is set before invoking a fallible closer. No subsequent bare-FD retry.
        token['state'] = 'UNKNOWN'
        try:
            token['closer'](token['fd'])
        except BaseException:
            self.retain()
            raise
        token['state'] = 'CLOSED'

    def blockers(self, exempt=()):
        return [t for t in self.tokens if t['state'] != 'CLOSED' and not
                (t['state']=='OPEN' and t['kind']=='DIRECTORY'
                 and getattr(t['owner'],'initialized',False) is True
                 and any(t['owner'] is x for x in exempt))]

    def retain(self, *refs):
        for ref in refs:
            if ref is not None and not any(x is ref for x in self.references):
                self.references.append(ref)
        if not any(x is self for x in RETAINED_OWNERSHIP):
            RETAINED_OWNERSHIP.append(self)

    def finish(self, *caller_owners):
        callers=tuple(x for x in caller_owners if x is not None)
        if self.blockers(callers):
            self.retain(*callers)
            return False
        for owner in callers:
            try:
                owner.close()
            except BaseException:
                self.retain(*callers)
                return False
        if self.blockers():
            self.retain(*callers)
            return False
        return True

    def summary(self):
        return [dict(number=t['number'],kind=t['kind'],state=t['state']) for t in self.tokens]

    def view(self, *exempt):
        ownership=self
        class View:
            def clear(self): return not ownership.blockers(exempt)
            def retain(self,*refs): ownership.retain(*refs)
        return View()


''' +s[at:]
s=s.replace('def __init__(self, path, mode=None, api=os):','def __init__(self, path, mode=None, api=os, ownership=None):')
s=s.replace("        self.os, self.path, self.chain = api, Path(path), []", """        self.os, self.path, self.chain = api, Path(path), []
        self.ownership = Ownership() if ownership is None else ownership
        self.owned, self.initialized = [], False
        self.ownership.owner(self)""")
s=s.replace("fd = api.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)","fd, token = self.open_fd('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, kind='DIRECTORY')")
s=s.replace("fd = api.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)","fd, token = self.open_fd(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, kind='DIRECTORY', dir_fd=parent)")
s=s.replace("        except BaseException:\n            self.close()\n            raise\n\n    def check(self):", """            self.initialized = True
        except BaseException:
            try:
                self.close()
            except BaseException:
                self.ownership.retain(self)
            raise

    def open_fd(self, name, flags, mode=None, kind='FILE', **kwargs):
        fd = self.os.open(name, flags, **kwargs) if mode is None else self.os.open(name, flags, mode, **kwargs)
        token = self.ownership.acquire(self, fd, self.os.close, kind)
        self.owned.append(token)
        return fd, token

    def token(self, fd):
        found = [t for t in self.owned if t['fd']==fd and t['state'] in ('OPEN','TRANSFERRED')]
        need(len(found)==1, 'EXACT_LIVE_ACQUISITION_TOKEN')
        return found[0]

    def close_fd(self, token):
        self.ownership.close(token)

    def check(self):""")
s=s.replace("fd = self.os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=self.fd)","fd, token = self.open_fd(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=self.fd)")
s=s.replace("fd = self.os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode, dir_fd=self.fd)","fd, token = self.open_fd(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode, dir_fd=self.fd)")
s=s.replace("            return fd\n        except BaseException:\n            self.os.close(fd)","            self.ownership.transfer(token, None, self.os.close)\n            return fd\n        except BaseException:\n            self.close_fd(token)")
s=s.replace("        fd = self.create_fd(name, mode)\n        try:","        fd = self.create_fd(name, mode)\n        token = self.token(fd)\n        try:")
s=s.replace("fd = self.os.open(name, os.O_WRONLY | os.O_NOFOLLOW, dir_fd=self.fd)","fd, token = self.open_fd(name, os.O_WRONLY | os.O_NOFOLLOW, dir_fd=self.fd)")
s=s.replace("            self.os.close(fd)","            self.close_fd(token)")
start=s.index('    def close(self):',s.index('class Custody:'));end=s.index('\n\nclass System:',start)
s=s[:start]+'''    def close(self):
        # Only close directory tokens here. Exposed/transient files have explicit owners;
        # UNKNOWN is never retried and CLOSED descriptor numbers may already be reused.
        failed=False
        for token in reversed(self.owned):
            if token['kind']=='DIRECTORY' and token['state']=='OPEN':
                try: self.close_fd(token)
                except BaseException: failed=True
        if failed or any(t['state']!='CLOSED' for t in self.owned):
            self.ownership.retain(self)
            raise Hold('CUSTODY_ACQUISITIONS_UNCONFIRMED')
        self.chain=[]
''' +s[end:]
s=s.replace('    def custody(self, path, mode=None):\n        return Custody(path, mode)',"    def __init__(self):\n        self.ownership = Ownership()\n\n    def custody(self, path, mode=None):\n        return Custody(path, mode, ownership=self.ownership)")
start=s.index('    def sink(self, c, name):');end=s.index('    def lock_free(',start)
s=s[:start]+'''    def sink(self, c, name):
        fd = c.create_fd(name)
        token = c.token(fd)
        try:
            handle = os.fdopen(fd, 'wb')
        except BaseException:
            # fdopen may have consumed/closed the FD before raising: never retry bare fd.
            token['state']='UNKNOWN'
            c.ownership.retain(c)
            raise
        c.ownership.transfer(token,handle,lambda unused:handle.close())
        try:
            expected = identity_key(os.fstat(handle.fileno()))
        except BaseException:
            c.close_fd(token)
            raise
        class RetainedSink:
            def fileno(self):
                c.check()
                need(identity_key(os.fstat(handle.fileno())) == expected == identity_key(c.info(name)), 'NATIVE_SINK_REPLACED')
                return handle.fileno()
            def close(self):
                if token['state']=='CLOSED': return
                need(token['state']!='UNKNOWN','UNKNOWN_SINK_CLOSE_NEVER_RETRY')
                try:
                    handle.flush()
                    os.fsync(handle.fileno())
                    c.check()
                    need(identity_key(os.fstat(handle.fileno())) == expected == identity_key(c.info(name)), 'NATIVE_SINK_CHANGED')
                finally:
                    c.close_fd(token)
        return RetainedSink()

''' +s[end:]
s=s.replace("fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=c.fd)","fd, token = c.open_fd(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=c.fd)")
# Only System.lock_free retains this exact old close call.
s=s.replace('            os.close(fd)\n\n    def environment', '            c.close_fd(token)\n\n    def environment')
s=s.replace('        self.c, self.unit = namespace, unit','        self.c, self.unit = namespace, unit\n        self.ownership = system.ownership')
s=s.replace("        if not resolved:\n            self.custody_retained", "        resolved = resolved and not self.ownership.blockers((self.c,self.unit))\n        if not resolved:\n            self.ownership.retain(self,self.relay,self.c,self.unit,self.a)\n            self.custody_retained")
s=s.replace("                        'relayReceipt': dict(relay.result), 'C8Credit': False", "                        'relayReceipt': None if relay is None else dict(relay.result),\n                        'acquisitionLedger': self.ownership.summary(), 'C8Credit': False")
s=s.replace("            self.c.close()\n            self.unit.close()\n        except BaseException:", "            need(self.ownership.finish(self.c,self.unit), 'INVOCATION_ACQUISITIONS_UNCONFIRMED')\n        except BaseException:")
s=s.replace("self.a['relayCustody'])", "self.a['relayCustody'], self.ownership.view(self.c,self.unit))")
s=s.replace("    c, unit = system.custody(CONTROL, 0o700), system.custody(UNIT, 0o700)\n    verified = Verified(system)\n    try:","    c, unit = None, None\n    verified = Verified(system)\n    try:\n        c = system.custody(CONTROL, 0o700)\n        unit = system.custody(UNIT, 0o700)")
s=s.replace("    except BaseException:\n        c.close()\n        unit.close()\n        raise\n\n\ndef operate", "    except BaseException:\n        system.ownership.finish(c,unit)\n        raise\n\n\ndef operate")
s=s.replace("    effects = load(concrete, args[1], args[2], args[3], args[0])\n    try:","    effects = None\n    try:\n        effects = load(concrete, args[1], args[2], args[3], args[0])")
s=s.replace("        if effects.registration_complete is not True:","        if effects is not None and effects.registration_complete is not True:")
s=s.replace("        custody_discharged = effects.release_custody()", "        custody_discharged = effects.release_custody() if effects is not None else concrete.ownership.finish()")
f.write_text(s)
f=P/'public_relay.py';s=f.read_text().replace('contract, digest, decode, peer_verifier, root_custody):','contract, digest, decode, peer_verifier, root_custody, ownership):').replace("        self.b,self.custody_factory,self.output = boundary,custody_factory,output", "        self.b,self.custody_factory,self.output = boundary,custody_factory,output\n        self.ownership = ownership")
s=s.replace("        closed = terminated and all(self.close_outcomes.get(name) is True for name in acquired)","        closed = terminated and all(self.close_outcomes.get(name) is True for name in acquired) and self.ownership.clear()")
s=s.replace("            self.result.update(failure=True,qualified=False)\n        return dict(self.result)","            self.result.update(failure=True,qualified=False)\n            self.ownership.retain(self,self.output)\n        return dict(self.result)")
f.write_text(s)
print('Inactive06 complete acquisition/transfer/closure source amended')
