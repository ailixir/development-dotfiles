"""Source04-only deterministic amendment. Reads/writes this inactive prepared directory only."""
from pathlib import Path

P = Path(__file__).absolute().parent
assert P.name == 'resume4'
p = P / 'public_observation_unit.py'
s = p.read_text()
s = s.replace("CONTROL_MEMBERS |= {'postclose-verification.json', 'relay-ready.json', 'relay-drain.json', 'relay-launch.json'}", """CONTROL_MEMBERS |= {'postclose-verification.json', 'relay-ready.json', 'relay-drain.json', 'relay-launch.json'}
# Strong references survive main return while an actual owned asynchronous resource is unresolved.
RETAINED_EFFECTS = []
ENTRY_NAME = re.compile(r'entry-[0-9]{4}-pins\\.json')


def control_member(name):
    return name in CONTROL_MEMBERS or ENTRY_NAME.fullmatch(name) is not None or re.fullmatch(
        r'(?:client-[0-9]+-[0-9a-f]{16}|(?:utility|observation)-[0-9]+-[0-9a-f]{16}-[0-9]+|native-(?:selected|compile-restored)-[0-9]+|custody-retained-[0-9]+-[0-9a-f]{16})\\.json', name) is not None


def entry_controls(verified, namespace, release_sha, entry_name, entry_sha, mode):
    # This SHA comes ONLY from the explicit operator argv, never from first-seen bytes.
    need(type(entry_name) is str and ENTRY_NAME.fullmatch(entry_name) is not None
         and hash_value(entry_sha) and mode in PHASES, 'EXPLICIT_ENTRY_CONTROL_ARGUMENTS')
    value = verified.document(CONTROL / entry_name, entry_sha, 0o600)
    need(type(value) is dict and set(value) == {'schemaVersion', 'kind', 'authorizedBy',
         'releaseSha256', 'mode', 'controlPins'} and type(value['schemaVersion']) is int
         and value['schemaVersion'] == 1 and value['kind'] == 'EXACT_ENTRY_EXISTING_CONTROL_PINS'
         and value['authorizedBy'] == 'root' and value['releaseSha256'] == release_sha
         and value['mode'] == mode, 'ENTRY_CONTROL_ROOT_ROLE_RELEASE_MODE')
    pins = value['controlPins']
    need(type(pins) is dict and pins and all(member(n) and control_member(n)
         and n.endswith('.json') and n not in ARTIFACTS and n not in ('root-release.json', entry_name)
         and hash_value(h) for n, h in pins.items()), 'ENTRY_CONTROL_EXACT_PIN_MAP')
    names = namespace.members()
    needed = {n for n in names if n.endswith('.json') and n not in ARTIFACTS
              and n not in ('root-release.json', entry_name)}
    need(set(pins) == needed and 'active-lock.json' in pins, 'ENTRY_CONTROL_EXACT_EXISTING_MEMBERSHIP')
    # Verify all existing JSON journals/controls before ANY one of them is interpreted.
    for name, expected in pins.items():
        verified.raw(CONTROL / name, expected, 0o600, 16 * 1024 * 1024)
    return dict(pins)
""")
s = s.replace("self.client, self.utilities, self.sequence, self.loaded_local = None, [], 0, {}", """self.client, self.utilities, self.sequence, self.loaded_local = None, [], 0, {}
        self.external_control_pins = dict(authority['_entryControlPins'])
        self.generated_control_buffers = {}
        self.selected_lifecycle = None
        self.selected_claim_sha, self.selected_authority_sha = None, None
        self.custody_retained = False""")
