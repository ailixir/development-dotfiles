"""Finite source06 custody extraction. No main or source-write operation."""
import os, stat, json, re
from pathlib import Path
RETAINED_OWNERSHIP=[]

class Hold(Exception):
    pass


def need(value, reason):
    if value is not True:
        raise Hold(reason)


def hash_value(value):
    return type(value) is str and re.fullmatch('[0-9a-f]{64}', value) is not None


def member(name):
    return type(name) is str and bool(name) and '/' not in name and '\x00' not in name and name not in ('.', '..')


def pairs(items):
    out = {}
    for key, value in items:
        need(key not in out, 'DUPLICATE_JSON_MEMBER')
        out[key] = value
    return out


def decode(raw):
    need(type(raw) is bytes and len(raw) <= 16 * 1024 * 1024, 'BOUNDED_JSON_BYTES')
    return json.loads(raw.decode('utf-8', 'strict'), object_pairs_hook=pairs,
                      parse_constant=lambda unused: (_ for _ in ()).throw(Hold('NONFINITE_JSON')))


def identity_key(st):
    return st.st_dev, st.st_ino, st.st_mode, st.st_uid


def file_key(st):
    return identity_key(st) + (st.st_size, st.st_mtime_ns, st.st_ctime_ns)


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


class Custody:
    """Retain every ancestor descriptor, and revalidate both named and opened objects."""
    def __init__(self, path, mode=None, api=os, ownership=None):
        self.os, self.path, self.chain = api, Path(path), []
        self.ownership = Ownership() if ownership is None else ownership
        self.owned, self.initialized = [], False
        self.ownership.owner(self)
        need(self.path.is_absolute() and '..' not in self.path.parts and str(self.path) == str(path), 'CUSTODY_PATH')
        try:
            fd, token = self.open_fd('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, kind='DIRECTORY')
            self.chain.append((None, '/', fd, identity_key(api.fstat(fd))))
            for name in self.path.parts[1:]:
                parent = fd
                fd, token = self.open_fd(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, kind='DIRECTORY', dir_fd=parent)
                self.chain.append((parent, name, fd, identity_key(api.fstat(fd))))
            self.fd = fd
            self.check()
            info = api.fstat(fd)
            need(mode is None or (stat.S_IMODE(info.st_mode) == mode and info.st_uid == api.getuid()), 'DIRECTORY_OWNER_MODE')
            self.initialized = True
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

    def check(self):
        for parent, name, fd, expected in self.chain:
            actual = self.os.fstat(fd)
            named = self.os.stat(name, follow_symlinks=False) if parent is None else self.os.stat(name, dir_fd=parent, follow_symlinks=False)
            need(stat.S_ISDIR(actual.st_mode) and identity_key(actual) == expected == identity_key(named), 'DIRECTORY_CUSTODY_CHANGED')

    def members(self):
        self.check()
        names = self.os.listdir(self.fd)
        self.check()
        need(all(member(n) for n in names) and len(names) == len(set(names)), 'MEMBERS')
        return sorted(names)

    def info(self, name):
        need(member(name), 'MEMBER')
        self.check()
        value = self.os.stat(name, dir_fd=self.fd, follow_symlinks=False)
        self.check()
        return value

    def absent(self, name):
        try:
            self.info(name)
        except FileNotFoundError:
            return True
        return False

    def read(self, name, mode=None, cap=16 * 1024 * 1024):
        need(member(name), 'MEMBER')
        self.check()
        fd, token = self.open_fd(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=self.fd)
        try:
            before = self.os.fstat(fd)
            need(stat.S_ISREG(before.st_mode) and before.st_uid in (0, self.os.getuid()) and
                 (mode is None or stat.S_IMODE(before.st_mode) == mode) and 0 <= before.st_size <= cap, 'FILE_OWNER_MODE_CAP')
            pieces, remaining = [], before.st_size
            while remaining:
                piece = self.os.read(fd, min(remaining, 1024 * 1024))
                need(bool(piece), 'SHORT_READ')
                pieces.append(piece)
                remaining -= len(piece)
            need(self.os.read(fd, 1) == b'', 'GROWING_FILE')
            after, named = self.os.fstat(fd), self.info(name)
            need(file_key(before) == file_key(after) == file_key(named), 'FILE_CHANGED')
            self.check()
            return b''.join(pieces), before
        finally:
            self.close_fd(token)

    def create_fd(self, name, mode=0o600):
        need(member(name), 'OUTPUT_MEMBER')
        self.check()
        fd, token = self.open_fd(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode, dir_fd=self.fd)
        try:
            info = self.os.fstat(fd)
            need(stat.S_ISREG(info.st_mode) and info.st_uid == self.os.getuid() and stat.S_IMODE(info.st_mode) == mode and info.st_nlink == 1, 'EXCLUSIVE_OUTPUT')
            need(identity_key(info) == identity_key(self.info(name)), 'OUTPUT_NAME_CHANGED')
            self.check()
            self.ownership.transfer(token, None, self.os.close)
            return fd
        except BaseException:
            self.close_fd(token)
            raise

    def write(self, name, raw, mode=0o600):
        need(type(raw) is bytes, 'WRITE_BYTES')
        fd = self.create_fd(name, mode)
        token = self.token(fd)
        try:
            offset = 0
            while offset < len(raw):
                count = self.os.write(fd, raw[offset:])
                need(type(count) is int and count > 0, 'SHORT_WRITE')
                offset += count
            self.os.fsync(fd)
            need(identity_key(self.os.fstat(fd)) == identity_key(self.info(name)), 'OUTPUT_REPLACED')
            self.check()
            self.os.fsync(self.fd)
        finally:
            self.close_fd(token)


    def close(self):
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

