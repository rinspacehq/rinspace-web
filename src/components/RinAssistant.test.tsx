import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/i18n';
import { loadRinChat, loadRinChatPrice, sendRinChatMessage } from '@/services/domains/assistant';

import RinAssistant from './RinAssistant';

vi.mock('@/pages/Profile', () => ({ CollectionFolderWorkspace: () => <div>收藏夹原有内容</div> }));
vi.mock('@/components/CodeMirrorEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="消息草稿" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));
vi.mock('@/components/MathText', () => ({ default: () => null }));
vi.mock('@/components/RinStickerPicker', () => ({ default: () => null }));
vi.mock('@/services/domains/assistant', () => ({
  ApiRequestError: class ApiRequestError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } },
  loadRinChat: vi.fn(async () => ({ id: 1, messages: [], participants: [] })),
  loadRinChatPrice: vi.fn(async () => ({ mode: 'gateway', enabled: true, priceSg: 2, policyVersion: 3, dailyCallsLimit: 10 })),
  sendRinChatMessage: vi.fn(),
}));

const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterAll(() => {
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

afterEach(async () => {
  cleanup();
  window.getSelection()?.removeAllRanges();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'caretRangeFromPoint');
  await i18n.changeLanguage('zh-CN');
});

function renderPage() {
  render(<>
    <a href="#reading">返回阅读</a>
    <div data-testid="blank"> </div>
    <p>这里是正文</p>
    <span>普通文字</span>
    <input aria-label="输入框" />
    <RinAssistant />
  </>);
}

function openMenu() {
  fireEvent.contextMenu(screen.getByTestId('blank'), { button: 2, clientX: 400, clientY: 300 });
  return screen.getByRole('menu', { name: '快捷菜单' });
}

describe('blank-page radial context menu', () => {
  it('retries an unconfirmed Rin message with the original operation key', async () => {
    vi.mocked(sendRinChatMessage)
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ id: 1, type: 'direct', title: '琳', participants: [], messages: [], updatedAt: new Date().toISOString() });
    renderPage();
    const wedge = openMenu().querySelector('.rin-radial-menu__wedge');
    fireEvent(wedge as Element, new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    await waitFor(() => expect(loadRinChat).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(loadRinChatPrice).toHaveBeenCalledTimes(1));
    expect(screen.getByText('本轮 2 善功')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: '消息草稿' }), { target: { value: '你好，琳' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '重试' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(sendRinChatMessage).toHaveBeenCalledTimes(2));
    const firstKey = vi.mocked(sendRinChatMessage).mock.calls[0]?.[4];
    const secondKey = vi.mocked(sendRinChatMessage).mock.calls[1]?.[4];
    expect(firstKey).toMatch(/^[a-f0-9-]{36}$/i);
    expect(secondKey).toBe(firstKey);
    expect(vi.mocked(sendRinChatMessage).mock.calls[0]?.slice(5, 7)).toEqual([3, 2]);
  });

  it('offers the two existing actions and the editor as a real new-tab link', () => {
    renderPage();
    openMenu();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(screen.getByRole('menuitem', { name: '召唤琳' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '收藏夹' })).toBeTruthy();
    const editor = screen.getByRole('menuitem', { name: '编辑器' });
    expect(editor.tagName).toBe('A');
    expect(editor.getAttribute('href')).toBe('/editor/');
    expect(editor.getAttribute('target')).toBe('_blank');
    expect(editor.getAttribute('rel')).toContain('noopener');
    expect(editor.getAttribute('title')).toContain('芥子环在线编辑器');
  });

  it('summons the existing assistant exactly once when a whole wedge is selected', async () => {
    renderPage();
    const menu = openMenu();
    const wedge = menu.querySelector('.rin-radial-menu__wedge');
    expect(wedge).not.toBeNull();
    fireEvent(wedge as Element, new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    await waitFor(() => expect(loadRinChat).toHaveBeenCalledTimes(1));
    expect(document.querySelector('.rin-assistant-window')).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('opens the existing collection window with keyboard navigation', async () => {
    const user = userEvent.setup();
    renderPage();
    const menu = openMenu();
    menu.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '收藏夹' }));
    await user.keyboard('{Enter}');
    expect(screen.getByRole('region', { name: '收藏夹' })).toBeTruthy();
    expect(screen.getByText('收藏夹原有内容')).toBeTruthy();
    expect(loadRinChat).not.toHaveBeenCalled();
  });

  it('closes with Escape and restores focus to the previous page control', async () => {
    const user = userEvent.setup();
    renderPage();
    const readingLink = screen.getByRole('link', { name: '返回阅读' });
    readingLink.focus();
    openMenu();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(readingLink);
  });

  it('preserves native menus for text, links, inputs and selected text', () => {
    renderPage();
    for (const target of [screen.getByText('这里是正文'), screen.getByRole('link'), screen.getByRole('textbox')]) {
      expect(fireEvent.contextMenu(target, { button: 2, clientX: 200, clientY: 100 })).toBe(true);
      expect(screen.queryByRole('menu')).toBeNull();
    }
    const range = document.createRange();
    range.selectNodeContents(screen.getByText('这里是正文'));
    window.getSelection()?.addRange(range);
    expect(fireEvent.contextMenu(screen.getByTestId('blank'), { button: 2 })).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('dismisses on outside interaction, scrolling, resizing and blur', async () => {
    const user = userEvent.setup();
    renderPage();
    openMenu();
    await user.click(screen.getByRole('textbox'));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
    for (const event of ['scroll', 'resize', 'blur']) {
      openMenu();
      fireEvent(window, new Event(event));
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    }
  });

  it('distinguishes actual text from empty space beside the nearest text caret', async () => {
    renderPage();
    const text = screen.getByText('普通文字');
    const range = document.createRange();
    range.setStart(text.firstChild as Text, 1);
    Object.defineProperty(range, 'getClientRects', { value: () => [new DOMRect(80, 80, 60, 20)] });
    Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: () => range });
    vi.spyOn(document, 'createRange').mockReturnValue(range);

    openMenu();
    expect(fireEvent.contextMenu(text, { button: 2, clientX: 90, clientY: 90 })).toBe(true);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('translates all three actions and the keyboard hint', async () => {
    await i18n.changeLanguage('en');
    renderPage();
    fireEvent.contextMenu(screen.getByTestId('blank'), { button: 2, clientX: 400, clientY: 300 });
    expect(screen.getByRole('menu', { name: 'Quick actions' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Summon Rin' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Collection folders' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Editor' })).toBeTruthy();
    expect(screen.getByText('Esc to close')).toBeTruthy();
  });
});
