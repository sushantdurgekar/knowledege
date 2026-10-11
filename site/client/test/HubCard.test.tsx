import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HubCard } from '../src/components/HubCard';
import { parseCatalog } from '../src/lib/catalog';
import { hubEntry, rawCatalog } from './fixtures';

const certHub = () => {
  const hub = parseCatalog(rawCatalog()).find((entry) => entry.slug === 'ai-103');
  if (!hub) throw new Error('fixture missing');
  return hub;
};

describe('HubCard', () => {
  it('shows code, title, level badge, blurb, module count and download size', () => {
    render(<HubCard hub={hubEntry()} progress={null} />);
    const card = screen.getByRole('article', { name: 'DSA L1 Foundation Hub' });
    expect(within(card).getByRole('heading', { level: 4, name: 'DSA L1 Foundation Hub' })).toBeInTheDocument();
    expect(card).toHaveTextContent('DSA · L1');
    expect(card).toHaveTextContent('L1 · Foundation');
    expect(card).toHaveTextContent('Level 1 of data structures and algorithms');
    expect(card).toHaveTextContent('8 modules');
    expect(card).toHaveTextContent('98 KB download');
    // Level hubs show the badge, not the cert line.
    expect(card).not.toHaveTextContent('Data Structures & Algorithms · L1 Foundation');
  });

  it('shows the certification line for cert hubs', () => {
    render(<HubCard hub={certHub()} progress={null} />);
    const card = screen.getByRole('article');
    expect(card).toHaveTextContent('Microsoft Certified: Azure AI Apps and Agents Developer Associate');
    expect(card).toHaveTextContent('Certification');
    expect(card).toHaveTextContent('197 KB download');
  });

  it('links Open to the hub page with a plain href and Download to the original file', () => {
    render(<HubCard hub={certHub()} progress={null} />);
    const open = screen.getByRole('link', { name: 'Open AI-103 Study Hub' });
    expect(open).toHaveAttribute('href', '/h/ai-103');
    expect(open).not.toHaveAttribute('download');
    const download = screen.getByRole('link', { name: /^Download AI-103 Study Hub/ });
    expect(download).toHaveAttribute('href', '/h/ai-103/download');
    expect(download).toHaveAttribute('download');
  });

  it('shows local progress when there is some', () => {
    render(<HubCard hub={hubEntry()} progress={{ done: 3, total: 8 }} />);
    expect(screen.getByText(/3 \/ 8 modules/)).toHaveTextContent('Progress in this browser: 3 / 8 modules');
  });

  it('marks a finished hub as complete', () => {
    const { container } = render(<HubCard hub={hubEntry()} progress={{ done: 8, total: 8 }} />);
    expect(container.querySelector('.hub-card__progress')).toHaveAttribute('data-complete', 'true');
  });

  it('shows no progress line without local progress', () => {
    render(<HubCard hub={hubEntry()} progress={null} />);
    expect(screen.queryByText(/Progress in this browser/)).not.toBeInTheDocument();
  });

  it('sets the accent stripe colour only from a sanitised hex value', () => {
    const { unmount } = render(<HubCard hub={hubEntry({ accent: '#0A7356' })} progress={null} />);
    expect(screen.getByRole('article').style.getPropertyValue('--hub-accent')).toBe('#0a7356');
    unmount();

    render(<HubCard hub={hubEntry({ accent: 'red;background:url(//evil.example/x)' })} progress={null} />);
    const card = screen.getByRole('article');
    expect(card.style.getPropertyValue('--hub-accent')).toBe('');
    expect(card).not.toHaveAttribute('style');
  });

  it('hides the size when the catalog has none', () => {
    render(<HubCard hub={hubEntry({ brBytes: null })} progress={null} />);
    expect(screen.getByRole('article')).not.toHaveTextContent(/KB download/);
  });
});
