/**
 * Story 10.18b, AC-20: this story says, **in the deliverables and not only in the story file**,
 * what is still open.
 *
 * <pre>
 *   "A hardening story that ships without saying this ships a deployment whose readers will
 *    assume the opposite."
 * </pre>
 *
 * The criterion's own check is that the statements exist in the delivered artefacts and name
 * `ED-02`; their absence fails it. That is what this file is — and it runs in the **default** tier,
 * not the deployment tier, because it needs neither `helm` nor a built image and because a
 * disclosure that only a specialist stage can see is not a disclosure.
 *
 * **Why a test and not a paragraph.** A paragraph cannot be deleted loudly. 10.18a's own draft
 * argued that the runbook is *"the only deliverable whose absence is visible rather than silent"* —
 * this makes the absence of its most important sentences visible too. Every assertion below has a
 * one-line falsification: delete the sentence, watch this go red.
 *
 * **What this deliberately does NOT do.** It does not scan for the *word* `ED-02` and stop there.
 * Each assertion names a distinct **claim** — three bypass paths, the header path's ordering, the
 * vault stub, the unassigned owner, the pilot prohibition, the CSRF gap, the unproven ingress — so
 * that a rewrite which keeps the reference and drops the meaning still fails. A source scan over an
 * artefact that quotes its own prohibition is a catalogued vacuous shape; this is scoped to the
 * claims the story is obliged to make.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageRoot } from './helpers/corpus.js';

const repoRoot = join(packageRoot, '..');

function read(...segments: string[]): string {
  return readFileSync(join(repoRoot, ...segments), 'utf8');
}

const RUNBOOK = 'docs/runbooks/studio-runner.md';
const STAGING_VALUES = 'helm-chart/put-checks/values-uat.yaml';
const PROD_VALUES = 'helm-chart/put-checks/values-prod.yaml';

/** A claim, and the shapes any honest statement of it must contain. */
interface Claim {
  readonly what: string;
  readonly needles: readonly (string | RegExp)[];
}

function assertClaims(text: string, where: string, claims: readonly Claim[]): void {
  for (const claim of claims) {
    for (const needle of claim.needles) {
      const found = typeof needle === 'string' ? text.includes(needle) : needle.test(text);
      expect(
        found,
        `${where} no longer states: ${claim.what} (looked for ${String(needle)}). ` +
          'AC-20 is a launch-exit criterion: these statements are the deliverable, not decoration.',
      ).toBe(true);
    }
  }
}

