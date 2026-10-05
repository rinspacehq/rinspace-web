import { publicEnv } from '@/app/config/env';
import { authHeaders, getAuthAccessToken, getAuthDeviceId } from '@/services/phoneAuth';
import { editorViewCtx, schemaCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { Fragment, Slice } from '@milkdown/kit/prose/model';

type QuiverExportMessage = {
  scope: 'rin-quiver';
  type: 'export-tikzcd-result';
  requestId: string | null;
  ok: boolean;
  error?: string;
  payload?: {
    data?: string;
    url?: string;
  };
};

export type TikzcdDiagramSource = {
  body: string;
  options: string;
};

type RenderedDiagram = {
  url: string;
  svg?: string;
};

function quiverEditorNodes(ctx: Ctx, imageUrl: string) {
  const schema = ctx.get(schemaCtx);
  const imageBlockType = schema.nodes['image-block'];
  if (!imageBlockType) {
    throw new Error('The editor is missing the node required for Quiver images.');
  }
  return [
    imageBlockType.create({
      src: imageUrl,
      caption: '',
      ratio: 1,
    }),
  ];
}

export function insertQuiverDiagramBlock(imageUrl: string) {
  return (ctx: Ctx) => {
    const view = ctx.get(editorViewCtx);
    const nodes = quiverEditorNodes(ctx, imageUrl);
    view.dispatch(
      view.state.tr
        .replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0))
        .scrollIntoView(),
    );
  };
}

export function replaceQuiverDiagramBlock(oldImageUrl: string, nextImageUrl: string) {
  return (ctx: Ctx) => {
    const view = ctx.get(editorViewCtx);
    const nodes = quiverEditorNodes(ctx, nextImageUrl);
    const oldID = diagramIdFromImageUrl(oldImageUrl);
    let targetPos = -1;
    let targetSize = 0;
    let targetAttrs: Record<string, unknown> | null = null;

    view.state.doc.descendants((node, pos) => {
      if (targetPos >= 0) return false;
      if (node.type.name !== 'image-block') return true;
      const src = typeof node.attrs.src === 'string' ? node.attrs.src : '';
      if (diagramIdFromImageUrl(src) !== oldID) return true;
      targetPos = pos;
      targetSize = node.nodeSize;
      targetAttrs = { ...node.attrs };
      return false;
    });

    if (targetPos < 0) {
      view.dispatch(
        view.state.tr
          .replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0))
          .scrollIntoView(),
      );
      return;
    }

    const schema = ctx.get(schemaCtx);
    const imageBlockType = schema.nodes['image-block'];
    if (!imageBlockType) {
      throw new Error('The editor is missing the node required for Quiver images.');
    }
    const replacement = imageBlockType.create({
      ...(targetAttrs || {}),
      src: nextImageUrl,
    });
    view.dispatch(
      view.state.tr
        .replaceWith(targetPos, targetPos + targetSize, replacement)
        .scrollIntoView(),
    );
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

export function readQuiverExportMessage(value: unknown): QuiverExportMessage | null {
  if (!isObject(value)) return null;
  if (value.scope !== 'rin-quiver' || value.type !== 'export-tikzcd-result') {
    return null;
  }
  const payload = isObject(value.payload) ? value.payload : undefined;
  return {
    scope: 'rin-quiver',
    type: 'export-tikzcd-result',
    requestId: typeof value.requestId === 'string' ? value.requestId : null,
    ok: value.ok === true,
    error: typeof value.error === 'string' ? value.error : undefined,
    payload: payload
      ? {
          data: typeof payload.data === 'string' ? payload.data : undefined,
          url: typeof payload.url === 'string' ? payload.url : undefined,
        }
      : undefined,
  };
}

export function normalizeQuiverTikzcd(value: string) {
  const text = value.trim();
  const begin = text.indexOf('\\begin{tikzcd}');
  const end = text.indexOf('\\end{tikzcd}', begin);
  if (begin < 0 || end < begin) return text;
  return text.slice(begin, end + '\\end{tikzcd}'.length).trim();
}

