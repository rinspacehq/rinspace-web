import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import TagCreationFlow from './TagCreationFlow';

const tagServiceMocks = vi.hoisted(() => ({
  compareCanonicalTags: vi.fn(),
  createCanonicalTag: vi.fn(),
  loadTagCreationOperation: vi.fn(),
  retryTagCreationOperation: vi.fn(),
}));

vi.mock('@/services/tagV2', () => tagServiceMocks);
vi.mock('@/services/domains/tag', () => ({ suggestTags: async () => [] }));

beforeEach(() => {
  tagServiceMocks.compareCanonicalTags.mockResolvedValue([{ id: 8, displayName: 'Sheaf', normalizedName: 'sheaf', usageScope: 'Algebraic geometry', parentTagIds: [2], version: 1 }]);
  tagServiceMocks.createCanonicalTag.mockResolvedValue({ operationId: 'op-42', state: 'active', tag: { id: 42, displayName: 'Sheaf', normalizedName: 'sheaf', usageScope: 'Category theory', parentTagIds: [], version: 1 } });
  tagServiceMocks.loadTagCreationOperation.mockResolvedValue({ operationId: 'op-42', tagId: 42, state: 'active', currentStep: 'active', retryable: false, version: 2 });
  tagServiceMocks.retryTagCreationOperation.mockResolvedValue({ operationId: 'op-42', tagId: 42, state: 'pending', currentStep: 'delivery', retryable: true, version: 2 });
});

afterEach(async () => {
  vi.clearAllMocks();
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
});

test('creates a parentless same-name tag after explicit context review', async () => {
  const created = vi.fn();
  const view = render(<TagCreationFlow open onOpenChange={() => {}} invocation={{ source: 'directory', initialName: 'Sheaf' }} onCreated={created} />);
  await view.findByText('ID 8');
  fireEvent.change(view.getByPlaceholderText('它在这里具体指什么？'), { target: { value: 'Category theory' } });
  expect(view.getByRole('dialog').textContent).not.toContain('知识节点');
  fireEvent.click(view.getByRole('button', { name: /创建标签/ }));
  await waitFor(() => expect(created).toHaveBeenCalled());
  expect(view.getByRole('status').textContent).toContain('已创建');
});

test('renders English controls without translating authored tag context', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = render(
    <TagCreationFlow
      open
      onOpenChange={() => {}}
      invocation={{ source: 'directory', initialName: 'Sheaf' }}
    />,
  );

  await view.findByText('Tags with the same name');
  expect(view.getByRole('dialog').textContent).toContain('Algebraic geometry');
  expect(view.getByRole('dialog').textContent).toContain('Sheaf');
  expect(view.getByPlaceholderText('What does it mean in this context?')).toBeTruthy();
  expect(view.getByRole('button', { name: /Create tag/ })).toBeTruthy();
});

test('retains unsaved tag fields while switching the interface language', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await ensureLocaleNamespaces('zh-CN', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = render(
    <TagCreationFlow
      open
      onOpenChange={() => {}}
      invocation={{ source: 'directory', initialName: 'Derived category' }}
    />,
  );
  const scope = view.getByPlaceholderText('What does it mean in this context?');
  fireEvent.change(scope, { target: { value: '作者尚未提交的使用语境' } });

  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  expect((view.getByDisplayValue('Derived category') as HTMLInputElement).value).toBe(
    'Derived category',
  );
  expect(
    (view.getByPlaceholderText('它在这里具体指什么？') as HTMLTextAreaElement).value,
  ).toBe('作者尚未提交的使用语境');
});

test('polls a pending operation immediately until the Tag becomes active', async () => {
  const created = vi.fn();
  tagServiceMocks.createCanonicalTag.mockResolvedValueOnce({
    operationId: 'op-pending',
    state: 'pending',
    tag: { id: 73, displayName: '逆向工程', normalizedName: '逆向工程', usageScope: '软件与硬件分析', parentTagIds: [], version: 1 },
  });
  tagServiceMocks.loadTagCreationOperation.mockResolvedValueOnce({
    operationId: 'op-pending',
    tagId: 73,
    state: 'active',
    currentStep: 'active',
    retryable: false,
    version: 2,
  });

  const view = render(<TagCreationFlow open onOpenChange={() => {}} invocation={{ source: 'directory', initialName: '逆向工程' }} onCreated={created} />);
  fireEvent.change(view.getByPlaceholderText('它在这里具体指什么？'), { target: { value: '软件与硬件分析' } });
  fireEvent.click(view.getByRole('button', { name: /创建标签/ }));

  await waitFor(() => expect(tagServiceMocks.loadTagCreationOperation).toHaveBeenCalledWith('op-pending'));
  await waitFor(() => expect(created).toHaveBeenCalledWith(expect.objectContaining({ id: 73 })));
  expect(view.getByRole('status').textContent).toContain('已创建');
});

