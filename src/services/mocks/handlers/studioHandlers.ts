import { http, HttpResponse, delay } from 'msw';
import { mockUITests, mockUITestExecutions } from '../mockData/studioData';

export const studioHandlers = [
  http.get('/api/studio/tests', async ({ request }) => {
    await delay(300);
    const url = new URL(request.url);
    const csiId = url.searchParams.get('csiId');
    let filteredTests = [...mockUITests];
    if (csiId) filteredTests = filteredTests.filter((test) => test.csiId === csiId);
    return HttpResponse.json({ data: filteredTests, total: filteredTests.length });
  }),
  http.post('/api/studio/tests', async ({ request }) => {
    await delay(800);
    const newTestData = (await request.json()) as any;
    const newTest = {
      id: `ui-test-${Date.now()}`,
      ...newTestData,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'current.user@citi.com',
    };
    mockUITests.push(newTest);
    return HttpResponse.json(newTest, { status: 201 });
  }),
  http.post('/api/studio/tests/:id/execute', async ({ params, request }) => {
    const { id } = params;
    // Accept variables in payload, echo in logs metadata
    let variables: Record<string, any> | undefined;
    try {
      const body: any = await request.json();
      variables = body && typeof body === 'object' ? body.variables : undefined;
    } catch {}
    const test = mockUITests.find((t) => t.id === id);
    if (!test) return new HttpResponse(null, { status: 404 });
    const executionId = `exec-ui-${Date.now()}`;
    const startTime = new Date().toISOString();
    const execution = {
      id: executionId,
      testId: id as string,
      status: 'running' as const,
      startTime,
      stepResults: test.steps.map((_, index) => ({ stepIndex: index, status: 'pending' as const, timestamp: startTime })),
      logs: [
        { timestamp: startTime, level: 'info' as const, message: `Starting UI test execution: ${test.name}` },
        variables ? { timestamp: startTime, level: 'info', message: `Variables: ${JSON.stringify(variables)}` } as any : null,
      ].filter(Boolean),
      // Attach a mock video url when done; set later
    } as any;
    mockUITestExecutions.push(execution);
    // Simulate terminal outcome after a few seconds: success for Customer Login Flow, fail for Trade Booking Workflow
    setTimeout(() => {
      const exec = mockUITestExecutions.find((e) => e.id === executionId);
      if (!exec) return;
      // Force complete: mark all pending as pass first
      exec.stepResults = exec.stepResults.map((s: any) => ({ ...s, status: 'pass', timestamp: new Date().toISOString() }));
      const isSuccess = test.name?.toLowerCase().includes('customer login flow');
      if (isSuccess) {
        exec.status = 'completed';
        exec.logs.push({ timestamp: new Date().toISOString(), level: 'info', message: 'Execution finished: SUCCESS' } as any);
      } else {
        exec.status = 'failed';
        // Mark last step as fail
        if (exec.stepResults.length > 0) exec.stepResults[exec.stepResults.length - 1].status = 'fail';
        exec.logs.push({ timestamp: new Date().toISOString(), level: 'error', message: 'Execution finished: FAILED' } as any);
      }
      exec.endTime = new Date().toISOString();
      exec.videoUrl = '/assets/videos/sample-ui-test.mp4';
    }, Math.min(5000, 2500 + Math.random() * 2500));
    return HttpResponse.json({ executionId, status: 'started', message: 'Test execution started.' });
  }),
  // Polling endpoint returns current state; simulate progression over time
  http.get('/api/studio/executions/:id', async ({ params }) => {
    await delay(200);
    const { id } = params;
    const execution = mockUITestExecutions.find((e) => e.id === id);
    if (!execution) return new HttpResponse(null, { status: 404 });
    // Simulate progression: mark next pending as running/pass and push logs
    const now = new Date().toISOString();
    const nextPending = execution.stepResults.find((s: any) => s.status === 'pending');
    const currentlyRunning = execution.stepResults.find((s: any) => s.status === 'running');
    if (execution.status === 'running') {
      if (!currentlyRunning && nextPending) {
        nextPending.status = 'running';
        nextPending.timestamp = now;
        execution.logs.push({ timestamp: now, level: 'info', message: `Step ${nextPending.stepIndex + 1}: ${execution.testId} running`, stepIndex: nextPending.stepIndex } as any);
      } else if (currentlyRunning) {
        // Move running to pass
        currentlyRunning.status = 'pass';
        currentlyRunning.timestamp = now;
        execution.logs.push({ timestamp: now, level: 'info', message: `Step ${currentlyRunning.stepIndex + 1}: completed`, stepIndex: currentlyRunning.stepIndex } as any);
        const next = execution.stepResults.find((s: any) => s.status === 'pending');
        if (next) {
          next.status = 'running';
          next.timestamp = now;
          execution.logs.push({ timestamp: now, level: 'info', message: `Step ${next.stepIndex + 1}: started`, stepIndex: next.stepIndex } as any);
        } else {
          // Allow the scheduled setTimeout to finalize status rather than forcing completed here
        }
      }
    }
    return HttpResponse.json(execution);
  }),
  http.get('/api/studio/executions', async () => {
    await delay(200);
    return HttpResponse.json({ data: mockUITestExecutions });
  }),
  http.put('/api/studio/tests/:id', async ({ params, request }) => {
    await delay(500);
    const { id } = params;
    const updateData = (await request.json()) as any;
    const testIndex = mockUITests.findIndex((t) => t.id === id);
    if (testIndex === -1) return new HttpResponse(null, { status: 404 });
    mockUITests[testIndex] = {
      ...mockUITests[testIndex],
      ...updateData,
      updatedAt: new Date().toISOString(),
    } as any;
    return HttpResponse.json(mockUITests[testIndex]);
  }),
  http.get('/api/studio/tests/:id', async ({ params }) => {
    await delay(200);
    const { id } = params;
    const test = mockUITests.find((t) => t.id === id);
    if (!test) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(test);
  }),
  http.post('/api/studio/tests/:id/validate-variables', async ({ params, request }) => {
    await delay(250);
    const { id } = params;
    const test = mockUITests.find((t) => t.id === id);
    if (!test) return new HttpResponse(null, { status: 404 });
    const { variables } = (await request.json()) as { variables: Record<string, any> };
    const required = (test.variables || []).filter((v) => v.required).map((v) => v.name);
    const missing = required.filter((n) => variables?.[n] == null || (variables[n].kind === 'secret' ? !variables[n].secretId : variables[n].value == null || variables[n].value === ''));
    const isValid = missing.length === 0;
    return HttpResponse.json({ isValid, missing });
  }),
  http.delete('/api/studio/tests/:id', async ({ params }) => {
    await delay(200);
    const { id } = params;
    const idx = mockUITests.findIndex((t) => t.id === id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    mockUITests.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post('/api/studio/validate-steps', async ({ request }) => {
    await delay(300);
    const { steps } = (await request.json()) as { steps: string[] };
    const validationResults = steps.map((step, index) => {
      const s = step.trim().toLowerCase();
      const isValid = s.length > 0 && (s.startsWith('go to') || s.startsWith('navigate to') || s.startsWith('click') || s.startsWith('type') || s.startsWith('wait for') || s.startsWith('check that') || s.startsWith('check url contains'));
      return { stepIndex: index, isValid, suggestion: !isValid ? 'Step should start with a valid action' : null };
    });
    return HttpResponse.json({ isValid: validationResults.every((r) => r.isValid), results: validationResults });
  }),
];

export default studioHandlers;


