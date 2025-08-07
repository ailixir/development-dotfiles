import { http, HttpResponse } from 'msw';
import { API_ENDPOINTS } from '@/utils/constants';

export const studioHandlers = [
  http.get(`*${API_ENDPOINTS.studio}`, () => {
    return HttpResponse.json({
      data: [],
      status: 'success',
      timestamp: new Date().toISOString(),
    });
  }),
];

export default studioHandlers;