test('starts a reopened dialog with clean fields and a fresh idempotency key', async () => {
  const view = render(<TagCreationFlow open onOpenChange={() => {}} invocation={{ source: 'directory', initialName: '第一个标签' }} />);
  fireEvent.change(view.getByPlaceholderText('它在这里具体指什么？'), { target: { value: '第一个语境' } });
  fireEvent.click(view.getByRole('button', { name: /创建标签/ }));
  await waitFor(() => expect(tagServiceMocks.createCanonicalTag).toHaveBeenCalledTimes(1));

  view.rerender(<TagCreationFlow open={false} onOpenChange={() => {}} invocation={{ source: 'directory', initialName: '第一个标签' }} />);
  view.rerender(<TagCreationFlow open onOpenChange={() => {}} invocation={{ source: 'topbar', initialName: '第二个标签' }} />);

  await waitFor(() => expect(view.getByDisplayValue('第二个标签')).toBeTruthy());
  const scope = view.getByPlaceholderText('它在这里具体指什么？') as HTMLTextAreaElement;
  expect(scope.value).toBe('');
  fireEvent.change(scope, { target: { value: '第二个语境' } });
  fireEvent.click(view.getByRole('button', { name: /创建标签/ }));
  await waitFor(() => expect(tagServiceMocks.createCanonicalTag).toHaveBeenCalledTimes(2));

  const firstKey = tagServiceMocks.createCanonicalTag.mock.calls[0]?.[0].idempotencyKey;
  const secondKey = tagServiceMocks.createCanonicalTag.mock.calls[1]?.[0].idempotencyKey;
  expect(firstKey).toBeTruthy();
  expect(secondKey).toBeTruthy();
  expect(secondKey).not.toBe(firstKey);
});

test('keeps polling a retryable failure until the background delivery succeeds', async () => {
  const created = vi.fn();
  tagServiceMocks.createCanonicalTag.mockResolvedValueOnce({
    operationId: 'op-retryable',
    state: 'pending',
    tag: { id: 78, displayName: '孤本', normalizedName: '孤本', usageScope: '版本鉴定', parentTagIds: [], version: 1 },
  });
  tagServiceMocks.loadTagCreationOperation
    .mockResolvedValueOnce({
      operationId: 'op-retryable',
      tagId: 78,
      state: 'failed',
      currentStep: 'control_plane',
      publicErrorCode: 'control_plane_unavailable',
      retryable: true,
      version: 3,
    })
    .mockResolvedValue({
      operationId: 'op-retryable',
      tagId: 78,
      state: 'active',
      currentStep: 'active',
      retryable: false,
      version: 4,
    });

  const view = render(<TagCreationFlow open onOpenChange={() => {}} invocation={{ source: 'directory', initialName: '孤本' }} onCreated={created} />);
  fireEvent.change(view.getByPlaceholderText('它在这里具体指什么？'), { target: { value: '版本鉴定' } });
  fireEvent.click(view.getByRole('button', { name: /创建标签/ }));

  await waitFor(() => expect(view.getByRole('status').textContent).toContain('创建尚未完成'), { timeout: 4000 });
  await waitFor(() => expect(tagServiceMocks.loadTagCreationOperation.mock.calls.length).toBeGreaterThan(1), { timeout: 6000 });
  await waitFor(() => expect(created).toHaveBeenCalledWith(expect.objectContaining({ id: 78 })), { timeout: 6000 });
  expect(view.getByRole('status').textContent).toContain('已创建');
});

test('keeps polling while the operation is activating', async () => {
  const created = vi.fn();
  tagServiceMocks.createCanonicalTag.mockResolvedValueOnce({
    operationId: 'op-activating',
    state: 'pending',
    tag: { id: 79, displayName: '手稿', normalizedName: '手稿', usageScope: '文献整理', parentTagIds: [], version: 1 },
  });
  tagServiceMocks.loadTagCreationOperation
    .mockResolvedValueOnce({
      operationId: 'op-activating',
      tagId: 79,
      state: 'activating',
      currentStep: 'control_plane',
      retryable: true,
      version: 2,
    })
    .mockResolvedValue({
      operationId: 'op-activating',
      tagId: 79,
      state: 'active',
      currentStep: 'active',
      retryable: false,
      version: 3,
    });

  const view = render(<TagCreationFlow open onOpenChange={() => {}} invocation={{ source: 'directory', initialName: '手稿' }} onCreated={created} />);
  fireEvent.change(view.getByPlaceholderText('它在这里具体指什么？'), { target: { value: '文献整理' } });
  fireEvent.click(view.getByRole('button', { name: /创建标签/ }));

  await waitFor(() => expect(view.getByRole('status').textContent).toContain('标签创建中'), { timeout: 4000 });
  await waitFor(() => expect(created).toHaveBeenCalledWith(expect.objectContaining({ id: 79 })), { timeout: 6000 });
  expect(view.getByRole('status').textContent).toContain('已创建');
});
