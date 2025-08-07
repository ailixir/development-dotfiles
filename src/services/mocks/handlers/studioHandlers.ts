import { http, HttpResponse, delay } from 'msw';
import { mockUITests, mockUITestExecutions } from '../mockData/studioData';

export const studioHandlers = [
  // Get UI tests
  http.get('/api/studio/tests', async ({ request }) => {
    await delay(300);
    
    const url = new URL(request.url);
    const csiId = url.searchParams.get('csiId');
    
    let filteredTests = [...mockUITests];
    
    if (csiId) {
      filteredTests = filteredTests.filter(test => test.csiId === csiId);
    }
    
    return HttpResponse.json({
      data: filteredTests,
      total: filteredTests.length
    });
  }),

  // Create new UI test
  http.post('/api/studio/tests', async ({ request }) => {
    await delay(800);
    
    const newTestData = await request.json() as any;
    
    const newTest = {
      id: `ui-test-${Date.now()}`,
      ...newTestData,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'current.user@citi.com'
    };
    
    mockUITests.push(newTest);
    
    return HttpResponse.json(newTest, { status: 201 });
  }),

  // Execute UI test with real-time progress simulation
  http.post('/api/studio/tests/:id/execute', async ({ params }) => {
    const { id } = params;
    const test = mockUITests.find(t => t.id === id);
    
    if (!test) {
      return new HttpResponse(null, { status: 404 });
    }
    
    // Start execution immediately
    const executionId = `exec-ui-${Date.now()}`;
    const startTime = new Date().toISOString();
    
    // Simulate progressive execution
    const execution = {
      id: executionId,
      testId: id as string,
      status: 'running' as const,
      startTime,
      stepResults: test.steps.map((_, index) => ({
        stepIndex: index,
        status: 'pending' as const,
        timestamp: startTime
      })),
      logs: [
        {
          timestamp: startTime,
          level: 'info' as const,
          message: `Starting UI test execution: ${test.name}`
        }
      ]
    };
    
    // Store execution for WebSocket updates
    mockUITestExecutions.push(execution);
    
    // Return immediate response with execution ID
    return HttpResponse.json({
      executionId,
      status: 'started',
      message: 'Test execution started. Use WebSocket connection for real-time updates.'
    });
  }),

  // Get UI test execution result
  http.get('/api/studio/executions/:id', async ({ params }) => {
    await delay(200);
    
    const { id } = params;
    const execution = mockUITestExecutions.find(e => e.id === id);
    
    if (!execution) {
      return new HttpResponse(null, { status: 404 });
    }
    
    return HttpResponse.json(execution);
  }),

  // Update UI test
  http.put('/api/studio/tests/:id', async ({ params, request }) => {
    await delay(500);
    
    const { id } = params;
    const updateData = await request.json() as any;
    
    const testIndex = mockUITests.findIndex(t => t.id === id);
    if (testIndex === -1) {
      return new HttpResponse(null, { status: 404 });
    }
    
    mockUITests[testIndex] = {
      ...mockUITests[testIndex],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    
    return HttpResponse.json(mockUITests[testIndex]);
  }),

  // Get UI test by ID
  http.get('/api/studio/tests/:id', async ({ params }) => {
    await delay(200);
    
    const { id } = params;
    const test = mockUITests.find(t => t.id === id);
    
    if (!test) {
      return new HttpResponse(null, { status: 404 });
    }
    
    return HttpResponse.json(test);
  }),

  // Validate test steps (for real-time validation)
  http.post('/api/studio/validate-steps', async ({ request }) => {
    await delay(300);
    
    const { steps } = await request.json() as { steps: string[] };
    
    const validationResults = steps.map((step, index) => {
      // Simple validation rules
      const isValid = step.trim().length > 0 && 
                     (step.toLowerCase().startsWith('go to') ||
                      step.toLowerCase().startsWith('click') ||
                      step.toLowerCase().startsWith('type') ||
                      step.toLowerCase().startsWith('wait for') ||
                      step.toLowerCase().startsWith('check that'));
      
      return {
        stepIndex: index,
        isValid,
        suggestion: !isValid ? 'Step should start with a valid action (Go to, Click, Type, Wait for, Check that)' : null
      };
    });
    
    return HttpResponse.json({
      isValid: validationResults.every(r => r.isValid),
      results: validationResults
    });
  })
];