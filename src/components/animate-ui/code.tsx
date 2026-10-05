import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

import {
  addLineNumbersToHighlightedCode,
  cleanShikiPreHtml,
  plainRinCodePreHtml,
  rinCodeDarkTheme,
  rinCodeHighlighter,
  rinCodeTheme,
} from '@/utils/rinCodeHighlight';
import { AnimateCopyButton } from './content';
import { getStrictContext } from './strict-context';

type CodeContextType = { code: string };

const [CodeProvider, useCode] = getStrictContext<CodeContextType>('CodeContext');

export type CodeProps = React.ComponentProps<'div'> & {
  code: string;
  children?: ReactNode;
};

export function Code({ className = '', code, children, ...props }: CodeProps) {
  return (
    <CodeProvider value={{ code }}>
      <div className={`rin-animate-code ${className}`.trim()} {...props}>
        {children}
      </div>
    </CodeProvider>
  );
}

export type CodeHeaderProps = React.ComponentProps<'div'> & {
  icon?: ElementType;
  copyButton?: boolean;
};

export function CodeHeader({
  className = '',
  children,
  icon: Icon,
  copyButton = false,
  ...props
}: CodeHeaderProps) {
  const { code } = useCode();
  return (
    <div className={`rin-animate-code-header ${className}`.trim()} {...props}>
      {Icon ? <Icon className="rin-animate-code-header-icon" aria-hidden="true" /> : null}
      <span className="rin-animate-code-header-label">{children}</span>
      {copyButton ? <AnimateCopyButton text={code} label="复制代码" /> : null}
    </div>
  );
}

export type CodeBlockProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  /** Raw source to highlight (ignored when `html` is provided). */
  code?: string;
  lang?: string;
  /** Pre-highlighted <pre> HTML (e.g. server-final output) rendered as-is. */
  html?: string;
  lineNumbers?: boolean;
};

export function CodeBlock({
  code = '',
  lang = '',
  html,
  lineNumbers = true,
  className = '',
  ...props
}: CodeBlockProps) {
  const blockRef = useRef<HTMLDivElement>(null);
  // Start with a full-height plain <pre> (same line structure as the Shiki
  // output) so a fresh mount never collapses to a header-only block; the async
  // highlight swaps in place at the same height.
  const [rendered, setRendered] = useState<string>(() => html ?? plainRinCodePreHtml(code));

  useEffect(() => {
    let cancelled = false;
    async function highlight() {
      if (html) {
        setRendered(html);
        return;
      }
      if (!lang) {
        setRendered(plainRinCodePreHtml(code));
        return;
      }
      try {
        const highlighter = await rinCodeHighlighter();
        if (cancelled) return;
        const highlighted = highlighter.codeToHtml(code, {
          lang,
          themes: { light: rinCodeTheme, dark: rinCodeDarkTheme },
        });
        setRendered(cleanShikiPreHtml(highlighted, lang));
      } catch (error) {
        console.error(`Language "${lang}" could not be highlighted.`, error);
        if (!cancelled) setRendered(plainRinCodePreHtml(code));
      }
    }
    void highlight();
    return () => {
      cancelled = true;
    };
  }, [code, html, lang]);

  useEffect(() => {
    if (!lineNumbers) return;
    const codeElement = blockRef.current?.querySelector<HTMLElement>('pre code');
    if (codeElement) addLineNumbersToHighlightedCode(codeElement);
  }, [lineNumbers, rendered]);

  return (
    <div
      ref={blockRef}
      className={`rin-animate-code-block ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: rendered }}
      {...props}
    />
  );
}
