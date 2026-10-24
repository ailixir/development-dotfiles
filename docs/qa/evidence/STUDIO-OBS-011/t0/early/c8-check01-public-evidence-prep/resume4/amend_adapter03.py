"""Pure textual source composition; never loads/executes the adapter."""
from pathlib import Path
P=Path(__file__).absolute().parent
p=P/'public_observation_unit.py';s=p.read_text()
s=s.replace('import ast\n','import ast\nimport base64\nimport threading\n')
s=s.replace("ARTIFACTS = {", "ARTIFACTS = {'public_relay.py', ")
s=s.replace("CONTROL_MEMBERS |= {'postclose-verification.json'}", "CONTROL_MEMBERS |= {'postclose-verification.json', 'relay-ready.json', 'relay-drain.json', 'relay-launch.json'}")
s=s.replace("        self.scope, self.receipt = None, None", "        self.scope, self.receipt = None, None\n        self.relay, self.relay_module, self.selected_worker = None, None, None\n        self.peer_lock = threading.Lock()")
s=s.replace("'projectMarkerCandidate': any", "'testWorkerCandidate': ('GradleWorkerMain' in words[7] and 'Gradle Test Executor' in words[7]), 'projectMarkerCandidate': any")
s=s.replace('        self.last_probe = probe\n        return rows', '''        self.last_probe = probe
        if self.receipt is not None and self.receipt.get('phase') == 'selected' and self.receipt.get('collectorPid') is not None:
            candidates = [r for r in rows.values() if r['pid'] in descendants(rows,{self.receipt['collectorPid']}) and r.get('testWorkerCandidate') is True]
            need(len(candidates) <= 1, 'SELECTED_JVM_AMBIGUOUS')
            if candidates:
                selected = self.fingerprint(candidates[0])
                need(selected['executableFileHash'] == JAVA_SHA, 'SELECTED_JAVA21_EXACT')
                kernel = self.sys.process_identity(selected['pid'],self.plan['javaHome']+'/bin/java')
                with self.peer_lock:
                    prior = self.selected_worker
                    need(prior is None or (prior['pid'],prior['start']) == (selected['pid'],selected['start']), 'SELECTED_JVM_REPLACED')
                    self.selected_worker = dict(selected, **kernel)
        return rows''')
# Generalize kernel observer while preserving utility default call shape.
s=s.replace('    def utility_identity(self, pid, expected_path):','    def process_identity(self, pid, expected_path):')
s=s.replace(" and before.ppid == os.getpid() and before.startSeconds > 0", " and before.startSeconds > 0")
s=s.replace("'kernelIdentityComplete': True}\n\n    def sink", "'kernelIdentityComplete': True, 'uid': before.uid}\n\n    def utility_identity(self, pid, expected_path):\n        value = self.process_identity(pid, expected_path)\n        need(value['ppid'] == self.pid(), 'UTILITY_DIRECT_PARENT')\n        return value\n\n    def relay_boundary(self, module):\n        return module.Boundary()\n\n    def sink")
# append methods inside Effects before native run; load relay via verified consumed code.
needle='    def run_owned(self, command, cwd, phase):'
new='''    def relay_peer(self, pid):
        # No subprocess from the relay thread. The core's current collector-descendant
        # census must already have recorded ONE exact Gradle test executor JVM.
        with self.peer_lock:
            expected = None if self.selected_worker is None else dict(self.selected_worker)
        need(expected is not None and expected['pid'] == pid and expected.get('testWorkerCandidate') is True and expected.get('identityComplete') is True, 'EXACT_SELECTED_PEER_NOT_RECORDED')
        actual = self.sys.process_identity(pid,self.plan['javaHome']+'/bin/java')
        need(all(actual[k] == expected[k] for k in ('pid','ppid','kernelStartSeconds','kernelStartMicroseconds','processImage','uid')) and actual['uid'] == self.sys.uid(), 'SELECTED_PEER_KERNEL_REUSED')
        return dict(actual, identityComplete=True, start=expected['start'], argvHash=expected['argvHash'], executableFileHash=expected['executableFileHash'])

    def start_relay(self):
        need(self.relay is None, 'ONE_RELAY')
        self.relay_module = self.v.module(CONTROL / 'public_relay.py',self.a['artifactPins']['public_relay.py'],'_verified_public_relay')
        raw = base64.urlsafe_b64decode(self.a['launchControlBase64'])
        need(len(raw) <= 4096 and sha(raw) == self.a['observerControlSha256'], 'LAUNCH_CONTROL_PIN')
        control = decode(raw)
        self.relay_module.validate_control(control,self.contract)
        provenance = dict(self.a['collectorProvenance'],rootReleaseSha256=self.a['releaseSha256'])
        self.relay = self.relay_module.Relay(self.sys.relay_boundary(self.relay_module),self.sys.custody,self.unit,
            control,self.a['observerControlSha256'],provenance,self.contract,sha,decode,self.relay_peer,self.a['relayCustody'])
        self.write_once('relay-launch.json',dict(controlSha256=sha(raw),releaseSha256=self.a['releaseSha256'],
            codePins=provenance,selectedAttemptAlreadyConsumed=not self.c.absent('selected-consumed.json')))
        ready = self.relay.start()
        self.write_once('relay-ready.json',ready)

    def stop_relay(self):
        # Source03 retains unresolved objects and journals actual close/join results.
        if self.relay is None:
            return None
        try:
            value = self.relay.stop()
        except BaseException:
            value = dict(self.relay.result, failure=True, qualified=False, threadTerminated=False)
        self.write_once('relay-drain.json',dict(releaseSha256=self.a['releaseSha256'],receipt=value))
        if value.get('threadTerminated') is not True or value.get('descriptorsClosed') is not True or value.get('failure') is True:
            self.gaps['resourceObservationGap'] = True
        return value

    def relay_receipt(self):
        value = self.root_document('relay-drain.json')
        need(value.get('releaseSha256') == self.a['releaseSha256'], 'RELAY_RELEASE')
        receipt=value.get('receipt')
        need(type(receipt) is dict and set(receipt)==self.contract.RELAY_FIELDS and receipt.get('controlSha256')==self.a['observerControlSha256'], 'RELAY_RECEIPT_CONTROL')
        return receipt

    def verify_relay_closed_namespace(self):
        if self.c.absent('relay-drain.json'):
            need(self.c.absent('selected-consumed.json'), 'SELECTED_RELAY_DRAIN_MISSING')
            return
        receipt=self.relay_receipt()
        need(receipt['threadTerminated'] is True and receipt['descriptorsClosed'] is True and receipt['failure'] is False, 'RELAY_DRAIN_UNRESOLVED')
        module=self.v.module(CONTROL/'public_relay.py',self.a['artifactPins']['public_relay.py'],'_verified_closed_relay')
        short=self.sys.custody(module.SHORT,0o700)
        try:
            need(short.members()==['r.sock'], 'CLOSED_SHORT_MEMBERS')
            parent=self.sys.custody('/private/tmp')
            try: need(module.metadata(parent.info('obs011-pub-observe01'))==receipt['shortNamespace'], 'CLOSED_SHORT_IDENTITY')
            finally: parent.close()
            node=short.info('r.sock')
            need(stat.S_ISSOCK(node.st_mode) and module.metadata(node)==receipt['socketNode'], 'CLOSED_SOCKET_NODE_METADATA')
            # Metadata only: no reading/hashing filesystem socket. No unlink.
            short.check()
        finally: short.close()
        raw,probe=self.utility(['/usr/sbin/lsof','-nP','-U','-F','pfn','--',module.ENDPOINT],(0,1))
        need(raw=='', 'RELAY_SOCKET_DESCRIPTOR_STILL_OPEN')

'''
s=s.replace(needle,new+needle)
s=s.replace("        need(environment == self.a['nativeEnvironment'], 'EXACT_NATIVE_ENVIRONMENT')", """        need(environment == self.a['nativeEnvironment'], 'EXACT_NATIVE_ENVIRONMENT')
        if phase == 'selected':
            environment['CHECKS_PUBLIC_OBSERVER_CONTROL']=self.a['launchControlBase64']
            environment['CHECKS_PUBLIC_OBSERVER_CONTROL_SHA256']=self.a['observerControlSha256']""")
