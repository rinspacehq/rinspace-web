import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({ localRealClient: false, publicBasePath: '' }));

vi.mock('@/app/config/env', () => ({
  publicEnv: config,
  publicAsset: (pathname: string) => `${config.publicBasePath.replace(/\/$/, '')}${pathname}`,
}));

import SiteIcpLink from './SiteIcpLink';

function renderFooter() {
  return render(<MemoryRouter><SiteIcpLink /></MemoryRouter>);
}

describe('official registration resource boundary', () => {
  afterEach(() => {
    cleanup();
    config.localRealClient = false;
    config.publicBasePath = '';
  });

  it('preserves the existing production asset path', () => {
    const { container } = renderFooter();
    expect(container.querySelector('.site-police-beian-link img')?.getAttribute('src'))
      .toBe('/assets/beian-mps.png');
  });

  it('preserves a configured production asset prefix', () => {
    config.publicBasePath = '/rinspace/';
    const { container } = renderFooter();
    expect(container.querySelector('.site-police-beian-link img')?.getAttribute('src'))
      .toBe('/rinspace/assets/beian-mps.png');
  });

  it('reads the excluded icon from the official site only in local preview', () => {
    config.localRealClient = true;
    config.publicBasePath = '/unused-local-prefix';
    const { container } = renderFooter();
    expect(container.querySelector('.site-police-beian-link img')?.getAttribute('src'))
      .toBe('https://rinspace.com/assets/beian-mps.png');
    expect(container.querySelector('.site-police-beian-link')?.getAttribute('href'))
      .toBe('https://beian.mps.gov.cn/#/query/webSearch?code=31012102000206');
    expect(container.querySelector('.site-icp-link')?.getAttribute('href'))
      .toBe('https://beian.miit.gov.cn/');
    expect(container.querySelectorAll('.site-legal-links a')).toHaveLength(5);
  });
});
