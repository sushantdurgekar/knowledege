import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { catalogFetch, rawCatalog } from './fixtures';

/** Shows the router's current search string so tests can assert URL state. */
function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="location" hidden>{pathname + search}</div>;
}

function renderAt(path: string) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]} useTransitions={false}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { user, ...view };
}

const location = () => screen.getByTestId('location').textContent;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(catalogFetch()));
});

describe('layout', () => {
  it('has the header, main and footer landmarks with the expected links', async () => {
    renderAt('/privacy');
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('link', { name: 'Study Hubs' })).toHaveAttribute('href', '/');
    expect(within(banner).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
    expect(screen.getByRole('main')).toBeInTheDocument();
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(footer).toHaveTextContent('Progress is saved in this browser');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  });

  it('moves focus to the main landmark after client-side navigation', async () => {
    const { user } = renderAt('/privacy');
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Accounts are coming soon' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
    expect(document.title).toBe('Sign in · Study Hubs');
  });
});

describe('routes', () => {
  it('shows NotFound for an unknown path', () => {
    renderAt('/no/such/page');
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText('/no/such/page', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse all hubs' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('Page not found · Study Hubs');
  });

  it.each(['/signin', '/signup', '/reset', '/verify', '/signout', '/account', '/admin', '/admin/backup'])(
    'shows the accounts placeholder at %s',
    (path) => {
      renderAt(path);
      expect(screen.getByRole('heading', { level: 1, name: 'Accounts are coming soon' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Browse all hubs' })).toHaveAttribute('href', '/');
    },
  );

  it('offers a way back to the hub only for a safe ?next= hub path', () => {
    const { unmount } = renderAt('/signin?next=/h/ai-103');
    expect(screen.getByRole('link', { name: 'Back to the hub' })).toHaveAttribute('href', '/h/ai-103');
    unmount();
    for (const next of ['//evil.example', 'https://evil.example/h/x', '/h/x/../../admin', '/account']) {
      const view = renderAt(`/signin?next=${encodeURIComponent(next)}`);
      expect(screen.queryByRole('link', { name: 'Back to the hub' })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('shows the privacy page', () => {
    renderAt('/privacy');
    expect(screen.getByRole('heading', { level: 1, name: 'What this site stores' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('local storage');
  });
});

describe('catalog page', () => {
  it('shows a loading state, then hubs grouped by domain and subject', async () => {
    renderAt('/');
    expect(screen.getByText('Loading hubs…')).toBeInTheDocument();

    const domains = await screen.findAllByRole('heading', { level: 2 });
    expect(domains.map((h) => h.textContent)).toEqual(['Certifications', 'Software Engineering']);
    expect(screen.getByRole('heading', { level: 3, name: 'Data Structures & Algorithms' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(7);
    expect(screen.getByRole('status')).toHaveTextContent('7 hubs');
    expect(fetch).toHaveBeenCalledWith('/catalog.json', expect.anything());
  });

  it('filters with the chips (aria-pressed) and keeps the choice in the URL', async () => {
    const { user } = renderAt('/');
    await screen.findAllByRole('article');
    const group = screen.getByRole('group', { name: 'Filter by level' });
    const all = within(group).getByRole('button', { name: /^All/ });
    const cert = within(group).getByRole('button', { name: /^Cert/ });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(cert).toHaveAttribute('aria-pressed', 'false');
    expect(cert).toHaveAccessibleName('Cert certifications, 4 hubs');
    expect(within(group).getByRole('button', { name: /^L4/ })).toHaveAccessibleName('L4 Expert, 0 hubs');

    await user.click(cert);
    expect(cert).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.queryByRole('heading', { level: 2, name: 'Software Engineering' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Showing 4 of 7 hubs');
    expect(location()).toBe('/?filter=cert');

    await user.click(within(group).getByRole('button', { name: /^L2/ }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'DSA L2 Proficient Hub' })).toBeInTheDocument();
  });

  it('chips work from the keyboard', async () => {
    const { user } = renderAt('/');
    await screen.findAllByRole('article');
    const l1 = screen.getByRole('button', { name: /^L1/ });
    l1.focus();
    await user.keyboard('{Enter}');
    expect(l1).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('restores filter and search from the URL', async () => {
    renderAt('/?filter=cert&q=azure');
    const cards = await screen.findAllByRole('article');
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'AI-103 Study Hub',
      'AI-901 Study Hub',
    ]);
    expect(screen.getByRole('searchbox', { name: 'Search hubs' })).toHaveValue('azure');
  });

  it('searches as you type and shows an empty state with a reset', async () => {
    const { user } = renderAt('/');
    await screen.findAllByRole('article');
    const search = screen.getByRole('searchbox', { name: 'Search hubs' });

    await user.type(search, 'copilot');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: 'AB-620 Study Hub' })).toBeInTheDocument();
    expect(location()).toBe('/?q=copilot');

    await user.clear(search);
    await user.type(search, 'quantum basket weaving');
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'No hubs match' })).toBeInTheDocument();
    expect(screen.getByText(/Nothing matches “quantum basket weaving”/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all hubs' }));
    expect(screen.getAllByRole('article')).toHaveLength(7);
    expect(search).toHaveValue('');
    expect(location()).toBe('/');
  });

  it('shows local progress badges read from localStorage', async () => {
    localStorage.setItem('studyhub.dsa-l1.v2', JSON.stringify({ S: { done: { a: true, b: true, c: true } } }));
    localStorage.setItem('ai901hub.v1', JSON.stringify({ done: { m1: true } }));
    localStorage.setItem('studyhub.ai103.v2', '{broken');
    renderAt('/');
    expect(await screen.findByText(/3 \/ 8 modules/)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 17 modules/)).toBeInTheDocument();
    const ai103 = screen.getByRole('article', { name: 'AI-103 Study Hub' });
    expect(ai103).not.toHaveTextContent('Progress in this browser');
  });

  it('re-reads progress when another tab changes storage', async () => {
    renderAt('/');
    await screen.findAllByRole('article');
    expect(screen.queryByText(/Progress in this browser/)).not.toBeInTheDocument();
    localStorage.setItem('studyhub.dsa-l2.v2', JSON.stringify({ S: { done: { a: true } } }));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'studyhub.dsa-l2.v2' }));
    });
    expect(screen.getByText(/1 \/ 12 modules/)).toBeInTheDocument();
  });

  it('shows an error with a working retry when the catalog fails to load', async () => {
    const fetchMock = vi.fn(catalogFetch(undefined, 'http-500'));
    vi.stubGlobal('fetch', fetchMock);
    const { user } = renderAt('/');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load the hubs');
    expect(alert).toHaveTextContent('The server answered 500.');

    fetchMock.mockImplementation(catalogFetch());
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(7));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when the catalog is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(catalogFetch({ ...rawCatalog(), hubs: [] })));
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'No hubs yet' })).toBeInTheDocument();
  });
});
