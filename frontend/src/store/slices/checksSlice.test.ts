import { describe, it, expect, vi, beforeEach } from 'vitest';
import checksReducer, { fetchChecks } from './checksSlice';

describe('checksSlice', () => {
  it('should return initial state', () => {
    const state = checksReducer(undefined as any, { type: '@@INIT' } as any);
    expect(state.loading).toBe('idle');
    expect(Array.isArray(state.data)).toBe(true);
  });

  it('should handle fetchChecks.pending and fulfilled', () => {
    const pending = checksReducer(undefined as any, fetchChecks.pending('', {} as any));
    expect(pending.loading).toBe('loading');
    const payload = { data: [], total: 0 } as any;
    const fulfilled = checksReducer(pending, fetchChecks.fulfilled(payload, '', {} as any));
    expect(fulfilled.loading).toBe('succeeded');
    expect(fulfilled.totalCount).toBe(0);
  });
});


