# GS-M(a) implementation receipt — recovery 2026-10-20

The five-file implementation is applied. Focused green a01 passed **14/14**, with no failures, errors or skips. All four reviewed mutations failed their intended assertions, and the exact final service was restored after each. No runtime job remains active.

| Proof | Actual result |
|---|---|
| gsma-red01 | 0 PASS / 2 FAIL / 0 SKIP; INTENDED_OLD_BEHAVIOR_ASSERTION_RED |
| gsma-red02 | 4 PASS / 5 FAIL / 0 SKIP; STOP_MIXED_INTENDED_ASSERTION_RED_AND_FIXTURE_SETUP_FAILURES |
| gsma-red03 | 4 PASS / 5 FAIL / 0 SKIP; STOP_INTENDED_ASSERTION_REDS_PLUS_TERMINAL_IMMUTABILITY_FIXTURE_FAILURE |
| gsma-red04 | 5 PASS / 4 FAIL / 0 SKIP; INTENDED_OLD_BEHAVIOR_ASSERTION_RED_NO_FIXTURE_FAILURES |
| gsma-a01 | 14 PASS / 0 FAIL / 0 SKIP; FOCUSED_IMPLEMENTATION_GREEN |
| gsma-mut01 | 1 PASS / 1 FAIL / 0 SKIP; INTENDED_ASSERTION_KILL |
| gsma-mut02 | 1 PASS / 1 FAIL / 0 SKIP; INTENDED_ASSERTION_KILL |
| gsma-mut03 | 8 PASS / 1 FAIL / 0 SKIP; INTENDED_ASSERTION_KILL |
| gsma-mut04 | 5 PASS / 4 FAIL / 0 SKIP; INTENDED_ASSERTION_KILL_GSM_P5 |

red02 and red03 contain fixture/setup failures and receive no clean-red credit. red04 supplies the corrected old-behavior result red. The original packets and all failed-run evidence remain intact. Both fixture corrections were explicitly reviewed and authorized by root. All nine test methods and 65 original assertion/verification chains remain literal and in order; all owned real starts are cancelled even when another cleanup fails.

All nine collectors retained source, test-input and dist stability during their own run. A fresh final capture differs from the fresh runner baseline in exactly the five owned target paths; every other captured source and all runner dist bytes are unchanged.

Final projector baton: `5ce495e53d553660f0fa8a6d05279f79ae2b1184afe8fb7e43a4e7176330e6b8`. Final source digest: `330399d14af7602b7cc113b77b310735337c8c6f94dbc9fe591f2e3006887a49`. Final dist digest: `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210`.

| Final target | SHA256 |
|---|---|
| `backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationResultProjector.java` | `5ce495e53d553660f0fa8a6d05279f79ae2b1184afe8fb7e43a4e7176330e6b8` |
| `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionController.java` | `a33cbefe1eb2e41f630610f94c94e2d3889fcc9098b2817360e6944293029fbd` |
| `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java` | `40a3b099bad65b36eabded37ed2312aadaee578af314298d350d5908deb28f8e` |
| `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedResultPublicationDisabledIT.java` | `255469af129ef55146c568d5a839d643c6469c54900bbd81c699b87b2f056c05` |
| `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedTeardownShedTest.java` | `516de17503e177bc4b7920f438b9d36dd19e72230b116e03c63f8c442d63e92a` |

The read-only pruner pin remains exact. The successor package changes only the result fixture and its manifest/artifact bindings; all three helper programs, three main candidates, teardown test and four mutation patches are byte-identical to the reviewed corrected package.

This receipt records implementation and focused proofs only. No broad Replay/full-class call, formatter/style gate, final integrated gate, independent QA approval, lifecycle completion, release, external provider operation, commit, push or deployment was performed by this lane. Those remaining gates stay with root. Shared USD500 ceiling retained; aggregate spend unavailable.
