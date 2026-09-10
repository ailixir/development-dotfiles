import { describe, expect, it } from 'vitest';
import {
  columnRange,
  compareNumber,
  deriveFacts,
  describeCondition,
  evaluate,
  isConfigValid,
  parseAggregations,
  parseByField,
  parseIndex,
  parseWindow,
  runQuery,
  seedRule,
} from './evaluatePreview';
import { DEFAULT_FORM, type MetricRule, type SplunkPrototypeForm } from './types';

const METRICS_QUERY =
  '| mstats avg(cpu_pct) avg(mem_pct) WHERE index=em_metrics env=prod span=1m BY host earliest=-15m';

const metricsForm = (rules: MetricRule[], overrides: Partial<SplunkPrototypeForm> = {}) => ({
  ...DEFAULT_FORM,
  capability: 'METRICS' as const,
  query: METRICS_QUERY,
  rules,
  ...overrides,
});

const rule = (column: string, operator: MetricRule['operator'], value: number): MetricRule => ({
  id: `${column}-1`,
  column,
  operator,
  value,
});

describe('compareNumber', () => {
  it('applies each operator', () => {
    expect(compareNumber(5, '>', 3)).toBe(true);
    expect(compareNumber(5, '>=', 5)).toBe(true);
    expect(compareNumber(5, '<', 3)).toBe(false);
    expect(compareNumber(3, '<=', 3)).toBe(true);
    expect(compareNumber(3, '==', 3)).toBe(true);
  });
});

describe('query parsing', () => {
  it('reads index, window, grouping and aggregations from the SPL', () => {
    expect(parseIndex(METRICS_QUERY)).toBe('em_metrics');
    expect(parseWindow(METRICS_QUERY)).toBe('15m');
    expect(parseByField(METRICS_QUERY)).toBe('host');
    expect(parseAggregations(METRICS_QUERY)).toEqual(['avg(cpu_pct)', 'avg(mem_pct)']);
  });

  it('returns nulls when the query says nothing', () => {
    expect(deriveFacts('| mstats p95(lag_ms)')).toEqual({
      index: null,
      window: null,
      byField: null,
      aggregations: ['p95(lag_ms)'],
    });
  });
});

describe('runQuery', () => {
  it('returns one row per group with a column per aggregation', () => {
    const result = runQuery(METRICS_QUERY, 'METRICS');
    expect(result.columns).toEqual(['host', 'avg(cpu_pct)', 'avg(mem_pct)']);
    expect(result.numericColumns).toEqual(['avg(cpu_pct)', 'avg(mem_pct)']);
    expect(result.labelColumn).toBe('host');
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({ host: 'prod-01', 'avg(cpu_pct)': 93.4 });
    expect(result.rows[1]['avg(cpu_pct)']).toBe(88.1);
    expect(result.rows[2]['avg(cpu_pct)']).toBe(95.7);
  });

  it('returns a single unlabelled row when the query has no BY clause', () => {
    const result = runQuery('| mstats p95(trade_lag_ms) WHERE index=em_metrics earliest=-15m', 'METRICS');
    expect(result.rows).toHaveLength(1);
    expect(result.labelColumn).toBeNull();
    expect(result.columns).toEqual(['p95(trade_lag_ms)']);
  });

  it('returns no numeric columns when the query aggregates nothing', () => {
    const result = runQuery('search index=app ERROR', 'METRICS');
    expect(result.numericColumns).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('returns one row per event in Logs mode', () => {
    const result = runQuery('search index=app sourcetype=app_health heartbeat earliest=-15m', 'LOGS');
    expect(result.rows).toHaveLength(12);
    expect(result.columns).toEqual(['_time', 'host', 'event']);
    expect(runQuery('search index=app ERROR earliest=-15m', 'LOGS').rows).toHaveLength(0);
  });
});

describe('seedRule', () => {
  it('seeds a passing threshold just above the observed range', () => {
    const result = runQuery(METRICS_QUERY, 'METRICS');
    expect(columnRange(result, 'avg(cpu_pct)')).toEqual({ min: 88.1, max: 95.7 });

    const seeded = seedRule(result, 'avg(cpu_pct)', []);
    expect(seeded).toMatchObject({ column: 'avg(cpu_pct)', operator: '<', value: 100 });
    expect(evaluate(metricsForm([seeded]), result).passed).toBe(true);
  });

  it('keeps ids unique when a column is thresholded twice', () => {
    const result = runQuery(METRICS_QUERY, 'METRICS');
    const first = seedRule(result, 'avg(cpu_pct)', []);
    const second = seedRule(result, 'avg(cpu_pct)', [first]);
    expect(second.id).not.toBe(first.id);
  });
});

describe('evaluate — metrics', () => {
  const result = runQuery(METRICS_QUERY, 'METRICS');

  it('fails when any row breaches and the scope is every row', () => {
    const evaluation = evaluate(metricsForm([rule('avg(cpu_pct)', '<', 90)]), result);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.kind === 'METRICS' && evaluation.failingLabels).toEqual(['prod-01', 'prod-03']);
    expect(evaluation.kind === 'METRICS' && evaluation.verdicts[0].breachedColumns).toEqual([
      'avg(cpu_pct)',
    ]);
    expect(evaluation.kind === 'METRICS' && evaluation.verdicts[1].satisfied).toBe(true);
  });

  it('passes with the any row scope when a single row satisfies it', () => {
    const evaluation = evaluate(
      metricsForm([rule('avg(cpu_pct)', '<', 90)], { rowScope: 'any' }),
      result,
    );
    expect(evaluation.passed).toBe(true);
    expect(evaluation.kind === 'METRICS' && evaluation.rowScope).toBe('any');
  });

  it('combines rules with and', () => {
    const rules = [rule('avg(cpu_pct)', '<', 96), rule('avg(mem_pct)', '<', 70)];
    const evaluation = evaluate(metricsForm(rules), result);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.kind === 'METRICS' && evaluation.failingLabels).toEqual(['prod-01', 'prod-03']);
  });

  it('combines rules with or', () => {
    const rules = [rule('avg(cpu_pct)', '<', 96), rule('avg(mem_pct)', '<', 70)];
    const evaluation = evaluate(metricsForm(rules, { match: 'any' }), result);
    expect(evaluation.passed).toBe(true);
  });

  it('flags rules whose column the query no longer returns', () => {
    const evaluation = evaluate(metricsForm([rule('avg(disk_pct)', '<', 90)]), result);
    expect(evaluation.kind === 'METRICS' && evaluation.staleColumns).toEqual(['avg(disk_pct)']);
    expect(evaluation.passed).toBe(false);
  });

  it('reports why it cannot decide', () => {
    const noRules = evaluate(metricsForm([]), result);
    expect(noRules.kind === 'METRICS' && noRules.issue).toBe('NO_RULES');

    const emptyResult = runQuery('search index=app ERROR', 'METRICS');
    const noColumns = evaluate(metricsForm([rule('avg(cpu_pct)', '<', 90)]), emptyResult);
    expect(noColumns.kind === 'METRICS' && noColumns.issue).toBe('NO_NUMERIC_COLUMNS');
  });
});

