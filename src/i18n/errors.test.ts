import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceError } from '@/services/httpClient';

import { localizedErrorMessage } from './errors';
import { i18n } from './index';

describe('localizedErrorMessage', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage('zh-CN');
  });

  it('uses a stable feature fallback instead of exposing a raw client error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await i18n.changeLanguage('en');

    expect(localizedErrorMessage(
      new Error('标签治理接口失败'),
      'discovery.tagGovernanceLoadFailed',
    )).toBe('Tag governance data could not be loaded.');
  });

  it('uses the stable generic copy when a caller does not provide a feature fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await i18n.changeLanguage('en');

    expect(localizedErrorMessage(new Error('数据库连接失败'))).toBe(
      'The action could not be completed. Try again shortly.',
    );
  });

  it('keeps unmapped service diagnostics out of the translated message', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await i18n.changeLanguage('zh-CN');
    const failure = new ServiceError(
      'internal shard unavailable',
      503,
      { traceId: 'trace-1' },
      'directory.shard_unavailable',
    );

    expect(localizedErrorMessage(failure, 'discovery.tagsLoadFailed')).toBe('标签加载失败。');
    expect(errorLog).toHaveBeenCalledWith('Unmapped service error', expect.objectContaining({
      code: 'directory.shard_unavailable',
      status: 503,
    }));
  });
});
