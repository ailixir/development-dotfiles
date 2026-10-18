import { theme } from '@/theme';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, onTestFailed } from 'vitest';
import SplunkPrototypePage from './SplunkPrototypePage';

const renderPage = () =>
  render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MemoryRouter>
        <SplunkPrototypePage />
      </MemoryRouter>
    </ThemeProvider>,
  );

const goToConfig = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/Check name/i), 'CPU');
  await user.click(screen.getByRole('button', { name: /Next/i }));
};

// MUI + jsdom make each interaction slow; these flows chain several of them.
const SLOW = 20000;

describe('SplunkPrototypePage', () => {
  it('shows a single Splunk card and no separate Logs/Metrics types', () => {
    renderPage();
    expect(screen.getByText('Splunk')).toBeInTheDocument();
    expect(screen.getByText(/Run an SPL query against logs or metrics/i)).toBeInTheDocument();
    expect(screen.queryByText('Grafana')).not.toBeInTheDocument();
    expect(screen.queryByText('Splunk Logs')).not.toBeInTheDocument();
    expect(screen.queryByText('Splunk Metrics')).not.toBeInTheDocument();
  });

  it('never asks for an index or a time range — both are read from the query', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToConfig(user);

    await user.click(screen.getByRole('button', { name: /Metrics/i }));
    await user.click(screen.getByRole('button', { name: /CPU \+ memory by host/i }));

    expect(screen.queryByLabelText(/Index/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Time range/i)).not.toBeInTheDocument();
    expect(screen.getByText('index em_metrics')).toBeInTheDocument();
    expect(screen.getByText('last 15m')).toBeInTheDocument();
    expect(screen.getByText('grouped by host')).toBeInTheDocument();
  }, SLOW);

  it('builds the condition from the columns the query returns', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToConfig(user);

    await user.click(screen.getByRole('button', { name: /Metrics/i }));
    await user.click(screen.getByRole('button', { name: /CPU \+ memory by host/i }));
    expect(screen.getByText(/Thresholds are built from the table it returns/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Run query/i }));

    // Every metric the query returned is offered as a threshold, in the panel and in the table.
    expect(await screen.findByText('Threshold a metric:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add threshold on avg\(mem_pct\)/i })).toBeInTheDocument();
    expect(screen.getByText('prod-01')).toBeInTheDocument();
    expect(screen.getByText('93.4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'avg(cpu_pct)' }));
    expect(screen.getByText('PASS')).toBeInTheDocument();
    expect(
      screen.getByText('PASS if every row has avg(cpu_pct) < 100 over the last 15m'),
    ).toBeInTheDocument();

    // Tightening the threshold re-marks the table without re-running the query.
    const threshold = screen.getByLabelText(/Threshold for avg\(cpu_pct\)/i);
    await user.clear(threshold);
    await user.type(threshold, '90');

    expect(screen.getByText('FAIL')).toBeInTheDocument();
    expect(screen.getByText('Breaching: prod-01, prod-03.')).toBeInTheDocument();
    expect(screen.getAllByLabelText('row fail')).toHaveLength(2);
    expect(screen.getAllByLabelText('row pass')).toHaveLength(1);
  }, SLOW);

  it('lets the metric of an existing threshold be changed', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToConfig(user);

    await user.click(screen.getByRole('button', { name: /Metrics/i }));
    await user.click(screen.getByRole('button', { name: /CPU \+ memory by host/i }));
    await user.click(screen.getByRole('button', { name: /Run query/i }));
    await user.click(await screen.findByRole('button', { name: 'avg(cpu_pct)' }));

    const metric = screen.getByRole('combobox', { name: /Metric for condition 1/i });
    expect(metric).toHaveValue('avg(cpu_pct)');

    await user.click(metric);
    await user.click(await screen.findByRole('option', { name: 'avg(mem_pct)' }));

    // The threshold re-seeds to the new metric's range, so the number stays meaningful.
    expect(
      screen.getByText('PASS if every row has avg(mem_pct) < 75 over the last 15m'),
    ).toBeInTheDocument();
  }, SLOW);

  it('accepts a metric typed by hand', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToConfig(user);

    await user.click(screen.getByRole('button', { name: /Metrics/i }));
    await user.click(screen.getByRole('button', { name: /CPU \+ memory by host/i }));
    await user.click(screen.getByRole('button', { name: /Run query/i }));
    await user.click(await screen.findByRole('button', { name: 'avg(cpu_pct)' }));

    const metric = screen.getByRole('combobox', { name: /Metric for condition 1/i });
    await user.clear(metric);
    await user.type(metric, 'avg(disk_pct)');

    expect(
      screen.getByText('PASS if every row has avg(disk_pct) < 100 over the last 15m'),
    ).toBeInTheDocument();
    expect(screen.getByText(/avg\(disk_pct\) is no longer returned/i)).toBeInTheDocument();
  }, SLOW);

  it('combines thresholds across columns', async () => {
    const startedAt = performance.now();
    const stages: [number, number][] = [];
    const stage = (ordinal: number) => {
      if (stages.length < 10) stages.push([ordinal, Math.floor(performance.now() - startedAt)]);
    };
    onTestFailed(() => {
      console.info('OBS007_SPLUNK_COMBINE_STAGE', JSON.stringify(stages));
    });
    const user = userEvent.setup({ skipHover: true });
    renderPage();
    stage(1);
    await goToConfig(user);

    stage(2);
    await user.click(screen.getByRole('button', { name: /Metrics/i }));
    stage(3);
    await user.click(screen.getByRole('button', { name: /CPU \+ memory by host/i }));
    stage(4);
    await user.click(screen.getByRole('button', { name: /Run query/i }));

    stage(5);
    const cpuThreshold = await screen.findByRole('button', { name: /Add threshold on avg\(cpu_pct\)/i });
    stage(6);
    await user.click(cpuThreshold);
    stage(7);
    await user.click(screen.getByRole('button', { name: /Add threshold on avg\(mem_pct\)/i }));

    stage(8);
    expect(
      screen.getByText(
        'PASS if every row has avg(cpu_pct) < 100 and avg(mem_pct) < 75 over the last 15m',
      ),
    ).toBeInTheDocument();

    stage(9);
    await user.click(screen.getByRole('button', { name: /^and$/i }));
    stage(10);
    expect(
      screen.getByText(
        'PASS if every row has avg(cpu_pct) < 100 or avg(mem_pct) < 75 over the last 15m',
      ),
    ).toBeInTheDocument();
  }, SLOW);

  it('evaluates the row count when the same flow runs in Logs mode', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToConfig(user);

    await user.click(screen.getByRole('button', { name: /Logs/i }));
    await user.click(screen.getByRole('button', { name: /Heartbeat present/i }));
    await user.click(screen.getByRole('button', { name: /Run query/i }));

    expect(await screen.findByText('PASS')).toBeInTheDocument();
    expect(screen.getByText('PASS if row count > 0 over the last 15m')).toBeInTheDocument();
    expect(screen.getByText('12 rows returned.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Expected count/i)).toBeInTheDocument();
  }, SLOW);
});