start = s.index('    def root_document(self, name, expected=None):')
end = s.index('    def now(self):', start)
s = s[:start] + '''    def root_document(self, name, expected=None):
        need(member(name), 'CONTROL_DOCUMENT_MEMBER')
        generated = self.generated_control_buffers.get(name)
        external = self.external_control_pins.get(name)
        wanted = external if external is not None else sha(generated) if generated is not None else None
        need(hash_value(wanted), 'INDEPENDENT_FIRST_CONTROL_PIN_REQUIRED')
        need(expected is None or hash_value(expected) and expected == wanted, 'CONTROL_EXPECTED_PIN_CONFLICT')
        raw = self.c.read(name, 0o600)[0]
        need(sha(raw) == wanted and (generated is None or raw == generated), 'LOCAL_IMMUTABLE_CHANGED')
        self.loaded_local[name] = wanted
        # The exact buffer checked above is the one decoded; no interpretation reread.
        return decode(raw)

    def local_hash(self, name):
        self.root_document(name)
        return self.loaded_local[name]

    def write_once(self, name, value):
        need(member(name), 'OUTPUT_NAME')
        need(name not in self.external_control_pins and name not in self.generated_control_buffers,
             'NO_EXISTING_CONTROL_REGRANT_OR_REWRITE')
        raw = packed(value) + b'\\n'
        self.c.write(name, raw)
        # Only a successful exclusive write by THIS invocation establishes this branch.
        self.generated_control_buffers[name] = raw

    def claim_once(self, phase):
        need(phase in PHASES, 'CLAIM_PHASE')
        self.write_once(phase + '-consumed.json', {'phase': phase, 'releaseSha256': self.a['releaseSha256'], 'client': self.client, 'atEpoch': self.now(), 'attemptCap': 1})
        if phase == 'selected':
            need(self.mode == 'selected' and self.selected_lifecycle is None
                 and self.client is not None and self.client.get('identityComplete') is True,
                 'EXACT_SELECTED_CLAIM_CLIENT')
            self.selected_claim_sha = self.local_hash('selected-consumed.json')
            self.selected_lifecycle = 'CLAIMED_NOT_AUTHORIZED'

    def pending_selected_preflight(self):
        need(self.mode == 'selected' and self.selected_lifecycle == 'AUTHORIZED_PENDING_SETUP'
             and self.selected_authority_sha == self.external_control_pins.get('root-selected-decision.json')
             and hash_value(self.selected_authority_sha) and self.relay is None
             and self.receipt is None and self.selected_worker is None,
             'EXACT_AUTHORIZED_PENDING_SELECTED_STATE')
        claim = self.root_document('selected-consumed.json', self.selected_claim_sha)
        need(claim.get('client') == self.client and claim.get('phase') == 'selected'
             and claim.get('releaseSha256') == self.a['releaseSha256']
             and type(claim.get('attemptCap')) is int and claim['attemptCap'] == 1,
             'PENDING_SELECTED_CLAIM_IDENTITY')
        need(all(self.c.absent(n) for n in ('relay-launch.json', 'relay-ready.json', 'relay-drain.json',
             'selected-drain.json', 'selected-native-result.json', 'selected-result.json')),
             'PENDING_SELECTED_NO_SETUP_OR_TERMINAL_RECORDS')
        return True

    def release_custody(self):
        # Never discharge another thread's output/ancestor descriptors from this caller.
        relay = self.relay
        resolved = relay is None
        if relay is not None:
            thread = relay.thread
            resolved = (relay.result.get('threadTerminated') is True
                        and relay.result.get('descriptorsClosed') is True
                        and (thread is None or thread.is_alive() is False))
        if not resolved:
            self.custody_retained = True
            self.gaps['resourceObservationGap'] = True
            if not any(item is self for item in RETAINED_EFFECTS):
                RETAINED_EFFECTS.append(self)
            if self.client is not None and self.client.get('identityComplete') is True:
                name = 'custody-retained-' + str(self.client['pid']) + '-' + sha(self.client['start'].encode())[:16] + '.json'
                if self.c.absent(name):
                    self.write_once(name, {'kind': 'UNRESOLVED_ASYNC_CUSTODY_RETAINED',
                        'releaseSha256': self.a['releaseSha256'], 'client': self.client,
                        'threadTerminationConfirmed': False, 'outputCustodyRetained': True,
                        'controlCustodyRetained': True, 'qualified': False,
                        'relayReceipt': dict(relay.result), 'C8Credit': False})
            return False
        self.c.close()
        self.unit.close()
        return True

''' + s[end:]
old = "need(name in self.a['controlMembers'] or re.fullmatch(r'(?:client-[0-9]+-[0-9a-f]{16}|(?:utility|observation)-[0-9]+-[0-9a-f]{16}-[0-9]+|native-(?:selected|compile-restored)-[0-9]+)\\.json', name) is not None, 'UNEXPECTED_CONTROL_MEMBER')"
s = s.replace(old,"need(control_member(name), 'UNEXPECTED_CONTROL_MEMBER')")
old = "need(name in CONTROL_MEMBERS or re.fullmatch(r'(?:client-[0-9]+-[0-9a-f]{16}|(?:utility|observation)-[0-9]+-[0-9a-f]{16}-[0-9]+|native-(?:selected|compile-restored)-[0-9]+)\\.json', name) is not None, 'BOOTSTRAP_NAMESPACE_MEMBERSHIP')"
s = s.replace(old,"need(control_member(name), 'BOOTSTRAP_NAMESPACE_MEMBERSHIP')")
s = s.replace("        return value\n\n    def validate_negative(self):", """        if decision == 'AUTHORIZE_ONE_SELECTED_NATIVE' and self.selected_lifecycle == 'CLAIMED_NOT_AUTHORIZED':
            need(self.mode == 'selected' and self.local_hash('root-selected-decision.json')
                 == self.external_control_pins.get('root-selected-decision.json'),
                 'EXTERNAL_SELECTED_AUTHORITY_REQUIRED')
            self.selected_authority_sha = self.local_hash('root-selected-decision.json')
            self.selected_lifecycle = 'AUTHORIZED_PENDING_SETUP'
        return value

    def validate_negative(self):""")
