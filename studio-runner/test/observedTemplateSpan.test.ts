import { describe, it, expect } from 'vitest';
import { cutsTemplateToken } from '../src/validator/observedReplay.js';

describe('template span recipes', () => {
    const source = 'Search for "Top 3 banks. is <var BANK>?" now';
    const start = source.indexOf('Top'), end = source.lastIndexOf('"');
    it('accepts a span holding whole variable tokens', () => {
        expect(cutsTemplateToken(source, start, end)).toBe(false);
        expect(cutsTemplateToken(source, source.indexOf('<var'), source.indexOf('>') + 1)).toBe(false);
        expect(cutsTemplateToken(source, 0, 3)).toBe(false);
    });
    it('refuses a span whose edge is inside a variable token', () => {
        expect(cutsTemplateToken(source, start, source.indexOf('BANK') + 2)).toBe(true);
        expect(cutsTemplateToken(source, source.indexOf('var'), end)).toBe(true);
    });
});
