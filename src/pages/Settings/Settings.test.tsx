import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { SiteTopbarHost } from '@/components/SiteTopbarShell';
import type { CurrentUserInfo, UserNotificationConfig } from '@/services/contracts';
import {
  loadCurrentUserInfo,
  loadUserNotificationConfig,
  updateUserInterfaceConfig,
  updateUserNotificationConfig,
} from '@/services/domains/identity';
import { loadCodeRecoveries } from '@/services/recovery';
import {
  sendIdentityStepUpOtp,
  completeCloudBaseStepUp,
  listIdentityCredentials,
  listIdentityDevices,
  revokeIdentityCredential,
} from '@/services/phoneAuth';
import SettingsPage from './index';

vi.mock('@/services/domains/identity', () => ({
  loadCurrentUserInfo: vi.fn(),
  loadUserNotificationConfig: vi.fn(),
  updateUserInterfaceConfig: vi.fn(),
  updateUserNotificationConfig: vi.fn(),
}));

vi.mock('@/services/recovery', () => ({
  loadCodeRecoveries: vi.fn(),
  createCodeRecoveryTicket: vi.fn(),
}));

vi.mock('@/services/phoneAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/phoneAuth')>();
  return {
    ...actual,
    sendIdentityStepUpOtp: vi.fn(),
    completeCloudBaseStepUp: vi.fn(),
    listIdentityCredentials: vi.fn(),
    listIdentityDevices: vi.fn(),
    revokeAllIdentityDevices: vi.fn(),
    revokeAllIdentityPersonalAccess: vi.fn(),
    revokeIdentityCredential: vi.fn(),
    revokeIdentityDevice: vi.fn(),
  };
});

const currentUser: CurrentUserInfo = {
  id: 'user-1',
  created_at: 1,
  last_login_date: 1,
  username: 'rin-user',
  display_name: 'Rin User',
  avatar: { type: 'custom', gravatar: '', custom: '' },
  cover_url: '',
  mobile: '',
  bio: '',
  bio_html: '',
  website: '',
  location: '',
  about_html: '',
  language: 'zh-CN',
  color_scheme: 'system',
  access_token: '',
  role_id: 1,
  role_name: 'member',
  rank: 0,
  status: 'available',
  have_password: false,
  visit_token: '',
  suspended_until: 0,
};

const notifications: UserNotificationConfig = {
  inbox: { key: 'email', enable: false },
  allNewQuestion: { key: 'email', enable: false },
  allNewQuestionForFollowingTags: { key: 'email', enable: false },
};

function renderSettings() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/settings']}>
        <AppProviders>
          <SiteTopbarHost><SettingsPage /></SiteTopbarHost>
        </AppProviders>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('Settings interface language', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(loadCurrentUserInfo).mockResolvedValue(currentUser);
    vi.mocked(loadUserNotificationConfig).mockResolvedValue(notifications);
    vi.mocked(updateUserNotificationConfig).mockResolvedValue(notifications);
    vi.mocked(updateUserInterfaceConfig).mockResolvedValue({
      language: 'en',
      colorScheme: 'system',
    });
    vi.mocked(loadCodeRecoveries).mockResolvedValue([]);
    vi.mocked(listIdentityDevices).mockResolvedValue([]);
    vi.mocked(listIdentityCredentials).mockResolvedValue([]);
    vi.mocked(sendIdentityStepUpOtp).mockResolvedValue({ verificationId: 'verification-security', phoneNumber: '+8613700000000', isUser: true });
    vi.mocked(completeCloudBaseStepUp).mockResolvedValue('rin_su_proof');
    vi.mocked(revokeIdentityCredential).mockResolvedValue({});
  });

  it('offers the three approved choices and switches atomically after save', async () => {
    renderSettings();
    const languageSelect = await screen.findByLabelText('语言');
    expect(Array.from((languageSelect as HTMLSelectElement).options, (option) => option.value)).toEqual([
      'system',
      'zh-CN',
      'en',
    ]);

    fireEvent.change(languageSelect, { target: { value: 'en' } });
    fireEvent.click(screen.getByRole('button', { name: '保存偏好' }));

    await waitFor(() => expect(updateUserInterfaceConfig).toHaveBeenCalledWith({
      language: 'en',
      colorScheme: 'system',
    }));
    await screen.findByRole('heading', { name: 'Settings', level: 1, hidden: true });
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByLabelText('Language')).toBe(languageSelect);
  });

  it('renders without the hero, sidebar, or notification preferences', async () => {
    const { container } = renderSettings();

    expect(await screen.findByLabelText('语言')).toBeTruthy();
    expect(container.querySelector('.settings-toolbar')).toBeNull();
    expect(container.querySelector('.settings-profile-card')).toBeNull();
    expect(screen.queryByText('通知偏好')).toBeNull();
    expect(loadUserNotificationConfig).not.toHaveBeenCalled();
  });

  it('shows separate device and personal credential scopes and confirms a targeted revoke', async () => {
    vi.mocked(listIdentityDevices).mockResolvedValue([{
      sid: 'sid-current', clientLabel: 'Desktop browser', authMethod: 'sms',
      createdAt: '2026-09-01T00:00:00Z', lastActiveAt: '2026-09-12T00:00:00Z',
      idleExpiresAt: '2026-10-01T00:00:00Z', absoluteExpires: '2026-12-01T00:00:00Z',
      current: true, revoked: false, cleanupComplete: true, runtimes: { gitea_web: 'active' },
    }]);
    vi.mocked(listIdentityCredentials).mockResolvedValue([{
      ref: 'gitea:ssh:17', provider: 'gitea', kind: 'ssh', label: 'Laptop key',
      scopes: ['git'], createdAt: '2026-09-01T00:00:00Z', state: 'active',
    }]);
    renderSettings();

    expect(await screen.findByText('Desktop browser')).toBeTruthy();
    expect(screen.getByText('Laptop key')).toBeTruthy();
    expect(screen.getByText('最近使用：未知时间')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '撤销此凭据' }));
    fireEvent.change(await screen.findByLabelText('手机号'), { target: { value: '13700000000' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    await waitFor(() => expect(sendIdentityStepUpOtp).toHaveBeenCalledWith('credential_revoke', 'gitea:ssh:17', '13700000000'));
    fireEvent.change(await screen.findByLabelText('验证码'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '确认操作' }));
    await waitFor(() => expect(completeCloudBaseStepUp).toHaveBeenCalledWith(
      'credential_revoke', 'gitea:ssh:17',
      { verificationId: 'verification-security', phoneNumber: '+8613700000000', isUser: true },
      '123456',
    ));
    await waitFor(() => expect(revokeIdentityCredential).toHaveBeenCalledWith('gitea:ssh:17', 'rin_su_proof'));
  });
});
