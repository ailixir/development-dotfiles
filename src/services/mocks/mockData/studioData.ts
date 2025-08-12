export interface MockUITest {
  id: string;
  name: string;
  csiId: string;
  description: string;
  steps: string[];
  configuration: {
    browser: 'chrome' | 'firefox' | 'safari' | 'edge';
    viewport: {
      width: number;
      height: number;
    };
    timeout: number;
    waitStrategy: 'none' | 'networkidle' | 'domcontentloaded';
  };
  variables?: Array<{ name: string; type: 'plain' | 'number' | 'boolean' | 'secret'; required?: boolean; description?: string }>;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastRunStatus?: 'success' | 'failed' | 'timeout';
  lastRunAt?: string;
}

export interface MockUITestExecution {
  id: string;
  testId: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startTime: string;
  endTime?: string;
  duration?: number;
  stepResults: Array<{
    stepIndex: number;
    status: 'pending' | 'running' | 'pass' | 'fail';
    message?: string;
    screenshot?: string;
    timestamp: string;
  }>;
  videoUrl?: string;
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warning' | 'error';
    message: string;
    stepIndex?: number;
  }>;
  error?: string;
}

export const mockUITests: MockUITest[] = [
  {
    id: 'ui-test-001',
    name: 'Customer Login Flow Test',
    csiId: '111111',
    description: 'End-to-end test of the customer login process',
    steps: [
      'Go to "https://online.citi.com"',
      'Click "Sign On"',
      'Wait for the text "User ID" to appear',
      'Type "testuser123" in the "User ID" field',
      'Click "Continue"',
      'Wait for the text "Password" to appear',
      'Check that the URL contains "login"'
    ],
    configuration: {
      browser: 'chrome',
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      waitStrategy: 'networkidle'
    },
    variables: [
      { name: 'USERNAME', type: 'plain', required: true },
      { name: 'PASSWORD', type: 'secret', required: true },
    ],
    status: 'active',
    createdAt: '2024-01-15T09:00:00Z',
    updatedAt: '2024-01-15T09:00:00Z',
    createdBy: 'priya.sharma@citi.com'
  },
  {
    id: 'ui-test-002',
    name: 'Trade Booking Workflow',
    csiId: '123456',
    description: 'Test the complete trade booking process in the trading interface',
    steps: [
      'Go to "https://trading.internal.citi.com"',
      'Login with credentials',
      'Click "New Trade"',
      'Select "Equity" from dropdown',
      'Type "AAPL" in symbol field',
      'Enter quantity "100"',
      'Select "Market" order type',
      'Click "Submit Trade"',
      'Wait for confirmation message',
      'Check that trade ID is displayed'
    ],
    configuration: {
      browser: 'chrome',
      viewport: { width: 1440, height: 900 },
      timeout: 45000,
      waitStrategy: 'networkidle'
    },
    variables: [
      { name: 'SYMBOL', type: 'plain', required: true },
      { name: 'QUANTITY', type: 'number', required: true },
    ],
    status: 'draft',
    createdAt: '2024-01-14T15:30:00Z',
    updatedAt: '2024-01-14T15:30:00Z',
    createdBy: 'david.chen@citi.com'
  }
];

export const mockUITestExecutions: MockUITestExecution[] = [
  {
    id: 'exec-ui-001',
    testId: 'ui-test-001',
    status: 'completed',
    startTime: '2024-01-15T10:30:00Z',
    endTime: '2024-01-15T10:31:15Z',
    duration: 75000,
    stepResults: [
      {
        stepIndex: 0,
        status: 'pass',
        message: 'Successfully navigated to https://online.citi.com',
        timestamp: '2024-01-15T10:30:05Z'
      },
      {
        stepIndex: 1,
        status: 'pass',
        message: 'Clicked "Sign On" button',
        timestamp: '2024-01-15T10:30:12Z'
      },
      {
        stepIndex: 2,
        status: 'pass',
        message: 'Found text "User ID" on page',
        timestamp: '2024-01-15T10:30:18Z'
      },
      {
        stepIndex: 3,
        status: 'pass',
        message: 'Typed "testuser123" in User ID field',
        timestamp: '2024-01-15T10:30:25Z'
      },
      {
        stepIndex: 4,
        status: 'pass',
        message: 'Clicked "Continue" button',
        timestamp: '2024-01-15T10:30:32Z'
      },
      {
        stepIndex: 5,
        status: 'pass',
        message: 'Found text "Password" on page',
        timestamp: '2024-01-15T10:30:45Z'
      },
      {
        stepIndex: 6,
        status: 'pass',
        message: 'URL contains "login" - verification successful',
        timestamp: '2024-01-15T10:30:48Z'
      }
    ],
    videoUrl: '/assets/videos/sample-ui-test.mp4',
    logs: [
      {
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'Starting UI test execution: Customer Login Flow Test'
      },
      {
        timestamp: '2024-01-15T10:30:01Z',
        level: 'info',
        message: 'Browser session started (Chrome 120.0.6099.129)'
      },
      {
        timestamp: '2024-01-15T10:30:02Z',
        level: 'info',
        message: 'Viewport set to 1920x1080'
      },
      {
        timestamp: '2024-01-15T10:30:05Z',
        level: 'info',
        message: 'Step 1: Navigating to https://online.citi.com',
        stepIndex: 0
      },
      {
        timestamp: '2024-01-15T10:30:10Z',
        level: 'info',
        message: 'Page loaded successfully (2.1s)',
        stepIndex: 0
      },
      {
        timestamp: '2024-01-15T10:30:12Z',
        level: 'info',
        message: 'Step 2: Looking for "Sign On" button',
        stepIndex: 1
      },
      {
        timestamp: '2024-01-15T10:30:14Z',
        level: 'info',
        message: 'Button found and clicked',
        stepIndex: 1
      },
      {
        timestamp: '2024-01-15T10:30:18Z',
        level: 'info',
        message: 'Step 3: Waiting for "User ID" text',
        stepIndex: 2
      },
      {
        timestamp: '2024-01-15T10:30:20Z',
        level: 'info',
        message: 'Text found on page',
        stepIndex: 2
      },
      {
        timestamp: '2024-01-15T10:30:25Z',
        level: 'info',
        message: 'Step 4: Typing in User ID field',
        stepIndex: 3
      },
      {
        timestamp: '2024-01-15T10:30:32Z',
        level: 'info',
        message: 'Step 5: Clicking Continue button',
        stepIndex: 4
      },
      {
        timestamp: '2024-01-15T10:30:45Z',
        level: 'info',
        message: 'Step 6: Password field appeared',
        stepIndex: 5
      },
      {
        timestamp: '2024-01-15T10:30:48Z',
        level: 'info',
        message: 'Step 7: URL verification successful',
        stepIndex: 6
      },
      {
        timestamp: '2024-01-15T10:31:15Z',
        level: 'info',
        message: 'Test execution completed successfully (75s total)'
      }
    ]
  }
];

// Mock video file paths for testing
export const mockVideoAssets = {
  'sample-ui-test.mp4': '/assets/videos/sample-ui-test.mp4',
  'trade-booking-test.mp4': '/assets/videos/trade-booking-test.mp4'
};