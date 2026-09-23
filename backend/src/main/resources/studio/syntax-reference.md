<!-- syntaxReferenceVersion: 2.1.0 -->

# Playwright syntax reference (Studio, V1)

This is the pinned reference the compile prompt carries. Its version is recorded on every revision's
provenance and compared **exactly** by the runner before a browser is launched: the same source
compiled against a different reference may have been proposed under a different set of examples, so
an artifact is never reinterpreted across a change here.

The authority for what is *accepted* is the runner's default-deny validator
(`studio-runner/src/validator/`), not this document. This document exists to tell the model what to
propose; the validator decides what is allowed to run. Bump
`studio-runner/src/versions.ts` `SYNTAX_REFERENCE_VERSION` and
`CompilePins.SYNTAX_REFERENCE_VERSION` together whenever anything below changes.

## Shape of one step

Each step is a bounded sequence of awaited calls from the list below. Every other statement, node,
declaration, import, loop, conditional, function, assignment and expression form is rejected.

```js
await page.goto('https://example.com/login');
```

## Navigation

| Call | Notes |
|---|---|
| `await page.goto(url)` | Absolute `http` or `https` URL literal, or `vars.get('NAME')` |
| `await page.goto(url, options)` | `timeout`, `waitUntil` |
| `await page.waitForURL(url)` | String literal, regular expression literal, or `vars.get('NAME')` |
| `await page.waitForURL(url, options)` | `timeout`, `waitUntil` |

`waitUntil` is one of `'load'`, `'domcontentloaded'`, `'networkidle'`, `'commit'`. Every `timeout`
is an integer number of milliseconds from 0 to 600000.

## Locators

Chains start at `page` and use only these segments. A segment may follow another segment, so
`page.getByRole('list').getByText('Invoices')` is a valid chain.

| Segment | Options |
|---|---|
| `getByRole(role, options)` | `name` (string, regular expression or `vars.get`), `exact`, `checked`, `disabled`, `expanded`, `selected`, `pressed` (booleans), `level` (integer 1–6) |
| `getByText(text, options)` | `exact` |
| `getByLabel(text, options)` | `exact` |
| `getByPlaceholder(text, options)` | `exact` |
| `getByTestId(id)` | none |
| `locator(cssSelector)` | none |

`role` is a standard ARIA role name. `text` is a string literal, a regular expression literal, or
`vars.get('NAME')`. `locator()` takes a plain CSS selector literal only: Playwright selector-engine
syntax such as `>>`, `:has-text(`, `:text(`, `:has(`, `:visible` or `:nth-match(` is rejected.

```js
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('heading', { name: /welcome/i, level: 1 }).click();
await page.locator('#search-field').fill('invoices');
```

## Actions

Each action is awaited, called on a locator chain, and takes at most the option keys listed for
it.

| Call | Options |
|---|---|
| `click()` | `button` (`'left'`, `'right'`, `'middle'`), `clickCount` (integer 1–3), `delay` (integer 0–5000), `force`, `timeout` |
| `fill(value)` | `force`, `timeout` |
| `press(key)` | `delay` (integer 0–5000), `timeout` |
| `check()` | `force`, `timeout` |
| `uncheck()` | `force`, `timeout` |
| `hover()` | `force`, `timeout` |
| `selectOption(value)` | `force`, `timeout` |

`fill` takes a string literal, `vars.get('NAME')` or `vars.secret('ID')`. `selectOption` takes a
string literal or `vars.get('NAME')`. `press` takes a key name literal such as `'Enter'`.

The trial option is rejected, including `trial: false`: a trial skips the reviewed action.

## Assertions

| Call | Options |
|---|---|
| `expect(locator).toBeVisible()` | `timeout` |
| `expect(locator).toContainText(text)` | `timeout`, `ignoreCase`, `useInnerText` |
| `expect(locator).toHaveValue(text)` | `timeout` |
| `expect(page).toHaveURL(url)` | `timeout`, `ignoreCase` |
| `expect(page).toHaveTitle(text)` | `timeout` |

The expected `text` of `toContainText`, `toHaveValue` and `toHaveTitle`, and the expected `url` of
`toHaveURL`, is a string literal, a regular expression literal, or `vars.get('NAME')`.

String `toContainText` and `toHaveTitle` expectations trim and collapse whitespace on both
sides (including removal of zero-width spaces and soft hyphens). Regex expectations match raw
text. `toHaveValue` strings remain literal. For `toContainText` and `toHaveURL`, an explicit
boolean `ignoreCase` overrides a regex's `i` flag; omission preserves it. URL string expectations
use absolute URL canonicalization; relative or invalid values remain literal (Studio does not
configure a base URL). Regex URLs remain raw patterns.

```js
await expect(page.getByText('Welcome')).toBeVisible();
await expect(page.getByTestId('total')).toContainText('120.00', { ignoreCase: true });
await expect(page.getByLabel('Email')).toHaveValue('a@example.com');
await expect(page).toHaveURL('https://example.com/dashboard');
await expect(page).toHaveTitle('Dashboard');
```

## Regular expressions

Wherever a regular expression literal is accepted, only the flags `i`, `m`, `s` and `u` are
permitted. Keep patterns short and simple: long or potentially catastrophic patterns are rejected.

## References — values are never inlined

A source line may carry `<var NAME>` or `<secret ID>`. These stay opaque through compilation: the
compiler never sees a resolved value and must never invent one.

| Source placeholder | Generated code |
|---|---|
| `<var USERNAME>` | `vars.get('USERNAME')` |
| `<secret LOGIN_PW>` | `vars.secret('LOGIN_PW')` |

```js
await page.getByLabel('Username').fill(vars.get('USERNAME'));
await page.getByLabel('Password').fill(vars.secret('LOGIN_PW'));
```

Never emit a literal credential, a hard-coded token, or a value read from anywhere other than
`vars.get` / `vars.secret`.

## Worked example

Source:

```
Go to "https://example.com/login"
Type "<var USERNAME>" in the "Username" field
Type "<secret LOGIN_PW>" in the "Password" field
Click the "Sign in" button
Check that we landed on the dashboard
```

Artifact:

```json
{
  "version": 1,
  "steps": [
    {"stepIndex": 0, "originalText": "Go to \"https://example.com/login\"", "code": "await page.goto('https://example.com/login');"},
    {"stepIndex": 1, "originalText": "Type \"<var USERNAME>\" in the \"Username\" field", "code": "await page.getByLabel('Username').fill(vars.get('USERNAME'));"},
    {"stepIndex": 2, "originalText": "Type \"<secret LOGIN_PW>\" in the \"Password\" field", "code": "await page.getByLabel('Password').fill(vars.secret('LOGIN_PW'));"},
    {"stepIndex": 3, "originalText": "Click the \"Sign in\" button", "code": "await page.getByRole('button', { name: 'Sign in' }).click();"},
    {"stepIndex": 4, "originalText": "Check that we landed on the dashboard", "code": "await expect(page).toHaveURL('https://example.com/dashboard');"}
  ]
}
```
