import { publicEnv } from '@/app/config/env';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { localizedErrorMessage } from '@/i18n/errors';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { rinStickerByToken, rinStickerSrc } from '../utils/rinStickers';
import { prefixInlineSvgIds } from '../utils/inlineSvgIds';

type MathTextProps = {
  text: string;
};

type MathToken = {
  kind: 'text' | 'math' | 'image' | 'quote' | 'sticker' | 'mention' | 'diagram';
  value: string;
  display?: boolean;
  alt?: string;
  uid?: string;
  diagramType?: string;
  options?: string;
};

type MarkdownImageMatch = {
  token: MathToken;
  nextIndex: number;
};

type MarkdownQuoteMatch = MarkdownImageMatch;
type StickerMatch = MarkdownImageMatch;
type DiagramMatch = MarkdownImageMatch;

type MathBlock = MathToken[];

type KatexRenderer = typeof import('katex')['default'];

let loadedKatex: KatexRenderer | null = null;
let katexRequest: Promise<KatexRenderer | null> | null = null;

function loadKatex() {
  if (loadedKatex) return Promise.resolve(loadedKatex);
  if (katexRequest) return katexRequest;
  katexRequest = import('katex')
    .then((module) => {
      loadedKatex = module.default;
      return loadedKatex;
    })
    .catch((error: unknown) => {
      console.error('KaTeX could not be loaded', error);
      return null;
    })
    .finally(() => {
      katexRequest = null;
    });
  return katexRequest;
}

function isEscaped(text: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findClosingDelimiter(text: string, start: number, delimiter: string) {
  for (let index = start; index < text.length; index += 1) {
    if (!isEscaped(text, index) && text.startsWith(delimiter, index)) {
      return index;
    }
  }
  return -1;
}

function isSafeImageUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(https?:)?\/\//i.test(trimmed)) return true;
  if (/^(\/|\.\/|\.\.\/)[^\s]*$/i.test(trimmed)) return true;
  return false;
}

function isDiagramImageUrl(value: string) {
  try {
    const parsed = new URL(value, 'https://rinspace.local');
    return parsed.pathname.includes('/api/diagrams/');
  } catch {
    return /(^|\/)api\/diagrams\//.test(value);
  }
}

function findMarkdownImageEnd(text: string, start: number) {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === ')' && !isEscaped(text, index)) return index;
  }
  return -1;
}

function readMarkdownImage(text: string, index: number): MarkdownImageMatch | null {
  if (!text.startsWith('![', index) || isEscaped(text, index)) return null;
  const altEnd = findClosingDelimiter(text, index + 2, ']');
  if (altEnd === -1 || text[altEnd + 1] !== '(') return null;
  const urlStart = altEnd + 2;
  const urlEnd = findMarkdownImageEnd(text, urlStart);
  if (urlEnd === -1) return null;
  const url = text.slice(urlStart, urlEnd).trim();
  if (!isSafeImageUrl(url)) return null;
  return {
    token: {
      kind: 'image',
      value: url,
      alt: text.slice(index + 2, altEnd).trim(),
    },
    nextIndex: urlEnd + 1,
  };
}

function readMarkdownQuote(text: string, index: number): MarkdownQuoteMatch | null {
  if (index > 0 && text[index - 1] !== '\n') return null;
  if (text[index] !== '>') return null;
  const lines = text.slice(index).split('\n');
  const quoteLines: string[] = [];
  let consumed = 0;
  for (const line of lines) {
    if (!line.startsWith('>')) break;
    quoteLines.push(line.replace(/^>\s?/, ''));
    consumed += line.length + 1;
  }
  if (!quoteLines.length) return null;
  return {
    token: {
      kind: 'quote',
      value: quoteLines.join('\n').trim(),
    },
    nextIndex: Math.min(text.length, index + consumed),
  };
}

function readRinSticker(text: string, index: number): StickerMatch | null {
  if (text[index] !== ':' || isEscaped(text, index)) return null;
  const match = text.slice(index).match(/^:rin_[a-z0-9_]+:/);
  if (!match) return null;
  const sticker = rinStickerByToken(match[0]);
  if (!sticker) return null;
  return {
    token: {
      kind: 'sticker',
      value: sticker.token,
      alt: sticker.label,
    },
    nextIndex: index + sticker.token.length,
  };
}

function diagramTypeForEnvironment(environment: string) {
  switch (environment.toLowerCase()) {
    case 'tikzpicture':
      return 'tikzpicture';
    case 'tikzcd':
      return 'tikzcd';
    case 'axis':
      return 'axis';
    case 'pspicture':
      return 'pspicture';
    case 'cd':
      return 'amscd';
    case 'picture':
      return 'picture';
    case 'forest':
      return 'forest';
    case 'circuitikz':
      return 'circuitikz';
    default:
      return '';
  }
}

