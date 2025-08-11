import { http, HttpResponse, delay } from 'msw';
import { mockCSIs, mockUsers } from '../mockData/csiData';
import { mockChecks } from '../mockData/checksData';

export const csiHandlers = [
  // Get all CSIs with optional filtering
  http.get('/api/csi', async ({ request }) => {
    await delay(400);
    
    const url = new URL(request.url);
    const searchQuery = url.searchParams.get('search');
    const businessUnit = url.searchParams.get('businessUnit');
    const environment = url.searchParams.get('environment');
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    let filteredCSIs = [...mockCSIs];

    // Apply filters
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredCSIs = filteredCSIs.filter(csi =>
        csi.name.toLowerCase().includes(query) ||
        csi.description.toLowerCase().includes(query) ||
        csi.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    if (businessUnit) {
      filteredCSIs = filteredCSIs.filter(csi => csi.businessUnit === businessUnit);
    }

    if (environment) {
      filteredCSIs = filteredCSIs.filter(csi => csi.environment === environment);
    }

    if (status) {
      filteredCSIs = filteredCSIs.filter(csi => csi.status === status);
    }

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedCSIs = filteredCSIs.slice(startIndex, endIndex);

    return HttpResponse.json({
      data: paginatedCSIs,
      total: filteredCSIs.length,
      page,
      limit,
      totalPages: Math.ceil(filteredCSIs.length / limit)
    });
  }),

  // Search CSIs with autocomplete (place BEFORE /api/csi/:id to avoid route shadowing)
  http.get('/api/csi/search', async ({ request }) => {
    await delay(200);
    
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    if (!query || query.length < 2) {
      return HttpResponse.json([]);
    }
    
    const searchTerm = query.toLowerCase();
    // Build unique CSIs from checks dataset first (ensures selections map to checks results)
    const uniqueFromChecks: Record<string, { id: string; name: string }> = {};
    mockChecks.forEach((ch) => {
      if (!uniqueFromChecks[ch.csiId]) {
        uniqueFromChecks[ch.csiId] = { id: ch.csiId, name: ch.csiName };
      }
    });
    const checksList = Object.values(uniqueFromChecks)
      .filter((i) => i.name.toLowerCase().includes(searchTerm) || i.id.toLowerCase().includes(searchTerm));

    // Fill with directory CSIs not already included
    const seenNames = new Set(checksList.map((i) => i.name));
    const directoryList = mockCSIs
      .filter(
        (csi) =>
          (csi.name.toLowerCase().includes(searchTerm) || csi.id.toLowerCase().includes(searchTerm)) &&
          !seenNames.has(csi.name)
      )
      .map((csi) => ({ id: csi.id, name: csi.name }));

    const combined = [...checksList, ...directoryList].slice(0, limit);
    return HttpResponse.json(combined);
  }),

  // Get single CSI by ID
  http.get('/api/csi/:id', async ({ params }) => {
    await delay(300);
    
    const { id } = params;
    const csi = mockCSIs.find(c => c.id === id);
    
    if (!csi) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'CSI not found'
      });
    }
    
    return HttpResponse.json(csi);
  }),

  // Get CSI applications
  http.get('/api/csi/:id/applications', async ({ params }) => {
    await delay(200);
    
    const { id } = params;
    const csi = mockCSIs.find(c => c.id === id);
    
    if (!csi) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'CSI not found'
      });
    }
    
    return HttpResponse.json(csi.applications);
  }),

  // Get business units (for filtering)
  http.get('/api/csi/business-units', async () => {
    await delay(200);
    
    const businessUnits = [...new Set(mockCSIs.map(csi => csi.businessUnit))];
    
    return HttpResponse.json(businessUnits);
  }),

  // Get user permissions
  http.get('/api/csi/user-permissions', async () => {
    await delay(300);
    
    // Simulate getting current user's permissions
    const currentUser = mockUsers[1]; // Priya Sharma for demo
    
    return HttpResponse.json({
      user: currentUser,
      allowedCSIs: currentUser.permissions,
      role: currentUser.role
    });
  }),

  

  // Get CSI health summary
  http.get('/api/csi/:id/health', async ({ params }) => {
    await delay(500);
    
    const { id } = params;
    const csi = mockCSIs.find(c => c.id === id);
    
    if (!csi) {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'CSI not found'
      });
    }
    
    // Generate mock health data
    const totalChecks = Math.floor(Math.random() * 20) + 5;
    const passingChecks = Math.floor(totalChecks * (0.7 + Math.random() * 0.2));
    const failingChecks = Math.floor((totalChecks - passingChecks) * 0.6);
    const warningChecks = totalChecks - passingChecks - failingChecks;
    
    const healthSummary = {
      csiId: id,
      totalChecks,
      passingChecks,
      failingChecks,
      warningChecks,
      overallStatus: failingChecks > 0 ? 'CRITICAL' : 
                    warningChecks > 0 ? 'WARNING' : 'HEALTHY',
      lastUpdated: new Date().toISOString(),
      applications: csi.applications.map(app => ({
        ...app,
        checkCount: Math.floor(Math.random() * 5) + 1,
        healthStatus: Math.random() > 0.8 ? 'WARNING' : 'HEALTHY'
      }))
    };
    
    return HttpResponse.json(healthSummary);
  })
];