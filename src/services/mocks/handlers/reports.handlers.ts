import { http, HttpResponse } from 'msw';
import { API_ENDPOINTS } from '@/utils/constants';

export const reportsHandlers = [
  http.get(`*${API_ENDPOINTS.reports}`, () => {
    return HttpResponse.json({
      data: [],
      status: 'success',
      timestamp: new Date().toISOString(),
    });
  }),
];

export default reportsHandlers;
