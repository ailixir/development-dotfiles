import { describe, expect, it } from 'vitest';
import { identityMatches, identityRequired, parseAriaIdentity } from '../../src/run/targetIdentity.js';
import type { Locator } from '../../src/run/locatorSynth.js';

// First lines of locator.ariaSnapshot() recorded on Playwright 1.63 / Chromium 153 (probe p13).
const GOLDENS: [string, string, { role: string; name: string | null } | null][] = [
  ['named button', '- button "Search"', { role: 'button', name: 'Search' }],
  ['quote and backslash', '- button "Say \\"hi\\" \\\\ there"', { role: 'button', name: 'Say "hi" \\ there' }],
  ['image link with children', '- link "logo":\n  - img "logo"', { role: 'link', name: 'logo' }],
  ['unnamed link', '- link:\n  - /url: /c', { role: 'link', name: null }],
  ['textbox with a label', '- textbox "User":', { role: 'textbox', name: 'User' }],
  ['checkbox with a state', '- checkbox "Opt in" [checked]', { role: 'checkbox', name: 'Opt in' }],
  ['combobox', '- combobox "Version":\n  - option "3.12"', { role: 'combobox', name: 'Version' }],
  ['heading with level', '- heading "Docs" [level=1]', { role: 'heading', name: 'Docs' }],
  ['disabled button', '- button "Off" [disabled]', { role: 'button', name: 'Off' }],
  ['name with text after the colon', '- button "spaced name": x', { role: 'button', name: 'spaced name' }],
  ['listitem without a name', '- listitem: two', { role: 'listitem', name: null }],
  ['plain text node', '- text: Hello there', { role: 'text', name: null }],
  ['landmark', '- main:\n  - heading "Docs" [level=1]', { role: 'main', name: null }],
  ['role without a name but with a state', '- checkbox [checked]', { role: 'checkbox', name: null }],
  ['whitespace collapsed', '- button "a   b\\n c"', { role: 'button', name: 'a b c' }],
  ['not a snapshot line', 'Error: something', null],
  ['empty', '', null],
];

describe('the identity parser', () => {
  it.each(GOLDENS)('parses %s', (_label, snapshot, expected) => {
    expect(parseAriaIdentity(snapshot)).toEqual(expected);
  });

  it('a textbox line carrying a value never leaks the value', () => {
    const snapshot = '- textbox "Has value": secret-value-123';
    const parsed = parseAriaIdentity(snapshot);
    expect(parsed).toEqual({ role: 'textbox', name: 'Has value' });
    expect(JSON.stringify(parsed)).not.toContain('secret-value-123');
    // A value that looks like a name does not become one.
    expect(parseAriaIdentity('- textbox: "Looks like a name"')).toEqual({ role: 'textbox', name: null });
  });

  it('matches role and name, and ignores the name when the recorded name is null', () => {
    expect(identityMatches({ role: 'button', name: 'Go' }, { role: 'button', name: 'Go' })).toBe(true);
    expect(identityMatches({ role: 'button', name: 'Go' }, { role: 'link', name: 'Go' })).toBe(false);
    expect(identityMatches({ role: 'button', name: 'Go' }, { role: 'button', name: 'Stop' })).toBe(false);
    expect(identityMatches({ role: 'button', name: 'Go' }, { role: 'button', name: null })).toBe(false);
    expect(identityMatches({ role: 'button', name: null }, { role: 'button', name: 'Anything' })).toBe(true);
    expect(identityMatches({ role: 'button', name: ' a  b ' }, { role: 'button', name: 'a b' })).toBe(true);
    expect(identityMatches({ role: 'button', name: 'Go' }, null)).toBe(false);
  });
});

describe('which locators need the identity check', () => {
  const role = (name?: string): Locator[number] => (name === undefined ? { by: 'role', role: 'button' } : { by: 'role', role: 'button', name, exact: true });
  const scope: Locator[number] = { by: 'scope', role: 'group', name: 'G2', exact: true };
  it('the three ADR tiers always need it', () => {
    for (const tier of ['attribute', 'filterHas', 'nth']) expect(identityRequired(tier, [role('x')])).toBe(true);
  });
  it('the identity check also covers a scoped locator whose last step has no name', () => {
    expect(identityRequired('scoped', [scope, role()])).toBe(true);
    expect(identityRequired('scoped', [scope, { by: 'tag', tag: 'button' }])).toBe(true);
    expect(identityRequired('scoped', [scope, role('Buy')])).toBe(false);
  });
  it('the other tiers do not', () => {
    for (const tier of ['testId', 'role', 'label', 'placeholder', 'text']) expect(identityRequired(tier, [role('x')])).toBe(false);
  });
});
