import type {
  CellValue,
  CompareOperator,
  Evaluation,
  MetricRule,
  QueryExample,
  QueryResult,
  RowVerdict,
  SplunkCapability,
  SplunkPrototypeForm,
} from './types';

export function compareNumber(actual: number, operator: CompareOperator, expected: number): boolean {
  switch (operator) {
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
    case '==':
      return actual === expected;
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ *
 * Query parsing — everything the form no longer asks the user for.
 * ------------------------------------------------------------------ */

export function parseIndex(query: string): string | null {
  const match = query.match(/index\s*=\s*"?([\w*-]+)"?/i);
  return match ? match[1] : null;
}

export function parseWindow(query: string): string | null {
  const match = query.match(/earliest\s*=\s*-?(\d+[smhd])/i);
  return match ? match[1] : null;
}

/** `avg(cpu_pct) avg(mem_pct)` → `['avg(cpu_pct)', 'avg(mem_pct)']`. */
export function parseAggregations(query: string): string[] {
  const matches = query.matchAll(/\b(avg|max|min|sum|p95|p99|latest|count|median)\s*\(\s*([\w.]+)\s*\)/gi);
  const seen = new Set<string>();
  for (const match of matches) {
    seen.add(`${match[1].toLowerCase()}(${match[2]})`);
  }
  return [...seen];
}

export function parseByField(query: string): string | null {
  const match = query.match(/\bBY\s+([\w.]+)/i);
  return match ? match[1] : null;
}

export interface QueryFacts {
  index: string | null;
  window: string | null;
  byField: string | null;
  aggregations: string[];
}

export function deriveFacts(query: string): QueryFacts {
  return {
    index: parseIndex(query),
    window: parseWindow(query),
    byField: parseByField(query),
    aggregations: parseAggregations(query),
  };
}

/* ------------------------------------------------------------------ *
 * Offline query runner — deterministic table derived from the SPL text.
 * ------------------------------------------------------------------ */

const ROW_OFFSETS = [0, -5.3, 2.3];

const LABEL_VALUES: Record<string, string[]> = {
  host: ['prod-01', 'prod-02', 'prod-03'],
  service: ['orders', 'pricing', 'settlement'],
  region: ['emea', 'namr', 'apac'],
};

function baseValue(column: string): number {
  const field = column.toLowerCase();
  if (field.includes('cpu')) return 93.4;
  if (field.includes('mem')) return 71.2;
  if (field.includes('lag')) return 184;
  if (field.includes('queue')) return 42;
  if (field.includes('rate')) return 1280;
  if (field.includes('error')) return 3;
  return 56.8;
}

function cellValue(column: string, rowIndex: number): number {
  const base = baseValue(column);
  const offset = ROW_OFFSETS[rowIndex % ROW_OFFSETS.length];
  const raw = base + offset;
  return Number.isInteger(base) ? Math.round(raw) : Number(raw.toFixed(1));
}

function labelValues(byField: string): string[] {
  return LABEL_VALUES[byField.toLowerCase()] ?? [`${byField}-a`, `${byField}-b`, `${byField}-c`];
}

export function mockLogCount(query: string): number {
  const q = query.toLowerCase();
  if (!q.trim()) return 0;
  if (q.includes('transaction') || q.includes('eventcount')) return 2;
  if (q.includes('error') || q.includes('exception')) return 0;
  if (q.includes('heartbeat') || q.includes('keepalive')) return 12;
  return 7;
}

const LOG_TEMPLATES: Array<{ host: string; event: string }> = [
  { host: 'prod-trade-02', event: 'settlement timeout tradeId=T-88421' },
  { host: 'prod-trade-01', event: 'retry scheduled tradeId=T-88421' },
  { host: 'prod-trade-03', event: 'downstream ack received' },
];

const HEARTBEAT_TEMPLATES: Array<{ host: string; event: string }> = [
  { host: 'prod-trade-01', event: 'heartbeat ok' },
  { host: 'prod-trade-02', event: 'heartbeat ok' },
  { host: 'prod-trade-03', event: 'heartbeat ok' },
];

const TRANSACTION_TEMPLATES: Array<{ host: string; event: string }> = [
  { host: 'prod-trade-02', event: 'trade_received tradeId=T-88421' },
  { host: 'prod-trade-03', event: 'trade_received tradeId=T-88408' },
];

function logRows(query: string, count: number): Array<Record<string, CellValue>> {
  const q = query.toLowerCase();
  let templates = LOG_TEMPLATES;
  if (q.includes('transaction') || q.includes('eventcount')) templates = TRANSACTION_TEMPLATES;
  else if (q.includes('heartbeat') || q.includes('keepalive')) templates = HEARTBEAT_TEMPLATES;

  return Array.from({ length: count }, (_, i) => {
    const template = templates[i % templates.length];
    const minute = 42 - i;
    return {
      _time: `15:${String(Math.max(minute, 0)).padStart(2, '0')}:0${i % 10}`,
      host: template.host,
      event: template.event,
    };
  });
}

export function runQuery(query: string, capability: SplunkCapability): QueryResult {
  if (capability === 'LOGS') {
    const count = mockLogCount(query);
    return {
      query,
      capability,
      columns: ['_time', 'host', 'event'],
      numericColumns: [],
      labelColumn: 'host',
      rows: logRows(query, count),
    };
  }

  const { byField, aggregations } = deriveFacts(query);
  const numericColumns = aggregations.length > 0 ? aggregations : [];
  const labels = byField ? labelValues(byField) : [''];

  const rows = labels.map((label, rowIndex) => {
    const row: Record<string, CellValue> = {};
    if (byField) row[byField] = label;
    numericColumns.forEach((column) => {
      row[column] = cellValue(column, rowIndex);
    });
    return row;
  });

  return {
    query,
    capability,
    columns: byField ? [byField, ...numericColumns] : numericColumns,
    numericColumns,
    labelColumn: byField,
    rows: numericColumns.length === 0 ? [] : rows,
  };
}

/* ------------------------------------------------------------------ *
 * Rules
 * ------------------------------------------------------------------ */

function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

export function columnRange(result: QueryResult, column: string): { min: number; max: number } | null {
  const values = result.rows
    .map((row) => Number(row[column]))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** A threshold that currently passes, just above the column's observed range. */
export function seedThreshold(result: QueryResult, column: string): number {
  const range = columnRange(result, column);
  if (!range) return 100;
  return roundUpTo(range.max, range.max > 100 ? 50 : 5);
}

export function seedRule(result: QueryResult, column: string, existing: MetricRule[]): MetricRule {
  return {
    id: nextRuleId(existing, column),
    column,
    operator: '<',
    value: seedThreshold(result, column),
  };
}

function nextRuleId(existing: MetricRule[], column: string): string {
  const prefix = `${column}-`;
  const highest = existing
    .filter((rule) => rule.id.startsWith(prefix))
    .map((rule) => Number(rule.id.slice(prefix.length)))
    .filter(Number.isFinite);
  return `${column}-${(highest.length ? Math.max(...highest) : 0) + 1}`;
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

export function describeCondition(form: SplunkPrototypeForm, rowCount = 0): string {
  const window = parseWindow(form.query);
  const suffix = window ? ` over the last ${window}` : '';

  if (form.capability === 'METRICS') {
    if (form.rules.length === 0) return 'No condition yet.';
    const joiner = form.match === 'all' ? ' and ' : ' or ';
    const clauses = form.rules
      .map((rule) => `${rule.column} ${rule.operator} ${rule.value}`)
      .join(joiner);
    const scope = rowCount > 1 ? `${form.rowScope === 'every' ? 'every' : 'any'} row has ` : '';
    return `PASS if ${scope}${clauses}${suffix}`;
  }
  return `PASS if row count ${form.countOperator} ${form.expectedCount}${suffix}`;
}

function rowSatisfies(
  row: Record<string, CellValue>,
  rules: MetricRule[],
  match: SplunkPrototypeForm['match'],
): { satisfied: boolean; breachedColumns: string[] } {
  const outcomes = rules.map((rule) => {
    const value = Number(row[rule.column]);
    return {
      column: rule.column,
      ok: Number.isFinite(value) && compareNumber(value, rule.operator, rule.value),
    };
  });
  const satisfied =
    match === 'all' ? outcomes.every((o) => o.ok) : outcomes.some((o) => o.ok);
  return {
    satisfied,
    breachedColumns: outcomes.filter((o) => !o.ok).map((o) => o.column),
  };
}

export function evaluate(form: SplunkPrototypeForm, result: QueryResult): Evaluation {
  if (form.capability === 'METRICS') {
    const condition = describeCondition(form, result.rows.length);
    const staleColumns = form.rules
      .map((rule) => rule.column)
      .filter((column) => !result.numericColumns.includes(column));

    const base = {
      kind: 'METRICS' as const,
      condition,
      result,
      rowScope: form.rowScope,
      staleColumns,
    };

    if (result.numericColumns.length === 0) {
      return { ...base, passed: false, verdicts: [], failingLabels: [], issue: 'NO_NUMERIC_COLUMNS' };
    }
    if (result.rows.length === 0) {
      return { ...base, passed: false, verdicts: [], failingLabels: [], issue: 'NO_ROWS' };
    }
    if (form.rules.length === 0) {
      return { ...base, passed: false, verdicts: [], failingLabels: [], issue: 'NO_RULES' };
    }

    const verdicts: RowVerdict[] = result.rows.map((row, index) => {
      const label = result.labelColumn ? String(row[result.labelColumn]) : `row ${index + 1}`;
      return { label, ...rowSatisfies(row, form.rules, form.match) };
    });

    const passed =
      form.rowScope === 'every'
        ? verdicts.every((verdict) => verdict.satisfied)
        : verdicts.some((verdict) => verdict.satisfied);

    return {
      ...base,
      passed,
      verdicts,
      failingLabels: verdicts.filter((v) => !v.satisfied).map((v) => v.label),
      issue: null,
    };
  }

  const actualCount = result.rows.length;
  return {
    kind: 'LOGS',
    passed: compareNumber(actualCount, form.countOperator, form.expectedCount),
    condition: describeCondition(form, actualCount),
    result,
    actualCount,
  };
}

export function runAndEvaluate(form: SplunkPrototypeForm): Evaluation {
  const capability: SplunkCapability = form.capability === 'METRICS' ? 'METRICS' : 'LOGS';
  return evaluate(form, runQuery(form.query, capability));
}

export function applyExample(
  capability: SplunkPrototypeForm['capability'],
  example: QueryExample,
): Partial<SplunkPrototypeForm> {
  if (capability === 'METRICS') {
    return { query: example.query, rules: [] };
  }
  return {
    query: example.query,
    countOperator: example.operator ?? '==',
    expectedCount: example.value ?? 0,
  };
}

export function isConfigValid(form: SplunkPrototypeForm): boolean {
  if (!form.capability || !form.query.trim()) return false;
  if (form.capability === 'METRICS') return form.rules.length > 0;
  return true;
}
