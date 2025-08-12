export type TemplateType = 'HTTP' | 'TCP' | 'SPLUNK' | 'GRAFANA' | 'ITRS' | 'APPDYNAMICS' | 'UI_TEST';

export interface CheckTemplate {
  id: string;
  type: TemplateType;
  title: string;
  description: string;
  tags: string[];
  estimatedSetup: 'easy' | 'medium' | 'advanced';
  defaults: Record<string, any>;
}

export const mockCheckTemplates: CheckTemplate[] = [
  {
    id: 'tpl-http-latency-200',
    type: 'HTTP',
    title: 'HTTP Latency & 200 OK',
    description: 'Checks a public endpoint for 200 OK and acceptable latency.',
    tags: ['http', 'latency', 'availability'],
    estimatedSetup: 'easy',
    defaults: {
      endpoint: 'https://api.example.com/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 30,
      retries: 2,
      validateSSL: true,
      followRedirects: true,
      headers: {
        'Accept': 'application/json',
      },
    },
  },
  {
    id: 'tpl-tcp-port-availability',
    type: 'TCP',
    title: 'TCP Port Availability',
    description: 'Validates connectivity to a host:port with a short timeout.',
    tags: ['tcp', 'network'],
    estimatedSetup: 'easy',
    defaults: {
      host: 'db.internal.example',
      port: 5432,
      timeout: 15,
    },
  },
  {
    id: 'tpl-splunk-error-threshold',
    type: 'SPLUNK',
    title: 'Splunk Error Count Threshold',
    description: 'Flags when error events exceed a threshold within a time range.',
    tags: ['splunk', 'logs', 'errors'],
    estimatedSetup: 'medium',
    defaults: {
      splunkQuery: 'search index=prod source="app.log" level=ERROR earliest=-15m | stats count',
      timeRange: '15m',
      expectedCount: 0,
      countOperator: '>',
      splunkIndex: 'prod',
    },
  },
  {
    id: 'tpl-grafana-metric-threshold',
    type: 'GRAFANA',
    title: 'Grafana Metric Threshold',
    description: 'Triggers when a chosen metric crosses a threshold for a duration.',
    tags: ['grafana', 'metrics', 'threshold'],
    estimatedSetup: 'medium',
    defaults: {
      grafanaDashboard: 'api-performance',
      grafanaPanel: 'latency-panel',
      metric: 'avg(http_request_duration_seconds)',
      threshold: 0.5,
      thresholdOperator: '>'
    },
  },
  {
    id: 'tpl-itrs-sampler-ok',
    type: 'ITRS',
    title: 'ITRS Sampler OK',
    description: 'Monitors a specific ITRS sampler path for OK status.',
    tags: ['itrs', 'sampler'],
    estimatedSetup: 'medium',
    defaults: {
      itrsSampler: 'Gateway > Entity > Sampler > Dataview',
      itrsExpectedStatus: 'OK',
    },
  },
  {
    id: 'tpl-appdynamics-health-rule',
    type: 'APPDYNAMICS',
    title: 'AppDynamics Health Rule',
    description: 'Watches an AppDynamics health rule for violations.',
    tags: ['appdynamics', 'apm'],
    estimatedSetup: 'medium',
    defaults: {
      appDynamicsApp: 'customer-portal-prod',
      healthRule: 'response-time-violation',
    },
  },
  {
    id: 'tpl-ui-login-flow',
    type: 'UI_TEST',
    title: 'UI Login Flow',
    description: 'Verifies a simple login flow using Checks Studio.',
    tags: ['ui-test', 'login', 'studio'],
    estimatedSetup: 'advanced',
    defaults: {
      // For UI_TEST we prefill the Studio Test selection if available and suggest variables
      uiTestId: 'ui-test-001',
      uiVariables: {
        USERNAME: { kind: 'plain', value: '' },
        PASSWORD: { kind: 'secret', secretId: '' },
      },
      timeout: 30,
    },
  },
];