describe('evaluate — logs', () => {
  it('compares the row count', () => {
    const form = {
      ...DEFAULT_FORM,
      capability: 'LOGS' as const,
      query: 'search index=app sourcetype=app_health heartbeat earliest=-15m',
      countOperator: '>' as const,
      expectedCount: 0,
    };
    const evaluation = evaluate(form, runQuery(form.query, 'LOGS'));
    expect(evaluation.passed).toBe(true);
    expect(evaluation.kind === 'LOGS' && evaluation.actualCount).toBe(12);
  });
});

describe('describeCondition', () => {
  it('reads as a sentence for metrics', () => {
    expect(describeCondition(metricsForm([rule('avg(cpu_pct)', '<', 90)]), 3)).toBe(
      'PASS if every row has avg(cpu_pct) < 90 over the last 15m',
    );
    expect(
      describeCondition(
        metricsForm([rule('avg(cpu_pct)', '<', 90), rule('avg(mem_pct)', '<', 80)]),
        3,
      ),
    ).toBe('PASS if every row has avg(cpu_pct) < 90 and avg(mem_pct) < 80 over the last 15m');
  });

  it('drops the row scope when the query returns a single row', () => {
    expect(describeCondition(metricsForm([rule('p95(lag_ms)', '<', 250)]), 1)).toBe(
      'PASS if p95(lag_ms) < 250 over the last 15m',
    );
  });

  it('reads as a sentence for logs', () => {
    const form = {
      ...DEFAULT_FORM,
      capability: 'LOGS' as const,
      query: 'search index=app ERROR earliest=-15m',
    };
    expect(describeCondition(form)).toBe('PASS if row count == 0 over the last 15m');
  });
});

describe('isConfigValid', () => {
  it('requires at least one threshold in metrics mode', () => {
    expect(isConfigValid(metricsForm([]))).toBe(false);
    expect(isConfigValid(metricsForm([rule('avg(cpu_pct)', '<', 90)]))).toBe(true);
  });

  it('only requires a query in logs mode', () => {
    expect(isConfigValid({ ...DEFAULT_FORM, capability: 'LOGS', query: 'search index=app' })).toBe(true);
    expect(isConfigValid({ ...DEFAULT_FORM, capability: 'LOGS', query: '  ' })).toBe(false);
  });
});
