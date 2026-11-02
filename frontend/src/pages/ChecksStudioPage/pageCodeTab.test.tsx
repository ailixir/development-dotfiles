import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { http, HttpResponse } from 'msw';
import { studioMockServer } from '@/services/mocks/studio/server';
import { resetStudioMocks } from '@/services/mocks/studio/handlers';
import { fixtureDetail } from '@/services/mocks/studio/authoringState';
import { readyDraft, unlearnedDraft } from '@/services/mocks/studio/readinessFixtures';
import { STEP_CODE_COPY } from '@/components/studio/code';
import { renderStudioAt } from '@/test/renderStudioAt';
import { store } from '@/store';
import { fetchSources } from '@/store/slices/sourcesSlice';
import { fetchFeatures } from '@/store/slices/featuresSlice';
import type { TestDto } from '@/types/studio/studioTypes';
import ChecksStudioPage from './ChecksStudioPage';

const STUDIO_BASE = '*/api/v1/studio';
const API_BASE = '*/api/v1';

const StoreProvider = ({ children }: { children?: ReactNode }) => <Provider store={store}>{children}</Provider>;

function serve(test: TestDto) {
  studioMockServer.use(
    http.get(`${API_BASE}/checks/sources`, () => HttpResponse.json({ sources: [] })),
    http.get(`${API_BASE}/features`, () => HttpResponse.json({ sources: [], features: [] })),
    http.get(`${STUDIO_BASE}/tests`, () =>
      HttpResponse.json({ data: [test], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
    ),
    http.get(`${STUDIO_BASE}/tests/:id`, () => HttpResponse.json(fixtureDetail(test))),
  );
  return renderStudioAt(test.id, <ChecksStudioPage />, { wrapper: StoreProvider });
}

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
  studioMockServer.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  window.localStorage.clear();
  store.dispatch(
    fetchSources.fulfilled([{ type: 'UI_TEST', enabled: true, label: 'UI Test (Checks Studio)' }], 'test', undefined),
  );
  store.dispatch(
    fetchFeatures.fulfilled(
      { sources: [], features: [{ key: 'STUDIO', enabled: true, label: 'Checks Studio' }] },
      'test',
      undefined,
    ),
  );
});
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

describe('the Code tab', () => {
  it('follows Logs and shows the confirmed revision code per step for a READY test', async () => {
    serve(readyDraft);
    await screen.findByRole('button', { name: 'Run Test' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Proof', 'Logs', 'Code']);

    await userEvent.setup({ delay: null }).click(screen.getByRole('tab', { name: 'Code' }));
    const panel = screen.getByRole('tabpanel', { name: 'Code' });
    const blocks = within(panel).getAllByTestId('step-code-block');
    expect(blocks).toHaveLength(3);
    expect(within(blocks[0]).getByRole('heading', { name: 'Step 1' })).toBeInTheDocument();
    expect(within(blocks[0]).getByText('Go to "https://www.citi.com"')).toBeInTheDocument();
    expect(within(blocks[0]).getByTestId('step-code')).toHaveTextContent(
      'await page.goto(inputs["input-destination"]);',
    );
  }, 15000);

  it('says what to do when the test has no confirmed revision', async () => {
    serve(unlearnedDraft);
    await screen.findByRole('button', { name: 'Run Test' });
    await userEvent.setup({ delay: null }).click(screen.getByRole('tab', { name: 'Code' }));
    expect(within(screen.getByRole('tabpanel', { name: 'Code' })).getByTestId('step-code-empty')).toHaveTextContent(
      STEP_CODE_COPY.emptyOther,
    );
  }, 15000);
});
