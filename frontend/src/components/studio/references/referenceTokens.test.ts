import { describe, expect, it } from 'vitest';
import {
  SECRETS_NEED_SAVED_TEST,
  insertAtSelection,
  isReferenceName,
  secretFailureText,
  secretToken,
  secretsUnavailableText,
  varToken,
} from './referenceTokens';
import type { StudioCapabilitiesState } from '@/utils/config/studioCapabilities';

/**
 * STUDIO-OBS-008 AC-5(b) and ruling D-8: the tokens the reference picker inserts, and where it
 * inserts them. The name grammar is `Variable.secretId` in `openapi.yaml`.
 */

/** T0 ruling A2: struck from 008, so it must never be rendered by this lane. */
const STRUCK_SECRET_FILL_COPY = 'Secrets can only be typed into a password box.';

const ready = (vaultSecrets: boolean): StudioCapabilitiesState => ({
  status: 'ready',
  capabilities: { vaultSecrets, guidedStart: { available: false, code: 'RUNTIME_INCOMPATIBLE' } },
});

describe('reference names (D-8 grammar)', () => {
  it.each(['LOGIN_PW', 'a', 'sso.totp-seed_1', 'A'.repeat(64), '...', '.env'])('accepts %s', (name) => {
    expect(isReferenceName(name)).toBe(true);
  });

  it.each(['', '.', '..', 'A'.repeat(65), 'has space', 'a/b', '<x>', 'naïve', 'a,b'])('refuses %j', (name) => {
    expect(isReferenceName(name)).toBe(false);
  });
});

describe('tokens', () => {
  it('writes <var NAME> for a variable and <secret ID> for a Vault name', () => {
    expect(varToken('USERNAME')).toBe('<var USERNAME>');
    expect(secretToken('LOGIN_PW')).toBe('<secret LOGIN_PW>');
  });

  it.each(['', '..', 'two words', 'x>y'])('refuses to build a token from %j', (name) => {
    expect(() => varToken(name)).toThrow('Not a valid <var> reference name');
    expect(() => secretToken(name)).toThrow('Not a valid <secret> reference name');
  });
});

describe('insertAtSelection', () => {
  const text = 'Type "" in the "Password" field';

  it('inserts at a collapsed caret and keeps the text around it byte for byte', () => {
    const caret = text.indexOf('""') + 1;
    const result = insertAtSelection(text, caret, caret, '<secret LOGIN_PW>');
    expect(result.text).toBe('Type "<secret LOGIN_PW>" in the "Password" field');
    expect(result.caret).toBe(caret + '<secret LOGIN_PW>'.length);
  });

  it('replaces the selected text', () => {
    const source = 'Type "alice" in the "User ID" field';
    const start = source.indexOf('alice');
    const result = insertAtSelection(source, start, start + 'alice'.length, '<var USERNAME>');
    expect(result.text).toBe('Type "<var USERNAME>" in the "User ID" field');
    expect(result.caret).toBe(start + '<var USERNAME>'.length);
  });

  it('inserts at the start, at the end and into empty text', () => {
    expect(insertAtSelection('abc', 0, 0, 'T')).toEqual({ text: 'Tabc', caret: 1 });
    expect(insertAtSelection('abc', 3, 3, 'T')).toEqual({ text: 'abcT', caret: 4 });
    expect(insertAtSelection('', 0, 0, '<var X>')).toEqual({ text: '<var X>', caret: 7 });
  });

  it('orders reversed bounds and clamps out-of-range ones, so no text is dropped', () => {
    expect(insertAtSelection('abcdef', 4, 2, 'T')).toEqual({ text: 'abTef', caret: 3 });
    expect(insertAtSelection('abc', -5, -1, 'T')).toEqual({ text: 'Tabc', caret: 1 });
    expect(insertAtSelection('abc', 10, 99, 'T')).toEqual({ text: 'abcT', caret: 4 });
    expect(insertAtSelection('abc', Number.NaN, Number.NaN, 'T')).toEqual({ text: 'abcT', caret: 4 });
  });

  it('keeps multi-line and non-ASCII text intact', () => {
    const source = 'Type "é" in\nthe "Ünïcode" field';
    const at = source.indexOf('\n');
    expect(insertAtSelection(source, at, at, ' <var X>').text).toBe('Type "é" in <var X>\nthe "Ünïcode" field');
  });
});

describe('secretsUnavailableText (capability off / on / unknown / error)', () => {
  it('says nothing when the capability is on', () => {
    expect(secretsUnavailableText(ready(true))).toBeNull();
  });

  it('says Vault is not connected when the capability is off', () => {
    expect(secretsUnavailableText(ready(false))).toBe('Vault is not connected for this environment.');
  });

  it('asks for a saved test when the capability is unknown, with the caller wording when given', () => {
    const unknown: StudioCapabilitiesState = { status: 'unknown', capabilities: null };
    expect(secretsUnavailableText(unknown)).toBe(SECRETS_NEED_SAVED_TEST);
    expect(SECRETS_NEED_SAVED_TEST).toBe('Save the test before adding secrets');
    expect(secretsUnavailableText(unknown, 'Select a Studio test first')).toBe('Select a Studio test first');
  });

  it('says it is still checking while the capability loads', () => {
    expect(secretsUnavailableText({ status: 'loading', capabilities: null })).toBe(
      'Checking whether secrets are available for this test…',
    );
  });

  it('says secrets are off when the capability read failed', () => {
    expect(secretsUnavailableText({ status: 'unavailable', capabilities: null })).toBe(
      'Studio could not confirm that secrets are available for this test, so they are off.',
    );
  });
});

describe('secretFailureText', () => {
  it.each([
    ['VAULT_NOT_CONFIGURED', 'Vault is not connected for this environment.'],
    ['VAULT_UNAVAILABLE', 'Vault is temporarily unavailable. Try again.'],
    ['SECRET_ALREADY_EXISTS', 'A secret with this name already exists for this test.'],
    ['INVALID_SECRET_ORIGINS', 'The secret was rejected: check the name, value and origins.'],
    ['STUDIO_FORBIDDEN', 'fallback'],
  ])('maps %s', (code, text) => {
    expect(secretFailureText(new Error(code), 'fallback')).toBe(text);
  });

  it('falls back for anything that is not an error with a code', () => {
    expect(secretFailureText(null, 'fallback')).toBe('fallback');
    expect(secretFailureText({ message: 42 }, 'fallback')).toBe('fallback');
  });
});

describe('ruling A2: the struck secret-fill copy', () => {
  it('is produced by no helper in this lane', () => {
    const produced = [
      secretsUnavailableText(ready(false)),
      secretsUnavailableText({ status: 'unknown', capabilities: null }),
      secretsUnavailableText({ status: 'loading', capabilities: null }),
      secretsUnavailableText({ status: 'unavailable', capabilities: null }),
      ...['VAULT_NOT_CONFIGURED', 'VAULT_UNAVAILABLE', 'SECRET_ALREADY_EXISTS', 'INVALID_SECRET_VALUE', 'INVALID_CONTRACT'].map(
        (code) => secretFailureText(new Error(code), 'Could not create the secret'),
      ),
    ];
    for (const text of produced) {
      expect(text ?? '').not.toContain(STRUCK_SECRET_FILL_COPY);
    }
  });
});
