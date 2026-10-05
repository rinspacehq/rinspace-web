import { render, waitFor } from '@testing-library/react';

import MathText from './MathText';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toBeNull(): void;
  toContain(expected: unknown): void;
  not: {
    toBeNull(): void;
    toContain(expected: unknown): void;
  };
};

test('keeps inline math in the surrounding paragraph across soft line breaks', () => {
  const { container } = render(<MathText text={'设\n$A \\to B$\n是一个态射。'} />);
  const paragraphs = container.querySelectorAll('.math-text > p');

  expect(paragraphs.length).toBe(1);
  expect(paragraphs[0].childNodes.length).toBe(3);
  expect(paragraphs[0].querySelector('.math-fragment-display')).toBeNull();
  expect(paragraphs[0].querySelector('.math-fragment')).not.toBeNull();
});

test('renders display math as its own row', () => {
  const { container } = render(<MathText text={'正文\n\n$$x^2+y^2=z^2$$\n\n后文'} />);
  const paragraphs = container.querySelectorAll('.math-text > p');

  expect(paragraphs.length).toBe(3);
  expect(paragraphs[1].classList.contains('math-text-display-row')).toBe(true);
  expect(paragraphs[1].querySelector('.math-fragment-display')).not.toBeNull();
});

test('hides quiver metadata comments before diagram images', () => {
  const { container } = render(
    <MathText
      text={
        '<!-- rin-quiver url="https://rinspace.com/quiver/#q=abc123" type="tikzcd" -->\n![abc123](/rin/api/diagrams/tikzcd/example.svg)'
      }
    />,
  );

  expect(container.textContent?.includes('rin-quiver')).toBe(false);
  expect(container.querySelector('.rin-quiver-image')).not.toBeNull();
  expect(container.querySelector('figcaption')).toBeNull();
});

test('renders tikzcd environments through the diagram API', async () => {
  const previousFetch = global.fetch;
  let requestedUrl = '';
  let requestedBody = '';
  global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedBody = String(init?.body || '');
    return Promise.resolve(
      new Response(
        JSON.stringify({
          type: 'tikzcd',
          svg: '<svg viewBox="0 0 10 10"><path stroke="#000"/></svg>',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }) as typeof fetch;

  try {
    const { container } = render(
      <MathText text={'\\begin{tikzcd}[column sep=large]\nA \\arrow[r] & B\n\\end{tikzcd}'} />,
    );

    await waitFor(() => {
      expect(container.querySelector('.math-diagram-svg')).not.toBeNull();
    });

    const payload = JSON.parse(requestedBody) as { body?: string; options?: string };
    expect(requestedUrl.endsWith('/api/diagrams/tikzcd')).toBe(true);
    expect(payload.body?.includes('\\arrow[r]')).toBe(true);
    expect(payload.options).toBe('column sep=large');
  } finally {
    global.fetch = previousFetch;
  }
});

test('renders explicit user mentions with uid links only', () => {
  const { container } = render(
    <MathText text={'欢迎 @[Rin 用户](user:rin-user-206) 来到这里。'} />,
  );

  const link = container.querySelector('.mention-link') as HTMLAnchorElement | null;
  expect(link).not.toBeNull();
  expect(link?.getAttribute('href')).toBe('/rinspace/@rin-user-206');
  expect(link?.textContent).toBe('@Rin 用户');
});

test('keeps plain @mentions as text when no uid is present', () => {
  const { container } = render(<MathText text={'欢迎 @Rin 用户 来到这里。'} />);

  expect(container.querySelector('.mention-link')).toBeNull();
  expect(container.textContent).toContain('@Rin 用户');
  expect(container.textContent).not.toContain('/@Rin 用户');
});
