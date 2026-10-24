import { http, HttpResponse } from 'msw';
import { DEMO_CSIS } from '@services/mocks/studio/demoFixtures';
import { MOCK_READABLE_CSIS } from '@services/mocks/studio/fixtures';
import type { FeaturesResponse } from '@/services/api/featuresApi';
import type { CheckSourcesResponse } from '@/services/api/sourcesApi';
import type { CSI } from '@/types/csi/csiTypes';

/** Node-MSW preview data only; no production permissions or browser-worker handlers. */
const sources: CheckSourcesResponse = {
  sources: [{ type: 'UI_TEST', enabled: true, label: 'UI Test (Checks Studio)' }],
};
const features: FeaturesResponse = {
  sources: sources.sources,
  features: [{ key: 'STUDIO', enabled: true, label: 'Checks Studio' }],
};

const demoCsis: CSI[] = DEMO_CSIS.map((id) => ({
  id,
  name: `Studio demo system ${id}`,
  description: 'Synthetic system for the local Studio preview.',
  businessUnit: 'Studio preview',
  criticality: 'MEDIUM',
  owner: 'studio-preview@example.test',
  tags: [],
  environment: 'Development',
  status: 'OPERATIONAL',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
}));

/** Exact GET routes supplement each scenario; everything else retains the proxy's 502 refusal. */
export const previewBootstrapHandlers = [
  http.get('*/api/v1/checks/sources', () => HttpResponse.json(sources)),
  http.get('*/api/v1/features', () => HttpResponse.json(features)),
  http.get('*/api/v1/csi', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0);
    const size = Math.min(100, Math.max(1, Number.parseInt(params.get('size') ?? '20', 10) || 20));
    const search = (params.get('search') ?? '').trim().toLowerCase();
    const readable = demoCsis.filter((csi) =>
      MOCK_READABLE_CSIS.includes(csi.id)
      && `${csi.id} ${csi.name}`.toLowerCase().includes(search),
    );
    return HttpResponse.json({
      data: readable.slice(page * size, (page + 1) * size),
      page,
      size,
      totalElements: readable.length,
      totalPages: Math.ceil(readable.length / size),
    });
  }),
];
