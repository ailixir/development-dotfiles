# SPK-07 F1 — Playwright's engine in our isolated world (no model)

| Field | Value |
|---|---|
| Result | **PASS**, same-session scope. No mismatches on 8 live pages and 1 edge-case page. |
| Evidence class | **Screening evidence, not ADR-SC-005 D-C evidence.** |
| Run | `f1-20261026-1126`, 2026-10-26. Raw output is in `studio-runner/evaluation/grounding/runs/f1-20261026-1126/` (`summary.json` plus one JSON per page) and is not committed. |
| Script | `studio-runner/evaluation/grounding/f1-conformance.mjs`, `lib/pwEngine.mjs`, `lib/cdp.mjs` |
| Informs | The "F1 passes" clause of Stage 1 and hard zero HZ-6 in [preregistration.md](preregistration.md) |

## Question

Can Playwright's own selector engine run inside a CDP isolated world we own and agree exactly with Playwright's public locators, with the same count and the same element, without changing the page?

## Method
1. **Load.** Each page gets a fresh headless Chromium context at 1280×720 (Playwright 1.63.0). It is loaded with `goto` (`domcontentloaded`), followed by a 2.5 s wait. The edge page is loaded with `setContent`.
2. **Freeze and hash.** A CDP session freezes page scripts with `Emulation.setScriptExecutionDisabled(true)`. The sha256 of `document.documentElement.outerHTML` is taken.
3. **Engine.** `Page.createIsolatedWorld` (without universal access) creates a world, and `InjectedScript` is instantiated in it from the pinned bundle (`lib/pwEngine.mjs`).
4. **Generated-selector check.**
   - The engine takes an AI-mode `ariaSnapshot` of the document. Each ref with an interactive role is a candidate. There are 14 such roles: button, link, textbox, searchbox, combobox, checkbox, radio, listbox, spinbutton, slider, switch, tab, menuitem and option.
   - For each candidate, `aria-ref` is resolved to an element. `generateSelectorSimple` builds a selector, and our engine runs `querySelectorAll` on it.
   - The public `page.locator(selector)` runs on the same selector, and both results are compared by `backendNodeId` (`locatorIds`).
   - A row passes when both counts are 1 and the elements are the same.
5. **Hint check.**
   - The production collector (`dist`) runs with relaxed limits in a second isolated world.
   - Each distinct hint of today's kinds (role, label, testId, text and placeholder, all exact) is turned into an internal selector by `hintSelector`.
   - Our engine's count is compared with the public `getBy*` count with `exact: true`.
6. **Re-hash.** The outerHTML sha256 is taken again. An unchanged hash means the DOM was not changed.
7. **Pass rule.** On every page: 0 mismatches, 0 hint mismatches, an unchanged DOM, and every candidate checked.

## Results (from `summary.json`)

| Page | Candidates checked | Mismatches | Distinct hints | Hint mismatches | Hints unique under Playwright | Engine ms | ms/element | DOM unchanged |
|---|---|---|---|---|---|---|---|---|
| practicetestautomation login | 13 | 0 | 28 | 0 | 22 | 20 | 1.5 | yes |
| Wikipedia, Python article | 1,558 | 0 | 751 | 0 | 568 | 76,608 | 49.2 | yes |
| GOV.UK home | 80 | 0 | 109 | 0 | 79 | 304 | 3.8 | yes |
| Hacker News front page | 228 | 0 | 214 | 0 | 204 | 1,018 | 4.5 | yes |
| Hacker News login | 7 | 0 | 2 | 0 | 2 | 12 | 1.7 | yes |
| Python docs | 78 | 0 | 38 | 0 | 26 | 190 | 2.4 | yes |
| MDN home | 83 | 0 | 44 | 0 | 37 | 302 | 3.6 | yes |
| GitHub microsoft/playwright | 236 | 0 | 467 | 0 | 367 | 2,271 | 9.6 | yes |
| Edge-case page (`setContent`) | 11 | 0 | 16 | 0 | 15 | 9 | 0.8 | yes |
| **Total** | **2,294** | **0** | **1,669** | **0** | **1,320** | 80,734 | — | **9/9** |

On every page the number of candidates equalled the number checked, and `summary.pass` is `true`.

