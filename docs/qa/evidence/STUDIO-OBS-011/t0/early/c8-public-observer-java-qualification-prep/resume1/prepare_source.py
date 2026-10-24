"""Source-author metadata only. No target generator or runtime function executes."""
from pathlib import Path
import ast, hashlib, json, stat

HERE = Path(__file__).absolute().parent
T0 = HERE.parents[2]
OLD = T0 / 'early/c8-check01-public-evidence-prep/resume6'
DESIGN = T0 / 'resume-architecture/resume2/c8-public-observer-java-qualification-design'
QA = T0 / 'qa/c8-public-observer-java-qualification-design-review'
PINS = []

def raw(path, expected=None):
    value = path.read_bytes()
    digest = hashlib.sha256(value).hexdigest()
    if expected is not None and digest != expected:
        raise RuntimeError('SOURCE_PIN_MISMATCH')
    info = path.stat()
    PINS.append(dict(path=str(path), sha256=digest, bytes=len(value), mode=stat.S_IMODE(info.st_mode)))
    return value

def save(name, value):
    content = value if type(value) is bytes else value.encode()
    (HERE/name).write_bytes(content)

def document(name, value):
    save(name, json.dumps(value, indent=2, allow_nan=False)+'\n')

def packet(directory, expected):
    data = json.loads(raw(directory/'manifest.json', expected))
    rows = data.get('files', data.get('members'))
    if type(rows) is not list:
        raise RuntimeError('MANIFEST_ROWS')
    for row in rows:
        path = directory / row.get('name', row.get('path'))
        # Existing manifests may use a root-relative path.
        if not path.is_file():
            path = Path(row['path'])
        value = raw(path, row['sha256'])
        if len(value) != row['bytes']:
            raise RuntimeError('SOURCE_BYTES')
        mode=row['mode']
        if type(mode) is str:mode=int(mode,0) if mode.startswith('0o') else int(mode,8)
        if stat.S_IMODE(path.stat().st_mode)!=mode:raise RuntimeError('SOURCE_MODE')
    return data

packet(DESIGN, '11c18feae978bafbd9af35b5c760abe33e99377d889986102a83353bbe155f99')
packet(QA, '50d2ffcedeacd0a9251f8d66ff56e0bfbffe728f9f06ce0ee82d597b96a3a70b')
packet(OLD, 'b5aa1e5d1e602c30b0e134ad21342ec1604ea2b2cf7e31be1b2c7d58a1f4bdf1')
for directory, expected in ((T0/'qa/c8-public-observer-source06-exact-review', '8f53da49d167dbf13c391dc2c90e3615b9445cb9db6e39f9cabcb99c98c23ea2'),
                             (T0/'resume-architecture/resume2/c8-public-observer-source06-exact-review', 'c334a8113638ed3b1628340e9c8d7231982a498f7ab92266904fac81d5bb7ca4')):
    packet(directory, expected)
raw(T0/'resume2-c8-public-observer-java-qualification-design-root-adoption.json', 'bb29f911f7a6c835cb9394af1fd438f1db1c48c5b0976c77ac056f0df1c2d873')
raw(T0/'resume2-c8-public-observer-source06-exact-source-root-adoption.json', '710fb946333f8403bcd64d2ac4c274d337bc21747b21bc419c5656a76700ab16')

fragment = raw(OLD/'observer-fragment.java.txt', '0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66')
harness = raw(OLD/'ObserverBoundaryHarness.java', '541d3f7009694fe885a630fc98072966d12f2408bf3a181935e74cb67501b2a5')
body = raw(OLD/'java-harness-body.java.txt').decode()
if harness.count(fragment) != 1:
    raise RuntimeError('FRAGMENT_ONCE')
save('observer-fragment.java.txt', fragment)
save('public_contract.py', raw(OLD/'public_contract.py'))
save('public-observation.schema.json', raw(OLD/'public-observation.schema.json'))
relay = raw(OLD/'public_relay.py').decode()
# Preserve all existing operations; expose only a bounded closed reason at their existing catch.
relay = relay.replace("        except BaseException:\n            self.result['failure']=not", "        except BaseException as failure:\n            self.primary_reason = reason(failure)\n            self.result['failure']=not", 1)
relay = relay.replace("        self.join_confirmed = False", "        self.join_confirmed = False\n        self.primary_reason = 'NONE'", 1)
reasons = sorted(set(node.args[1].value for node in ast.walk(ast.parse(relay))
                     if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id=='need'
                     and len(node.args)>1 and isinstance(node.args[1], ast.Constant)))