function optionalArgumentEnd(text: string, start: number) {
  if (text[start] !== '[') return start;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

export function parseTikzcdSource(source: string): TikzcdDiagramSource | null {
  const text = normalizeQuiverTikzcd(source);
  const begin = text.indexOf('\\begin{tikzcd}');
  if (begin < 0) {
    const body = text.trim();
    return body ? { body, options: '' } : null;
  }
  let bodyStart = begin + '\\begin{tikzcd}'.length;
  let options = '';
  if (text[bodyStart] === '[') {
    const optionEnd = optionalArgumentEnd(text, bodyStart);
    if (optionEnd < 0) return null;
    options = text.slice(bodyStart + 1, optionEnd - 1).trim();
    bodyStart = optionEnd;
  }
  const bodyEnd = text.indexOf('\\end{tikzcd}', bodyStart);
  if (bodyEnd < 0) return null;
  const body = text.slice(bodyStart, bodyEnd).trim();
  return body ? { body, options } : null;
}

function quiverCodeFromUrl(url: string) {
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : url;
  const params = new URLSearchParams(hash);
  return params.get('q') || '';
}

function isLikelyQuiverCode(value: string) {
  const code = value.trim();
  return code.length >= 8 && /^[A-Za-z0-9+/=_-]+$/.test(code);
}

export function diagramIdFromImageUrl(value: string, origin = window.location.origin) {
  const raw = value.trim();
  if (!raw) return '';
  const repositoryPath = (() => {
    const marker = '#rin-repository-path=';
    const index = raw.indexOf(marker);
    if (index < 0) return raw.replace(/^\.\//, '');
    try {
      return decodeURIComponent(raw.slice(index + marker.length));
    } catch {
      return '';
    }
  })();
  const repositoryMatch = repositoryPath.match(/^assets\/quiver\/([a-z0-9][a-z0-9_-]{0,63})\.svg$/);
  if (repositoryMatch?.[1]) return repositoryMatch[1];
  try {
    const parsed = new URL(raw, origin);
    const match = parsed.pathname.match(/\/rin\/api\/diagrams\/([^/?#]+)/);
    return match?.[1] ? decodeURIComponent(match[1]).replace(/\.svg$/, '') : '';
  } catch {
    const match = raw.match(/\/rin\/api\/diagrams\/([^/?#]+)/);
    return match?.[1] ? decodeURIComponent(match[1]).replace(/\.svg$/, '') : '';
  }
}

export function isRepositoryQuiverImageUrl(value: string) {
  const raw = value.trim();
  if (!raw) return false;
  const marker = '#rin-repository-path=';
  const index = raw.indexOf(marker);
  let repositoryPath = raw.replace(/^\.\//, '');
  if (index >= 0) {
    try {
      repositoryPath = decodeURIComponent(raw.slice(index + marker.length));
    } catch {
      return false;
    }
  }
  return /^assets\/quiver\/[a-z0-9][a-z0-9_-]{0,63}\.svg$/.test(repositoryPath);
}

export function tikzcdDiagramSourceText(source: TikzcdDiagramSource) {
  const options = source.options.trim();
  return [
    `\\begin{tikzcd}${options ? `[${options}]` : ''}`,
    source.body.trim(),
    '\\end{tikzcd}',
  ].join('\n');
}

export async function loadTikzcdDiagramSource(id: string): Promise<TikzcdDiagramSource> {
  const diagramID = id.trim();
  if (!diagramID) throw new Error('Missing Quiver diagram identifier.');
  const response = await fetch(
    `${publicEnv.publicBasePath || ''}/api/diagrams/${encodeURIComponent(diagramID)}/source`,
  );
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok || !isObject(payload)) {
    const message = isObject(payload) && typeof payload.message === 'string'
      ? payload.message
      : text;
    throw new Error(message || 'Unable to read the Quiver diagram source.');
  }
  const type = typeof payload.type === 'string' ? payload.type : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const options = typeof payload.options === 'string' ? payload.options.trim() : '';
  if (type !== 'tikzcd') throw new Error('This image is not a Quiver commutative diagram.');
  if (!body) throw new Error('The Quiver diagram source is empty.');
  return { body, options };
}

export async function renderTikzcdDiagram(
  source: TikzcdDiagramSource,
): Promise<RenderedDiagram> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(`${publicEnv.publicBasePath || ''}/api/diagrams/tikzcd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: source.body,
        options: source.options,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Quiver diagram rendering timed out.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok || !isObject(payload)) {
    const message = isObject(payload) && typeof payload.message === 'string'
      ? payload.message
      : text;
    throw new Error(message || 'Unable to render the Quiver diagram.');
  }
  const url = typeof payload.url === 'string' ? payload.url : '';
  if (!url) throw new Error('The Quiver renderer did not return an image URL.');
  return { url };
}

export async function renderTikzcdRepositoryDiagram(
  source: TikzcdDiagramSource,
  options: { legacyMigration?: boolean } = {},
): Promise<Required<RenderedDiagram>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    const accessToken = await getAuthAccessToken();
    response = await fetch(`${publicEnv.publicBasePath || ''}/api/author/diagrams/tikzcd`, {
      method: 'POST',
      headers: {
        ...authHeaders(accessToken),
        'Content-Type': 'application/json',
        'x-device-id': getAuthDeviceId(),
        ...(options.legacyMigration ? { 'X-Rin-Legacy-Quiver-Migration': 'true' } : {}),
      },
      body: JSON.stringify({ body: source.body, options: source.options }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Quiver diagram rendering timed out.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok || !isObject(payload)) {
    const message = isObject(payload) && typeof payload.message === 'string'
      ? payload.message
      : text;
    throw new Error(message || 'Unable to render the Quiver diagram.');
  }
  const svg = typeof payload.svg === 'string' ? payload.svg : '';
  if (!svg.trimStart().startsWith('<svg')) {
    throw new Error('The Quiver renderer did not return an SVG image.');
  }
  return { url: '', svg };
}

function previousNonEmptyLine(lines: string[], index: number) {
  for (let lineIndex = index - 1; lineIndex >= 0; lineIndex -= 1) {
    const line = lines[lineIndex]?.trim() || '';
    if (line) return line;
  }
  return '';
}

function quiverCodeFromComment(comment: string) {
  const match = comment.match(/rin-quiver\s+url="([^"]+)"/);
  if (!match?.[1]) return '';
  return quiverCodeFromUrl(match[1].replace(/&amp;/g, '&'));
}

type DiagramImageLine = {
  alt: string;
  url: string;
  title: string;
};

function unquoteMarkdownTitle(value: string) {
  const text = value.trim();
  if (!text) return '';
  const quote = text[0];
  if (
    (quote === '"' && text.endsWith('"')) ||
    (quote === "'" && text.endsWith("'")) ||
    (quote === '(' && text.endsWith(')'))
  ) {
    return text
      .slice(1, -1)
      .replace(/\\(["'()\\])/g, '$1')
      .trim();
  }
  return text;
}

function markdownImageAlt(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

function parseDiagramImageLine(line: string): DiagramImageLine | null {
  const match = line
    .trim()
    .match(/^!\[([^\]]*)\]\((\/rin\/api\/diagrams\/[^)\s]+|https?:\/\/[^)\s]+\/rin\/api\/diagrams\/[^)\s]+)(?:\s+(.+))?\)$/);
  if (!match?.[2]) return null;
  return {
    alt: match[1] || '',
    url: match[2],
    title: match[3] ? unquoteMarkdownTitle(match[3]) : '',
  };
}

function normalizedDiagramImageAlt(image: DiagramImageLine) {
  const title = image.title.trim();
  if (title) return title;
  const alt = image.alt.trim();
  if (!alt || isLikelyQuiverCode(alt) || /^\d+(?:\.\d+)?$/.test(alt)) {
    return 'Quiver diagram';
  }
  return alt;
}

export function normalizeQuiverImages(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const nextLines: string[] = [];

  lines.forEach((line, index) => {
    const image = parseDiagramImageLine(line);
    const previous = previousNonEmptyLine(nextLines, nextLines.length);
    if (/^<!--\s*rin-quiver\b[\s\S]*-->$/.test(line.trim())) {
      return;
    }
    if (!image) {
      nextLines.push(lines[index] ?? line);
      return;
    }

    const existingCode = isLikelyQuiverCode(image.alt || '') ? image.alt || '' : '';
    const commentCode = previous.includes('rin-quiver') ? quiverCodeFromComment(previous) : '';
    const code = existingCode || commentCode;
    const alt = markdownImageAlt(normalizedDiagramImageAlt(image));
    if (code || commentCode) {
      nextLines.push(`![${alt}](${image.url})`);
      return;
    }
    nextLines.push(`![${alt}](${image.url})`);
  });

  return nextLines.join('\n');
}
