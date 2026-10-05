import { fireEvent, render, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

import { AnimateButton } from 'components/ui';
import TagPicker, { normalizeTagInput } from './TagPicker';

declare function beforeEach(callback: () => void): void;
declare function test(name: string, callback: () => Promise<void> | void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toContain(expected: string): void;
  toEqual(expected: unknown): void;
  toBeNull(): void;
  not: {
    toBeNull(): void;
    toContain(expected: string): void;
  };
};

vi.mock('react-router-dom', () => {
  const React = require('react');
  return {
    Link: ({
      to,
      children,
    }: {
      to: string;
      children: React.ReactNode;
    }) => React.createElement('a', { href: to }, children),
  };
});

vi.mock('@/services/domains/tag', () => ({
  suggestTags: async (query: string, limit = 20) => {
    const response = await fetch(
      `/api/question/tags?tag=${encodeURIComponent(query)}&limit=${String(limit)}`,
      { headers: { Accept: 'application/json' } },
    );
    const payload: unknown = await response.json();
    if (
      payload !== null &&
      typeof payload === 'object' &&
      Array.isArray((payload as { items?: unknown }).items)
    ) {
      return (payload as { items: unknown[] }).items;
    }
    return [];
  },
}));

vi.mock('@/features/tags/TagCreationFlow', () => ({
  default: ({ open, invocation, onCreated }: { open: boolean; invocation: { initialName?: string }; onCreated?(tag: { id: number; displayName: string }): void }) => open ? <AnimateButton unstyled type="button" onClick={() => onCreated?.({ id: 42, displayName: invocation.initialName || 'Tag' })}>确认创建</AnimateButton> : null,
}));

function tagSuggestResponse(items: unknown[]) {
  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPicker(
  element: ReactElement,
) {
  return render(element);
}

beforeEach(() => {
  global.fetch = async () => tagSuggestResponse([]);
});

test('normalizes Latin diacritics in new tag slugs', () => {
  expect(normalizeTagInput('Néron-Severi group')).toBe('neron-severi-group');
});

test('adds a new normalized tag by clicking the create suggestion', async () => {
  let selected: string[] = [];
  let pickedSource = '';
  let pickedSlug = '';
  let pickedLabel = '';
  const view = renderPicker(
    <TagPicker
      value={[]}
      onChange={(next) => {
        selected = next;
      }}
      onPick={(selection) => {
        pickedSource = selection.source;
        pickedSlug = selection.slug;
        pickedLabel = selection.label;
      }}
      ariaLabel="内容标签"
    />,
  );

  fireEvent.change(view.getByLabelText('内容标签'), {
    target: { value: 'Algebraic Topology' },
  });
  const createButton = await view.findByText('新标签：Algebraic Topology');
  fireEvent.click(createButton);
	fireEvent.click(view.getByText('确认创建'));

  expect(selected).toEqual(['42']);
  expect(pickedSource).toBe('new');
  expect(pickedSlug).toBe('42');
  expect(pickedLabel).toBe('Algebraic Topology');
});

test('adds a new normalized tag with Enter after suggestions finish loading', async () => {
  let selected: string[] = [];
  const view = renderPicker(
    <TagPicker
      value={[]}
      onChange={(next) => {
        selected = next;
      }}
      ariaLabel="话题标签"
    />,
  );
  const input = view.getByLabelText('话题标签');

  fireEvent.change(input, { target: { value: 'Derived Geometry' } });
  await view.findByText('新标签：Derived Geometry');
  fireEvent.keyDown(input, { key: 'Enter' });
	fireEvent.click(view.getByText('确认创建'));

  expect(selected).toEqual(['42']);
});

test('picks an existing tag suggestion without creating a duplicate label', async () => {
  global.fetch = async () =>
    tagSuggestResponse([
      {
        slug: 'sheaf',
        name: 'sheaf',
        displayName: 'Sheaf',
        postCount: 3,
        usageExcerpt: '3 related posts',
        usage_excerpt: '3 related posts',
      },
    ]);
  let selected: string[] = [];
  let pickedSource = '';
  let pickedSlug = '';
  const view = renderPicker(
    <TagPicker
      value={[]}
      onChange={(next) => {
        selected = next;
      }}
      onPick={(selection) => {
        pickedSource = selection.source;
        pickedSlug = selection.tag?.slug || selection.slug;
      }}
      ariaLabel="内容标签"
    />,
  );

  fireEvent.change(view.getByLabelText('内容标签'), {
    target: { value: 'shea' },
  });
  const existingButton = await view.findByText('Sheaf');
  fireEvent.click(existingButton);

  expect(selected).toEqual(['sheaf']);
  expect(pickedSource).toBe('existing');
  expect(pickedSlug).toBe('sheaf');
});

test('keeps an explicit creation path when an existing tag has the same name', async () => {
  global.fetch = async () =>
    tagSuggestResponse([
      {
        tagId: '8',
        slug: 'sheaf',
        name: 'sheaf',
        displayName: 'Sheaf',
        postCount: 3,
        parentTags: [{ tagId: '2', slugName: 'geometry', displayName: 'Geometry' }],
        usageExcerpt: 'Algebraic geometry',
      },
    ]);
  let selected: string[] = [];
  const view = renderPicker(
    <TagPicker
      value={[]}
      onChange={(next) => {
        selected = next;
      }}
      ariaLabel="内容标签"
    />,
  );

  fireEvent.change(view.getByLabelText('内容标签'), {
    target: { value: 'Sheaf' },
  });
  fireEvent.click(await view.findByText('新标签：Sheaf'));
  fireEvent.click(view.getByText('确认创建'));

  expect(selected).toEqual(['42']);
});

test('shows tag id, readable label, slug, and parent context in suggestions', async () => {
  global.fetch = async () =>
    tagSuggestResponse([
      {
        tagId: '42',
        slug: 'sheaf',
        name: 'sheaf',
        displayName: 'Sheaf',
        postCount: 3,
        parentTags: [
          {
            tagId: '7',
            slugName: 'category-theory',
            displayName: 'Category theory',
          },
        ],
        usageExcerpt: '',
      },
    ]);
  const view = renderPicker(
    <TagPicker
      value={[]}
      onChange={() => {}}
      ariaLabel="内容标签"
    />,
  );

  fireEvent.change(view.getByLabelText('内容标签'), {
    target: { value: 'shea' },
  });

  await view.findByText('ID 42');
  await view.findByText('Sheaf');
  await view.findByText('sheaf');
  await view.findByText('Category theory');
  expect(view.container.textContent || '').not.toContain('topic');
});

test('distinguishes suggestions that share the same display label', async () => {
  global.fetch = async () =>
    tagSuggestResponse([
      {
        tagId: '42',
        slug: 'sheaf',
        name: 'sheaf',
        displayName: 'Sheaf',
        postCount: 3,
        parentTags: [{ tagId: '7', slugName: 'category-theory', displayName: 'Category theory' }],
        usageExcerpt: '',
      },
      {
        tagId: '43',
        slug: 'sheaf-cohomology',
        name: 'sheaf-cohomology',
        displayName: 'Sheaf',
        postCount: 2,
        parentTags: [{ tagId: '8', slugName: 'algebraic-geometry', displayName: 'Algebraic geometry' }],
        usageExcerpt: '',
      },
    ]);
  const view = renderPicker(
    <TagPicker
      value={[]}
      onChange={() => {}}
      ariaLabel="内容标签"
    />,
  );

  fireEvent.change(view.getByLabelText('内容标签'), {
    target: { value: 'shea' },
  });

  const sharedLabels = await view.findAllByText('Sheaf');
  expect(sharedLabels.length).toBe(2);
  await view.findByText('ID 42');
  await view.findByText('ID 43');
  await view.findByText('sheaf');
  await view.findByText('sheaf-cohomology');
  await view.findByText('Category theory');
  await view.findByText('Algebraic geometry');
});

test('uses a creation link instead of adding directly in link mode', async () => {
  let selected: string[] = [];
  const view = renderPicker(
    <TagPicker
      value={[]}
      onChange={(next) => {
        selected = next;
      }}
      createMode="link"
      createLink={(query) => `/tags/new?name=${encodeURIComponent(query)}`}
      ariaLabel="父标签"
    />,
  );

  fireEvent.change(view.getByLabelText('父标签'), {
    target: { value: 'New Parent' },
  });
  const link = await view.findByText('创建“New Parent”');

  expect(link.closest('a')?.getAttribute('href')).toBe('/tags/new?name=New%20Parent');
  expect(selected).toEqual([]);
});

test('does not show an already selected suggestion again but keeps same-name creation available', async () => {
  global.fetch = async () =>
    tagSuggestResponse([
      {
        slug: 'analysis',
        name: 'analysis',
        displayName: 'Analysis',
        postCount: 5,
        usageExcerpt: '',
      },
    ]);
  const view = renderPicker(
    <TagPicker
      value={['analysis']}
      onChange={() => {}}
      ariaLabel="内容标签"
    />,
  );

  fireEvent.change(view.getByLabelText('内容标签'), {
    target: { value: 'analysis' },
  });

  await view.findByText('新标签：analysis');
  expect(view.container.textContent || '').toContain('analysis');
});

test('stores one id-backed selection for a parent tag', async () => {
  global.fetch = async () =>
    tagSuggestResponse([
      {
        tagId: '6793',
        slug: 'authorized-security-test',
        name: 'authorized-security-test',
        displayName: '测试',
        postCount: 2,
        usageExcerpt: '',
      },
    ]);
  let selected: string[] = [];
  let labels: Record<string, string> = {};
  const view = renderPicker(
    <TagPicker
      value={selected}
      onChange={(next) => {
        selected = next;
      }}
      selectedLabels={labels}
      onSelectedLabelsChange={(next) => {
        labels = next;
      }}
      createMode="none"
      valueMode="id"
      ariaLabel="搜索父标签"
    />,
  );

  fireEvent.change(view.getByLabelText('搜索父标签'), {
    target: { value: '测试' },
  });
  fireEvent.click(await view.findByText('测试'));

  expect(selected).toEqual(['6793']);
  expect(labels).toEqual({ '6793': '测试' });
  view.rerender(
    <TagPicker
      value={selected}
      onChange={(next) => {
        selected = next;
      }}
      selectedLabels={labels}
      onSelectedLabelsChange={(next) => {
        labels = next;
      }}
      createMode="none"
      valueMode="id"
      ariaLabel="搜索父标签"
    />,
  );
  expect(view.container.querySelectorAll('.tag-picker-selected button').length).toBe(1);
  expect(view.container.querySelector('.tag-picker-selected')?.textContent || '').toBe('测试');
});
