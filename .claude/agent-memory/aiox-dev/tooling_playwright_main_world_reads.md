---
name: playwright-main-world-reads
description: Playwright 1.63 plural reads (allInnerTexts, allTextContents, evaluateAll) run in the page main world and are steerable; singular locator reads run in the utility world; noWaitAfter navigation recipe
metadata:
  type: reference
---

Probed on Playwright 1.63 (own browser, scratchpad probes): `locator.allInnerTexts()`, `allTextContents()` and `evaluateAll()` are `$$eval` in the page's MAIN world, so a page that redefines `HTMLElement.prototype.innerText`, `Node.prototype.textContent` or `HTMLOptionElement.prototype.label` steers them. The singular reads `textContent()`, `innerText()`, `getAttribute()`, `isDisabled()`, `inputValue()` and CSS counts such as `option.and(page.locator(':disabled')).count()` run in the utility world and were not steered. A tamper probe must not swap two things that cancel (the critic's probe5 swapped `getAttribute` and an `innerText` getter that called it, so it looked clean); remove one override to see the effect.

`locator.click()` waits for the navigation it starts inside its own timeout, so a link answering after 4 s throws TimeoutError at 2.5 s although the click happened. Recipe: pre-register `waitForEvent('request', navigation request of the main frame)` and `waitForEvent('framenavigated', main frame)` with `.then(()=>true,()=>false)`, run `click({noWaitAfter:true})`, race the request promise against a 300 ms delay that starts AFTER the click returns, then await the commit and `waitForLoadState('domcontentloaded')`. A 1.5 s window made every non-navigating click cost 1.5 s.

`locator.press` and `locator.fill` act on whatever holds focus; verify with `locator.focus()`, `locator.and(page.locator(':focus')).count()==1` and `input[type="password" i]:focus` count 0. Synchronous focus handlers are caught; a timer a few ms after the focus (2 to 3 ms) still wins sometimes.
