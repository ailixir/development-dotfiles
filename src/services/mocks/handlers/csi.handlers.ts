import { http, HttpResponse } from 'msw';
import { API_ENDPOINTS } from '@/utils/constants';

// Basic placeholder handlers for CSI
export const csiHandlers = [
  // Get all CSIs
  http.get(`*${API_ENDPOINTS.csi}`, () => {
    return HttpResponse.json({
      data: [],
      status: 'success',
      timestamp: new Date().toISOString(),
    });
  }),
];

export default csiHandlers;
