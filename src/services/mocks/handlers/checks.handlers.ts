import { http, HttpResponse } from 'msw';
import { API_ENDPOINTS } from '@/utils/constants';

// Basic placeholder handlers for checks
export const checksHandlers = [
  // Get all checks
  http.get(`*${API_ENDPOINTS.checks}`, () => {
    return HttpResponse.json({
      data: [],
      status: 'success',
      timestamp: new Date().toISOString(),
    });
  }),

  // Get check by ID
  http.get(`*${API_ENDPOINTS.checks}/:id`, () => {
    return HttpResponse.json({
      data: null,
      status: 'success',
      timestamp: new Date().toISOString(),
    });
  }),

  // Create check
  http.post(`*${API_ENDPOINTS.checks}`, () => {
    return HttpResponse.json({
      data: { id: 'mock-check-id' },
      status: 'success',
      timestamp: new Date().toISOString(),
    });
  }),
];

export default checksHandlers;
