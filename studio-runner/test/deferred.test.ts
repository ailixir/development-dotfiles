/**
 * Story 10.18a's blocked criteria — **skipped, never passed** (AC-27).
 *
 * The epic's a/b convention since story 10.3: a `b` half that turns green without its gate moving
 * is a defect, not a bonus. Each skip below names its criterion, its external dependency, its
 * spike and its owner, and each says what evidence would close it — so that closing one is a
 * deliberate act with a committed record under `docs/qa/spikes/SPK-0N/` and an updated `ED-0N`
 * entry, rather than someone deleting a `.skip`.
 *
 * **Why these are tests and not a list in a document.** A comment cannot be counted. These appear
 * in every run's skip count, so a half that quietly stops being deferred is visible in the totals
 * of the run that did it. Story 10.18a runs with **ten** skips from earlier stories plus the
 * twelve below.
 *
 * **Eight of these belong to other stories.** Stories 10.12, 10.13, 10.14 and 10.17 each deferred
 * a half naming *this* story as its owner; a half that ships without re-pointing them orphans them
 * silently, which is how a `b` half becomes a passed criterion three waves later.
 */
import { describe, it } from 'vitest';

describe('10.18a — blocked criteria, recorded as skipped and never passed', () => {
  describe('ED-05 / SPK-04 — the internal image and the sandbox, in-cluster', () => {
    it.skip(
      'AC-2b [ED-05, SPK-04, Platform/SRE] — the same pod spec APPLIED, with Chromium’s sandbox observed ' +
        'active in-cluster: non-root under the cluster PodSecurity level, unprivileged user namespaces on ' +
        'the nodes, launch logs showing the sandbox active with no disabling flag, /dev/shm sized ' +
        'sufficiently, and a controlled-fixture run producing a readable webm from that pod. ' +
        'CARRIES story 10.12 AC-6b. There is NO fallback that disables the sandbox: if neither ' +
        'RuntimeDefault nor a Platform-approved Localhost profile works, this escalates to Platform/SRE ' +
        'and Security. Closes when docs/qa/spikes/SPK-04/ carries the evidence and ED-05 is updated.',
      () => {
        throw new Error('unreachable: this criterion is deferred');
      },
    );

    it.skip(
      'AC-3b [SPK-04 question 3, Platform/SRE + @architect] — the seccomp profile the spike selects, with ' +
        'its approval reference: whether RuntimeDefault permits the namespace-creating clone/unshare calls ' +
        'the sandbox needs without CAP_SYS_ADMIN, and if not, the Platform-approved Localhost profile file, ' +
        'its owner and its approval reference, committed under docs/qa/spikes/SPK-04/. ' +
        'ADR-001 open item O-4. The chart renders RuntimeDefault as a deliberate starting value, never ' +
        'inherited from the backend and never Unconfined.',
      () => {
        throw new Error('unreachable: this criterion is deferred');
      },
    );

    it.skip(
      'AC-4b [ED-05, SPK-04, Platform/SRE] — SEC-2 browser-path immutability on the INTERNAL image ' +
        'in-cluster, rather than on the public Playwright base ADR-001 §8 permits for local development ' +
        'only. The attack itself is run and recorded against the local image in ' +
        'test/deployment/sec2.test.ts; what is deferred is running it against the image ED-05 delivers, ' +
        'inside a pod. CARRIES story 10.12 AC-6b with AC-2b.',
      () => {
        throw new Error('unreachable: this criterion is deferred');
      },
    );

    it.skip(
      'AC-5b [SPK-04 question 6, Platform/SRE] — in-cluster PID-1 reaping and slot recovery: under ' +
        'shareProcessNamespace, an orphaned grandchild is reaped by the pause container and a hung child is ' +
        'killed by the parent with the pod recovering its slot. ' +
        'CARRIES story 10.13 AC-11b. The mechanism is chosen and rendered (shareProcessNamespace: true) and ' +
        'the SIGNAL half is proven against the built image in 10.18a; the REAPING half cannot be proven ' +
        'outside a pod, because a pause container exists only in one. Stated rather than blurred, as AC-5a ' +
        'requires.',
      () => {
        throw new Error('unreachable: this criterion is deferred');
      },
    );
  });

  describe('ED-04 / SPK-05 — egress enforcement and destination policy', () => {
    it.skip(
      'AC-8b [ED-04, SPK-05, Platform/SRE + an unnamed application owner] — enforcement proven FROM a runner ' +
        'pod with the policy applied: approved host reachable; unapproved host blocked; REDIRECT to an ' +
        'unapproved host blocked; subresources and authentication-provider hops to approved hosts allowed; ' +
        'cloud/cluster metadata and control endpoints, link-local ranges and local files unreachable; DNS ' +
        'behaviour for an unapproved name recorded; callback and object store reachable. ' +
        'If the spike finds only static L3/L4 policy exists, §9.3 requires that per-run destination checks ' +
        'in the runner become the PRIMARY control and that Security accept that limitation EXPLICITLY — ' +
        'that acceptance, or its absence, is part of this criterion’s evidence.',
      () => {
        throw new Error('unreachable: this criterion is deferred');
      },
    );

    it.skip(
      'AC-9b [ED-04, ADR-002 O-6, @architect then the implementing story] — story 10.17’s destination-misuse ' +
        'negative tests, un-skipped against the enforced mechanism. They are 10.17’s tests, in 10.17’s files, ' +
        'and this story does not rewrite them. CARRIES story 10.17 AC-16b with its gate note unchanged. ' +
        'The gate-shut tripwire over the production ACCEPTED_JOB_KEYS is re-run UNCHANGED and green in ' +
        'test/run/canary.test.ts; adding a policy field to the closed RunJob is ADR-002 Class B and no story ' +
        'may land it before an architect rules.',
      () => {
        throw new Error('unreachable: this criterion is deferred');
      },
    );
  });

  describe('ED-03 / SPK-03 — the private object store', () => {
    it.skip(
      'AC-10b [ED-03, SPK-03, Platform/SRE] — the scopes DENIED IN FACT on the real store: the runner ' +
        'principal’s GET and LIST denied, the API principal’s PUT denied; plus path-style addressing, ' +
        'multipart upload, HEAD/GET with Range, server-side encryption defaults, and read-after-write ' +
        'consistency on a key the recovery path reads immediately after writing. ' +
        'CARRIES story 10.14 AC-18b. The DEPLOYMENT half — two distinct Secrets, no Get/List key name on ' +
        'the runner’s side, the fixed §6.2 prefix — is asserted over the rendered manifest in ' +
        'test/deployment/chart.test.ts. What is deferred is a denial observed on a real store.',
      () => {
        throw new Error('unreachable: this criterion is deferred');
      },
    );

    it.skip(
      'AC-11 [ED-03, SPK-03, Platform/SRE] — lifecycle, versioning and incomplete-upload behaviour with ' +
        'caveats recorded: whether bucket versioning is on and whether lifecycle rules expire noncurrent ' +
        'versions and delete markers; whether incomplete multipart uploads are aborted and after how long; ' +
        'the observed lag between lifecycle expiry and physical deletion; and whether a GET on an expired ' +
        'object fails or still serves. CARRIES story 10.14 AC-19b. ' +
        'A NEGATIVE result is a valid closure and is recorded as a caveat for Security, not worked around. ' +
        'Until then no artefact may claim exact-time physical deletion — asserted over this story’s own ' +
        'rendered output in chart.test.ts.',
      () => {
        throw new Error('unreachable: this criterion is deferred');
      },
    );
  });

  describe('ED-02 — identity, and the halves inherited from stories 10.7 and 10.17', () => {
    it.skip(
      'AC-19b [ED-02, owner UNASSIGNED IN SOURCES] — credentialed acceptance through the real ingress: a real ' +
        'trusted-gateway identity resolving to a real user; a FORGED identity header denied at the gateway ' +
        'rather than at the application; a wrong-CSI request denied; access revocation terminating an open ' +
        'SSE stream within the configured refresh interval; and the real vault replacing the SecretsService ' +
        'REDACTED/plaintext stub. ' +
        'CARRIES story 10.17 AC-5b and AC-7b, and story 10.7 AC-4b, AC-6b and AC-37b. ' +
        'The CODE half (three bypass paths made configuration-driven and default-closed) is story 10.18b’s. ' +
        '@po could not name an owner and said so; @pm raises ED-02 to Checks-squad engineering management ' +
        'via BRD §8, with Security & Compliance accepting. Story 10.19 MAY NOT BE DRAFTED while ED-02’s ' +
        'owner reads TBD.',
      () => {
        throw new Error('unreachable: this criterion is deferred');
      },
    );
  });

  describe('Not skips — pointers, so nothing is counted twice', () => {
    it.skip(
      'AC-17 IS NOT THIS STORY’S and is not a skip here. @po moved it to story 10.19 at wave-6 validation: ' +
        'it depends on sibling story 10.15, it is blocked on ED-06/SPK-02 either way, 10.19’s depends_on ' +
        'already lists both 10.15 and 10.18, and it duplicated story 10.15’s AC-19b ("deployment owner ' +
        '10.18, integrated proof 10.19"). Recorded in the manifest under 10.19’s inherited_deferrals. ' +
        'This entry exists so a reader looking for AC-17 finds the pointer rather than concluding it was ' +
        'dropped. Dependency assumption D-3 is CLOSED.',
      () => {
        throw new Error('unreachable: this is a pointer, not a criterion');
      },
    );

    it.skip(
      'Story 10.14’s AC-26 is DISCHARGED, not re-opened. It was recorded "skipped, never passed" in a merged ' +
        'story for want of an architect’s ruling on promoting RunnerEvidence.partial to required. ADR-002 §20 ' +
        'is that ruling and story 10.18a landed the edit; 10.14’s own checkbox is left exactly as it merged, ' +
        'on the standing rule that a merged, gated story is not re-opened to close a deferral a later ruling ' +
        'unblocked.',
      () => {
        throw new Error('unreachable: this is a pointer, not a criterion');
      },
    );

    it.skip(
      'AC-13a – AC-16b, AC-18 – AC-23a are STORY 10.18b’s, not deferred: the streaming Ingress, CORS, the ' +
        'envFrom key-validity check, the three bypass closures, the CSRF finding, the measured backend ' +
        'baseline and the kill switch. The seam is the pod/edge boundary and @po mandated it. This entry ' +
        'exists so the count of blocked criteria in THIS half is not inflated by the other half’s scope.',
      () => {
        throw new Error('unreachable: this is a pointer, not a criterion');
      },
    );
  });
});