relay += '\nCLOSED_REASONS = frozenset('+repr(tuple(reasons+['COMMIT_EOF_NOT_CONFIRMED','SYNTHETIC_NOT_STARTED_ONLY']))+')\n'
relay += "def reason(failure):\n    if type(failure) is RelayHold and len(failure.args)==1 and failure.args[0] in CLOSED_REASONS:\n        return failure.args[0]\n    return 'UNMAPPED_RELAY_FAILURE'\n"
relay += '''
class SyntheticRelay(Relay):
    def validate_data(self, data):
        observation = super().validate_data(data)
        need(observation['captureStatus']=='NOT_REPRODUCED' and observation['pollState']=='FINALIZING'
             and observation['networkAccounting']==self.contract.network_not_started(), 'SYNTHETIC_NOT_STARTED_ONLY')
        return observation
'''
save('qualified_relay.py', relay)

adapter = raw(OLD/'public_observation_unit.py').decode()
tree = ast.parse(adapter)
selected = ('Hold','need','hash_value','member','pairs','decode','identity_key','file_key','Ownership','Custody')
lines = adapter.splitlines(keepends=True)
pieces = []
for node in tree.body:
    if isinstance(node, (ast.ClassDef,ast.FunctionDef)) and node.name in selected:
        if node.name=='Custody':
            # Remove only unrelated shared-source replace operation from this receiver library.
            start=node.lineno-1; end=node.end_lineno
            method=next(n for n in node.body if isinstance(n,ast.FunctionDef) and n.name=='replace_exact')
            pieces.append(''.join(lines[start:method.lineno-1]+lines[method.end_lineno:end]))
        else:
            pieces.append(''.join(lines[node.lineno-1:node.end_lineno]))
save('qualification_custody.py', '"""Finite source06 custody extraction. No main or source-write operation."""\nimport os, stat, json, re\nfrom pathlib import Path\nRETAINED_OWNERSHIP=[]\n\n'+'\n\n'.join(pieces)+'\n')

marker='    System.out.println("{\\"case\\":\\"parser\\",\\"status\\":\\"PASS\\",\\"checks\\":18,\\"nativeBusinessRequests\\":0}");'
added='''    parserCase("chunk-line129",bytes("HTTP/1.1 200 OK\\r\\nTransfer-Encoding: chunked\\r\\n\\r\\n"+"0".repeat(129)+"\\r\\n"),false,0);
    parserCase("chunk-data-bad-CRLF",bytes("HTTP/1.1 200 OK\\r\\nTransfer-Encoding: chunked\\r\\n\\r\\n2\\r\\n{}X\\n0\\r\\n\\r\\n"),false,0);
    parserCase("bare-LF-header",bytes("HTTP/1.1 200 OK\\n\\n"),false,0);
    parserCase("header-exact16384",bytes("HTTP/1.1 200 OK\\r\\nX: "+"x".repeat(16360)+"\\r\\n\\r\\n"),true,0);
    parserCase("trailer-exact8192",bytes("HTTP/1.1 200 OK\\r\\nTransfer-Encoding: chunked\\r\\n\\r\\n0\\r\\nX: "+"x".repeat(8185)+"\\r\\n\\r\\n"),true,0);
    parserCase("trailer-bad-CRLF",bytes("HTTP/1.1 200 OK\\r\\nTransfer-Encoding: chunked\\r\\n\\r\\n0\\r\\nX: x\\rX"),false,0);
    System.out.println("{\\"case\\":\\"parser\\",\\"status\\":\\"PASS\\",\\"originalChecks\\":18,\\"addedChecks\\":6,\\"checks\\":24,\\"nativeBusinessRequests\\":0}");'''
if marker not in body:
    raise RuntimeError('PARSER_MARKER')
body = body.replace(marker, added)
start = body.index('  private static void tlsCase(')
end = body.index('  public static void main(', start)
tls = raw(HERE/'tls-driver.java.txt').decode()
body = body[:start]+tls+'\n'+body[end:]
save('java-harness-body.java.txt', body)
oldbody = raw(OLD/'java-harness-body.java.txt')
if harness.count(oldbody)!=1:
    raise RuntimeError('BODY_ONCE')
newharness = harness.replace(oldbody, body.encode())
if newharness.count(fragment)!=1:
    raise RuntimeError('NEW_FRAGMENT_ONCE')
save('ObserverBoundaryHarness.java', newharness)
document('java-harness-status.json', dict(productionFragmentSha256=hashlib.sha256(fragment).hexdigest(), fragmentByteIdentical=True,
    compiled=False, executed=False, originalParserChecks=18, addedParserChecks=6, totalParserChecks=24,
    modes=['parser','tls-good','tls-oversize','tls-stall-handshake','tls-stall-write','tls-stall-body','tls-stall-trailers','tls-dribble','relay'],
    actualBlockedWriteSupport='UNKNOWN', actualPlatformQualified=False))
document('verified-inputs.json', PINS)
save('acceptance-matrix.md',raw(DESIGN/'acceptance-matrix.md'))
save('finite-input-requirements.json',raw(DESIGN/'input-catalog.json'))
print(json.dumps(dict(kind='SOURCE_METADATA_ONLY', pinnedReads=len(PINS), nativeActions=0)))
