import { store } from '@/store';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayoutProvider, useLayout } from './LayoutProvider';

const Mode = () => <span data-testid="mode">{useLayout().deploymentMode}</span>;

function modeAt(port: string, hostname: string, standaloneFlag?: boolean): string | null {
  vi.stubGlobal('location', { ...window.location, port, hostname });
  if (standaloneFlag !== undefined) window.__CHECKS_STANDALONE__ = standaloneFlag;
  render(
    <Provider store={store}>
      <MemoryRouter>
        <LayoutProvider>
          <Mode />
        </LayoutProvider>
      </MemoryRouter>
    </Provider>,
  );
  return screen.getByTestId('mode').textContent;
}

describe('LayoutProvider deployment mode', () => {
  afterEach(() => {
    delete window.__CHECKS_STANDALONE__;
    vi.unstubAllGlobals();
  });

  it('is standalone on any dev-server port once the Vite standalone entry marks it', () => {
    expect(modeAt('5181', 'localhost', true)).toBe('standalone');
  });

  it('is standalone when the entry marks it, even on the host port 3000', () => {
    expect(modeAt('3000', 'localhost', true)).toBe('standalone');
  });

  it('stays federated on port 3000 when no standalone entry ran', () => {
    expect(modeAt('3000', 'localhost')).toBe('federated');
  });

  it('stays federated on a localhost port other than 5173 when no standalone entry ran', () => {
    expect(modeAt('5181', 'localhost')).toBe('federated');
  });

  it('is standalone on the default Vite port when no standalone entry ran', () => {
    expect(modeAt('5173', 'localhost')).toBe('standalone');
  });

  it('is standalone on a non-localhost host when no standalone entry ran', () => {
    expect(modeAt('4177', '127.0.0.1')).toBe('standalone');
  });
});
