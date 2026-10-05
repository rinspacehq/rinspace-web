import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { loadWalletTipperCount } from './api';
import TipButton from './TipButton';

vi.mock('./api', async original => ({ ...await original<typeof import('./api')>(), loadWalletTipperCount: vi.fn() }));

beforeEach(async () => {
  vi.resetAllMocks();
  await ensureLocaleNamespaces('en', ['wallet']);
  await i18n.changeLanguage('en');
});

afterEach(() => cleanup());

describe('TipButton', () => {
  it('keeps the same action element and reserves the count slot while the aggregate loads', async () => {
    let resolveCount: (count: number) => void = () => {};
    vi.mocked(loadWalletTipperCount).mockImplementation(() => new Promise<number>((resolve) => {
      resolveCount = resolve;
    }));
    render(<MemoryRouter><TipButton target={{ contentType: 'blog', postID: '41' }} showLabel={false} /></MemoryRouter>);
    const loadingButton = await screen.findByRole('button', { name: 'Tip' });
    const loadingCount = loadingButton.querySelector('.wallet-tip-count');
    expect(loadingCount).not.toBeNull();
    expect(loadingCount?.getAttribute('data-loading')).toBe('true');

    resolveCount(5);

    const loadedButton = await screen.findByRole('button', { name: 'Tip, 5 people' });
    expect(loadedButton).toBe(loadingButton);
    expect(loadedButton.querySelector('.wallet-tip-count')?.textContent).toBe('5');
  });

  it('renders the real distinct tipper count without an article-side text label', async () => {
    vi.mocked(loadWalletTipperCount).mockResolvedValue(5);
    render(<MemoryRouter><TipButton target={{ contentType: 'blog', postID: '42' }} showLabel={false} /></MemoryRouter>);
    const button = await screen.findByRole('button', { name: 'Tip, 5 people' });
    expect(button.textContent).toBe('5');
    expect(loadWalletTipperCount).toHaveBeenCalledWith('blog', '42', expect.any(AbortSignal));
  });

  it('keeps the book action label and does not invent a count when the aggregate is unavailable', async () => {
    vi.mocked(loadWalletTipperCount).mockRejectedValue(new Error('unavailable'));
    render(<MemoryRouter><TipButton target={{ contentType: 'book', postID: '43' }} /></MemoryRouter>);
    expect((await screen.findByRole('button', { name: 'Tip' })).textContent).toContain('Tip');
    await waitFor(() => expect(loadWalletTipperCount).toHaveBeenCalledOnce());
    expect(screen.queryByText('0')).toBeNull();
  });
});
