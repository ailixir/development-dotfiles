import { http, HttpResponse, delay } from 'msw';
import { mockChecks } from '../mockData/checksData';

export const checksHandlers = [
  // Get all checks with filtering and pagination
  http.get('/api/checks', async ({ request }) => {
    await delay(500); // Simulate network delay
    
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const csiId = url.searchParams.get('csiId');
    const status = url.searchParams.get('status');
    const type = url.searchParams.get('type');
    const searchQuery = url.searchParams.get('search');
    const tags = url.searchParams.getAll('tags[]'); // Support multiple tags
    const tagMode = url.searchParams.get('tagMode') || 'AND'; // AND or OR
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    let filteredChecks = [...mockChecks];

    // Apply filters
    if (csiId) {
      filteredChecks = filteredChecks.filter(check => check.csiId === csiId);
    }
    if (status) {
      filteredChecks = filteredChecks.filter(check => check.status === status);
    }
    if (type) {
      filteredChecks = filteredChecks.filter(check => check.type === type);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredChecks = filteredChecks.filter(check =>
        check.name.toLowerCase().includes(query) ||
        check.description?.toLowerCase().includes(query) ||
        check.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    // Apply tag filtering
    if (tags && tags.length > 0) {
      filteredChecks = filteredChecks.filter(check => {
        if (tagMode === 'OR') {
          // Check has at least one of the selected tags
          return tags.some(tag => check.tags.includes(tag));
        } else {
          // Check has all selected tags (AND mode)
          return tags.every(tag => check.tags.includes(tag));
        }
      });
    }

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    if (url.searchParams.get('__empty') === '1') {
      filteredChecks = [];
    }
    const paginatedChecks = filteredChecks.slice(startIndex, endIndex);

    return HttpResponse.json({
      data: paginatedChecks,
      total: filteredChecks.length,
      page,
      limit,
      totalPages: Math.ceil(filteredChecks.length / limit)
    });
  }),

  // Get single check by ID
  http.get('/api/checks/:id', async ({ params, request }) => {
    await delay(300);
    
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const check = mockChecks.find(c => c.id === id);
    
    if (!check) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    return HttpResponse.json(check);
  }),

  // Create new check
  http.post('/api/checks', async ({ request }) => {
    await delay(1000); // Simulate validation time
    
    const newCheckData = await request.json() as any;
    
    // Simulate validation errors occasionally
    if (Math.random() < 0.1) {
      return HttpResponse.json(
        {
          error: 'Validation failed',
          details: {
            name: 'Check name must be unique within the CSI'
          }
        },
        { status: 400 }
      );
    }
    
    const newCheck = {
      id: `check-${Date.now()}`,
      ...newCheckData,
      status: 'PENDING',
      lastExecution: null,
      nextExecution: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes from now
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'current.user@citi.com', // Would come from auth context
      tags: newCheckData.tags || []
    };
    
    // Add to mock data for subsequent requests
    mockChecks.push(newCheck);
    
    return HttpResponse.json(newCheck, { status: 201 });
  }),

  // Update check
  http.put('/api/checks/:id', async ({ params, request }) => {
    await delay(500);
    
    const { id } = params;
    const updateData = await request.json() as any;
    
    const checkIndex = mockChecks.findIndex(c => c.id === id);
    if (checkIndex === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    // Update the check
    mockChecks[checkIndex] = {
      ...mockChecks[checkIndex],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    
    return HttpResponse.json(mockChecks[checkIndex]);
  }),

  // Delete check
  http.delete('/api/checks/:id', async ({ params }) => {
    await delay(300);
    
    const { id } = params;
    const checkIndex = mockChecks.findIndex(c => c.id === id);
    
    if (checkIndex === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    // Remove from mock data
    mockChecks.splice(checkIndex, 1);
    
    return new HttpResponse(null, { status: 204 });
  }),

  // Execute check
  http.post('/api/checks/:id/execute', async ({ params, request }) => {
    await delay(2000 + Math.random() * 3000); // 2-5 second execution time
    
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const check = mockChecks.find(c => c.id === id);
    
    if (!check) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    // Simulate different execution outcomes
    const outcomes = ['SUCCESS', 'FAILURE', 'WARNING', 'TIMEOUT'];
    const weights = [0.7, 0.2, 0.08, 0.02]; // 70% success, 20% failure, etc.
    
    let randomValue = Math.random();
    let selectedOutcome = 'SUCCESS';
    
    for (let i = 0; i < outcomes.length; i++) {
      if (randomValue < weights[i]) {
        selectedOutcome = outcomes[i];
        break;
      }
      randomValue -= weights[i];
    }
    
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + Math.random() * 5000 + 1000); // 1-6 seconds
    
    const executionResult = {
      id: `exec-${Date.now()}`,
      checkId: id,
      status: selectedOutcome,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: endTime.getTime() - startTime.getTime(),
      output: generateMockOutput(check.type, selectedOutcome),
      metadata: generateMockMetadata(check.type, selectedOutcome),
      ...(selectedOutcome !== 'SUCCESS' && {
        error: generateMockError(check.type, selectedOutcome)
      })
    };
    
    // Update check's last execution time and status
    const checkIndex = mockChecks.findIndex(c => c.id === id);
    if (checkIndex !== -1) {
      mockChecks[checkIndex].lastExecution = endTime.toISOString();
      mockChecks[checkIndex].status = selectedOutcome === 'SUCCESS' ? 'PASSING' : 
                                    selectedOutcome === 'WARNING' ? 'WARNING' : 'FAILING';
      mockChecks[checkIndex].nextExecution = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    }
    
    return HttpResponse.json(executionResult);
  }),

  // Get execution history for a check
  http.get('/api/checks/:id/executions', async ({ params, request }) => {
    await delay(400);
    
    const { id } = params;
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    // Generate mock execution history
    const executions = [];
    for (let i = 0; i < limit; i++) {
      const timestamp = new Date(Date.now() - i * 5 * 60 * 1000); // Every 5 minutes back
      executions.push({
        id: `exec-history-${id}-${i}`,
        checkId: id,
        status: Math.random() > 0.8 ? 'FAILURE' : 'SUCCESS',
        startTime: timestamp.toISOString(),
        endTime: new Date(timestamp.getTime() + Math.random() * 3000 + 500).toISOString(),
        duration: Math.random() * 3000 + 500,
        output: 'Historical execution result'
      });
    }
    
    return HttpResponse.json({
      data: executions,
      total: 50, // Simulate total history
      hasMore: limit < 50
    });
  }),

  // Update check schedule
  http.put('/api/checks/:id/schedule', async ({ params, request }) => {
    await delay(500);
    
    const { id } = params;
    const scheduleData = await request.json() as any;
    
    const checkIndex = mockChecks.findIndex(c => c.id === id);
    if (checkIndex === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    // Update the check's schedule
    mockChecks[checkIndex] = {
      ...mockChecks[checkIndex],
      schedule: {
        ...mockChecks[checkIndex].schedule,
        ...scheduleData
      },
      updatedAt: new Date().toISOString(),
      nextExecution: scheduleData.enabled 
        ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
        : null
    };
    
    return HttpResponse.json(mockChecks[checkIndex]);
  }),

  // Pause check
  http.post('/api/checks/:id/pause', async ({ params }) => {
    await delay(300);
    
    const { id } = params;
    const checkIndex = mockChecks.findIndex(c => c.id === id);
    
    if (checkIndex === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    mockChecks[checkIndex] = {
      ...mockChecks[checkIndex],
      schedule: {
        ...mockChecks[checkIndex].schedule,
        enabled: false
      },
      nextExecution: null,
      updatedAt: new Date().toISOString()
    };
    
    return HttpResponse.json(mockChecks[checkIndex]);
  }),

  // Resume check
  http.post('/api/checks/:id/resume', async ({ params }) => {
    await delay(300);
    
    const { id } = params;
    const checkIndex = mockChecks.findIndex(c => c.id === id);
    
    if (checkIndex === -1) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Check not found'
      });
    }
    
    mockChecks[checkIndex] = {
      ...mockChecks[checkIndex],
      schedule: {
        ...mockChecks[checkIndex].schedule,
        enabled: true
      },
      nextExecution: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    return HttpResponse.json(mockChecks[checkIndex]);
  }),

  // Get upcoming executions
  http.get('/api/checks/upcoming', async ({ request }) => {
    await delay(400);
    
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const limit = parseInt(url.searchParams.get('limit') || '20');
    
    // Filter checks that are enabled and scheduled
    let upcomingChecks = mockChecks
      .filter(check => check.schedule.enabled && check.nextExecution)
      .sort((a, b) => new Date(a.nextExecution!).getTime() - new Date(b.nextExecution!).getTime())
      .slice(0, limit)
      .map(check => ({
        checkId: check.id,
        checkName: check.name,
        nextExecution: check.nextExecution!,
        csiName: check.csiName,
        frequency: check.schedule.frequency,
        priority: check.tags.find(tag => tag.startsWith('priority:'))?.split(':')[1] || 'medium'
      }));
    if (url.searchParams.get('__empty') === '1') upcomingChecks = [];
    
    return HttpResponse.json({
      data: upcomingChecks,
      total: upcomingChecks.length
    });
  })
];

// Helper functions for generating realistic mock data
function generateMockOutput(checkType: string, status: string): string {
  const outputs: Record<string, Record<string, string>> = {
    HTTP: {
      SUCCESS: 'HTTP GET request successful. Status: 200 OK. Response time: 145ms.',
      FAILURE: 'HTTP request failed. Status: 503 Service Unavailable. Response time: 5000ms.',
      WARNING: 'HTTP request successful but slow. Status: 200 OK. Response time: 2500ms.',
      TIMEOUT: 'HTTP request timed out after 5000ms.'
    },
    TCP: {
      SUCCESS: 'TCP connection established successfully. Response time: 23ms.',
      FAILURE: 'TCP connection refused. Unable to connect to host:port.',
      WARNING: 'TCP connection slow. Response time: 1500ms.',
      TIMEOUT: 'TCP connection timed out after 3000ms.'
    },
    SPLUNK: {
      SUCCESS: 'Splunk query executed successfully. Results: 0 events matching criteria.',
      FAILURE: 'Splunk query returned 15 events, exceeding threshold of 5.',
      WARNING: 'Splunk query returned 3 events, approaching threshold of 5.',
      TIMEOUT: 'Splunk query timed out after 30000ms.'
    }
  };
  
  return outputs[checkType]?.[status] || `${checkType} check completed with status: ${status}`;
}

function generateMockMetadata(checkType: string, status: string): Record<string, any> {
  const baseMetadata: Record<string, any> = {
    timestamp: new Date().toISOString(),
    executionId: `exec-${Date.now()}`
  };
  
  switch (checkType) {
    case 'HTTP':
      return {
        ...baseMetadata,
        responseTime: status === 'SUCCESS' ? Math.random() * 500 + 50 : Math.random() * 3000 + 2000,
        statusCode: status === 'SUCCESS' ? 200 : status === 'FAILURE' ? 503 : 200,
        responseSize: Math.floor(Math.random() * 5000) + 500
      };
    case 'TCP':
      return {
        ...baseMetadata,
        connectionTime: status === 'SUCCESS' ? Math.random() * 100 + 10 : Math.random() * 2000 + 1000
      };
    case 'SPLUNK':
      return {
        ...baseMetadata,
        eventCount: status === 'SUCCESS' ? 0 : Math.floor(Math.random() * 20),
        queryDuration: Math.random() * 10000 + 1000
      };
    default:
      return baseMetadata;
  }
}

function generateMockError(checkType: string, status: string): string {
  const errors: Record<string, Record<string, string>> = {
    HTTP: {
      FAILURE: 'Service unavailable - upstream service is down',
      WARNING: 'Response time exceeded acceptable threshold',
      TIMEOUT: 'Request timeout - service did not respond within 5 seconds'
    },
    TCP: {
      FAILURE: 'Connection refused - port may be closed or service down',
      WARNING: 'Connection established but response time is slow',
      TIMEOUT: 'Connection timeout - unable to establish connection'
    },
    SPLUNK: {
      FAILURE: 'Query returned results above acceptable threshold',
      WARNING: 'Query returned results approaching threshold limit',
      TIMEOUT: 'Query execution exceeded maximum allowed time'
    }
  };
  
  return errors[checkType]?.[status] || `${checkType} check failed with status: ${status}`;
}