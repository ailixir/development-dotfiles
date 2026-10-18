---
name: 009-t0-outcomes-20261017
description: 2026-10-17 OBS-009 T0-PO pass (story 0.3.20) — A2.6 one-pod rule judged a note not an amendment (R1 provisional, U20); register U16–U22; D2 QA record = 010 T2/011 trigger; open B2/B3/A16
metadata:
  type: project
---

On 2026-10-17, root dispatched @po (Pax) to record the OBS-009 T0 outcomes (lane T0-PO). Sources: Aria `prep-20261016/t0-rulings/ruling.md` and Quinn `qa/t0-qa-20261017.md`. The 009 story went to 0.3.20 and stays Ready.

**What was placed**
- An AC-1 note, A2.6 a–e: guided mode runs only on a one-replica runner Deployment, enforced by a chart render guard.
- An AC-4 note, A18: a local Vault container is a non-crediting rehearsal.
- An AC-7 note, B1: "ported" means re-authored ports.
- Dated notes at EDGE a ("not requested", @qa) and at the REL-001 pointer (`code CANCELLED` ruled in ruling §4).
- A section "PO T0 outcomes — 2026-10-17" with an index of rulings to story items.

**Register.** `prerequisite-register.json` gained the key `t0Batch20261017` with these items, none satisfied:
- U16, A17;
- U17 and U18, B8 split by owner;
- U19, the Vault image pull;
- U20, the R1 override;
- U21, the ED-02 create+list policy note;
- U22, Docker for the image smoke;
- U3, U8 and U13, restated.

The AE-01 S&C request draft is at `t0-rulings/ae01-ack-request-draft.md` and was not sent. The 010 and 011 stories were not edited.

**Why:** root decided R1 provisionally under the user's yolo mandate and will raise it with the user. A2.6 was judged within AC-1's meaning: AC-1 fixes one process, image and Deployment, not a replica count, and capacity/KEDA is already GA §4.G out-of-scope. If the user overrides R1, A2.6 is struck and AC-1 goes to @architect + @pm. It is then a scope change, not a PO note.

**How to apply:**
- **G9 trigger.** The trigger for 010 T2 and 011 is Quinn's D2 `local-gate-<date>/qa-local-validation-record`, not a Done verdict.
- **Open, not done by @po:**
  - B2 (the class-P denominator) and B3 (iframe);
  - the optional B5 N-RS1 case;
  - an inline A16 "co-run rebuilt" note at AC-11 and Testing (there is only an index row).
- **Mismatches reported to root, not edited:**
  - Aria's 011 trigger adds "Live surface list accepted by @pm", which 011 lacks.
  - The A4 runner-origin/base-url merge is assigned to the 011 fold but not named in 011.
  - Quinn's D2 AC-1 row says "capacity/policy hash as config", but A2.3/A2.4 rule there are no such keys.
  - The D2 digest omits `helm-chart/` (owner root).

See [[prep-009-010-20261016]] and [[studio-observed-wave-po-conventions]].
