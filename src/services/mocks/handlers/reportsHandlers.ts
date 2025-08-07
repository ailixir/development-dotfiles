import { http, HttpResponse, delay } from 'msw';
import { mockReports, mockReportExecutions } from '../mockData/reportsData';

export const reportsHandlers = [
  // Get all reports
  http.get('/api/reports', async ({ request }) => {
    await delay(300);
    
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    let filteredReports = [...mockReports];

    if (status) {
      filteredReports = filteredReports.filter(report => report.status === status);
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedReports = filteredReports.slice(startIndex, endIndex);

    return HttpResponse.json({
      data: paginatedReports,
      total: filteredReports.length,
      page,
      limit,
      totalPages: Math.ceil(filteredReports.length / limit)
    });
  }),

  // Create new report
  http.post('/api/reports', async ({ request }) => {
    await delay(800);
    
    const newReportData = await request.json() as any;
    
    const newReport = {
      id: `report-${Date.now()}`,
      ...newReportData,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'current.user@citi.com'
    };
    
    mockReports.push(newReport);
    
    return HttpResponse.json(newReport, { status: 201 });
  }),

  // Update report
  http.put('/api/reports/:id', async ({ params, request }) => {
    await delay(500);
    
    const { id } = params;
    const updateData = await request.json() as any;
    
    const reportIndex = mockReports.findIndex(r => r.id === id);
    if (reportIndex === -1) {
      return new HttpResponse(null, { status: 404 });
    }
    
    mockReports[reportIndex] = {
      ...mockReports[reportIndex],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    
    return HttpResponse.json(mockReports[reportIndex]);
  }),

  // Generate report preview
  http.post('/api/reports/:id/preview', async ({ params }) => {
    await delay(1000);
    
    const { id } = params;
    const report = mockReports.find(r => r.id === id);
    
    if (!report) {
      return new HttpResponse(null, { status: 404 });
    }
    
    const mockPreview = `
Subject: ${report.name} - ${new Date().toLocaleDateString()}

----------------------------------------

Report Generated: ${new Date().toLocaleString()}
Status: PREVIEW MODE

Selected Checks Summary:
${report.selectedChecks.map(checkId => `• Check ${checkId}: PASSING`).join('\n')}

Overall System Health: GOOD
Total Checks: ${report.selectedChecks.length}
Passing: ${Math.floor(report.selectedChecks.length * 0.8)}
Warning: ${Math.floor(report.selectedChecks.length * 0.15)}
Failing: ${Math.floor(report.selectedChecks.length * 0.05)}

----------------------------------------
Generated with PUT Checks Platform
    `;
    
    return HttpResponse.json({
      preview: mockPreview,
      generatedAt: new Date().toISOString()
    });
  }),

  // Get report execution history
  http.get('/api/reports/:id/executions', async ({ params }) => {
    await delay(400);
    
    const executions = mockReportExecutions.filter(
      exec => exec.reportId === params.id
    );
    
    return HttpResponse.json({
      data: executions,
      total: executions.length
    });
  })
];