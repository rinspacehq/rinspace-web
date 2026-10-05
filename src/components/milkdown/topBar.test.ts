import { beforeEach, describe, expect, it } from 'vitest';

import { applyMilkdownTopBarLabels } from './topBar';

describe('Milkdown top bar labels', () => {
  beforeEach(() => {
    const host = document.createElement('div');
    host.id = 'editor';
    const toolbar = document.createElement('div');
    toolbar.className = 'top-bar-inner';
    const headingSelector = document.createElement('div');
    headingSelector.className = 'top-bar-heading-selector';
    const heading = document.createElement('button');
    heading.className = 'top-bar-heading-button';
    heading.type = 'button';
    heading.textContent = 'Paragraph';
    headingSelector.append(heading);
    toolbar.append(headingSelector);
    for (let index = 0; index < 2; index += 1) {
      const item = document.createElement('button');
      item.className = 'top-bar-item';
      item.type = 'button';
      toolbar.append(item);
    }
    host.append(toolbar);
    document.body.replaceChildren(host);
  });

  it('adds accessible names and visible tooltip content to toolbar controls', () => {
    const host = document.querySelector<HTMLElement>('#editor');
    expect(host).not.toBeNull();

    applyMilkdownTopBarLabels(host!, {
      toolbar: 'Markdown editing tools',
      heading: 'Paragraph and heading',
      items: ['Bold', 'Italic'],
    });

    const toolbar = host!.querySelector('.top-bar-inner');
    const heading = host!.querySelector('.top-bar-heading-button');
    const items = host!.querySelectorAll('.top-bar-item');

    expect(toolbar?.getAttribute('role')).toBe('toolbar');
    expect(toolbar?.getAttribute('aria-label')).toBe('Markdown editing tools');
    expect(heading?.getAttribute('aria-label')).toBe('Paragraph and heading');
    expect(heading?.getAttribute('data-rin-tooltip')).toBe('Paragraph and heading');
    expect(items[0]?.getAttribute('aria-label')).toBe('Bold');
    expect(items[0]?.getAttribute('data-rin-tooltip')).toBe('Bold');
    expect(items[1]?.getAttribute('aria-label')).toBe('Italic');
    expect(items[1]?.getAttribute('data-rin-tooltip')).toBe('Italic');
    expect(items[1]?.getAttribute('title')).toBeNull();
  });
});