function findOptionalArgumentEnd(text: string, start: number) {
  if (text[start] !== '[') return start;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (isEscaped(text, index)) continue;
    if (text[index] === '[') depth += 1;
    if (text[index] === ']') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function readDiagramEnvironment(text: string, index: number): DiagramMatch | null {
  if (isEscaped(text, index) || !text.startsWith('\\begin{', index)) return null;
  const begin = text.slice(index).match(/^\\begin\{([A-Za-z]+)\}/);
  if (!begin) return null;
  const environment = begin[1];
  const diagramType = diagramTypeForEnvironment(environment);
  if (!diagramType) return null;

  let bodyStart = index + begin[0].length;
  let options = '';
  if (text[bodyStart] === '[') {
    const optionEnd = findOptionalArgumentEnd(text, bodyStart);
    if (optionEnd === -1) return null;
    options = text.slice(bodyStart + 1, optionEnd - 1).trim();
    bodyStart = optionEnd;
  }

  const endMarker = `\\end{${environment}}`;
  const bodyEnd = text.indexOf(endMarker, bodyStart);
  if (bodyEnd === -1) return null;
  return {
    token: {
      kind: 'diagram',
      value: text.slice(bodyStart, bodyEnd).trim(),
      diagramType,
      options,
      display: true,
    },
    nextIndex: bodyEnd + endMarker.length,
  };
}

function isMentionRune(value: string) {
  if (/^[A-Za-z0-9_.-]$/.test(value)) return true;
  return /^[\u4e00-\u9fff]$/.test(value);
}

function readMention(text: string, index: number): MarkdownImageMatch | null {
  if (!['@', '＠'].includes(text[index]) || isEscaped(text, index)) return null;
  if (text[index + 1] === '[') {
    const displayEnd = findClosingDelimiter(text, index + 2, ']');
    if (displayEnd !== -1 && text[displayEnd + 1] === '(') {
      const refEnd = findMarkdownImageEnd(text, displayEnd + 2);
      if (refEnd === -1) return null;
      const display = text.slice(index + 2, displayEnd).trim();
      const ref = text.slice(displayEnd + 2, refEnd).trim();
      if (display && ref.startsWith('user:')) {
        const uid = ref.slice('user:'.length).trim();
        if (uid) {
          return {
            token: { kind: 'mention', value: display, uid },
            nextIndex: refEnd + 1,
          };
        }
      }
    }
  }
  let cursor = index + 1;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  const start = cursor;
  while (cursor < text.length && isMentionRune(text[cursor])) cursor += 1;
  const value = text.slice(start, cursor).trim();
  if (!value) return null;
  return {
    token: { kind: 'mention', value },
    nextIndex: cursor,
  };
}

function stripHiddenHtmlComments(text: string) {
  return text.replace(/<!--\s*rin-quiver[\s\S]*?-->/g, '');
}

function tokenizeMath(text: string): MathToken[] {
  const source = stripHiddenHtmlComments(text);
  const tokens: MathToken[] = [];
  let index = 0;
  let textBuffer = '';

  const flushText = () => {
    if (textBuffer) {
      tokens.push({ kind: 'text', value: textBuffer });
      textBuffer = '';
    }
  };

  while (index < source.length) {
    const diagram = readDiagramEnvironment(source, index);
    if (diagram) {
      flushText();
      tokens.push(diagram.token);
      index = diagram.nextIndex;
      continue;
    }

    const quote = readMarkdownQuote(source, index);
    if (quote) {
      flushText();
      tokens.push(quote.token);
      index = quote.nextIndex;
      continue;
    }

    const sticker = readRinSticker(source, index);
    if (sticker) {
      flushText();
      tokens.push(sticker.token);
      index = sticker.nextIndex;
      continue;
    }

    const mention = readMention(source, index);
    if (mention) {
      flushText();
      tokens.push(mention.token);
      index = mention.nextIndex;
      continue;
    }

    const image = readMarkdownImage(source, index);
    if (image) {
      flushText();
      tokens.push(image.token);
      index = image.nextIndex;
      continue;
    }

    const delimiter = !isEscaped(source, index) && source.startsWith('$$', index)
      ? { open: '$$', close: '$$', display: true }
      : !isEscaped(source, index) && source.startsWith('\\[', index)
        ? { open: '\\[', close: '\\]', display: true }
        : !isEscaped(source, index) && source.startsWith('\\(', index)
          ? { open: '\\(', close: '\\)', display: false }
          : !isEscaped(source, index) && source[index] === '$' && source[index + 1] !== '$'
            ? { open: '$', close: '$', display: false }
            : null;

    if (!delimiter) {
      textBuffer += source[index];
      index += 1;
      continue;
    }

    const contentStart = index + delimiter.open.length;
    const contentEnd = findClosingDelimiter(source, contentStart, delimiter.close);
    if (contentEnd === -1) {
      textBuffer += delimiter.open;
      index = contentStart;
      continue;
    }

    flushText();
    tokens.push({
      kind: 'math',
      value: source.slice(contentStart, contentEnd),
      display: delimiter.display,
    });
    index = contentEnd + delimiter.close.length;
  }

  flushText();
  return tokens;
}

function extractDiagramSvg(payload: unknown) {
  if (!payload || typeof payload !== 'object') return '';
  const svg = (payload as Record<string, unknown>).svg;
  return typeof svg === 'string' ? svg : '';
}

function localApiUrl(path: string) {
  const basePath = `${publicEnv.publicBasePath || ''}${path}`;
  if (typeof window === 'undefined') return basePath;
  return new URL(basePath, window.location.origin).toString();
}

let mathDiagramSvgInstance = 0;

function nextMathDiagramSvgPrefix() {
  mathDiagramSvgInstance += 1;
  return `math-diagram-${mathDiagramSvgInstance}-`;
}

function DiagramNode({ token }: { token: MathToken }) {
  const { t } = useFeatureTranslation('common');
  const svgPrefixRef = useRef('');
  if (!svgPrefixRef.current) {
    svgPrefixRef.current = nextMathDiagramSvgPrefix();
  }
  const [state, setState] = useState<{
    status: 'loading' | 'ready' | 'error';
    svg?: string;
    error?: string;
  }>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetch(localApiUrl(`/api/diagrams/${encodeURIComponent(token.diagramType || 'tikzcd')}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: token.value,
        options: token.options || '',
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error('diagram render failed');
        }
        const svg = extractDiagramSvg(payload);
        if (!svg) {
          throw new Error('empty diagram svg');
        }
        setState({ status: 'ready', svg });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          error: localizedErrorMessage(error, 'reader.diagramRenderFailed'),
        });
      });

    return () => controller.abort();
  }, [token.diagramType, token.options, token.value]);

  const className = `math-diagram math-diagram-${token.diagramType || 'latex'}`;
  if (state.status === 'ready' && state.svg) {
    return (
      <figure className={className}>
        <div
          className="math-diagram-svg"
          dangerouslySetInnerHTML={{ __html: prefixInlineSvgIds(state.svg, svgPrefixRef.current) }}
        />
      </figure>
    );
  }
  if (state.status === 'error') {
    return (
      <figure className={`${className} math-diagram-error`}>
        <pre>{state.error || token.value}</pre>
      </figure>
    );
  }
  return (
    <figure className={`${className} math-diagram-loading`}>
      <span>{t('media.renderingDiagram')}</span>
    </figure>
  );
}

function MathFormulaNode({ token, forceInline }: { token: MathToken; forceInline: boolean }) {
  const [renderer, setRenderer] = useState<KatexRenderer | null>(() => loadedKatex);
  useEffect(() => {
    if (renderer) return undefined;
    let active = true;
    void loadKatex().then((nextRenderer) => {
      if (active && nextRenderer) setRenderer(() => nextRenderer);
    });
    return () => {
      active = false;
    };
  }, [renderer]);

  const displayMode = forceInline ? false : Boolean(token.display);
  const className = displayMode ? 'math-fragment math-fragment-display' : 'math-fragment';
  if (!renderer) return <span className={className}>{token.value}</span>;
  const html = renderer.renderToString(token.value, {
    displayMode,
    throwOnError: false,
    strict: 'ignore',
    trust: false,
  });
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function MathNode({ token, forceInline = false }: { token: MathToken; forceInline?: boolean }) {
  const { t } = useFeatureTranslation('common');
  if (token.kind === 'text') return <>{token.value}</>;
  if (token.kind === 'diagram') return <DiagramNode token={token} />;
  if (token.kind === 'mention') {
    if (!token.uid) {
      return <span className="mention-text">@{token.value}</span>;
    }
    const href = `${publicEnv.publicBasePath || ''}/@${encodeURIComponent(token.uid)}`;
    return (
      <a className="mention-link" href={href}>
        @{token.value}
      </a>
    );
  }
  if (token.kind === 'quote') return <blockquote>{token.value}</blockquote>;
  if (token.kind === 'sticker') {
    const sticker = rinStickerByToken(token.value);
    if (!sticker) return <>{token.value}</>;
    return (
      <img
        className="rin-sticker-inline"
        src={rinStickerSrc(sticker)}
        alt={sticker.label}
        loading="lazy"
      />
    );
  }
  if (token.kind === 'image') {
    const quiverImage = isDiagramImageUrl(token.value);
    return (
      <figure className={`math-text-image${quiverImage ? ' rin-quiver rin-quiver-image-figure' : ''}`}>
        <img
          className={quiverImage ? 'rin-quiver-image' : undefined}
          src={token.value}
          alt={token.alt || t('media.commentImage')}
          loading="lazy"
        />
        {token.alt && !quiverImage ? <figcaption>{token.alt}</figcaption> : null}
      </figure>
    );
  }

  return <MathFormulaNode token={token} forceInline={forceInline} />;
}

function mathBlocks(text: string): MathBlock[] {
  const blocks: MathBlock[] = [];
  let currentBlock: MathBlock = [];

  const pushCurrentBlock = () => {
    if (currentBlock.length || blocks.length === 0) blocks.push(currentBlock);
    currentBlock = [];
  };

  tokenizeMath(text).forEach((token) => {
    if (token.kind === 'quote') {
      if (currentBlock.length) pushCurrentBlock();
      blocks.push([token]);
      return;
    }

    if (token.kind === 'image' || token.kind === 'diagram') {
      if (currentBlock.length) pushCurrentBlock();
      blocks.push([token]);
      return;
    }

    if (token.kind === 'math' && token.display) {
      if (currentBlock.length) pushCurrentBlock();
      blocks.push([token]);
      return;
    }

    if (token.kind === 'math') {
      currentBlock.push(token);
      return;
    }

    if (token.kind === 'sticker') {
      currentBlock.push(token);
      return;
    }

    if (token.kind === 'mention') {
      currentBlock.push(token);
      return;
    }

    token.value.split(/(\n{2,})/).forEach((segment) => {
      if (!segment) return;
      if (/^\n{2,}$/.test(segment)) {
        pushCurrentBlock();
        return;
      }

      const value = segment.replace(/[ \t]*\n[ \t]*/g, ' ');
      if (value) currentBlock.push({ kind: 'text', value });
    });
  });

  if (currentBlock.length || blocks.length === 0) pushCurrentBlock();
  return blocks;
}

export function MathInline({ text }: MathTextProps) {
  const { t } = useFeatureTranslation('common');
  const children: ReactNode[] = tokenizeMath(text).map((token, tokenIndex) =>
    token.kind === 'image' ? (
      <span key={`${token.kind}-${tokenIndex}`}>{token.alt || token.value}</span>
    ) : token.kind === 'diagram' ? (
      <span key={`${token.kind}-${tokenIndex}`}>{t('media.diagram')}</span>
    ) : token.kind === 'sticker' ? (
      <span key={`${token.kind}-${tokenIndex}`}>{token.alt || token.value}</span>
    ) : token.kind === 'mention' ? (
      <MathNode token={token} forceInline key={`${token.kind}-${tokenIndex}`} />
    ) : token.kind === 'quote' ? (
      <span key={`${token.kind}-${tokenIndex}`}>{token.value}</span>
    ) : (
      <MathNode token={token} forceInline key={`${token.kind}-${tokenIndex}`} />
    ),
  );
  return <span className="math-inline">{children.length ? children : text}</span>;
}

export default function MathText({ text }: MathTextProps) {
  const blocks = mathBlocks(text);
  return (
    <div className="math-text">
      {blocks.map((block, blockIndex) => {
        if (block.length === 1 && block[0].kind === 'image') {
          return (
            <MathNode
              token={block[0]}
              key={`${blockIndex}-${block[0].value.slice(0, 24)}`}
            />
          );
        }
        if (block.length === 1 && block[0].kind === 'diagram') {
          return (
            <MathNode
              token={block[0]}
              key={`${blockIndex}-${block[0].diagramType}-${block[0].value.slice(0, 24)}`}
            />
          );
        }
        if (block.length === 1 && block[0].kind === 'quote') {
          return (
            <MathNode
              token={block[0]}
              key={`${blockIndex}-${block[0].value.slice(0, 24)}`}
            />
          );
        }
        const children: ReactNode[] = block.map((token, tokenIndex) => (
          <MathNode token={token} key={`${token.kind}-${blockIndex}-${tokenIndex}`} />
        ));
        return (
          <p
            className={
              block.length === 1 && block[0].kind === 'math' && block[0].display
                ? 'math-text-display-row'
                : undefined
            }
            key={`${blockIndex}-${block.map((token) => token.value).join('').slice(0, 24)}`}
          >
            {children.length ? children : '\u00a0'}
          </p>
        );
      })}
    </div>
  );
}
