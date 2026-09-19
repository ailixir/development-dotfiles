# Login followed by protected-page navigation

## Verdict

The proposed context-aware design covers this use case. Contract validation now exists in Story 10.36 as the shared fixture `login-then-protected-navigation`. Live browser execution remains an implementation and staging gate; this document does not claim that the current demo runner already supports the flow.

Implementation wave status:

- 10.36 context contract and shared login fixture: QA PASS.
- 10.37 durable context/revision persistence: QA PASS.
- 10.38 stable frontend authoring state: QA PASS.
- 10.40 v2 API and MSW parity: QA PASS.
- 10.39 compiler context/intention correspondence: blocked by its final QA circuit breaker because an extra allowed Playwright action can still appear before or after the requested sequence and pass correspondence.

Live learning and page UI wiring remain downstream of 10.39 and were not started after that blocking verdict.

## Authoring sequence

1. Enter the username using a nonsecret variable reference.
2. Enter the password using an opaque secret reference. The LLM never receives the resolved password.
3. Submit the login form.
4. Verify the authenticated home state.
5. Navigate from the authenticated session to the protected page.
6. Verify the protected-page state.

Every step has a stable identity. Page evidence is bound to the step, route, environment and state where it applies. Login-page evidence cannot be reused as proof of the authenticated home or protected page.

## Inference lifecycle

During an explicit Learn session, inference is sequential because each action can change the page:

```text
observe current state
  → resolve current step + relevant context
  → ask the LLM for a Playwright proposal
  → validate target, exact value/reference and allowed operations
  → execute the validated action once
  → observe the resulting state
  → continue with the next step
```

The inference request is step-scoped. It carries shared global context, the current step's local context, relevant verified predecessor facts and a sanitized observation of the current page. It excludes resolved secrets, unrelated future-step context and raw authentication storage.

After learning, the system assembles and revalidates the learned per-step source into one immutable candidate. The user reviews and confirms that candidate. Normal manual or scheduled execution launches a fresh browser context, resolves authorized references inside the trusted boundary and replays the confirmed artifact without an LLM call.

## Validation coverage

- Six ordered steps with unique stable IDs.
- Password represented only as `secretRef`.
- Evidence remains `supplied` until trusted live capture exists.
- Separate `/login`, authenticated `/home` and `/reports` protected states.
- Evidence references match their containing step IDs.
- Contract explicitly distinguishes per-step Learn inference from LLM-free normal execution.

Remaining implementation gates are authenticated learning-session support, worker-side secret resolution, safe session cleanup, and a controlled browser fixture or authorized staging page proving the full transition.
