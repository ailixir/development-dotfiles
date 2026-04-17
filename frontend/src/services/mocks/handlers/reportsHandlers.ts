import { http, HttpResponse, delay } from 'msw';
import { mockReports, mockReportExecutions } from '../mockData/reportsData';
import { mockChecks, mockExecutionResults } from '../mockData/checksData';

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
  http.post('/api/reports/:id/pause', async ({ params, request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const idx = mockReports.findIndex((r) => r.id === id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    mockReports[idx].status = 'paused' as any;
    mockReports[idx].updatedAt = new Date().toISOString();
    return HttpResponse.json(mockReports[idx]);
  }),

  // Resume report
  http.post('/api/reports/:id/resume', async ({ params, request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const idx = mockReports.findIndex((r) => r.id === id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    mockReports[idx].status = 'active' as any;
    mockReports[idx].updatedAt = new Date().toISOString();
    return HttpResponse.json(mockReports[idx]);
  }),

  // Duplicate report
  http.post('/api/reports/:id/duplicate', async ({ params, request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const base = mockReports.find((r) => r.id === id);
    if (!base) return new HttpResponse(null, { status: 404 });
    const copy = { ...base, id: `report-${Date.now()}`, name: `${base.name} (Copy)`, status: 'draft' as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    mockReports.push(copy as any);
    return HttpResponse.json(copy);
  }),

  // Send test email (no-op)
  http.post('/api/reports/:id/send-test', async ({ params, request }) => {
    await delay(300);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const exists = mockReports.find((r) => r.id === id);
    if (!exists) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ ok: true, sentAt: new Date().toISOString() });
  }),
  // Get report by ID
  http.get('/api/reports/:id', async ({ params, request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const report = mockReports.find((r) => r.id === id);
    if (!report) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(report);
  }),

  // Create new report
  http.post('/api/reports', async ({ request }) => {
    await delay(800);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    
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
      status: 'paused',
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
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    
    const { id } = params;
    const updateData = await request.json() as any;
    
    const reportIndex = mockReports.findIndex(r => r.id === id);
    if (reportIndex === -1) {
      // Seamless upsert: if not found (e.g., mock data reset) create it on-the-fly
      const created = {
        id: id as string,
        ...updateData,
        status: (updateData as any)?.status || 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'current.user@citi.com'
      };
      mockReports.push(created as any);
      return HttpResponse.json(created);
    }
    
    mockReports[reportIndex] = {
      ...mockReports[reportIndex],
      ...updateData,
      ...(Array.isArray((updateData as any).sections) ? { sections: (updateData as any).sections } : {}),
      ...(updateData.schedule ? { schedule: { ...mockReports[reportIndex].schedule, ...updateData.schedule } } : {}),
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
          if (rule.tags && rule.tags.length) list = list.filter(c => rule.tags!.some((t: string) => c.tags.includes(t)));
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

    // Build a richer preview inspired by PRD
    const lines: string[] = [];
    const subject = (report as any).subject || report.name;
    const now = new Date();
    lines.push(`Subject: Checks Report: ${subject}`);
    lines.push('');
    lines.push('-----------------------------------------------------');
    lines.push('');
    lines.push(`Report for: ${now.toLocaleString()}`);

    // Compute overall status (warning if any failing/warning)
    const allCheckIds = sections.flatMap(s => s.checkIds);
    const allChecks = allCheckIds.map(id => mockChecks.find(c => c.id === id)).filter(Boolean) as typeof mockChecks[number][];
    const hasFailing = allChecks.some(c => c.status === 'FAILING');
    const hasWarning = allChecks.some(c => c.status === 'WARNING');
    const overall = hasFailing ? 'FAILING' : hasWarning ? 'WARNING' : (allChecks.length ? 'PASSING' : 'UNKNOWN');
    lines.push(`Overall Status: ${overall}`);
    lines.push('');

    if (report.schedule) {
      const sched = report.schedule as any;
      lines.push(`Schedule: ${sched.frequency}${sched.time ? ` at ${sched.time}` : ''}${sched.cron ? ` (cron: ${sched.cron})` : ''}${sched.timezone ? ` ${sched.timezone}` : ''}`);
      lines.push('');
    }

    for (const s of sections) {
      lines.push(`# ${s.title}`);
      if (s.checkIds.length === 0) {
        lines.push('  (no checks match)');
      } else {
        for (const id of s.checkIds) {
          const check = mockChecks.find(c => c.id === id);
          if (!check) { lines.push(`- Check: ${id}`); continue; }
          // Compute since-last-execution duration in a human way
          let since = '';
          if (check.lastExecution) {
            const ms = now.getTime() - new Date(check.lastExecution).getTime();
            const mins = Math.max(0, Math.round(ms / 60000));
            if (mins < 60) since = `${mins} minutes`;
            else {
              const hours = Math.round(mins / 60);
              since = `${hours} hours`;
            }
          }
          lines.push(`- Check: ${check.name} (CSI: ${check.csiId})`);
          lines.push(`  Status: ${check.status}${since ? ` (for ${since})` : ''}`);

          // Include recent error/details if available from mockExecutionResults
          const lastExec = [...mockExecutionResults]
            .filter(r => r.checkId === check.id)
            .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())[0];
          if (lastExec && (check.status === 'FAILING' || lastExec.status === 'FAILURE')) {
            const err = lastExec.error || lastExec.output?.slice(0, 180) || 'Failure reported';
            lines.push(`  Error: ${err}`);
          }
          // Deep link to investigate
          lines.push(`  [Investigate in Checks] → /checks/details/${check.id}`);
          lines.push('');
        }
      }
      lines.push('');
    }
    const total = sections.reduce((acc, s) => acc + s.checkIds.length, 0);
    lines.push('-----------------------------------------------------');
    lines.push(`Total Checks: ${total}`);
    lines.push('Generated with PUT Checks');
    const mockPreview = lines.join('\n');

    // Build HTML email (simple, professional, email-safe)
    const statusColor = overall === 'FAILING' ? '#D32F2F' : overall === 'WARNING' ? '#ED6C02' : overall === 'PASSING' ? '#2E7D32' : '#616161';
    const sectionHtml = sections.map((s) => {
      const items = s.checkIds.map((id) => {
        const check = mockChecks.find(c => c.id === id);
        if (!check) return '';
        const chipColor = check.status === 'FAILING' ? '#D32F2F' : check.status === 'WARNING' ? '#ED6C02' : check.status === 'PASSING' ? '#2E7D32' : '#616161';
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${check.name}<div style="color:#757575;font-size:12px;">${check.csiName}</div></td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;"><span style="display:inline-block;padding:4px 8px;border-radius:16px;background:${chipColor};color:#fff;font-size:12px;">${check.status}</span></td>
        </tr>`;
      }).join('');
      return `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;">
          <thead>
            <tr>
              <th colspan="2" style="text-align:left;padding:8px 12px;background:#F5F7FA;color:#374151;border:1px solid #eee;border-bottom:none;font-size:14px;">${s.title}</th>
            </tr>
          </thead>
          <tbody>
            ${items || `<tr><td style="padding:12px;color:#757575;border:1px solid #eee;border-top:none;" colspan="2">No checks match</td></tr>`}
          </tbody>
        </table>`;
    }).join('');

    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head>
    <body style="margin:0;padding:0;background:#F3F4F6;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F3F4F6;padding:20px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #E5E7EB;background:#0F172A;color:#ffffff;">
                  <div style="font-size:16px;font-weight:700;">Checks Report</div>
                  <div style="font-size:12px;opacity:0.85;">${now.toLocaleString()}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <div style="font-size:18px;color:#111827;font-weight:700;margin-bottom:4px;">${subject}</div>
                  <div style="font-size:13px;color:#6B7280;margin-bottom:12px;">Overall Status: <span style="color:${statusColor};font-weight:700;">${overall}</span></div>
                  <div style="font-size:12px;color:#6B7280;margin-bottom:12px;">Schedule: ${report?.schedule?.frequency || 'n/a'}${report?.schedule?.time ? ` at ${report?.schedule?.time}` : ''}${(report as any)?.schedule?.timezone ? ` ${(report as any).schedule.timezone}` : ''}</div>
                  ${sectionHtml}
                  <div style="border-top:1px solid #E5E7EB;margin-top:12px;padding-top:12px;font-size:12px;color:#6B7280;">Total Checks: ${total}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 20px;background:#F9FAFB;border-top:1px solid #E5E7EB;color:#6B7280;font-size:11px;">
                  Generated by PUT Checks
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
    
    return HttpResponse.json({
      preview: mockPreview,
      html,
      generatedAt: new Date().toISOString()
    });
  }),

  // Send report now (simulate immediate send/execution)
  http.post('/api/reports/:id/run-now', async ({ params, request }) => {
    await delay(800);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const report = mockReports.find(r => r.id === id);
    if (!report) return new HttpResponse(null, { status: 404 });
    // simulate generation outcome based on included checks and return email-like execution record
    const anySections = Array.isArray((report as any).sections) && (report as any).sections.length > 0;
    const chosenIds = anySections
      ? (report as any).sections.flatMap((s: any) => s.kind === 'manual' ? (s.checkIds || []) : mockChecks.slice(0, (s.rule?.limit || 5)).map(c => c.id))
      : (report.selectedChecks || []);
    const included = chosenIds.length || Math.floor(Math.random() * 5) + 1;
    const failures = Math.max(0, Math.floor(included * 0.2));
    // Build HTML similar to preview endpoint
    const rAny = report as any;
    const sections: Array<{ title: string; checkIds: string[] }> = [];
    if (Array.isArray(rAny.sections) && rAny.sections.length > 0) {
      for (const section of rAny.sections) {
        if (section.kind === 'manual') {
          sections.push({ title: section.title || 'Section', checkIds: Array.isArray(section.checkIds) ? section.checkIds : [] });
        } else if (section.kind === 'rule') {
          let list = [...mockChecks];
          const rule = section.rule || {};
          if (rule.csiIds && rule.csiIds.length) list = list.filter(c => rule.csiIds!.includes(c.csiId));
          if (rule.tags && rule.tags.length) list = list.filter(c => rule.tags!.some((t: string) => c.tags.includes(t)));
          if (rule.types && rule.types.length) list = list.filter(c => rule.types!.includes(c.type as any));
          if (rule.status && rule.status.length) list = list.filter(c => rule.status!.includes(c.status as any));
          if (rule.timeframe) {
            const nowT = Date.now();
            const ms = rule.timeframe === '5m' ? 5*60*1000 : rule.timeframe === '15m' ? 15*60*1000 : rule.timeframe === '1h' ? 60*60*1000 : 24*60*60*1000;
            list = list.filter(c => {
              if (!c.lastExecution) return false;
              const dt = new Date(c.lastExecution).getTime();
              return (nowT - dt) <= ms && (c.status === 'FAILING' || c.status === 'WARNING' || c.status === 'PENDING');
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
      sections.push({ title: 'Selected Checks', checkIds: chosenIds });
    }

    const now = new Date();
    const allCheckIds = sections.flatMap(s => s.checkIds);
    const allChecks = allCheckIds.map(id => mockChecks.find(c => c.id === id)).filter(Boolean) as typeof mockChecks[number][];
    const hasFailing = allChecks.some(c => c.status === 'FAILING');
    const hasWarning = allChecks.some(c => c.status === 'WARNING');
    const overall = hasFailing ? 'FAILING' : hasWarning ? 'WARNING' : (allChecks.length ? 'PASSING' : 'UNKNOWN');
    const statusColor = overall === 'FAILING' ? '#D32F2F' : overall === 'WARNING' ? '#ED6C02' : overall === 'PASSING' ? '#2E7D32' : '#616161';
    const sectionHtml = sections.map((s) => {
      const items = s.checkIds.map((id) => {
        const check = mockChecks.find(c => c.id === id);
        if (!check) return '';
        const chipColor = check.status === 'FAILING' ? '#D32F2F' : check.status === 'WARNING' ? '#ED6C02' : check.status === 'PASSING' ? '#2E7D32' : '#616161';
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;">${check.name}<div style="color:#757575;font-size:12px;">${check.csiName}</div></td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;"><span style="display:inline-block;padding:4px 8px;border-radius:16px;background:${chipColor};color:#fff;font-size:12px;">${check.status}</span></td>
        </tr>`;
      }).join('');
      return `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;">
          <thead>
            <tr>
              <th colspan="2" style="text-align:left;padding:8px 12px;background:#F5F7FA;color:#374151;border:1px solid #eee;border-bottom:none;font-size:14px;">${s.title}</th>
            </tr>
          </thead>
          <tbody>
            ${items || `<tr><td style="padding:12px;color:#757575;border:1px solid #eee;border-top:none;" colspan="2">No checks match</td></tr>`}
          </tbody>
        </table>`;
    }).join('');
    const subject = (report as any).subject || report.name;
    const totalChecks = sections.reduce((acc, s) => acc + s.checkIds.length, 0);
    const emailHtml = `<!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head>
    <body style="margin:0;padding:0;background:#F3F4F6;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F3F4F6;padding:20px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #E5E7EB;background:#0F172A;color:#ffffff;">
                  <div style="font-size:16px;font-weight:700;">Checks Report</div>
                  <div style="font-size:12px;opacity:0.85;">${now.toLocaleString()}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <div style="font-size:18px;color:#111827;font-weight:700;margin-bottom:4px;">${subject}</div>
                  <div style="font-size:13px;color:#6B7280;margin-bottom:12px;">Overall Status: <span style="color:${statusColor};font-weight:700;">${overall}</span></div>
                  <div style="font-size:12px;color:#6B7280;margin-bottom:12px;">Schedule: ${report?.schedule?.frequency || 'n/a'}${report?.schedule?.time ? ` at ${report?.schedule?.time}` : ''}${(report as any)?.schedule?.timezone ? ` ${(report as any).schedule.timezone}` : ''}</div>
                  ${sectionHtml}
                  <div style="border-top:1px solid #E5E7EB;margin-top:12px;padding-top:12px;font-size:12px;color:#6B7280;">Total Checks: ${totalChecks}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 20px;background:#F9FAFB;border-top:1px solid #E5E7EB;color:#6B7280;font-size:11px;">
                  Generated by PUT Checks
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;

    const exec = {
      id: `exec-${Date.now()}`,
      reportId: id as string,
      executionTime: new Date().toISOString(),
      status: failures === 0 ? 'success' : failures < included ? 'partial' : 'failed',
      recipientCount: (report.recipients || []).length,
      checksIncluded: included,
      checksFailures: failures,
      generationDuration: Math.floor(Math.random() * 1500) + 500,
      emailContent: emailHtml,
    };
    mockReportExecutions.unshift(exec as any);
    report.updatedAt = new Date().toISOString();
    (report as any).lastSent = exec.executionTime;
    return HttpResponse.json({ ok: true, execution: exec, report });
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
  http.delete('/api/reports/:id', async ({ params, request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const { id } = params;
    const idx = mockReports.findIndex((r) => r.id === id);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    mockReports.splice(idx, 1);
    return HttpResponse.json({ ok: true });
  })
];