s = s.replace("        need(self.relay is None, 'ONE_RELAY')", "        need(self.relay is None and self.selected_lifecycle == 'SETUP_STARTED', 'ONE_RELAY_AFTER_SELECTED_PREFLIGHT')")
s = s.replace("        # Source03 retains unresolved objects and journals actual close/join results.", "        # Source04 retains unresolved objects and journals actual close/join results.")
s = s.replace("            if not self.c.absent('selected-consumed.json'):\n                drain=self.root_document('selected-drain.json')\n                need(drain.get('nativeNotStarted') is True and self.c.absent('relay-launch.json'), 'SELECTED_RELAY_DRAIN_MISSING')", """            if not self.c.absent('selected-consumed.json'):
                if self.selected_lifecycle == 'AUTHORIZED_PENDING_SETUP':
                    self.pending_selected_preflight()
                    return
                drain=self.root_document('selected-drain.json')
                need(drain.get('nativeNotStarted') is True and self.c.absent('relay-launch.json')
                     and self.relay is None and all(drain.get(k) is False for k in self.policy.GAPS),
                     'SELECTED_RELAY_DRAIN_MISSING')""")
s = s.replace("        scope = core_scope(self.v.raw(ROOT / CORE, CORE_SHA))", """        if phase == 'selected':
            self.pending_selected_preflight()
            self.selected_lifecycle = 'SETUP_STARTED'
        scope = core_scope(self.v.raw(ROOT / CORE, CORE_SHA))""")
s = s.replace("            return receipt\n        receipt = self.receipt", "            if phase == 'selected':\n                self.selected_lifecycle = 'TERMINAL'\n            return receipt\n        receipt = self.receipt")
s = s.replace("        self.write_once(name, value)\n        return value\n\n    def actual_selected_result", "        self.write_once(name, value)\n        if phase == 'selected':\n            self.selected_lifecycle = 'TERMINAL'\n        return value\n\n    def actual_selected_result")
s = s.replace('def load(system, release_sha):', 'def load(system, release_sha, entry_name, entry_sha, mode):')
s = s.replace("        active_raw = c.read('active-lock.json', 0o600)[0]", """        need('_entryControlPins' not in a, 'NO_SERIALIZED_DERIVED_ENTRY_AUTHORITY')
        a['_entryControlPins'] = entry_controls(verified, c, release_sha, entry_name, entry_sha, mode)
        active_raw = verified.raw(CONTROL / 'active-lock.json', a['_entryControlPins']['active-lock.json'], 0o600)""")
s = s.replace("    need(type(args) is list and len(args) in (2, 3) and args[0] in PHASES and hash_value(args[1]), 'EXACT_CLI')", "    need(type(args) is list and len(args) in (4, 5) and args[0] in PHASES and hash_value(args[1]) and type(args[2]) is str and ENTRY_NAME.fullmatch(args[2]) is not None and hash_value(args[3]), 'EXACT_CLI')")
s = s.replace("(len(args) == 3)", "(len(args) == 5)").replace("if len(args) == 3:", "if len(args) == 5:").replace("need(args[2] in ('0', '1')", "need(args[4] in ('0', '1')")
s = s.replace("effects = load(concrete, args[1])", "effects = load(concrete, args[1], args[2], args[3], args[0])")
s = s.replace("int(args[2]) if len(args) == 3 else None", "int(args[4]) if len(args) == 5 else None")
s = s.replace("        effects.c.close()\n        effects.unit.close()", "        effects.release_custody()")
p.write_text(s)
assert 'wanted is None or sha(raw)' not in s

# The Java code and candidate remain literal03 bytes. Only current instructions change.
for name in ('RECIPE.md', 'RUNTIME-RECIPE.md'):
    t=(P/name).read_text().replace('Source03','Source04').replace('source03','source04')
    t=t.replace('ecb74d5f9ab42e3888d8e05f419f107213030873ca84d2b0dfc0ce4964da0b35','3a6fddda4946106f143783640746464cf2c775256f2340b9d24d1a4701adadbd')
    (P/name).write_text(t)
print('Amended inactive04 concrete lifecycle/control/custody; no runtime effects')
