import { http, HttpResponse } from 'msw';
import { API_ENDPOINTS } from '@/utils/constants';

export const executionHandlers = [
  http.post(`*${API_ENDPOINTS.execution}`, () => {
    return HttpResponse.json({
      data: { jobId: 'mock-job-id', status: 'started' },
      status: 'success',
      timestamp: new Date().toISOString(),
    });
  }),
];

export default executionHandlers;
