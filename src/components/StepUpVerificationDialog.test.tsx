import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { beginIdentityStepUp, completeIdentityStepUp } from '@/services/phoneAuth';
import StepUpVerificationDialog from './StepUpVerificationDialog';

vi.mock('@/services/phoneAuth', () => ({
  beginIdentityStepUp: vi.fn(),
  completeIdentityStepUp: vi.fn(),
}));

beforeEach(async () => {
  await ensureLocaleNamespaces('zh-CN', ['common']);
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
  vi.mocked(beginIdentityStepUp).mockResolvedValue({ challengeId: 'challenge-1' });
  vi.mocked(completeIdentityStepUp).mockResolvedValue('rin_su_proof');
});

afterEach(() => {
  vi.clearAllMocks();
});

test('uses the bound account phone and submits an action-bound deletion proof', async () => {
  const onVerified = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <StepUpVerificationDialog
      show
      title="确认删除"
      purpose="content_delete"
      target="article-42"
      onCancel={() => {}}
      onVerified={onVerified}
    />,
  );

  await waitFor(() => expect(beginIdentityStepUp).toHaveBeenCalledWith('content_delete', 'article-42'));
  expect(view.queryByRole('textbox', { name: /手机号/ })).toBeNull();
  fireEvent.change(view.getByLabelText('短信验证码'), { target: { value: '123456' } });
  fireEvent.click(view.getByRole('button', { name: '验证并删除' }));

  await waitFor(() => expect(completeIdentityStepUp).toHaveBeenCalledWith(
    'content_delete',
    'article-42',
    'challenge-1',
    '123456',
  ));
  expect(onVerified).toHaveBeenCalledWith('rin_su_proof');
});
