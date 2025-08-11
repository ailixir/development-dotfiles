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
  environment?: string;
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
    tags: ['application:trading-api', 'team:platform-engineering', 'lob:capital-markets', 'priority:critical'],
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
    tags: ['application:trading-db', 'team:database-ops', 'lob:capital-markets', 'type:infrastructure'],
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
    tags: ['application:settlement-engine', 'team:sre', 'lob:capital-markets', 'priority:business-critical', 'type:log-analysis'],
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
    tags: ['application:market-data-api', 'team:performance-eng', 'lob:capital-markets', 'type:performance', 'priority:high'],
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
    tags: ['application:itrs-gateway', 'team:monitoring-ops', 'lob:capital-markets', 'type:monitoring'],
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
    tags: ['application:customer-portal', 'team:customer-experience', 'lob:retail-banking', 'type:apm', 'priority:customer-facing'],
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
    tags: ['application:online-banking', 'team:qa-automation', 'lob:retail-banking', 'type:ui-test', 'priority:customer-facing'],
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
    tags: ['application:core-banking', 'team:core-systems', 'lob:enterprise-banking', 'priority:critical'],
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
    tags: ['application:payment-gateway', 'team:payments-team', 'lob:transaction-services', 'priority:critical'],
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
    tags: ['application:risk-management', 'team:risk-analytics', 'lob:risk-compliance', 'type:monitoring'],
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
    tags: ['application:security-ops', 'team:cybersecurity', 'lob:enterprise-security', 'priority:critical'],
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
    tags: ['application:automation-platform', 'team:devops', 'lob:technology-infrastructure', 'type:infrastructure'],
    description: 'Monitors automated production management systems',
    environment: 'Production'
  },
  {
    id: 'check-013',
    name: 'Transaction Processing Queue Health',
    type: 'SPLUNK',
    csiId: '169834',
    csiName: 'Payment Gateway Infrastructure', 
    status: 'PASSING',
    lastExecution: '2024-01-15T10:30:00Z',
    nextExecution: '2024-01-15T10:45:00Z',
    configuration: {
      query: 'search index=payments source="transaction_queue.log" earliest=-15m | stats count by status | where status="processed" AND count > 1000',
      index: 'payments',
      timeRange: '15m',
      expectedCount: 1000,
      countOperator: '>'
    },
    schedule: {
      frequency: 'every_15_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-13T09:00:00Z',
    updatedAt: '2024-01-15T10:30:00Z', 
    createdBy: 'david.chen@citi.com',
    tags: ['application:payment-processor', 'team:payments-team', 'lob:transaction-services', 'type:splunk-query', 'priority:high'],
    description: 'Monitors payment transaction processing queue via Splunk logs',
    environment: 'Production'
  },
  {
    id: 'check-014',
    name: 'Market Data Feed Latency',
    type: 'GRAFANA',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'WARNING',
    lastExecution: '2024-01-15T10:32:00Z',
    nextExecution: '2024-01-15T10:37:00Z',
    configuration: {
      dashboard: 'market-data-monitoring',
      panel: 'feed-latency-panel-3',
      metric: 'avg(market_data_latency_ms{exchange="NYSE"})',
      threshold: 50,
      thresholdOperator: '<'
    },
    schedule: {
      frequency: 'every_5_minutes', 
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-13T10:00:00Z',
    updatedAt: '2024-01-15T10:32:00Z',
    createdBy: 'maria.rodriguez@citi.com',
    tags: ['application:market-feed', 'team:market-data', 'lob:capital-markets', 'type:grafana-metrics', 'exchange:nyse'],
    description: 'Monitors NYSE market data feed latency through Grafana metrics',
    environment: 'Production'
  },
  {
    id: 'check-015',
    name: 'Trading System Gateway Monitor',
    type: 'ITRS',
    csiId: '174523',
    csiName: 'Trading Platform Services',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:28:00Z',
    nextExecution: '2024-01-15T10:38:00Z',
    configuration: {
      sampler: 'Gateway > TradingGW01 > OrderManagement > OrderFlow',
      expectedStatus: 'OK'
    },
    schedule: {
      frequency: 'every_10_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-13T11:00:00Z',
    updatedAt: '2024-01-15T10:28:00Z',
    createdBy: 'robert.kim@citi.com',
    tags: ['application:order-management', 'team:trading-ops', 'lob:capital-markets', 'type:itrs-monitor', 'component:gateway'],
    description: 'Monitors ITRS trading system gateway and order flow status',
    environment: 'Production'
  },
  {
    id: 'check-016',
    name: 'Customer Portal Database Pool',
    type: 'APPDYNAMICS',
    csiId: '170456',
    csiName: 'Customer Digital Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:31:00Z',
    nextExecution: '2024-01-15T10:46:00Z',
    configuration: {
      application: 'customer-digital-portal-prod',
      healthRule: 'Database Connection Pool Health'
    },
    schedule: {
      frequency: 'every_15_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-13T12:00:00Z',
    updatedAt: '2024-01-15T10:31:00Z',
    createdBy: 'sarah.johnson@citi.com',
    tags: ['application:customer-portal', 'team:database-ops', 'lob:retail-banking', 'type:appdynamics', 'component:db-pool'],
    description: 'Monitors AppDynamics health rule for customer portal database connections',
    environment: 'Production'
  },
  {
    id: 'check-017',
    name: 'Payment Form UI Test',
    type: 'UI_TEST',
    csiId: '169834',
    csiName: 'Payment Gateway Infrastructure',
    status: 'PASSING',
    lastExecution: '2024-01-15T09:00:00Z',
    nextExecution: '2024-01-15T12:00:00Z',
    configuration: {
      steps: [
        'Go to "https://payments.citi.com/test"',
        'Wait for page to load completely',
        'Click "New Payment" button',
        'Fill "Amount" field with "100.00"',
        'Select "USD" from currency dropdown', 
        'Fill "Recipient" field with "Test Account"',
        'Click "Process Payment" button',
        'Wait for text "Payment Successful" to appear',
        'Check that URL contains "confirmation"'
      ],
      browserType: 'chrome',
      screenSize: '1920x1080'
    },
    schedule: {
      frequency: 'every_3_hours',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-14T08:00:00Z',
    updatedAt: '2024-01-15T09:00:00Z',
    createdBy: 'priya.sharma@citi.com',
    tags: ['application:payment-form', 'team:qa-automation', 'lob:transaction-services', 'type:ui-test', 'test-type:e2e'],
    description: 'End-to-end UI test for payment processing form and confirmation',
    environment: 'Staging'
  },
  {
    id: 'check-018',
    name: 'Redis Cache Server',
    type: 'TCP',
    csiId: '170456', 
    csiName: 'Customer Digital Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:33:00Z',
    nextExecution: '2024-01-15T10:38:00Z',
    configuration: {
      host: 'redis-cluster.customer.internal',
      port: 6379,
      timeout: 2000
    },
    schedule: {
      frequency: 'every_5_minutes',
      timezone: 'EST', 
      enabled: true
    },
    createdAt: '2024-01-14T09:00:00Z',
    updatedAt: '2024-01-15T10:33:00Z',
    createdBy: 'david.chen@citi.com',
    tags: ['application:redis-cache', 'team:infrastructure', 'lob:retail-banking', 'type:tcp-check', 'component:cache'],
    description: 'Checks TCP connectivity to Redis cache cluster for customer platform',
    environment: 'Production'
  },
  {
    id: 'check-019',
    name: 'Mobile Banking API Performance',
    type: 'HTTP',
    csiId: '173621',
    csiName: 'Mobile Banking Platform',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:34:00Z', 
    nextExecution: '2024-01-15T10:37:00Z',
    configuration: {
      endpoint: 'https://api.mobile.citi.com/v2/health',
      method: 'POST',
      expectedStatus: 200,
      timeout: 3000,
      retries: 2,
      validateSSL: true,
      followRedirects: false,
      headers: {
        'Authorization': 'Bearer ${MOBILE_API_TOKEN}',
        'Content-Type': 'application/json',
        'X-Client-Version': '3.2.1',
        'X-Platform': 'ios'
      }
    },
    schedule: {
      frequency: 'every_3_minutes',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-14T10:00:00Z',
    updatedAt: '2024-01-15T10:34:00Z',
    createdBy: 'mobile.team@citi.com',
    tags: ['application:mobile-banking', 'team:mobile-dev', 'lob:digital-channels', 'type:api-check', 'priority:critical', 'platform:ios'],
    description: 'Monitors mobile banking API health and performance metrics',
    environment: 'Production'
  },
  {
    id: 'check-020', 
    name: 'Compliance Audit Log Analysis',
    type: 'SPLUNK',
    csiId: '171205',
    csiName: 'Risk Management Systems',
    status: 'PASSING',
    lastExecution: '2024-01-15T10:15:00Z',
    nextExecution: '2024-01-15T11:15:00Z',
    configuration: {
      query: 'search index=compliance source="audit.log" earliest=-1h | rex field=_raw "transaction_id=(?<tx_id>[A-Z0-9]+)" | stats dc(tx_id) as unique_transactions | eval status=if(unique_transactions>500,"healthy","warning")',
      index: 'compliance',
      timeRange: '1h',
      expectedCount: 500,
      countOperator: '>'
    },
    schedule: {
      frequency: 'hourly',
      timezone: 'EST',
      enabled: true
    },
    createdAt: '2024-01-14T11:00:00Z',
    updatedAt: '2024-01-15T10:15:00Z',
    createdBy: 'compliance.ops@citi.com',
    tags: ['application:compliance-audit', 'team:compliance-ops', 'lob:risk-compliance', 'type:splunk-query', 'priority:regulatory', 'audit:required'],
    description: 'Analyzes compliance audit logs for transaction monitoring and regulatory reporting',
    environment: 'Production'
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
  },
  {
    id: 'exec-003',
    checkId: 'check-007',
    status: 'SUCCESS',
    startTime: '2024-01-15T12:00:00Z',
    endTime: '2024-01-15T12:00:18Z',
    duration: 18342,
    output: 'UI test completed successfully. All 7 steps passed. Video recording available.',
    metadata: {
      stepsExecuted: 7,
      stepsPassed: 7,
      stepsFailed: 0,
      screenshotCount: 14,
      videoUrl: '/videos/customer-login-flow-test.mp4',
      browserVersion: 'Chrome 120.0.6099.109',
      viewport: '1920x1080'
    }
  },
  {
    id: 'exec-004',
    checkId: 'check-013',
    status: 'SUCCESS',
    startTime: '2024-01-15T10:30:00Z',
    endTime: '2024-01-15T10:30:03Z',
    duration: 3156,
    output: 'Splunk query executed successfully. Found 1247 processed transactions in the last 15 minutes.',
    metadata: {
      queryExecutionTime: 2.8,
      resultsCount: 1247,
      expectedThreshold: 1000,
      splunkIndex: 'payments',
      timeRange: '15m'
    }
  },
  {
    id: 'exec-005',
    checkId: 'check-014',
    status: 'WARNING',
    startTime: '2024-01-15T10:32:00Z',
    endTime: '2024-01-15T10:32:02Z',
    duration: 2894,
    output: 'Market data latency warning. Current average: 67ms, threshold: 50ms',
    metadata: {
      currentLatency: 67,
      thresholdLatency: 50,
      exchange: 'NYSE',
      affectedSymbols: ['SPY', 'QQQ', 'IWM'],
      grafanaDashboard: 'market-data-monitoring'
    }
  },
  {
    id: 'exec-006',
    checkId: 'check-015',
    status: 'SUCCESS',
    startTime: '2024-01-15T10:28:00Z',
    endTime: '2024-01-15T10:28:01Z',
    duration: 1203,
    output: 'ITRS sampler status check passed. OrderFlow status: OK',
    metadata: {
      samplerPath: 'Gateway > TradingGW01 > OrderManagement > OrderFlow',
      currentStatus: 'OK',
      expectedStatus: 'OK',
      lastUpdate: '2024-01-15T10:27:45Z'
    }
  },
  {
    id: 'exec-007',
    checkId: 'check-016',
    status: 'SUCCESS',
    startTime: '2024-01-15T10:31:00Z',
    endTime: '2024-01-15T10:31:04Z',
    duration: 4123,
    output: 'AppDynamics health rule check passed. Database connection pool is healthy.',
    metadata: {
      application: 'customer-digital-portal-prod',
      healthRule: 'Database Connection Pool Health',
      currentConnections: 45,
      maxConnections: 100,
      poolUtilization: 0.45
    }
  },
  {
    id: 'exec-008',
    checkId: 'check-017',
    status: 'SUCCESS',
    startTime: '2024-01-15T09:00:00Z',
    endTime: '2024-01-15T09:00:23Z',
    duration: 23567,
    output: 'Payment form UI test completed successfully. All 9 steps passed. Payment flow validated.',
    metadata: {
      stepsExecuted: 9,
      stepsPassed: 9,
      stepsFailed: 0,
      paymentAmount: '100.00',
      currency: 'USD',
      transactionId: 'TEST_TX_789123',
      videoUrl: '/videos/payment-form-test.mp4'
    }
  }
];

// Additional mock data for comprehensive testing
export const mockCheckStats = {
  total: 20,
  passing: 14,
  failing: 2,
  warning: 3,
  pending: 1,
  byType: {
    HTTP: 7,
    TCP: 2,
    SPLUNK: 3,
    GRAFANA: 2,
    ITRS: 2,
    APPDYNAMICS: 2,
    UI_TEST: 2
  },
  byCSI: {
    '174523': 5,  // Trading Platform Services
    '170456': 4,  // Customer Digital Platform  
    '169834': 3,  // Payment Gateway Infrastructure
    '171205': 2,  // Risk Management Systems
    '168942': 1,  // Core Banking Platform
    '172954': 1,  // Security Operations Platform
    '172087': 1,  // Automated Management of Production
    '173621': 1   // Mobile Banking Platform
  }
};