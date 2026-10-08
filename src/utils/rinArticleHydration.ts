export type RinArticleHydrationPlan = {
  renderDeferredMath: boolean;
  renderMathTextNodes: boolean;
  renderLateXMLMathML: boolean;
  renderDiagrams: boolean;
  enhanceCodeWithShiki: boolean;
  decorateFinalCode: boolean;
  hydrateMathJaxStretchy: boolean;
};

export function rinArticleHydrationPlan(options: {
  serverFinal: boolean;
  deferMath: boolean;
  hasDeferredMath: boolean;
}): RinArticleHydrationPlan {
  if (options.serverFinal) {
    return {
      // Durable markdown bundles inline their MathJax CHTML and carry no placeholders, so
      // hasDeferredMath is false and nothing is re-rendered. Legacy LaTeX article bodies publish
      // `.rin-deferred-math` placeholders that only the browser can typeset; skipping them left
      // the raw TeX visible to readers.
      renderDeferredMath: options.hasDeferredMath,
      renderMathTextNodes: false,
      renderLateXMLMathML: false,
      renderDiagrams: false,
      enhanceCodeWithShiki: false,
      decorateFinalCode: true,
      hydrateMathJaxStretchy: false,
    };
  }
  return {
    renderDeferredMath: true,
    renderMathTextNodes: options.deferMath && !options.hasDeferredMath,
    renderLateXMLMathML: true,
    renderDiagrams: true,
    enhanceCodeWithShiki: true,
    decorateFinalCode: false,
    hydrateMathJaxStretchy: true,
  };
}

const rinDeferredMathDisplayClasses = [
  'rin-deferred-math-display',
  'rin-display-math',
];

/**
 * Deferred math placeholders carry display mode in two dialects. Browser markdown output sets
 * `data-rin-math-display`; the legacy LaTeX renderer only sets the display classes. Reading both
 * keeps display equations from being typeset as inline math.
 */
export function rinDeferredMathDisplayMode(element: Element) {
  if (element.getAttribute('data-rin-math-display') === 'block') return true;
  return rinDeferredMathDisplayClasses.some((className) =>
    element.classList.contains(className),
  );
}