describe('AC-20 — the runbook states plainly what is still open', () => {
  const runbook = read(RUNBOOK);

  it('says the bypass CODE PATH still exists and is closed by configuration, not removed', () => {
    assertClaims(runbook, RUNBOOK, [
      {
        what: 'the code path survives',
        needles: [/code paths? still exists?/iu, /closed by \*?\*?configuration/iu],
      },
    ]);
  });

  it('says there are THREE bypass paths and that the header path is checked FIRST', () => {
    // The correction that outlives the story. Every epic record described ED-02 as one flag;
    // closing only that flag closes nothing for a caller that sends a header.
    assertClaims(runbook, RUNBOOK, [
      { what: 'three paths, not one', needles: [/THREE of them/u, /X-User-Id/u] },
      {
        what: 'the header path is checked before the flag',
        needles: [/checked \*?\*?before\*?\*?/iu, /closing that flag alone would have closed/iu],
      },
    ]);
  });

  it('says the vault is still a stub and names what it returns', () => {
    assertClaims(runbook, RUNBOOK, [
      { what: 'the vault stub', needles: [/vault is still a stub/iu, 'REDACTED'] },
    ]);
  });

  // DISCLOSURE-PIN-1, re-scoped 2026-09-17. This assertion used to require the literal
  // `TBD — not assigned in sources` and the escalation path that phrase implied. Both claims
  // **stopped being true on 2026-09-16**, when the user assigned `ED-02` to the PUT Core platform
  // (the Core BFF); story 10.19's AC-8 audit corrected the runbook, after which the phrase survived
  // only inside the two retractions that quote it (`:27` "It no longer does", `:451` "This item
  // used to read"). Measured, not inferred: deleting those two quotations — which leaves the
  // runbook *more* accurate — turned this file red, and the one failure was this test, whose own
  // name asserted the opposite of the user's decision. A pin a correction can satisfy only by
  // quoting what it retracts has stopped measuring its claim; it now penalises being right.
  //
  // What AC-20 is actually owed here has not weakened, it has moved: the disclosure must name
  // **who owns `ED-02`** and must not let an owner be mistaken for a delivery. So this pins the
  // three facts that are load-bearing **today** — the owner, the missing ticket, and `open` —
  // each of which is a live sentence of the runbook and none of which is a quotation of a
  // retraction. It is falsifiable in the right direction: delete the owner, or delete the
  // "no ticket / still open" half, and this goes red. Rewriting a retraction cannot redden it.
  it("names ED-02's assigned owner, and says an owner is still not a delivery", () => {
    assertClaims(runbook, RUNBOOK, [
      { what: "ED-02's owner, assigned 2026-09-16", needles: ['ED-02', /Core BFF/u] },
      {
        what: 'that the owner has no linked ticket and the item is still open',
        needles: [/no ticket ID exists yet/u, /owner is not a delivery/iu],
      },
    ]);
  });

  it('says NO CREDENTIALED PILOT may run until ED-02 has linked completed tickets', () => {
    assertClaims(runbook, RUNBOOK, [
      {
        what: 'the pilot prohibition',
        needles: [/No credentialed pilot may run until .?ED-02.? has linked completed tickets/iu],
      },
    ]);
  });

  it('records the CSRF gap with the two facts that bound it (AC-21a)', () => {
    assertClaims(runbook, RUNBOOK, [
      { what: 'the cookie', needles: ['put_session'] },
      { what: 'credentialed CORS', needles: ['setAllowCredentials(true)'] },
      { what: 'that it was NOT fixed here', needles: [/did not "fix" it/iu, 'SPK-02'] },
    ]);
  });

  it('records that the streaming route has never crossed a real proxy (ED-06 / SPK-02)', () => {
    assertClaims(runbook, RUNBOOK, [
      {
        what: 'the ingress is unproven',
        needles: [/NONE OF THIS HAS CROSSED A REAL PROXY/u, 'ED-06', 'SPK-02'],
      },
      {
        what: 'no session affinity may be introduced',
        needles: [/No session affinity or sticky-session setting may be introduced/iu],
      },
    ]);
  });

  it('records the envFrom escalation with its owner (AC-18)', () => {
    assertClaims(runbook, RUNBOOK, [
      { what: 'the inert mechanism', needles: [/inert since the chart was written/iu] },
      { what: 'the owner', needles: [/OWNER: @devops/u, /MECHANISM: @architect/u] },
    ]);
  });

  it('names an accountable owner for the document itself (AC-24)', () => {
    assertClaims(runbook, RUNBOOK, [
      { what: 'the accountable owner', needles: [/Accountable owner/u, /Checks squad/u] },
    ]);
  });

  it('links the architecture section each of the edge sections implements (AC-24)', () => {
    // "Each section links the architecture section it implements, so a drift in either is visible."
    for (const section of ['§5.4', '§8.5', '§5.5', '§6.2', '§9.1']) {
      expect(runbook, `the runbook no longer cites architecture ${section}`).toContain(section);
    }
  });
});

describe('AC-20 — the STAGING and PROD values say it too, where an operator meets them', () => {
  for (const file of [STAGING_VALUES, PROD_VALUES]) {
    const values = read(file);

    // DISCLOSURE-PIN-1, second surface. This list used to carry a fifth claim, 'the unassigned
    // owner', pinning the same literal `TBD — not assigned in sources`. In **these** files that
    // phrase is not a retraction — both values files still assert it as current fact, together
    // with "Story 10.19 may not be drafted while that owner reads TBD", and **both statements are
    // false since 2026-09-16** (`values-uat.yaml:44-47`, `values-prod.yaml:50-53`). The pin was
    // therefore holding a false sentence in place: correcting the files would have reddened this.
    //
    // It is **scoped out, not re-pointed**, and deliberately: the accurate statement does not exist
    // in these files yet, so pinning it would assert a fact about an artefact nobody has corrected.
    // The scoping that survives is the last needle below — a values file must route its reader to
    // the runbook, which is where `ED-02`'s ownership is stated and kept current. Correcting the
    // two comment blocks is routed as a finding, not made here: neither file is this change's to
    // edit. When they are corrected, re-arm an owner claim over them.
    it(`${file}: states that the code paths survive and the vault is a stub`, () => {
      assertClaims(values, file, [
        { what: 'the code path survives', needles: [/THE CODE PATHS STILL EXIST/u] },
        { what: 'the vault stub', needles: [/VAULT IS STILL A STUB/u, 'REDACTED'] },
        {
          what: 'the pilot prohibition',
          needles: [/NO CREDENTIALED PILOT MAY RUN UNTIL ED-02 HAS LINKED COMPLETED TICKETS/u],
        },
        { what: 'a pointer to the runbook', needles: [/docs\/runbooks\/studio-runner\.md/u] },
      ]);
    });

    it(`${file}: closes all three bypasses explicitly`, () => {
      // The rendered assertion lives in the deployment tier; this is the *disclosure* half —
      // the values file a human reads before deploying must show three closed flags, not one.
      expect(values).toMatch(/identityBypass:\s*\n\s*coreService: false\s*\n\s*identityHeaders: false\s*\n\s*csiRead: false/u);
    });
  }
});
