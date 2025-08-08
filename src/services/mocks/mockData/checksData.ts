export interface MockCheck {
  id: string;
  name: string;
  type: 'HTTP' | 'TCP' | 'SPLUNK' | 'GRAFANA' | 'ITRS' | 'APPDYNAMICS' | 'UI_TEST';
  csiId: string;
  csiName: string;
  status: 'PASSING' | 'FAILING' | 'WARNING' | 'PENDING' | 'UNKNOWN';
  lastExecution: string | null;
  nextExecution: string | null;
  configuration: Record<string, any>;
  schedule: {
    frequency: string;
    timezone: string;
    enabled: boolean;
  };
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  description?: string;
}

export const mockChecks: MockCheck[] = [
  {
    id: 'check-001',
    name: 'Trade API Health Check',
    type: 'HTTP',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:30:00Z',
    nextExecution: '2024-01-15T10:35:00Z',
    configuration: {
      url: 'https://api.trade.internal/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 5000,
      headers: {
        'Authorization': 'Bearer ${TRADE_API_TOKEN}',
        'Content-Type': 'application/json'
      }
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
    createdBy: 'david.chen@citi.com',
    tags: ['api', 'critical', 'trading'],
    description: 'Monitors the health of the main trading API endpoint'
  },
  {
    id: 'check-002',
    name: 'Database Connection Pool',
    type: 'TCP',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:29:00Z',
    nextExecution: '2024-01-15T10:34:00Z',
    configuration: {
      host: 'db.trade.internal',
      port: 5432,
      timeout: 3000
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-10T09:15:00Z',
    updatedAt: '2024-01-15T10:29:00Z',
    createdBy: 'priya.sharma@citi.com',
    tags: ['database', 'infrastructure'],
    description: 'Checks TCP connectivity to the primary database'
  },
  {
    id: 'check-003',
    name: 'Trade Settlement Log Analysis',
    type: 'SPLUNK',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'WARNING',
    lastExecution: '2024-01-15T10:25:00Z',
    nextExecution: '2024-01-15T10:40:00Z',
    configuration: {
      query: 'search index=trading source="settlement.log" | eval settlement_time=now()-_time | where settlement_time>900 | stats count',
      threshold: {
        operator: 'less_than',
        value: 5
      },
      timeRange: 'last_15_minutes'
    },
    schedule: {
      frequency: 'every_15_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-10T09:30:00Z',
    updatedAt: '2024-01-15T10:25:00Z',
    createdBy: 'david.chen@citi.com',
    tags: ['logs', 'settlement', 'business-critical'],
    description: 'Monitors trade settlement completion times via Splunk logs'
  },
  {
    id: 'check-004',
    name: 'CPU Usage Threshold',
    type: 'GRAFANA',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'FAILING',
    lastExecution: '2024-01-15T10:28:00Z',
    nextExecution: '2024-01-15T10:33:00Z',
    configuration: {
      datasource: 'prometheus',
      query: 'avg(cpu_usage_percent{job="market-data-api"})',
      threshold: {
        operator: 'greater_than',
        value: 85,
        duration: '5m'
      }
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-10T10:00:00Z',
    updatedAt: '2024-01-15T10:28:00Z',
    createdBy: 'maria.garcia@citi.com',
    tags: ['performance', 'infrastructure', 'market-data'],
    description: 'Monitors CPU usage for market data processing servers'
  },
  {
    id: 'check-005',
    name: 'ITRS Gateway Status',
    type: 'ITRS',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:27:00Z',
    nextExecution: '2024-01-15T10:37:00Z',
    configuration: {
      gateway: 'market-data-gw01',
      sampler: 'feed-monitor',
      dataitem: 'connection-status',
      expectedValue: 'OK'
    },
    schedule: {
      frequency: 'every_10_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-10T10:15:00Z',
    updatedAt: '2024-01-15T10:27:00Z',
    createdBy: 'robert.kim@citi.com',
    tags: ['itrs', 'monitoring', 'market-data'],
    description: 'Checks ITRS sampler status for market data feed connectivity'
  },
  {
    id: 'check-006',
    name: 'Application Performance Health Rule',
    type: 'APPDYNAMICS',
    csiId: '170456',
    csiName: 'Customer Digital Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:26:00Z',
    nextExecution: '2024-01-15T10:41:00Z',
    configuration: {
      application: 'customer-portal-prod',
      healthRule: 'response-time-violation',
      tier: 'web-tier'
    },
    schedule: {
      frequency: 'every_15_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-10T11:00:00Z',
    updatedAt: '2024-01-15T10:26:00Z',
    createdBy: 'sarah.johnson@citi.com',
    tags: ['appdynamics', 'performance', 'customer-facing'],
    description: 'Monitors AppDynamics health rules for customer portal performance'
  },
  {
    id: 'check-007',
    name: 'Customer Login Flow Test',
    type: 'UI_TEST',
    csiId: '170456',
    csiName: 'Customer Digital Platform',
    status: 'PENDING',
    lastExecution: null,
    nextExecution: '2024-01-15T12:00:00Z',
    configuration: {
      steps: [
        'Go to "https://online.citi.com"',
        'Click "Sign On"',
        'Wait for the text "User ID" to appear',
        'Type "testuser123" in the "User ID" field',
        'Click "Continue"',
        'Wait for the text "Password" to appear',
        'Check that the URL contains "login"'
      ],
      browser: 'chrome',
      viewport: { width: 1920, height: 1080 }
    },
    schedule: {
      frequency: 'hourly',
      timezone: 'EST',
      enabled: false
    },
    createdAt: '2024-01-15T09:00:00Z',
    updatedAt: '2024-01-15T09:00:00Z',
    createdBy: 'priya.sharma@citi.com',
    tags: ['ui-test', 'customer-facing', 'login'],
    description: 'End-to-end test of customer login flow'
  },
  {
    id: 'check-008',
    name: 'Core Banking API Health',
    type: 'HTTP',
    csiId: '168942',
    csiName: 'Core Banking Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:32:00Z',
    nextExecution: '2024-01-15T10:37:00Z',
    configuration: {
      url: 'https://api.corebanking.internal/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 3000
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-12T08:00:00Z',
    updatedAt: '2024-01-15T10:32:00Z',
    createdBy: 'banking.ops@citi.com',
    tags: ['banking', 'api', 'critical'],
    description: 'Monitors core banking API availability'
  },
  {
    id: 'check-009',
    name: 'Payment Gateway Health',
    type: 'HTTP',
    csiId: '169834',
    csiName: 'Payment Gateway Infrastructure',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:33:00Z',
    nextExecution: '2024-01-15T10:36:00Z',
    configuration: {
      url: 'https://payments.gateway.internal/status',
      method: 'GET',
      expectedStatus: 200,
      timeout: 5000
    },
    schedule: {
      frequency: 'every_3_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-12T09:00:00Z',
    updatedAt: '2024-01-15T10:33:00Z',
    createdBy: 'payments.ops@citi.com',
    tags: ['payments', 'gateway', 'critical'],
    description: 'Monitors payment gateway infrastructure health'
  },
  {
    id: 'check-010',
    name: 'Risk Management System Health',
    type: 'HTTP',
    csiId: '171205',
    csiName: 'Risk Management Systems',
    status: 'WARNING',
    lastExecution: '2024-01-15T10:31:00Z',
    nextExecution: '2024-01-15T10:41:00Z',
    configuration: {
      url: 'https://risk.systems.internal/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 8000
    },
    schedule: {
      frequency: 'every_10_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-12T10:00:00Z',
    updatedAt: '2024-01-15T10:31:00Z',
    createdBy: 'risk.ops@citi.com',
    tags: ['risk', 'compliance', 'monitoring'],
    description: 'Monitors risk management system health'
  },
  {
    id: 'check-011',
    name: 'Security Operations Monitor',
    type: 'HTTP',
    csiId: '172954',
    csiName: 'Security Operations Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:34:00Z',
    nextExecution: '2024-01-15T10:39:00Z',
    configuration: {
      url: 'https://security.ops.internal/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 3000
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-12T11:00:00Z',
    updatedAt: '2024-01-15T10:34:00Z',
    createdBy: 'security.ops@citi.com',
    tags: ['security', 'monitoring', 'critical'],
    description: 'Monitors security operations platform health'
  },
  {
    id: 'check-012',
    name: 'Automated Production Management',
    type: 'HTTP',
    csiId: '172087',
    csiName: 'Automated Management of Production',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:35:00Z',
    nextExecution: '2024-01-15T10:40:00Z',
    configuration: {
      url: 'https://automation.prod.internal/health',
      method: 'GET',
      expectedStatus: 200,
      timeout: 4000
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-12T12:00:00Z',
    updatedAt: '2024-01-15T10:35:00Z',
    createdBy: 'automation.ops@citi.com',
    tags: ['automation', 'production', 'infrastructure'],
    description: 'Monitors automated production management systems'
  }
];

export interface MockExecutionResult {
  id: string;
  checkId: string;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING' | 'TIMEOUT';
  startTime: string;
  endTime: string;
  duration: number;
  output: string;
  metadata: Record<string, any>;
  error?: string;
}

export const mockExecutionResults: MockExecutionResult[] = [
  {
    id: 'exec-001',
    checkId: 'check-001',
    status: 'SUCCESS',
    startTime: '2024-01-15T10:30:00Z',
    endTime: '2024-01-15T10:30:02Z',
    duration: 2147,
    output: 'HTTP GET request successful. Status: 200 OK. Response time: 145ms.',
    metadata: {
      responseTime: 145,
      statusCode: 200,
      responseSize: 1024,
      headers: {
        'content-type': 'application/json',
        'server': 'nginx/1.18.0'
      }
    }
  },
  {
    id: 'exec-002',
    checkId: 'check-004',
    status: 'FAILURE',
    startTime: '2024-01-15T10:28:00Z',
    endTime: '2024-01-15T10:28:05Z',
    duration: 5023,
    output: 'CPU usage threshold exceeded. Current: 92.5%, Threshold: 85%',
    metadata: {
      currentValue: 92.5,
      threshold: 85,
      duration: '7m',
      affectedNodes: ['mkt-data-01', 'mkt-data-02']
    },
    error: 'Threshold violation: CPU usage has been above 85% for 7 minutes'
  }
];