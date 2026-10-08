import {
  rinArticleHydrationPlan,
  rinDeferredMathDisplayMode,
} from './rinArticleHydration';

declare function test(name: string, callback: () => void): void;
declare function expect(actual: unknown): {
  toBe(expected: unknown): void;
};

test('server-final durable bundles do not invoke browser math renderers or hydration', () => {
  const plan = rinArticleHydrationPlan({
    serverFinal: true,
    deferMath: true,
    hasDeferredMath: false,
  });

  expect(plan.renderDeferredMath).toBe(false);
  expect(plan.renderMathTextNodes).toBe(false);
  expect(plan.renderLateXMLMathML).toBe(false);
  expect(plan.renderDiagrams).toBe(false);
  expect(plan.enhanceCodeWithShiki).toBe(false);
  expect(plan.decorateFinalCode).toBe(true);
  expect(plan.hydrateMathJaxStretchy).toBe(false);
});

test('server-final bodies still typeset the deferred math placeholders they publish', () => {
  const plan = rinArticleHydrationPlan({
    serverFinal: true,
    deferMath: false,
    hasDeferredMath: true,
  });

  expect(plan.renderDeferredMath).toBe(true);
  expect(plan.renderMathTextNodes).toBe(false);
  expect(plan.renderLateXMLMathML).toBe(false);
  expect(plan.decorateFinalCode).toBe(true);
  expect(plan.hydrateMathJaxStretchy).toBe(false);
});

test('legacy class-only deferred math placeholders count as display math', () => {
  const equation = document.createElement('div');
  equation.className =
    'rin-display-math rin-equation rin-deferred-math rin-deferred-math-display';
  expect(rinDeferredMathDisplayMode(equation)).toBe(true);

  const display = document.createElement('div');
  display.className =
    'rin-display-math rin-deferred-math rin-deferred-math-display';
  expect(rinDeferredMathDisplayMode(display)).toBe(true);

  const inline = document.createElement('span');
  inline.className = 'rin-inline-math rin-deferred-math';
  expect(rinDeferredMathDisplayMode(inline)).toBe(false);
});

test('browser markdown deferred math placeholders keep their explicit display attribute', () => {
  const display = document.createElement('div');
  display.setAttribute('data-rin-math-display', 'block');
  display.className = 'rin-display-math rin-deferred-math';
  expect(rinDeferredMathDisplayMode(display)).toBe(true);

  const inline = document.createElement('span');
  inline.setAttribute('data-rin-math-display', 'inline');
  inline.className = 'rin-deferred-math';
  expect(rinDeferredMathDisplayMode(inline)).toBe(false);
});

test('historical Markdown keeps the established browser fallback pipeline', () => {
  const plan = rinArticleHydrationPlan({
    serverFinal: false,
    deferMath: true,
    hasDeferredMath: false,
  });

  expect(plan.renderDeferredMath).toBe(true);
  expect(plan.renderMathTextNodes).toBe(true);
  expect(plan.renderLateXMLMathML).toBe(true);
  expect(plan.renderDiagrams).toBe(true);
  expect(plan.enhanceCodeWithShiki).toBe(true);
  expect(plan.decorateFinalCode).toBe(false);
  expect(plan.hydrateMathJaxStretchy).toBe(true);
});