s=s.replace("        try:\n            code = scope['run_owned']", "        try:\n            if phase == 'selected':\n                self.start_relay()\n            code = scope['run_owned']")
s=s.replace("            self.finally_record_owned_drain(phase)\n        log, unused", "            try:\n                if phase == 'selected':\n                    self.stop_relay()\n            finally:\n                self.finally_record_owned_drain(phase)\n        log, unused")
s=s.replace("        value = self.contract.collect_records(raw_records, provenance, provenance)", """        relay = self.relay_receipt()
        drain=self.root_document('selected-drain.json')
        native_drained = type(drain.get('collectorExit')) is int and type(drain.get('ownedJvmTerminalProof')) is list and type(drain.get('remainingOwnedNonJvmFacts')) is list and not drain['remainingOwnedNonJvmFacts'] and all(drain.get(k) is False for k in self.policy.GAPS)
        self.verify_relay_closed_namespace()
        value = self.contract.collect_records(raw_records, provenance, provenance, relay, native_drained)
        value['relayReceiptSha256']=self.local_hash('relay-drain.json')
        value['nativeDrainSha256']=self.local_hash('selected-drain.json')""")
s=s.replace("        self.contract.validate_record(value['publicObservation'])", "        self.contract.validate_record(value['publicObservation'])\n        need(value.get('relayReceiptSha256')==self.local_hash('relay-drain.json') and value.get('nativeDrainSha256')==self.local_hash('selected-drain.json'), 'COLLECTION_DRAIN_CHAIN')\n        self.verify_relay_closed_namespace()")
s=s.replace("        before = self.source()\n        snapshots = []", "        before = self.source()\n        self.verify_relay_closed_namespace()\n        snapshots = []")
s=s.replace("'root-admission.json', 'held-proof.json', 'negative-readiness-denial.json'):", "'root-admission.json', 'held-proof.json', 'negative-readiness-denial.json', 'relay-launch.json', 'relay-ready.json', 'relay-drain.json'):")
s=s.replace("        need(a['collectorProvenance']", """        need(a.get('installedPlatformQualificationReviewed') is True and a.get('auxiliaryNamespaceActuallyAuthorized') is True, 'PLATFORM_AND_AUXILIARY_RELEASE_OWED')
        need(type(a.get('relayCustody')) is dict and set(a['relayCustody'])=={'ownerUid','outputChain','shortParentChain','createShortExactly0700'} and a['relayCustody']['ownerUid']==system.uid(), 'ROOT_RELAY_CUSTODY_APPROVAL')
        need(type(a.get('launchControlBase64')) is str and len(a['launchControlBase64'])<=8192 and hash_value(a.get('observerControlSha256')), 'ROOT_LAUNCH_CONTROL')
        control_raw=base64.urlsafe_b64decode(a['launchControlBase64'])
        need(len(control_raw)<=4096 and sha(control_raw)==a['observerControlSha256'], 'ROOT_CONTROL_CONSUMED_BUFFER')
        relay_module=verified.module(CONTROL/'public_relay.py',a['artifactPins']['public_relay.py'],'_verified_bootstrap_relay')
        relay_module.validate_control(decode(control_raw),contract)
        need(a['collectorProvenance']""")
p.write_text(s)
