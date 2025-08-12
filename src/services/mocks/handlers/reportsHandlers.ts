import { http, HttpResponse, delay } from 'msw';
import { mockReports, mockReportExecutions } from '../mockData/reportsData';
import { mockChecks } from '../mockData/checksData';

export const reportsHandlers = [
  // Get all reports
  http.get('/api/reports', async ({ request }) => {
    await delay(300);
    
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    let filteredReports = [...mockReports];

    if (status) {
      filteredReports = filteredReports.filter(report => report.status === status);
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    if (url.searchParams.get('__empty') === '1') {
      filteredReports = [];
    }
    const paginatedReports = filteredReports.slice(startIndex, endIndex);

    return HttpResponse.json({
      data: paginatedReports,
      total: filteredReports.length,
      page,
      limit,
      totalPages: Math.ceil(filteredReports.length / limit)
    });
  }),

  // Pause report
  http.post('/api/reports/:id/pause', async ({ params }) => {
    await delay(200);
    const { id } = params;
    const idx = mockReports.findIndex((r) => r.id === id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    mockReports[idx].status = 'paused' as any;
    mockReports[idx].updatedAt = new Date().toISOString();
    return HttpResponse.json(mockReports[idx]);
  }),

  // Resume report
  http.post('/api/reports/:id/resume', async ({ params }) => {
    await delay(200);
    const { id } = params;
    const idx = mockReports.findIndex((r) => r.id === id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    mockReports[idx].status = 'active' as any;
    mockReports[idx].updatedAt = new Date().toISOString();
    return HttpResponse.json(mockReports[idx]);
  }),

  // Duplicate report
  http.post('/api/reports/:id/duplicate', async ({ params }) => {
    await delay(200);
    const { id } = params;
    const base = mockReports.find((r) => r.id === id);
    if (!base) return new HttpResponse(null, { status: 404 });
    const copy = { ...base, id: `report-${Date.now()}`, name: `${base.name} (Copy)`, status: 'draft' as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    mockReports.push(copy as any);
    return HttpResponse.json(copy);
  }),

  // Send test email (no-op)
  http.post('/api/reports/:id/send-test', async ({ params }) => {
    await delay(300);
    const { id } = params;
    const exists = mockReports.find((r) => r.id === id);
    if (!exists) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ ok: true, sentAt: new Date().toISOString() });
  }),
  // Get report by ID
  http.get('/api/reports/:id', async ({ params }) => {
    await delay(200);
    const { id } = params;
    const report = mockReports.find((r) => r.id === id);
    if (!report) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(report);
  }),

  // Create new report
  http.post('/api/reports', async ({ request }) => {
    await delay(800);
    
    const newReportData = await request.json() as any;
    // Normalize fields
    const selectedChecks: string[] = Array.isArray(newReportData.selectedChecks)
      ? newReportData.selectedChecks
      : Array.isArray(newReportData.checks)
        ? newReportData.checks
        : [];

    const newReport = {
      id: `report-${Date.now()}`,
      ...newReportData,
      selectedChecks,
      sections: Array.isArray((newReportData as any).sections) ? (newReportData as any).sections : undefined,
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
      ...(Array.isArray((updateData as any).sections) ? { sections: (updateData as any).sections } : {}),
      updatedAt: new Date().toISOString()
    };
    
    return HttpResponse.json(mockReports[reportIndex]);
  }),

  // Generate report preview
  http.post('/api/reports/:id/preview', async ({ params, request }) => {
    await delay(1000);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    
    const { id } = params;
    const report = mockReports.find(r => r.id === id);
    
    if (!report) {
      return new HttpResponse(null, { status: 404 });
    }
    // Resolve sections (grouped) or fallback to selectedChecks/legacy
    const sections: Array<{ title: string; checkIds: string[] }> = [];
    const rAny = report as any;
    if (Array.isArray(rAny.sections) && rAny.sections.length > 0) {
      for (const section of rAny.sections) {
        if (section.kind === 'manual') {
          sections.push({ title: section.title || 'Section', checkIds: Array.isArray(section.checkIds) ? section.checkIds : [] });
        } else if (section.kind === 'rule') {
          // Filter mockChecks by rule
          let list = [...mockChecks];
          const rule = section.rule || {};
          if (rule.csiIds && rule.csiIds.length) list = list.filter(c => rule.csiIds!.includes(c.csiId));
          if (rule.tags && rule.tags.length) list = list.filter(c => rule.tags!.some(t => c.tags.includes(t)));
          if (rule.types && rule.types.length) list = list.filter(c => rule.types!.includes(c.type as any));
          if (rule.status && rule.status.length) list = list.filter(c => rule.status!.includes(c.status as any));
          if (rule.timeframe) {
            const now = Date.now();
            const ms = rule.timeframe === '5m' ? 5*60*1000 : rule.timeframe === '15m' ? 15*60*1000 : rule.timeframe === '1h' ? 60*60*1000 : 24*60*60*1000;
            list = list.filter(c => {
              if (!c.lastExecution) return false;
              const dt = new Date(c.lastExecution).getTime();
              return (now - dt) <= ms && (c.status === 'FAILING' || c.status === 'WARNING' || c.status === 'PENDING');
            });
          }
          if (rule.sort === 'failing-first') {
            const order = { FAILING: 0, WARNING: 1, PENDING: 2, PASSING: 3, UNKNOWN: 4 } as Record<string, number>;
            list.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name));
          } else if (rule.sort === 'recently-failed') {
            const score = (c: typeof mockChecks[number]) => (c.status === 'FAILING' ? 2 : c.status === 'WARNING' ? 1 : 0);
            list.sort((a, b) => (score(b) - score(a)) || (new Date(b.lastExecution || 0).getTime() - new Date(a.lastExecution || 0).getTime()));
          } else if (rule.sort === 'alphabetical') {
            list.sort((a, b) => a.name.localeCompare(b.name));
          }
          const limited = typeof rule.limit === 'number' ? list.slice(0, Math.max(0, rule.limit)) : list;
          sections.push({ title: section.title || 'Section', checkIds: limited.map(c => c.id) });
        }
      }
    } else {
      const chosenChecks: string[] = Array.isArray(report.selectedChecks) && report.selectedChecks.length
        ? report.selectedChecks
        : Array.isArray((report as any).checks)
          ? (report as any).checks
          : [];
      sections.push({ title: 'Selected Checks', checkIds: chosenChecks });
    }

    const lines: string[] = [];
    lines.push(`Subject: ${report.name} - ${new Date().toLocaleDateString()}`);
    lines.push('');
    lines.push('-----------------------------------------------------');
    lines.push('');
    lines.push(`Report Generated: ${new Date().toLocaleString()}`);
    lines.push('Status: PREVIEW MODE');
    lines.push('');
    for (const s of sections) {
      lines.push(`# ${s.title}`);
      if (s.checkIds.length === 0) {
        lines.push('  (no checks match)');
      } else {
        for (const id of s.checkIds) {
          const check = mockChecks.find(c => c.id === id);
          if (!check) { lines.push(`• ${id}`); continue; }
          lines.push(`• ${check.name} (${check.csiName}) — ${check.status}`);
        }
      }
      lines.push('');
    }
    const total = sections.reduce((acc, s) => acc + s.checkIds.length, 0);
    lines.push('-----------------------------------------------------');
    lines.push(`Total Checks: ${total}`);
    lines.push('Generated with PUT Checks Platform');
    const mockPreview = lines.join('\n');
    
    return HttpResponse.json({
      preview: mockPreview,
      generatedAt: new Date().toISOString()
    });
  }),

  // Get report execution history
  http.get('/api/reports/:id/executions', async ({ params, request }) => {
    await delay(400);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    
    const executions = mockReportExecutions.filter(
      exec => exec.reportId === params.id
    );
    
    return HttpResponse.json({
      data: executions,
      total: executions.length
    });
  }),

  // Delete report
  http.delete('/api/reports/:id', async ({ params }) => {
    await delay(200);
    const { id } = params;
    const idx = mockReports.findIndex((r) => r.id === id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    mockReports.splice(idx, 1);
    return HttpResponse.json({ ok: true });
  })
];