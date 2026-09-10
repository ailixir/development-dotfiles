# Research report — Playwright runner language

**Date:** 2026-08-13  
**Verdict:** Isolated runner in **TypeScript/Node**. Python is a close second. Java is not justified once the runner is out of the Spring Boot JVM.

## Official position

Playwright’s own language page: bindings **share the same underlying implementation**; **all core browser-automation features** exist in every language; pick the language from **team experience, test-ecosystem fit, and project constraints**.

That means video, Chromium, locators, and Docker are not the differentiator. **Ecosystem + our existing IR/codegen + isolation** are.

## Video / proof (Priya’s right panel)

Two recording paths:

1. **`recordVideoDir` / `record_video_dir` / `setRecordVideoDir`** — context-lifecycle `.webm`. Available in Node, Python, Java. This is enough for V1 seek-via-`offsetMs`.
2. **`page.screencast` (added v1.59)** — start/stop, `showChapter` / `show_chapter`, overlays, optional `onFrame`. Documented for **Node, Python, and Java**. Node docs and examples landed first; Python 1.59.0 release notes and Java “next” release notes both include the same API.

Chapter overlays are a **later UX upgrade** (narrated proof). They are **not** a language lock. Do not pick Node only because of screencast.

## Concurrency (service, not pytest/Playwright Test)

| Binding | Official constraint | Implication for a runner pod |
|---|---|---|
| **Java** | Not thread-safe. All calls on the creating thread. Multiple `Playwright` instances, one per thread, are OK. Sync API only pumps events while a Playwright call is on the stack. | Spec §9 ThreadLocal pool exists *because* of this. Isolated Java still pays it. |
| **Python** | API is not thread-safe. Create one instance per thread. `sync_api` is the simple sequential model; `async_api` for asyncio services. | One process / one asyncio loop per concurrent run, or process pool. |
| **Node** | Single-threaded event loop. Multiple `BrowserContext`s in one process are the normal pattern. | Natural fit for a small HTTP worker that runs 1–N contexts with a concurrency cap. |

Browserless / Checkly-style workers in the wild are **Node containers**, not in-process Java (in-repo finding PW-14).

## Docker

Official images (version-pin to the package):

- Node: `mcr.microsoft.com/playwright:v<ver>-noble`
- Python: `mcr.microsoft.com/playwright/python:v<ver>-noble`
- Java: `mcr.microsoft.com/playwright/java:v<ver>-noble`

Shared ops constraints (all languages): `--init` / tini, `--ipc=host` or `/dev/shm`, Chromium sandbox vs root, **do not visit untrusted sites** with the stock image. Microsoft’s images include browsers + OS deps; the language package is installed separately. Chromium-only install still applies.

Java image = JDK + Node driver + browsers. Heaviest of the three for no remaining benefit.

## Docs / ecosystem signal (Context7, 2026-08-13)

| Library | Snippets | Benchmark |
|---|---|---|
| `/microsoft/playwright` (Node) | 6814 | 82.8 |
| `/microsoft/playwright-python` | 82 | 69.4 |
| `/microsoft/playwright-java` | 105 | 65.2 |

Not a feature-gap proof. It is a **support and example-density** gap. An isolated runner will hit Docker, video flush, and locator-edge cases; Node has the most answers.

## Project-specific fit

Already in `put-checks`:

- **IR parser is TypeScript** (`frontend/src/utils/studio/ir/parseSteps.ts`, ~70 lines, five step types). Spec §9.9 wanted a Java port; isolation makes that port optional.
- **Codegen is Playwright Python** (`frontend/src/utils/studio/codegen/pythonGenerator.ts`). PRD §5.2 / FR-STUDIO-06 is **export**, not the execution engine.
- **Backend is Java 21 / Spring Boot.** Isolation was requested so Chromium is not in that JVM.
- **No Python application runtime** in this repo today (only AIOS/tooling scripts).

Security: **never execute generated Python/JS**. Always interpret IR. Therefore “codegen language = runner language” is a **documentation nicety**, not a correctness requirement. “Parser language = runner language” **is** a correctness requirement (no second parser to drift).

## Devil’s advocate — stay on Java

**For:** one language for the Checks backend team; Gradle already in CI; no new runtime in the bank.

**Against:** the only strong reason for Java Playwright was “same container as Spring.” Isolation deletes that. You still get thread affinity, thinner docs, a heavier image, and a Java IR port. PW-14 still applies.

Java is the right call **only** if the runner is forbidden from being a second language. That is a staffing constraint, not a Playwright constraint.

## Decision matrix (V1 isolated runner)

| Criterion | Node/TS | Python | Java |
|---|---|---|---|
| Core automation + `.webm` | Yes | Yes | Yes |
| Screencast / chapters (1.59+) | Yes | Yes | Yes |
| Reuse `parseSteps.ts` | **Yes** | Port | Port |
| Matches Python codegen export | Export stays Python | Language match | No |
| Team already writes this in Checks | Frontend | No | Backend |
| Service concurrency model | Best | Fine (async or 1 proc/run) | Awkward |
| Official image | Yes | Yes | Yes (heaviest) |
| Reason to use after isolation | IR + ecosystem | Codegen alignment | Almost none |

**Pick: TypeScript/Node.**  
**Fallback:** Python if platform policy prefers Python automation services and IR is copied into a shared JSON-Schema + fixture corpus.  
**Do not pick Java** for an isolated runner unless a hard “no new language” edict exists.
