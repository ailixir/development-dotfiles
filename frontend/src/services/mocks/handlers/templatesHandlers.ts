import { http, HttpResponse, delay } from 'msw';
import { mockCheckTemplates } from '../mockData/templatesData';

export const templatesHandlers = [
  http.get('/api/check-templates', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const type = url.searchParams.get('type') || '';
    let results = [...mockCheckTemplates];
    if (q) {
      results = results.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    if (type) {
      results = results.filter((t) => t.type === type);
    }
    return HttpResponse.json({ data: results, total: results.length });
  }),
  http.get('/api/check-templates/:id', async ({ params }) => {
    await delay(150);
    const tpl = mockCheckTemplates.find((t) => t.id === params.id);
    if (!tpl) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(tpl);
  }),
];