**The edge page** contains:
- a hidden button (`display:none`);
- an `aria-hidden` button;
- a button inside an `aria-hidden` container;
- pairs of names where one is a prefix of the other: Save / Save draft, Email / Email address, Search / Search docs, Exact text / Exact text more;
- a testId;
- an open shadow root with its own "Save";
- a `srcdoc` iframe.

Two observations from the edge page, inferred from the generated selectors and not checked separately:
- **Hidden-from-assistive-tech elements are candidates.** The AI-mode snapshot listed the `aria-hidden` button and the button in the `aria-hidden` container (`internal:text="Save"i >> nth=2` and `div >> internal:has-text="Close"i >> button`), and conformance held for both.
- **The iframe's button was not a candidate.** The engine instance is per document, and neither our engine nor the public page-level locator crosses into frames.

## Pin and refusal
- The pinned file is `playwright-core` 1.63.0 `lib/coreBundle.js`, sha256 `549070af3acabb3efcc4f55bfe6210f9f7c2fcf633cf7eaa59bfe60719969171`.
- I re-hashed the installed `studio-runner/node_modules/playwright-core/lib/coreBundle.js` on 2026-10-26 and it matched. `package.json` reports 1.63.0.
- `injectedSource()` refuses three ways:
  - `ENGINE_PIN_MISMATCH` when the version or sha256 differs;
  - `ENGINE_SOURCE_NOT_FOUND` when the source-path marker is missing;
  - `ENGINE_SOURCE_INVALID` when the parsed literal is not the injected script.
- There is no fallback to the old resolver.

## How "DOM unchanged" was checked

Page scripts were frozen before the first hash, so any change during the check could only come from us. The two outerHTML hashes matched on all 9 pages.

The check covers attributes and nodes in the light DOM. It does **not** see:
- shadow-root content (outerHTML does not serialize it);
- current form-control values, which are properties, not attributes;
- iframe documents;
- JS-only state. This includes the main-world variable `locatorIds` uses to read element identity, which is set and then deleted.

Because scripts were frozen, it also cannot show how live page scripts would react. I infer that none react, because reads dispatch no events.

## Limitations
- **Same session only.** Engine instances and handles are bound to one document and are not carried across navigation. Durability across loads is measured separately in SPK-07 §11.
- **Static DOM.** Conformance was measured with scripts frozen. Pages that mutate while being observed are untested. For the corpus, the per-step runtime check HZ-6 covers this.
- **Selector generation cost.** On Wikipedia, 1,558 elements took 76,608 ms, about 50 ms per element. This is total engine time, including the snapshot and the per-element query. Other pages ranged from 0.8 to 9.6 ms per element. The product only needs to generate a selector for the picked element.
- **Private API.** The injected-script source is a private string inside `coreBundle.js`. It is not in the package's `exports`, so it is read by path, found by its source-path marker and parsed as a literal. The pin and the refusal rules govern it. Any Playwright upgrade means re-running F1 and re-pinning.
- **Candidate scope.** Only interactive roles were checked. Non-interactive targets for read and assert steps (text, headings, cells) are covered only by the text and testId hint check. In-frame targets are untested.
- **Exactness.** Hints were checked only in exact (`s`) form. Non-exact matching was exercised only through the generated selectors.
- **Generated selector forms.** The stored samples hold at most 50 rows per page, 331 rows in all. Of these, 35 use `nth=` and 281 match case-insensitively (`i`), which are Playwright's generator defaults. This does not affect conformance, but it matters for durability: see [preregistration.md](preregistration.md) §13 item 2.
- **Denominator.** The plan's pass criterion names "the 2,368 elements measured today". F1 checked 2,294 snapshot candidates and 1,669 collector hints, with a different candidate definition and on different page loads. I don't know which candidate set produced 2,368. Conformance on the corpus is still owed and is carried by HZ-6.
- **Run metadata.** `summary.json` does not record the Node or Chromium version. INTERFACES specifies Node v24.20.0. There was one run on one machine, headless, at a single viewport and locale.

## Conclusion

Within the scope above, Playwright's engine running in our isolated world matches the public locators element for element and does not change the light DOM. That satisfies the "F1 passes" clause of Stage 1 for the measured pages. The corpus part of the clause is decided by HZ-6 during the S2–S4 runs.

— Aria (@architect), 2026-10-26
