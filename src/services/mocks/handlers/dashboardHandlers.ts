import { http, HttpResponse, delay } from 'msw';
import { mockChecks } from '../mockData/checksData';
import { mockReports } from '../mockData/reportsData';
import { mockCSIs } from '../mockData/csiData';

export const dashboardHandlers = [
  // Summary
  http.get('/api/dashboard/summary', async ({ request }) => {
    // Allow runtime scenario tuning via query params
    // __slow=ms to add latency; __fail=CODE to return error; __empty=1 to return empty summary
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });

    if (url.searchParams.get('__empty') === '1') {
      return HttpResponse.json({
        overallStatus: 'HEALTHY',
        counts: { passing: 0, failing: 0, warning: 0, muted: 0 },
        lastUpdated: new Date().toISOString(),
      });
    }
    const csiIdFilter = url.searchParams.get('csiId') || '';
    const inScope = (c: any) => (!csiIdFilter || c.csiId === csiIdFilter);
    const passing = mockChecks.filter((c) => inScope(c) && c.status === 'PASSING').length;
    const failing = mockChecks.filter((c) => inScope(c) && c.status === 'FAILING').length;
    const warning = mockChecks.filter((c) => inScope(c) && c.status === 'WARNING').length;
    const muted = mockChecks.filter((c) => inScope(c) && c.tags.includes('muted')).length;
    const overallStatus = failing > 0 ? 'CRITICAL' : warning > 0 ? 'WARNING' : 'HEALTHY';
    return HttpResponse.json({
      overallStatus,
      counts: { passing, failing, warning, muted },
      lastUpdated: new Date().toISOString(),
    });
  }),

  // Attention list
  http.get('/api/dashboard/attention', async ({ request }) => {
    await delay(250);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const csiIdFilter = url.searchParams.get('csiId') || '';
    let items = mockChecks
      .filter((c) => c.status === 'FAILING' || c.status === 'WARNING')
      .filter((c) => !csiIdFilter || c.csiId === csiIdFilter)
      .slice(0, limit)
      .map((c) => ({
        id: c.id,
        name: c.name,
        csiId: c.csiId,
        csiName: (mockCSIs.find((x) => x.id === c.csiId)?.name) || c.csiName,
        status: c.status as 'FAILING' | 'WARNING',
        since: c.lastExecution || new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        reason: c.description || 'Threshold exceeded',
      }));
    if (url.searchParams.get('__empty') === '1') items = [];
    return HttpResponse.json({ data: items });
  }),

  // Activity timeline
  http.get('/api/dashboard/activity', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const hours = parseInt(url.searchParams.get('hours') || '24');
    const csiIdFilter = url.searchParams.get('csiId') || '';
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    let events = [] as any[];
    mockChecks
      .filter((c) => !csiIdFilter || c.csiId === csiIdFilter)
      .slice(0, 8)
      .forEach((c, i) => {
      const t = new Date(cutoff + i * 60 * 60 * 1000).toISOString();
      events.push({
        id: `evt-${c.id}`,
        type: c.status === 'FAILING' ? 'FAIL' : 'RECOVER',
        title: c.status === 'FAILING' ? 'Check Failed' : 'Recovered',
        description: c.name,
        csiName: c.csiName,
        timestamp: t,
      });
    });
    // add a report-sent
    mockReports.slice(0, 1).forEach((r) => {
      events.push({
        id: `evt-report-${r.id}`,
        type: 'REPORT_SENT',
        title: 'Report sent',
        description: r.name,
        timestamp: new Date().toISOString(),
      });
    });
    if (url.searchParams.get('__empty') === '1') events = [];
    return HttpResponse.json({ data: events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)) });
  }),

  // Upcoming schedules (reuse checks nextExecution)
  http.get('/api/dashboard/upcoming', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const csiIdFilter = url.searchParams.get('csiId') || '';
    let items = mockChecks
      .filter((c) => c.schedule.enabled && c.nextExecution)
      .filter((c) => !csiIdFilter || c.csiId === csiIdFilter)
      .sort((a, b) => new Date(a.nextExecution!).getTime() - new Date(b.nextExecution!).getTime())
      .slice(0, limit)
      .map((c) => ({
        checkId: c.id,
        checkName: c.name,
        nextExecution: c.nextExecution!,
        csiName: c.csiName,
      }));
    if (url.searchParams.get('__empty') === '1') items = [];
    return HttpResponse.json({ data: items });
  }),

  // Reports snapshot
  http.get('/api/dashboard/reports/snapshot', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const limit = parseInt(url.searchParams.get('limit') || '5');
    const csiIdFilter = url.searchParams.get('csiId') || '';
    let items = mockReports
      .filter((r) => {
        if (!csiIdFilter) return true;
        // heuristics: include reports referencing checks for that CSI
        return r.selectedChecks.some((id) => {
          const chk = mockChecks.find((c) => c.id === id);
          return chk && chk.csiId === csiIdFilter;
        });
      })
      .slice(0, limit)
      .map((r) => ({
      id: r.id,
      name: r.name,
      nextScheduledAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      lastStatus: Math.random() > 0.1 ? 'SUCCESS' : 'FAILURE',
    }));
    if (url.searchParams.get('__empty') === '1') items = [];
    return HttpResponse.json({ data: items });
  }),

  // Search across CSIs, checks, and reports
  http.get('/api/dashboard/search', async ({ request }) => {
    await delay(150);
    const url = new URL(request.url);
    const slow = parseInt(url.searchParams.get('__slow') || '0');
    if (slow > 0) await delay(slow);
    const fail = url.searchParams.get('__fail');
    if (fail) return new HttpResponse(null, { status: parseInt(fail) || 500 });
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const csiId = url.searchParams.get('csiId') || '';
    const environment = url.searchParams.get('environment') || '';
    const tags = url.searchParams.getAll('tags');
    const tagMode = (url.searchParams.get('tagMode') || 'AND').toUpperCase();
    let csiNameFromId: string | undefined;
    if (csiId) {
      const csi = mockCSIs.find((c) => c.id === csiId);
      if (csi) csiNameFromId = csi.name;
    }
    if (!q) return HttpResponse.json({ data: [] });
    const results: any[] = [];
    mockCSIs.forEach((csi) => {
      if (csi.name.toLowerCase().includes(q) || csi.id.toLowerCase().includes(q)) {
        results.push({ id: csi.id, type: 'CSI', title: csi.name, subtitle: csi.id, path: `/` });
      }
    });
    mockChecks.forEach((c) => {
      // CSI scope
      const inScopeCsi = !csiId || c.csiId === csiId || (csiNameFromId && c.csiName === csiNameFromId);
      // Environment scope: prefer check.environment; fallback to CSI.environment when check env missing
      let inScopeEnv = true;
      if (environment) {
        const csi = mockCSIs.find((x) => x.id === c.csiId);
        const envCandidate = c.environment || csi?.environment || '';
        inScopeEnv = envCandidate.toLowerCase().startsWith(environment.toLowerCase());
      }
      // Tags scope
      let inScopeTags = true;
      if (tags && tags.length) {
        if (tagMode === 'OR') {
          inScopeTags = tags.some((t) => c.tags.includes(t));
        } else {
          inScopeTags = tags.every((t) => c.tags.includes(t));
        }
      }
      if (c.name.toLowerCase().includes(q) && inScopeCsi && inScopeEnv && inScopeTags) {
        results.push({ id: c.id, type: 'CHECK', title: c.name, subtitle: c.csiName, path: `/checks/details/${c.id}` });
      }
    });
    mockReports.forEach((r) => {
      if (r.name.toLowerCase().includes(q)) {
        results.push({ id: r.id, type: 'REPORT', title: r.name, path: `/checks/reports/${r.id}` });
      }
    });
    return HttpResponse.json({ data: results.slice(0, 15) });
  }),

  // Acknowledge and assign actions
  http.post('/api/dashboard/attention/:id/acknowledge', async ({ params }) => {
    await delay(120);
    const { id } = params;
    return HttpResponse.json({ id, acknowledgedAt: new Date().toISOString() });
  }),

  http.post('/api/dashboard/attention/:id/assign', async ({ params, request }) => {
    await delay(120);
    const { id } = params;
    const body = (await request.json()) as any;
    return HttpResponse.json({ id, userId: body.userId });
  }),
];


