<!-- syntaxReferenceVersion: 2.0.0 -->

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
| `await page.goto(url)` | Absolute `https` URL, or `vars.get('NAME')` |
| `await page.goto(url, options)` | `timeout`, `waitUntil` |
| `await page.waitForURL(url)` | String or regular expression literal |
| `await page.waitForURL(url, options)` | `timeout`, `waitUntil` |

## Locators

Chains start at `page` and use only these segments:

`getByRole(role, options)`, `getByText(text, options)`, `getByLabel(text, options)`,
`getByPlaceholder(text, options)`, `getByTestId(id)`, `locator(cssSelector)`.

Options are limited to `name`, `exact`, `checked`, `selected`, `pressed`, `expanded`.

```js
await page.getByRole('button', { name: 'Sign in' }).click();
await page.locator('#search-field').fill('invoices');
```

## Actions

`click`, `fill`, `press`, `check`, `uncheck`, `selectOption`, `hover` — each awaited, each on a
locator chain. Permitted options are:

| Action | Options |
|---|---|
| `click` | `button`, `clickCount`, `delay`, `force`, `timeout` |
| `fill`, `check`, `uncheck`, `selectOption`, `hover` | `force`, `timeout` |
| `press` | `delay`, `timeout` |

The `trial` key is rejected, including `trial: false`. A trial skips the reviewed action.

## Assertions

String `toContainText` and `toHaveTitle` expectations trim and collapse whitespace on both
sides (including removal of zero-width spaces and soft hyphens). Regex expectations match raw
text. `toHaveValue` strings remain literal. `toContainText` and `toHaveURL` support `ignoreCase`:
explicit `true` or `false` overrides a regex's `i` flag; omission preserves it. `toContainText`
also supports `useInnerText`. URL string expectations use absolute URL canonicalization;
relative or invalid values remain literal (Studio does not configure a base URL). Regex URLs
remain raw patterns. Each assertion supports a bounded `timeout`.

```js
await expect(page.getByText('Welcome')).toBeVisible();
await expect(page.getByTestId('total')).toContainText('120.00');
await expect(page.getByLabel('Email')).toHaveValue('a@example.com');
await expect(page).toHaveURL('https://example.com/dashboard');
await expect(page).toHaveTitle('Dashboard');
```

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
