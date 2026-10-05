import fs from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearCapturedPwaInstallPrompt } from '@/services/pwaInstallPrompt';

import DownloadPage from './index';

const androidChromeUserAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36';
const androidEdgeUserAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36 EdgA/140.0.0.0';
const androidFirefoxUserAgent = 'Mozilla/5.0 (Android 14; Mobile; rv:142.0) Gecko/142.0 Firefox/142.0';
const androidQqUserAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 MQQBrowser/6.2 TBS/046136 QQ/9.1.50.12345';
const androidWechatUserAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.61';
const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');

function setUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
}

function installPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{
      outcome: 'accepted' | 'dismissed';
      platform: string;
    }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return event;
}

describe('Android download page', () => {
  beforeEach(() => {
    clearCapturedPwaInstallPrompt();
    setUserAgent(androidChromeUserAgent);
  });

  afterEach(() => {
    clearCapturedPwaInstallPrompt();
    if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
  });

  it('shares the inner-world application identity and launches Explore', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('public/site.webmanifest'), 'utf8')) as {
      id: string;
      scope: string;
      start_url: string;
    };
    expect(manifest).toMatchObject({
      id: '/home',
      scope: '/',
      start_url: '/explore?world=inner',
    });
  });

  it('keeps the Android SVG inside the single install button', () => {
    const { container } = render(<DownloadPage />);
    const button = screen.getByRole('button', { name: '安装芥子环' });
    expect(button.querySelector('svg.download-android-icon')).toBeTruthy();
    expect(container.querySelectorAll('.download-android-icon')).toHaveLength(1);
    expect(screen.queryAllByRole('button')).toHaveLength(1);
  });

  it('uses a real mobile Explore screenshot inside the phone preview', () => {
    render(<DownloadPage />);
    const screenshot = screen.getByRole('img', {
      name: '芥子环里世界 Explore 的真实移动端界面',
    });
    expect(screenshot.getAttribute('src')).toBe('/assets/download/rinspace-inner-explore-mobile.png');
    expect(fs.existsSync(path.resolve('public/assets/download/rinspace-inner-explore-mobile.png'))).toBe(true);
  });

  it('registers the inner-world notification worker as an ES module', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });

    try {
      render(<DownloadPage />);
      await waitFor(() => {
        expect(register).toHaveBeenCalledWith('/sw.js', {
          scope: '/',
          type: 'module',
        });
      });
    } finally {
      if (original) Object.defineProperty(navigator, 'serviceWorker', original);
      else Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });

  it.each([
    ['Chrome', androidChromeUserAgent],
    ['Edge', androidEdgeUserAgent],
  ])('opens the captured %s prompt without claiming the shortcut is installed', async (_browser, userAgent) => {
    setUserAgent(userAgent);
    render(<DownloadPage />);
    const event = installPromptEvent();
    act(() => window.dispatchEvent(event));
    await screen.findByText('芥子环可以安装；请允许 Edge 或 Chrome 创建桌面快捷方式。');
    fireEvent.click(screen.getByRole('button', { name: '安装芥子环' }));
    await waitFor(() => expect(event.prompt).toHaveBeenCalledOnce());
    const acceptedButton = await screen.findByRole('button', {
      name: '查看主屏幕',
    });
    expect((acceptedButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('请查看主屏幕；未出现时，请允许 Edge 或 Chrome 添加快捷方式。')).toBeTruthy();
    expect(screen.queryByText('芥子环已安装')).toBeNull();

    act(() => window.dispatchEvent(new Event('appinstalled')));
    expect(screen.getByText('请查看主屏幕；未出现时，请允许 Edge 或 Chrome 添加快捷方式。')).toBeTruthy();
    expect(screen.queryByText('芥子环已安装')).toBeNull();
  });

  it.each([
    ['Firefox', androidFirefoxUserAgent],
    ['QQ', androidQqUserAgent],
    ['WeChat', androidWechatUserAgent],
  ])('shows an immediate short prompt in Android %s', (_browser, userAgent) => {
    setUserAgent(userAgent);
    render(<DownloadPage />);
    expect(screen.getByText('请使用 Android 版 Edge 或 Chrome 打开。')).toBeTruthy();
    const installButton = screen.getByRole('button', { name: '安装芥子环' });
    expect((installButton as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ['Chrome', androidChromeUserAgent],
    ['Edge', androidEdgeUserAgent],
  ])('waits for the native install event before enabling the button in %s', (_browser, userAgent) => {
    setUserAgent(userAgent);
    render(<DownloadPage />);
    expect(screen.getByText('正在准备安装；请允许 Edge 或 Chrome 创建桌面快捷方式。')).toBeTruthy();
    expect((screen.getByRole('button', { name: '安装芥子环' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not turn an early click into a false permission failure', () => {
    render(<DownloadPage />);
    fireEvent.click(screen.getByRole('button', { name: '安装芥子环' }));
    expect(screen.getByText('正在准备安装；请允许 Edge 或 Chrome 创建桌面快捷方式。')).toBeTruthy();
    expect(screen.queryByText('当前无法安装；请允许 Edge 或 Chrome 创建桌面快捷方式后重试。')).toBeNull();
    expect(screen.queryByText('请使用 Android 版 Edge 或 Chrome 打开。')).toBeNull();
  });

  it('uses an install event captured before the lazy page mounts', async () => {
    const event = installPromptEvent();
    act(() => window.dispatchEvent(event));

    render(<DownloadPage />);

    await screen.findByText('芥子环可以安装；请允许 Edge 或 Chrome 创建桌面快捷方式。');
    const installButton = screen.getByRole('button', { name: '安装芥子环' });
    expect((installButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(installButton);
    await waitFor(() => expect(event.prompt).toHaveBeenCalledOnce());
  });

  it('reports installed only when the page is already running standalone', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));

    try {
      render(<DownloadPage />);
      expect(screen.getByText('芥子环已安装')).toBeTruthy();
      const openButton = screen.getByRole('button', { name: '打开芥子环' });
      expect((openButton as HTMLButtonElement).disabled).toBe(false);
    } finally {
      matchMedia.mockRestore();
    }
  });
});
