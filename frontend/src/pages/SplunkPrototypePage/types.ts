export type SplunkCapability = 'LOGS' | 'METRICS';
export type CompareOperator = '>' | '>=' | '<' | '<=' | '==';

/** How multiple rules combine on a single row. */
export type MatchMode = 'all' | 'any';

/** How the row verdicts combine into the check verdict. */
export type RowScope = 'every' | 'any';

export interface PrototypeCsi {
  id: string;
  name: string;
}

export interface MetricRule {
  id: string;
  column: string;
  operator: CompareOperator;
  value: number;
}

export interface SplunkPrototypeForm {
  name: string;
  description: string;
  csiId: string;
  environment: string;
  capability: SplunkCapability | '';
  query: string;
  countOperator: CompareOperator;
  expectedCount: number;
  rules: MetricRule[];
  match: MatchMode;
  rowScope: RowScope;
}

export type CellValue = string | number;

/** Both modes return a table; the mode decides how it is read. */
export interface QueryResult {
  query: string;
  capability: SplunkCapability;
  columns: string[];
  numericColumns: string[];
  labelColumn: string | null;
  rows: Array<Record<string, CellValue>>;
}

export interface RowVerdict {
  label: string;
  satisfied: boolean;
  /** Columns whose rule failed on this row. */
  breachedColumns: string[];
}

export type MetricsIssue = 'NO_ROWS' | 'NO_NUMERIC_COLUMNS' | 'NO_RULES';

export interface MetricsEvaluation {
  kind: 'METRICS';
  passed: boolean;
  condition: string;
  result: QueryResult;
  rowScope: RowScope;
  verdicts: RowVerdict[];
  failingLabels: string[];
  /** Rule columns missing from the current result, e.g. after the query changed. */
  staleColumns: string[];
  issue: MetricsIssue | null;
}

export interface LogsEvaluation {
  kind: 'LOGS';
  passed: boolean;
  condition: string;
  result: QueryResult;
  actualCount: number;
}

export type Evaluation = LogsEvaluation | MetricsEvaluation;

export interface QueryExample {
  label: string;
  query: string;
  /** Logs only — metrics conditions are built from the returned columns. */
  operator?: CompareOperator;
  value?: number;
}

export const PROTOTYPE_CSIS: PrototypeCsi[] = [
  { id: '174523', name: 'Trade Processing' },
  { id: '188201', name: 'Payments Hub' },
  { id: '201044', name: 'Client Portal' },
];

export const ENVIRONMENTS = ['Production', 'Staging', 'UAT'] as const;

export const OPERATORS: CompareOperator[] = ['>', '>=', '<', '<=', '=='];

export const QUERY_EXAMPLES: Record<SplunkCapability, QueryExample[]> = {
  LOGS: [
    {
      label: 'No errors',
      query: 'search index=app ERROR OR exception earliest=-15m',
      operator: '==',
      value: 0,
    },
    {
      label: 'Heartbeat present',
      query: 'search index=app sourcetype=app_health heartbeat earliest=-15m',
      operator: '>',
      value: 0,
    },
    {
      label: 'Trade pipeline',
      query:
        'search index=trading (event=trade_received OR event=trade_settled) earliest=-15m\n| transaction tradeId\n| where eventcount < 2',
      operator: '==',
      value: 0,
    },
  ],
  METRICS: [
    {
      label: 'CPU + memory by host',
      query:
        '| mstats avg(cpu_pct) avg(mem_pct) WHERE index=em_metrics env=prod span=1m BY host earliest=-15m',
    },
    {
      label: 'Queue depth by service',
      query:
        '| mstats max(queue_depth) avg(lag_ms) WHERE index=em_metrics env=prod span=1m BY service earliest=-15m',
    },
    {
      label: 'Trade lag p95',
      query: '| mstats p95(trade_lag_ms) WHERE index=em_metrics env=prod span=1m earliest=-15m',
    },
  ],
};

export const DEFAULT_FORM: SplunkPrototypeForm = {
  name: '',
  description: '',
  csiId: '174523',
  environment: 'Production',
  capability: '',
  query: '',
  countOperator: '==',
  expectedCount: 0,
  rules: [],
  match: 'all',
  rowScope: 'every',
};
