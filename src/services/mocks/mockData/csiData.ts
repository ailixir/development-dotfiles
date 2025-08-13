export interface MockCSI {
  id: string;
  name: string;
  description: string;
  owner: string;
  environment: 'Production' | 'Staging' | 'Development' | 'UAT';
  businessUnit: string;
  status: 'Active' | 'Deprecated' | 'Development';
  applications: MockApplication[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MockApplication {
  id: string;
  name: string;
  type: 'REST API' | 'Microservice' | 'Database' | 'Web Application' | 'Batch Job' | 'Message Queue';
  version: string;
  status: 'Running' | 'Stopped' | 'Error' | 'Maintenance';
  endpoints?: string[];
}

export const mockCSIs: MockCSI[] = [
  {
    id: '174523',
    name: 'Trade Processing System',
    description: 'Core trading system for equity and fixed income transactions',
    owner: 'Trading Technology Team',
    environment: 'Production',
    businessUnit: 'Markets & Securities Services',
    status: 'Active',
    applications: [
      {
        id: 'app-001',
        name: 'Trade API Gateway',
        type: 'REST API',
        version: 'v2.1.4',
        status: 'Running',
        endpoints: [
          'https://api.trade.internal/health',
          'https://api.trade.internal/orders',
          'https://api.trade.internal/settlements'
        ]
      },
      {
        id: 'app-002',
        name: 'Trade Settlement Service',
        type: 'Microservice',
        version: 'v1.8.2',
        status: 'Running'
      },
      {
        id: 'app-003',
        name: 'Trade Database',
        type: 'Database',
        version: 'PostgreSQL 14.9',
        status: 'Running'
      }
    ],
    tags: ['trading', 'critical', 'high-volume', 'real-time'],
    createdAt: '2023-06-15T09:00:00Z',
    updatedAt: '2024-01-10T14:30:00Z'
  },
  {
    id: '168942',
    name: 'Market Data System',
    description: 'Real-time market data processing and distribution platform',
    owner: 'Market Data Engineering',
    environment: 'Production',
    businessUnit: 'Markets & Securities Services',
    status: 'Active',
    applications: [
      {
        id: 'app-004',
        name: 'Market Data Processor',
        type: 'Microservice',
        version: 'v3.2.1',
        status: 'Running'
      },
      {
        id: 'app-005',
        name: 'Price Feed API',
        type: 'REST API',
        version: 'v2.0.3',
        status: 'Running',
        endpoints: [
          'https://api.marketdata.internal/prices',
          'https://api.marketdata.internal/quotes'
        ]
      },
      {
        id: 'app-006',
        name: 'Market Data Cache',
        type: 'Database',
        version: 'Redis 7.0.8',
        status: 'Running'
      }
    ],
    tags: ['market-data', 'real-time', 'high-throughput', 'low-latency'],
    createdAt: '2023-05-20T10:00:00Z',
    updatedAt: '2024-01-08T16:45:00Z'
  },
  {
    id: '170456',
    name: 'Customer Portal',
    description: 'Online banking portal for retail and corporate customers',
    owner: 'Digital Banking Team',
    environment: 'Production',
    businessUnit: 'Global Consumer Banking',
    status: 'Active',
    applications: [
      {
        id: 'app-007',
        name: 'Portal Web Application',
        type: 'Web Application',
        version: 'v5.1.2',
        status: 'Running',
        endpoints: [
          'https://online.citi.com',
          'https://online.citi.com/api/auth'
        ]
      },
      {
        id: 'app-008',
        name: 'Customer API Service',
        type: 'REST API',
        version: 'v4.0.1',
        status: 'Running'
      },
      {
        id: 'app-009',
        name: 'Session Management Service',
        type: 'Microservice',
        version: 'v2.3.5',
        status: 'Running'
      }
    ],
    tags: ['customer-facing', 'web', 'authentication', 'high-availability'],
    createdAt: '2023-03-10T11:00:00Z',
    updatedAt: '2024-01-12T09:15:00Z'
  },
  {
    id: '171205',
    name: 'Risk Management Platform',
    description: 'Enterprise risk assessment and monitoring platform',
    owner: 'Risk Technology Team',
    environment: 'Production',
    businessUnit: 'Risk Management',
    status: 'Active',
    applications: [
      {
        id: 'app-010',
        name: 'Risk Calculation Engine',
        type: 'Batch Job',
        version: 'v1.9.0',
        status: 'Running'
      },
      {
        id: 'app-011',
        name: 'Risk API Gateway',
        type: 'REST API',
        version: 'v3.1.7',
        status: 'Running'
      },
      {
        id: 'app-012',
        name: 'Risk Data Warehouse',
        type: 'Database',
        version: 'Oracle 19c',
        status: 'Running'
      }
    ],
    tags: ['risk', 'compliance', 'batch-processing', 'analytics'],
    createdAt: '2023-08-01T08:00:00Z',
    updatedAt: '2024-01-14T13:20:00Z'
  },
  {
    id: '169834',
    name: 'Payment Processing Network',
    description: 'Global payment processing and settlement network',
    owner: 'Payments Engineering',
    environment: 'Production',
    businessUnit: 'Treasury & Trade Solutions',
    status: 'Active',
    applications: [
      {
        id: 'app-013',
        name: 'Payment Gateway',
        type: 'REST API',
        version: 'v4.2.1',
        status: 'Running'
      },
      {
        id: 'app-014',
        name: 'Settlement Engine',
        type: 'Microservice',
        version: 'v2.7.3',
        status: 'Running'
      },
      {
        id: 'app-015',
        name: 'Payment Queue',
        type: 'Message Queue',
        version: 'Apache Kafka 3.4',
        status: 'Running'
      }
    ],
    tags: ['payments', 'settlement', 'messaging', 'global'],
    createdAt: '2023-07-12T07:30:00Z',
    updatedAt: '2024-01-11T15:45:00Z'
  },
  {
    id: '172954',
    name: 'Credit Card Processing',
    description: 'Credit card transaction processing and fraud detection system',
    owner: 'Cards Technology Team',
    environment: 'Production',
    businessUnit: 'Global Consumer Banking',
    status: 'Active',
    applications: [
      {
        id: 'app-016',
        name: 'Transaction Processor',
        type: 'Microservice',
        version: 'v6.1.0',
        status: 'Running'
      },
      {
        id: 'app-017',
        name: 'Fraud Detection API',
        type: 'REST API',
        version: 'v3.4.2',
        status: 'Running'
      }
    ],
    tags: ['credit-cards', 'fraud-detection', 'real-time', 'high-volume'],
    createdAt: '2023-04-05T12:00:00Z',
    updatedAt: '2024-01-09T11:30:00Z'
  },
  {
    id: '173621',
    name: 'Mobile Banking Platform',
    description: 'Mobile banking APIs and services for iOS and Android clients',
    owner: 'Mobile Banking Team',
    environment: 'Production',
    businessUnit: 'Digital Banking',
    status: 'Active',
    applications: [
      {
        id: 'app-018',
        name: 'Mobile Banking API',
        type: 'REST API',
        version: 'v2.3.0',
        status: 'Running',
        endpoints: [
          'https://api.mobile.citi.com/v2/health',
          'https://api.mobile.citi.com/v2/auth'
        ]
      },
      {
        id: 'app-019',
        name: 'Push Notification Service',
        type: 'Microservice',
        version: 'v1.5.2',
        status: 'Running'
      }
    ],
    tags: ['mobile-banking', 'digital-channels', 'customer-facing', 'high-availability'],
    createdAt: '2023-09-01T10:00:00Z',
    updatedAt: '2025-01-07T10:52:00Z'
  }
  ,
  {
    id: '176001',
    name: 'Treasury Liquidity Platform',
    description: 'Real-time liquidity monitoring and forecasting across accounts and currencies',
    owner: 'Treasury Engineering',
    environment: 'Production',
    businessUnit: 'Treasury & Trade Solutions',
    status: 'Active',
    applications: [
      {
        id: 'app-020',
        name: 'Liquidity API',
        type: 'REST API',
        version: 'v1.4.0',
        status: 'Running',
        endpoints: [
          'https://liquidity.api.internal/health',
          'https://liquidity.api.internal/positions'
        ]
      },
      {
        id: 'app-021',
        name: 'Liquidity Metrics Processor',
        type: 'Microservice',
        version: 'v2.3.1',
        status: 'Running'
      }
    ],
    tags: ['treasury', 'liquidity', 'real-time', 'critical'],
    createdAt: '2024-08-15T10:00:00Z',
    updatedAt: '2025-01-07T10:55:00Z'
  },
  {
    id: '176002',
    name: 'Fraud Detection Platform',
    description: 'Streaming fraud detection and scoring for card and account transactions',
    owner: 'Fraud Analytics Team',
    environment: 'Production',
    businessUnit: 'Risk Management',
    status: 'Active',
    applications: [
      {
        id: 'app-022',
        name: 'Fraud Scoring API',
        type: 'REST API',
        version: 'v3.0.2',
        status: 'Running',
        endpoints: [
          'https://fraud.api.internal/health',
          'https://fraud.api.internal/score'
        ]
      },
      {
        id: 'app-023',
        name: 'Fraud Feature Pipeline',
        type: 'Microservice',
        version: 'v1.7.4',
        status: 'Running'
      }
    ],
    tags: ['fraud', 'streaming', 'analytics', 'critical'],
    createdAt: '2024-09-10T09:00:00Z',
    updatedAt: '2025-01-07T10:58:00Z'
  }
];

export const mockUsers = [
  {
    id: 'user-001',
    name: 'David Chen',
    email: 'bruno.buger@citi.com',
    role: 'SRE Engineer',
    teams: ['Trading Technology Team'],
    permissions: ['174523', '168942']
  },
  {
    id: 'user-002',
    name: 'Priya Sharma',
    email: 'bruno.buger@citi.com',
    role: 'L2 Support Analyst',
    teams: ['Trading Technology Team', 'Digital Banking Team'],
    permissions: ['174523', '170456']
  },
  {
    id: 'user-003',
    name: 'Maria Garcia',
    email: 'matthew.robinson@citi.com',
    role: 'Operations Analyst',
    teams: ['Market Data Engineering'],
    permissions: ['168942']
  },
  {
    id: 'user-004',
    name: 'Robert Kim',
    email: 'emanuel.stanciu@citi.com',
    role: 'IT Director',
    teams: ['Trading Technology Team', 'Risk Technology Team'],
    permissions: ['174523', '171205']
  }
];