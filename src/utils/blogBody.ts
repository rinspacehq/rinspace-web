import katex from 'katex';

import { publicEnv } from '@/app/config/env';
import type { FeedItem, PostDetail, SourceFileInfo } from '@/services/contracts';
import { canonicalGiteaPathname } from './giteaPaths';
import { rinStickerSrc, rinStickers } from './rinStickers';

export type BlogEditorKind = 'rin' | 'markdown' | 'typst';

const markdownHtmlMarker = 'RIN_MARKDOWN';
const markdownSourceMarker = 'RIN_MARKDOWN_SOURCE';
const markdownFileMarker = 'RIN_MARKDOWN_FILE';
const markdownRenderMarker = 'RIN_MARKDOWN_RENDER';
const rinSourceFileMarker = 'RIN_SOURCE_FILE';
const markdownRenderSchema = 'rin-markdown-article-render/v1';
const markdownResultSchema = 'rin-render-result/v1';
const markdownBundleSchemaV1 = 'rin-document-bundle/v1';
const markdownBundleSchemaV2 = 'rin-document-bundle/v2';
const markdownProjectGraphSchema = 'rin-project-graph/v1';
const markdownRenderMaxEncodedBytes = 24 * 1024 * 1024;
const markdownRenderRequiredVersions = [
  'rinRenderer',
  'markdownAdapter',
  'markdownPipeline',
  'markdownSanitizer',
  'shiki',
  'mathJax',
  'mathJaxFont',
  'diagramEngine',
] as const;
const markdownWhitespaceEntityPattern =
  /&(?:#(?:0*32|x0*20|0*160|x0*a0);|nbsp;|ensp;|emsp;|thinsp;)/gi;
const markdownCodeFencePattern = /^\s{0,3}(```+|~~~+)/;

export function extractMarkedSection(body: string, marker: string) {
  const startMarker = `[[${marker}]]`;
  const endMarker = `[[/${marker}]]`;
  const start = body.indexOf(startMarker);
  if (start < 0) return '';
  const end = body.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return '';
  return body.slice(start + startMarker.length, end).trim();
}

export function rinWriterHtml(body: string) {
  return extractMarkedSection(body, 'RIN_WRITER');
}

export function rinWriterArchiveJson(body: string) {
  return extractMarkedSection(body, 'RIN_ARCHIVE');
}

export function markdownBlogHtml(body: string) {
  return extractMarkedSection(body, markdownHtmlMarker);
}

export function markdownBlogSource(body: string) {
  return extractMarkedSection(body, markdownSourceMarker);
}

export type StoredMarkdownArticleRender = {
  html: string;
  sourceSha256: string;
  jobId: string;
  projectHash: string;
  resultHash: string;
  bundleHash: string;
  versions: Readonly<Record<string, string>>;
};

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isMarkdownRenderHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isMarkdownRenderJobId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
}

function isMarkdownRenderRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

function isMarkdownRenderEntrypoint(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 255 &&
    value !== '.' &&
    value !== '..' &&
    !/[\u0000-\u001f\\]/.test(value) &&
    !value.startsWith('/') &&
    !value.split('/').some((part) => part === '' || part === '.' || part === '..')
  );
}

function decodeBase64UrlUtf8(value: string) {
  if (
    !value ||
    value.length > markdownRenderMaxEncodedBytes ||
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    value.length % 4 === 1
  ) {
    return '';
  }
  try {
    const padded = `${value.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat((4 - value.length % 4) % 4)}`;
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    let percentEncoded = '';
    for (let index = 0; index < bytes.length; index += 1) {
      percentEncoded += `%${bytes[index].toString(16).padStart(2, '0')}`;
    }
    return decodeURIComponent(percentEncoded);
  } catch {
    return '';
  }
}

function validMarkdownRenderVersions(value: unknown): value is Record<string, string> {
  if (!isUnknownRecord(value)) return false;
  if (!Object.entries(value).every(([component, version]) => isNonEmptyString(component) && isNonEmptyString(version))) {
    return false;
  }
  return markdownRenderRequiredVersions.every((component) => isNonEmptyString(value[component]));
}

function validMarkdownRenderCache(value: unknown) {
  return (
    isUnknownRecord(value) &&
    typeof value.hit === 'boolean' &&
    Array.isArray(value.reusedStages) &&
    value.reusedStages.every((stage) => typeof stage === 'string')
  );
}

function validMarkdownRenderTOC(value: unknown) {
  return Array.isArray(value) && value.every((entry) => (
    isUnknownRecord(entry) &&
    isNonEmptyString(entry.id) &&
    Number.isInteger(entry.depth) &&
    Number(entry.depth) > 0 &&
    typeof entry.text === 'string'
  ));
}

function validMarkdownRenderDiagnostics(value: unknown) {
  return Array.isArray(value) && value.every((diagnostic) => (
    isUnknownRecord(diagnostic) &&
    isNonEmptyString(diagnostic.code) &&
    isNonEmptyString(diagnostic.severity) &&
    isNonEmptyString(diagnostic.message) &&
    isNonEmptyString(diagnostic.stage)
  ));
}

function validMarkdownResultDiagnostics(value: unknown) {
  return value === null || validMarkdownRenderDiagnostics(value);
}

function validMarkdownBundleAssets(value: unknown) {
  return Array.isArray(value) && value.every((asset) => (
    isUnknownRecord(asset) &&
    isNonEmptyString(asset.id) &&
    isNonEmptyString(asset.kind) &&
    isMarkdownRenderHash(asset.sha256) &&
    typeof asset.bytes === 'number' && Number.isInteger(asset.bytes) && asset.bytes >= 0 &&
    isNonEmptyString(asset.mediaType)
  ));
}

function validMarkdownResultAssets(value: unknown) {
  return Array.isArray(value) && value.every((asset) => (
    isUnknownRecord(asset) &&
    isNonEmptyString(asset.artifactId) &&
    isMarkdownRenderHash(asset.sha256) &&
    typeof asset.bytes === 'number' && Number.isInteger(asset.bytes) && asset.bytes >= 0 &&
    isNonEmptyString(asset.mediaType) &&
    asset.visibility === 'public'
  ));
}

const markdownBlockKinds = new Set([
  'heading',
  'paragraph',
  'list-item',
  'theorem',
  'math',
  'code',
  'figure',
  'table',
  'quote',
]);

function validMarkdownDocumentBlock(value: unknown) {
  if (!isUnknownRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    /^rb_[a-f0-9]{32}$/.test(value.id) &&
    typeof value.kind === 'string' &&
    markdownBlockKinds.has(value.kind) &&
    typeof value.text === 'string' &&
    isMarkdownRenderHash(value.textHash) &&
    Array.isArray(value.headingPath) &&
    value.headingPath.every((heading) => isNonEmptyString(heading))
  );
}

function validMarkdownPageBlocks(schemaVersion: string, page: Record<string, unknown>) {
  if (schemaVersion === markdownBundleSchemaV1) return page.blocks === undefined;
  if (schemaVersion !== markdownBundleSchemaV2 || !Array.isArray(page.blocks) || page.blocks.length === 0) return false;
  if (!page.blocks.every(validMarkdownDocumentBlock)) return false;
  const ids = page.blocks.map((block) => (block as Record<string, unknown>).id as string);
  if (new Set(ids).size !== ids.length || typeof page.fragment !== 'string') return false;
  const fragmentIds = [...page.fragment.matchAll(/\bdata-rin-block-id\s*=\s*["'](rb_[a-f0-9]{32})["']/gi)]
    .map((match) => match[1]);
  if (fragmentIds.length !== ids.length) return false;
  const fragmentCounts = new Map<string, number>();
  fragmentIds.forEach((id) => fragmentCounts.set(id, (fragmentCounts.get(id) || 0) + 1));
  return ids.every((id) => fragmentCounts.get(id) === 1);
}

/**
 * Reads only the server-owned, durable Markdown article result contract. Invalid, incomplete,
 * legacy, or source-only bodies intentionally return null so the reader can use its historical
 * browser fallback. The HTML is still passed through the reader sanitizer before insertion.
 */
export function markdownStoredArticleRender(body: string): StoredMarkdownArticleRender | null {
  const source = markdownBlogSource(body);
  const encoded = extractMarkedSection(body, markdownRenderMarker);
  if (!source || !encoded) return null;
  const decoded = decodeBase64UrlUtf8(encoded);
  if (!decoded) return null;
  let stored: unknown;
  try {
    stored = JSON.parse(decoded) as unknown;
  } catch {
    return null;
  }
  if (!isUnknownRecord(stored) || stored.schemaVersion !== markdownRenderSchema || !isMarkdownRenderHash(stored.sourceSha256)) {
    return null;
  }
  const activeBinding = stored.entrypoint !== undefined;
  if (activeBinding) {
    if (
      !isNonEmptyString(stored.entrypoint) ||
      stored.entrypoint.length > 512 ||
      stored.entrypoint.startsWith('/') ||
      stored.entrypoint.includes('\\') ||
      stored.entrypoint.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      return null;
    }
  }

  const result = stored.result;
  if (
    !isUnknownRecord(result) ||
    result.schemaVersion !== markdownResultSchema ||
    !isMarkdownRenderJobId(result.jobId) ||
    !isMarkdownRenderRequestId(result.requestId) ||
    result.contentKind !== 'markdown' ||
    result.engine !== 'rin-markdown' ||
    !isMarkdownRenderHash(result.projectHash) ||
    !isMarkdownRenderHash(result.resultHash) ||
    !validMarkdownRenderVersions(result.versions) ||
    !validMarkdownResultAssets(result.assets) ||
    !validMarkdownResultDiagnostics(result.diagnostics) ||
    !validMarkdownRenderCache(result.cache)
  ) {
    return null;
  }

  const bundle = result.inline;
  if (
    !isUnknownRecord(bundle) ||
    (bundle.schemaVersion !== markdownBundleSchemaV1 && bundle.schemaVersion !== markdownBundleSchemaV2) ||
    bundle.state !== 'final' ||
    bundle.contentKind !== 'markdown' ||
    bundle.documentEngine !== 'rin-markdown' ||
    bundle.projectHash !== result.projectHash ||
    bundle.bundleHash !== result.resultHash ||
    !isNonEmptyString(bundle.title) ||
    !Array.isArray(bundle.pages) || bundle.pages.length !== 1 ||
    !Array.isArray(bundle.workUnits) || bundle.workUnits.length !== 0 ||
    !validMarkdownBundleAssets(bundle.assets) ||
    !validMarkdownRenderDiagnostics(bundle.diagnostics) ||
    !isUnknownRecord(bundle.provenance)
  ) {
    return null;
  }
  const provenance = bundle.provenance;
  if (
    provenance.adapter !== 'rin-markdown' ||
    provenance.projectGraphSchemaVersion !== markdownProjectGraphSchema ||
    provenance.adapterVersion !== result.versions.markdownAdapter ||
    provenance.engineVersion !== result.versions.markdownPipeline
  ) {
    return null;
  }

  const page = bundle.pages[0];
  if (
    !isUnknownRecord(page) ||
    !isNonEmptyString(page.id) ||
    !isMarkdownRenderEntrypoint(page.sourcePath) ||
    (activeBinding && page.sourcePath !== stored.entrypoint) ||
    page.fragmentFormat !== 'html' ||
    !isNonEmptyString(page.fragment) ||
    !validMarkdownRenderTOC(page.toc) ||
    !Array.isArray(page.dependencyHashes) ||
    !page.dependencyHashes.every(isMarkdownRenderHash) ||
    !validMarkdownPageBlocks(bundle.schemaVersion, page) ||
    (!activeBinding && !page.dependencyHashes.includes(stored.sourceSha256))
  ) {
    return null;
  }

  return {
    html: page.fragment,
    sourceSha256: stored.sourceSha256,
    jobId: result.jobId,
    projectHash: result.projectHash,
    resultHash: result.resultHash,
    bundleHash: bundle.bundleHash,
    versions: Object.freeze({ ...(result.versions as Record<string, string>) }),
  };
}

function markedSourceFileInfo(body: string, marker: string): SourceFileInfo | null {
  const raw = extractMarkedSection(body, marker);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const file = value as Record<string, unknown>;
    if (typeof file.filename !== 'string' || typeof file.url !== 'string') {
      return null;
    }
    return {
      filename: file.filename,
      mime: typeof file.mime === 'string' ? file.mime : undefined,
      bytes: typeof file.bytes === 'number' ? file.bytes : undefined,
      url: file.url,
    };
  } catch {
    return null;
  }
}

export function markdownBlogSourceFile(body: string): SourceFileInfo | null {
  return markedSourceFileInfo(body, markdownFileMarker);
}

export function rinWriterSourceFile(body: string): SourceFileInfo | null {
  return markedSourceFileInfo(body, rinSourceFileMarker);
}

/** Typst repositories keep their entry file at a fixed path. */
export const typstEntryFilename = 'main.typ';

/**
 * Typst articles and books keep their source only in the repository, so the reader
 * derives the entry file from the editor kind instead of an embedded source marker.
 */
export function typstSourceFile(
  post: Pick<FeedItem, 'editor'> & { body?: string },
): SourceFileInfo | null {
  if (blogEditorKind(post) !== 'typst') return null;
  return { filename: typstEntryFilename, mime: 'text/plain', url: '' };
}

/** Fallback metadata when the rin writer source section exists without a RIN_SOURCE_FILE marker. */
export function rinWriterSourceFallbackFile(body: string): SourceFileInfo | null {
  const section = extractMarkedSection(body, 'RIN_SOURCE');
  if (!section) return null;
  return {
    filename: 'main.tex',
    bytes: new TextEncoder().encode(section).byteLength,
    url: '',
  };
}

export function blogEditorKind(post: Pick<FeedItem, 'editor'> & { body?: string }): BlogEditorKind {
  const editor = (post.editor || '').trim().toLowerCase();
  if (editor === 'markdown' || editor === 'md') return 'markdown';
  if (editor === 'typst') return 'typst';
  if (editor === 'rin' || editor === 'latex' || editor === 'tex') return 'rin';
  if (post.body && markdownBlogHtml(post.body)) return 'markdown';
  return 'rin';
}

export function blogEditPath(post: Pick<FeedItem, 'id' | 'editor'> & { slug?: string; body?: string }) {
  const ref = encodeURIComponent(post.slug || post.id);
  return blogEditorKind(post) === 'markdown' ? `/write/markdown?edit=${ref}` : `/write?edit=${ref}`;
}

export function bodyFromMarkdownSource(
  markdown: string,
  sourceFile: SourceFileInfo | null,
) {
  const source = normalizeMarkdownWhitespaceEntities(markdown).trim();
  const sections = [
    `[[${markdownSourceMarker}]]`,
    source,
    `[[/${markdownSourceMarker}]]`,
  ];
  if (sourceFile) {
    sections.push(
      '',
      `[[${markdownFileMarker}]]`,
      JSON.stringify(sourceFile),
      `[[/${markdownFileMarker}]]`,
    );
  }
  return sections.join('\n');
}

export function excerptFromMarkdown(markdown: string) {
  return markdownExcerptFromSource(markdown, 180);
}

export function normalizeMarkdownWhitespaceEntities(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let codeFence = '';

  return lines
    .map((rawLine) => {
      const fenceMatch = rawLine.match(markdownCodeFencePattern);
      if (codeFence) {
        if (fenceMatch && fenceMatch[1].startsWith(codeFence)) {
          codeFence = '';
        }
        return rawLine;
      }
      if (fenceMatch) {
        codeFence = fenceMatch[1];
        return rawLine;
      }
      return rawLine.replace(markdownWhitespaceEntityPattern, ' ');
    })
    .join('\n');
}

function markdownExcerptFromSource(markdown: string, limit: number) {
  const lines = normalizeMarkdownWhitespaceEntities(markdown).split('\n');
  let inCodeFence = false;
  let inMathFence = '';
  let inFrontMatter = false;
  let seenContent = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!seenContent && line === '') continue;
    if (!seenContent && line === '---') {
      inFrontMatter = true;
      seenContent = true;
      continue;
    }
    if (inFrontMatter) {
      if (line === '---' || line === '...') inFrontMatter = false;
      continue;
    }
    if (line.startsWith('```') || line.startsWith('~~~')) {
      inCodeFence = !inCodeFence;
      seenContent = true;
      continue;
    }
    if (inCodeFence) continue;
    if (inMathFence) {
      if (markdownMathFenceCloseLine(line, inMathFence) || markdownMathFenceEnds(line, inMathFence)) {
        inMathFence = '';
      }
      continue;
    }
    const marker = markdownMathFenceStart(line);
    if (marker) {
      if (!markdownMathFenceEnds(line, marker) || line === marker) {
        inMathFence = marker;
      }
      seenContent = true;
      continue;
    }
    seenContent = true;
    if (
      !line ||
      line.startsWith('<!--') ||
      line.startsWith('#') ||
      line.startsWith('![') ||
      isMarkdownHorizontalRule(line) ||
      isMarkdownTableLine(line) ||
      isMarkdownMathOnlyLine(line)
    ) {
      continue;
    }
    const stripped = markdownLineToPlainText(
      line
        .replace(/^>\s*/, '')
        .replace(/^(?:[-*+]|\d+[.)])\s+/, ''),
    );
    if (!stripped || isMarkdownAdmonitionMarker(stripped)) continue;
    return completeExcerptSentence(stripped, limit);
  }
  return '';
}

function markdownLineToPlainText(line: string) {
  return normalizeExcerptWhitespace(
    splitInlineMathSegments(line)
      .map((segment) => (segment.math ? segment.text : cleanMarkdownProseSegment(segment.text)))
      .join(''),
  );
}

function cleanMarkdownProseSegment(segment: string) {
  return segment
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\s+/g, ' ');
}

type InlineMathSegment = {
  text: string;
  math: boolean;
};

function splitInlineMathSegments(value: string): InlineMathSegment[] {
  const runes = Array.from(value);
  const segments: InlineMathSegment[] = [];
  let prose = '';
  const pushProse = () => {
    if (prose) {
      segments.push({ text: prose, math: false });
      prose = '';
    }
  };

  for (let index = 0; index < runes.length;) {
    if (markdownInlineMathStartsAt(runes, index, '\\(')) {
      const end = findInlineMathEnd(runes, index + 2, '\\)');
      if (end >= 0) {
        pushProse();
        segments.push({ text: runes.slice(index, end + 2).join(''), math: true });
        index = end + 2;
        continue;
      }
    }
    if (markdownInlineMathStartsAt(runes, index, '\\[')) {
      const end = findInlineMathEnd(runes, index + 2, '\\]');
      if (end >= 0) {
        pushProse();
        segments.push({ text: runes.slice(index, end + 2).join(''), math: true });
        index = end + 2;
        continue;
      }
    }
    if (runes[index] === '$' && runes[index + 1] !== '$' && !isEscapedRune(runes, index)) {
      const end = findDollarInlineMathEnd(runes, index + 1);
      if (end >= 0) {
        pushProse();
        segments.push({ text: runes.slice(index, end + 1).join(''), math: true });
        index = end + 1;
        continue;
      }
    }
    prose += runes[index];
    index += 1;
  }
  pushProse();
  return segments;
}

function findInlineMathEnd(runes: string[], start: number, marker: string) {
  for (let index = start; index < runes.length; index += 1) {
    if (markdownInlineMathStartsAt(runes, index, marker)) return index;
  }
  return -1;
}

function findDollarInlineMathEnd(runes: string[], start: number) {
  for (let index = start; index < runes.length; index += 1) {
    if (
      runes[index] === '$' &&
      runes[index + 1] !== '$' &&
      runes[index - 1] !== '$' &&
      !isEscapedRune(runes, index)
    ) {
      return index;
    }
  }
  return -1;
}

function normalizeExcerptWhitespace(value: string) {
  return splitInlineMathSegments(value)
    .map((segment) => (segment.math ? segment.text : segment.text.replace(/\s+/g, ' ')))
    .join('')
    .trim();
}

function markdownMathFenceStart(line: string) {
  if (line.startsWith('$$')) return '$$';
  if (line.startsWith('\\[')) return '\\]';
  const match = /^\\begin\{([A-Za-z*]+)\}/.exec(line);
  return match ? `\\end{${match[1]}}` : '';
}

function markdownMathFenceEnds(line: string, marker: string) {
  if (marker === '$$') {
    return (
      !isDollarDisplayFenceLine(line) &&
      /\${2,}\s*$/.test(line) &&
      removeTrailingDollarDisplayFence(line).trim() !== ''
    );
  }
  return line.includes(marker);
}

function markdownMathFenceCloseLine(line: string, marker: string) {
  return marker === '$$' && isDollarDisplayFenceLine(line);
}

function isDollarDisplayFenceLine(line: string) {
  return /^\${2,}$/.test(line.trim());
}

function removeLeadingDollarDisplayFence(line: string) {
  return line.trim().replace(/^\${2,}/, '');
}

function removeTrailingDollarDisplayFence(line: string) {
  return line.replace(/\${2,}\s*$/, '');
}

function nextNonBlankMarkdownLineIndex(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim()) return index;
  }
  return -1;
}

function looksLikeRecoverableDisplayMathParagraph(lines: string[]) {
  const source = lines.join('\n').trim();
  if (!source || source.length > 4000) return false;
  if (source.includes('$')) return false;
  if (/^(?:#{1,6}\s|[-*+]\s+|\d+[.)]\s+)/.test(source)) return false;
  if (!/\\[A-Za-z]+/.test(source)) return false;
  if (
    !/[=<>_^{}]|\\(?:begin|end|cap|cup|exists|forall|frac|in|int|left|mathbb|mathcal|operatorname|prod|qquad|right|subset|sum|times)/.test(
      source,
    )
  ) {
    return false;
  }
  const proseWords =
    source
      .replace(/\\[A-Za-z]+/g, ' ')
      .replace(/[{}_^=<>|&+\-.,;:()[\]\d]/g, ' ')
      .match(/[A-Za-z]{3,}/g) || [];
  return proseWords.length <= 4;
}

function isMarkdownMathOnlyLine(line: string) {
  const trimmed = line.trim();
  return (
    trimmed === '$$' ||
    isDollarDisplayFenceLine(trimmed) ||
    trimmed === '\\[' ||
    trimmed === '\\]' ||
    (trimmed.startsWith('$') && trimmed.endsWith('$')) ||
    (trimmed.startsWith('\\(') && trimmed.endsWith('\\)'))
  );
}

function isMarkdownHorizontalRule(line: string) {
  return /^([-*_]\s*){3,}$/.test(line);
}

function isMarkdownTableLine(line: string) {
  return line.startsWith('|') && (line.match(/\|/g) || []).length >= 2;
}

function isMarkdownAdmonitionMarker(line: string) {
  return /^\[![A-Za-z]+]/.test(line.trim());
}

function completeExcerptSentence(value: string, limit: number) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const runes = Array.from(clean);
  const max = limit > 0 ? Math.min(limit, runes.length) : runes.length;
  let inInlineMath = false;
  let inlineMathEnd = '';
  for (let index = 0; index < max; index += 1) {
    if (inlineMathEnd) {
      if (markdownInlineMathStartsAt(runes, index, inlineMathEnd)) {
        inlineMathEnd = '';
      }
      continue;
    }
    if (runes[index] === '$' && !isEscapedRune(runes, index)) {
      inInlineMath = !inInlineMath;
      continue;
    }
    if (markdownInlineMathStartsAt(runes, index, '\\(')) {
      inlineMathEnd = '\\)';
      continue;
    }
    if (markdownInlineMathStartsAt(runes, index, '\\[')) {
      inlineMathEnd = '\\]';
      continue;
    }
    if (inInlineMath) continue;
    if (isExcerptSentenceEnd(runes[index], runes, index)) {
      return runes.slice(0, index + 1).join('').trim();
    }
  }
  if (runes.length <= max) return clean;
  for (let index = max - 1; index > 0; index -= 1) {
    if (['，', '、', ',', ';', '；', ' '].includes(runes[index])) {
      return runes.slice(0, index).join('').trim();
    }
  }
  return runes.slice(0, max).join('').trim();
}

function markdownInlineMathStartsAt(runes: string[], index: number, marker: string) {
  const markerRunes = Array.from(marker);
  if (index + markerRunes.length > runes.length) return false;
  return markerRunes.every((char, offset) => runes[index + offset] === char);
}

function isEscapedRune(runes: string[], index: number) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && runes[cursor] === '\\'; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function isExcerptSentenceEnd(char: string, runes: string[], index: number) {
  if (['。', '！', '？', '!', '?', '；', ';'].includes(char)) return true;
  if (char !== '.') return false;
  if (index < runes.length - 1 && runes[index + 1] !== ' ') return false;
  if (index > 0 && index < runes.length - 1) {
    const previous = runes[index - 1];
    const next = nextNonSpaceRune(runes, index + 1);
    if (isAsciiDigit(previous) && isAsciiDigit(next)) return false;
    if (isAsciiUpper(previous) && isInitialPreviousBoundary(runes, index - 1)) return false;
  }
  return true;
}

function nextNonSpaceRune(runes: string[], start: number) {
  for (let index = start; index < runes.length; index += 1) {
    if (!/\s/.test(runes[index])) return runes[index];
  }
  return '';
}

function isInitialPreviousBoundary(runes: string[], index: number) {
  if (index <= 0) return true;
  return /\s|[([{<"']/.test(runes[index - 1]);
}

function isAsciiUpper(value: string) {
  return /^[A-Z]$/.test(value);
}

function isAsciiDigit(value: string) {
  return /^[0-9]$/.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(value: string) {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith('#') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('data:image/')
  );
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function codeLanguageFromFence(value: string) {
  const token = value
    .trim()
    .replace(/^\{?\.?/, '')
    .split(/\s+/)[0]
    ?.replace(/\}?$/, '')
    .toLowerCase() || '';
  return token.replace(/[^a-z0-9_+#.-]/g, '');
}

function renderCodeBlock(code: string, language: string) {
  const normalizedLanguage = codeLanguageFromFence(language);
  const languageAttributes = normalizedLanguage
    ? ` class="language-${escapeAttribute(normalizedLanguage)}" data-language="${escapeAttribute(normalizedLanguage)}"`
    : '';
  const preAttributes = normalizedLanguage
    ? ` data-rin-code-language="${escapeAttribute(normalizedLanguage)}"`
    : '';
  return `<pre${preAttributes}><code${languageAttributes}>${escapeHtml(code)}</code></pre>`;
}

function isQuiverDiagramUrl(value: string) {
  try {
    const parsed = new URL(value, 'https://rinspace.local');
    return parsed.pathname.includes('/api/diagrams/');
  } catch {
    return /(^|\/)api\/diagrams\//.test(value);
  }
}

type MarkdownHtmlOptions = {
  deferMath?: boolean;
  footnotes?: MarkdownFootnoteContext;
  socialTokens?: boolean;
};

type MarkdownTableAlignment = 'left' | 'center' | 'right' | null;
type MarkdownTableAlignmentParseResult = MarkdownTableAlignment | 'invalid';
type MarkdownFootnoteDefinition = {
  id: string;
  key: string;
  label: string;
  lines: string[];
  number: number;
  refBaseId: string;
};
type MarkdownFootnoteContext = {
  definitions: Map<string, MarkdownFootnoteDefinition>;
  referenceCounts: Map<string, number>;
};

function renderMath(value: string, displayMode: boolean) {
  return katex.renderToString(value, {
    displayMode,
    throwOnError: false,
    strict: false,
  });
}

function renderDeferredMath(value: string, displayMode: boolean) {
  const source = value.trim();
  const display = displayMode ? 'block' : 'inline';
  const fallback = escapeHtml(source);
  return displayMode
    ? `<div class="rin-display-math rin-deferred-math" role="region" tabindex="0" aria-label="可横向滚动的公式" data-rin-math-display="${display}" data-rin-math-source="${escapeAttribute(source)}">${fallback}</div>`
    : `<span class="rin-deferred-math" data-rin-math-display="${display}" data-rin-math-source="${escapeAttribute(source)}">${fallback}</span>`;
}

function renderMarkdownMath(value: string, displayMode: boolean, options: MarkdownHtmlOptions) {
  return options.deferMath ? renderDeferredMath(value, displayMode) : renderMath(value, displayMode);
}

function normalizeMarkdownLiteralSetBraces(value: string) {
  return value
    .replace(/\\setminus\{([^{}\n]+)\}/g, '\\setminus\\{$1\\}')
    .replace(/\\times\{([^{}\n]+)\}/g, '\\times\\{$1\\}')
    .replace(/(^|[\n=/])\{([^{}\n]*(?:\\mid|\\sim|\\in|\\le|\\ge|\\times|\\sqcup)[^{}\n]*)\}/g, '$1\\{$2\\}')
    .replace(/(^|[\n(])\{([A-Za-z0-9]+(?:_[A-Za-z0-9]+)?)\}(?=\\times|\))/g, '$1\\{$2\\}');
}

function normalizeMarkdownDisplayMathSource(value: string) {
  const normalizedEscapes = String(value || '')
    .replace(/\\left\{/g, '\\left\\{')
    .replace(/\\right\}/g, '\\right\\}')
    .replace(/\\([_=<>\[\]*])/g, '$1')
    .trim();
  return normalizeMarkdownLiteralSetBraces(normalizedEscapes);
}

function renderDisplayMath(value: string, options: MarkdownHtmlOptions) {
  const math = normalizeMarkdownDisplayMathSource(value);
  if (!math) return '';
  if (options.deferMath) return renderDeferredMath(math, true);
  return `<div class="rin-display-math" role="region" tabindex="0" aria-label="可横向滚动的公式">${renderMath(math, true)}</div>`;
}

function findInlineEnd(value: string, start: number, marker: string) {
  let index = start;
  while (index < value.length) {
    const next = value.indexOf(marker, index);
    if (next < 0) return -1;
    if (!isEscapedInlineDelimiter(value, next)) return next;
    index = next + marker.length;
  }
  return -1;
}

function isEscapedInlineDelimiter(value: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findClosingParen(value: string, start: number) {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (char === '(') depth += 1;
    if (char === ')') {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

type MarkdownImageDestination = {
  url: string;
  title: string;
};

function unquoteMarkdownImageTitle(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
    return trimmed.slice(1, -1).trim();
  }
  if (first === '(' && last === ')') {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseMarkdownImageDestination(value: string): MarkdownImageDestination {
  const trimmed = value.trim();
  if (!trimmed) return { url: '', title: '' };

  if (trimmed.startsWith('<')) {
    const closeIndex = trimmed.indexOf('>');
    if (closeIndex > 0) {
      return {
        url: trimmed.slice(1, closeIndex).trim(),
        title: unquoteMarkdownImageTitle(trimmed.slice(closeIndex + 1)),
      };
    }
  }

  const whitespaceIndex = trimmed.search(/\s/);
  if (whitespaceIndex < 0) {
    return { url: trimmed, title: '' };
  }

  return {
    url: trimmed.slice(0, whitespaceIndex).trim(),
    title: unquoteMarkdownImageTitle(trimmed.slice(whitespaceIndex)),
  };
}

function isGeneratedMarkdownImageAlt(value: string) {
  const normalized = value.trim();
  if (!normalized) return true;
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return true;
  if (/^(?:img|image|figure|fig|pic|photo|screenshot|screen-shot)[-_ ]?\d*$/i.test(normalized)) {
    return true;
  }
  if (/^图片[-_ ]?\d*$/.test(normalized)) return true;
  if (/^[a-f0-9]{16,}$/i.test(normalized)) return true;
  return /^[\w.-]+\.(?:png|jpe?g|gif|webp|svg|bmp|tiff?|avif)(?:\?.*)?$/i.test(normalized);
}

function normalizeMarkdownFootnoteKey(value: string) {
  return value.trim().toLowerCase();
}

function markdownFootnoteSlug(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}

function uniqueMarkdownFootnoteId(base: string, usedIds: Set<string>) {
  let candidate = base;
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function isMarkdownFootnoteContinuationLine(line: string) {
  return /^(?: {2,}|\t)\S/.test(line);
}

function cleanMarkdownFootnoteContinuationLine(line: string) {
  return line.replace(/^(?: {2,}|\t)/, '');
}

function nextMarkdownFootnoteContinuationIndex(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    return isMarkdownFootnoteContinuationLine(lines[index]) ? index : -1;
  }
  return -1;
}

function markdownFootnoteDefinitionMatch(line: string) {
  return line.match(/^\s{0,3}\[\^([^\]\s]+)\]:\s?(.*)$/);
}

function extractMarkdownFootnotes(lines: string[]) {
  const contentLines: string[] = [];
  const definitions = new Map<string, MarkdownFootnoteDefinition>();
  const usedIds = new Set<string>();
  let codeFence = '';
  let mathFence: '$$' | '\\]' | '' = '';

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.replace(/\s+$/, '');

    if (codeFence) {
      contentLines.push(rawLine);
      if (line.startsWith(codeFence)) codeFence = '';
      continue;
    }

    if (mathFence) {
      contentLines.push(rawLine);
      const trimmedLine = line.trim();
      if (trimmedLine === mathFence || trimmedLine.endsWith(mathFence)) {
        mathFence = '';
      }
      continue;
    }

    const fenceMatch = line.match(/^(```+|~~~+)\s*([^\s`~]*)?/);
    if (fenceMatch) {
      codeFence = fenceMatch[1];
      contentLines.push(rawLine);
      continue;
    }

    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('$$') && findInlineEnd(trimmedLine, 2, '$$') < 0) {
      mathFence = '$$';
      contentLines.push(rawLine);
      continue;
    }
    if (trimmedLine === '\\[') {
      mathFence = '\\]';
      contentLines.push(rawLine);
      continue;
    }

    const footnote = markdownFootnoteDefinitionMatch(line);
    if (!footnote) {
      contentLines.push(rawLine);
      continue;
    }

    const label = footnote[1].trim();
    const key = normalizeMarkdownFootnoteKey(label);
    const footnoteLines = [footnote[2].trim()];
    let nextIndex = lineIndex + 1;
    while (nextIndex < lines.length) {
      const nextLine = lines[nextIndex];
      if (!nextLine.trim()) {
        const continuationIndex = nextMarkdownFootnoteContinuationIndex(lines, nextIndex + 1);
        if (continuationIndex >= 0) {
          footnoteLines.push('');
          nextIndex += 1;
          continue;
        }
        break;
      }
      if (!isMarkdownFootnoteContinuationLine(nextLine)) break;
      footnoteLines.push(cleanMarkdownFootnoteContinuationLine(nextLine).replace(/\s+$/, ''));
      nextIndex += 1;
    }

    if (!definitions.has(key)) {
      const number = definitions.size + 1;
      const slug = markdownFootnoteSlug(label, `note-${number}`);
      const id = uniqueMarkdownFootnoteId(`rin-md-fn-${slug}`, usedIds);
      definitions.set(key, {
        id,
        key,
        label,
        lines: footnoteLines,
        number,
        refBaseId: id.replace(/^rin-md-fn-/, 'rin-md-fnref-'),
      });
    }
    lineIndex = nextIndex - 1;
  }

  return {
    lines: contentLines,
    footnotes: {
      definitions,
      referenceCounts: new Map<string, number>(),
    },
  };
}

function markdownImageCaptionText(alt: string, title: string, isQuiverImage: boolean) {
  if (isQuiverImage) return '';
  const explicitTitle = title.trim();
  if (explicitTitle) return explicitTitle;
  return isGeneratedMarkdownImageAlt(alt) ? '' : alt.trim();
}

function renderMarkdownFootnoteReference(
  footnote: MarkdownFootnoteDefinition,
  context: MarkdownFootnoteContext,
) {
  const nextCount = (context.referenceCounts.get(footnote.key) || 0) + 1;
  context.referenceCounts.set(footnote.key, nextCount);
  const refId = nextCount === 1 ? footnote.refBaseId : `${footnote.refBaseId}-${nextCount}`;
  return [
    `<sup id="${escapeAttribute(refId)}" class="rin-footnote-ref">`,
    `<a href="#${escapeAttribute(footnote.id)}" aria-label="脚注 ${footnote.number}">`,
    String(footnote.number),
    '</a>',
    '</sup>',
  ].join('');
}

type MarkdownSocialToken = {
  html: string;
  nextIndex: number;
};

function isMarkdownMentionBoundary(value: string, index: number) {
  if (index === 0) return true;
  return /[\s([{>「『（【，。！？、:：；;]/u.test(value[index - 1]);
}

function isMarkdownMentionCharacter(value: string) {
  return /^[A-Za-z0-9_.\-\u4e00-\u9fff]$/u.test(value);
}

function renderMarkdownMentionAt(value: string, index: number): MarkdownSocialToken | null {
  if (
    !['@', '＠'].includes(value[index]) ||
    !isMarkdownMentionBoundary(value, index)
  ) {
    return null;
  }

  if (value[index + 1] === '[') {
    const displayEnd = value.indexOf(']', index + 2);
    if (displayEnd > index && value[displayEnd + 1] === '(') {
      const refEnd = findClosingParen(value, displayEnd + 2);
      if (refEnd > displayEnd) {
        const display = value.slice(index + 2, displayEnd).trim();
        const reference = value.slice(displayEnd + 2, refEnd).trim();
        if (display && reference.startsWith('user:')) {
          const uid = reference.slice('user:'.length).trim();
          if (uid && uid.length <= 160) {
            const href = `${publicEnv.publicBasePath || ''}/@${encodeURIComponent(uid)}`;
            return {
              html: `<a class="mention-link" href="${escapeAttribute(href)}">@${escapeHtml(display)}</a>`,
              nextIndex: refEnd + 1,
            };
          }
        }
      }
    }
  }

  let cursor = index + 1;
  while (cursor < value.length && isMarkdownMentionCharacter(value[cursor])) {
    cursor += 1;
  }
  const display = value.slice(index + 1, cursor);
  if (!display) return null;
  return {
    html: `<span class="mention-text">@${escapeHtml(display)}</span>`,
    nextIndex: cursor,
  };
}

function renderMarkdownStickerAt(value: string, index: number): MarkdownSocialToken | null {
  const sticker = rinStickers.find((candidate) => value.startsWith(candidate.token, index));
  if (!sticker) return null;
  return {
    html: `<img class="rin-sticker-inline" src="${escapeAttribute(rinStickerSrc(sticker))}" alt="${escapeAttribute(sticker.label)}" loading="lazy" decoding="async" />`,
    nextIndex: index + sticker.token.length,
  };
}

function renderInlineMarkdown(value: string, options: MarkdownHtmlOptions = {}): string {
  let html = '';
  let index = 0;
  while (index < value.length) {
    if (value.startsWith('\\\n', index)) {
      html += '<br />';
      index += 2;
      continue;
    }

    if (value[index] === '\n') {
      html += '<br />';
      index += 1;
      continue;
    }

    if (value.startsWith('`', index)) {
      const end = value.indexOf('`', index + 1);
      if (end > index) {
        html += `<code>${escapeHtml(value.slice(index + 1, end))}</code>`;
        index = end + 1;
        continue;
      }
    }

    if (options.socialTokens) {
      const mention = renderMarkdownMentionAt(value, index);
      if (mention) {
        html += mention.html;
        index = mention.nextIndex;
        continue;
      }
      const sticker = renderMarkdownStickerAt(value, index);
      if (sticker) {
        html += sticker.html;
        index = sticker.nextIndex;
        continue;
      }
    }

    if (value.startsWith('\\(', index)) {
      const end = findInlineEnd(value, index + 2, '\\)');
      if (end > index) {
        html += renderMarkdownMath(value.slice(index + 2, end), false, options);
        index = end + 2;
        continue;
      }
    }

    if (value.startsWith('$$', index)) {
      const end = findInlineEnd(value, index + 2, '$$');
      if (end > index) {
        html += renderMath(value.slice(index + 2, end), true);
        index = end + 2;
        continue;
      }
    }

    if (value.startsWith('$', index)) {
      const end = findInlineEnd(value, index + 1, '$');
      if (end > index) {
        html += renderMarkdownMath(value.slice(index + 1, end), false, options);
        index = end + 1;
        continue;
      }
    }

    if (value.startsWith('![', index)) {
      const labelEnd = value.indexOf(']', index + 2);
      if (labelEnd > index && value[labelEnd + 1] === '(') {
        const urlEnd = findClosingParen(value, labelEnd + 2);
        if (urlEnd > labelEnd) {
          const alt = value.slice(index + 2, labelEnd).trim();
          const { url, title } = parseMarkdownImageDestination(
            value.slice(labelEnd + 2, urlEnd),
          );
          const isQuiverImage = isQuiverDiagramUrl(url);
          const captionText = markdownImageCaptionText(alt, title, isQuiverImage);
          const figureClasses = isQuiverImage
            ? 'rin-quiver rin-quiver-image-figure'
            : `rin-markdown-image-figure${captionText ? ' has-caption' : ''}`;
          const figureClass = ` class="${escapeAttribute(figureClasses)}"`;
          const imageClass = isQuiverImage ? ' class="rin-quiver-image"' : '';
          const imageAlt = isGeneratedMarkdownImageAlt(alt) ? '' : alt;
          const caption = captionText ? `<figcaption>${escapeHtml(captionText)}</figcaption>` : '';
          html += isSafeUrl(url)
            ? `<figure${figureClass}><img${imageClass} src="${escapeAttribute(url)}" alt="${escapeAttribute(imageAlt)}" loading="lazy" decoding="async" />${caption}</figure>`
            : escapeHtml(value.slice(index, urlEnd + 1));
          index = urlEnd + 1;
          continue;
        }
      }
    }

    if (value.startsWith('<', index)) {
      const end = value.indexOf('>', index + 1);
      if (end > index) {
        const url = value.slice(index + 1, end).trim();
        if (/^(?:https?:\/\/|mailto:)[^\s<>]+$/i.test(url) && isSafeUrl(url)) {
          html += `<a href="${escapeAttribute(url)}">${escapeHtml(url)}</a>`;
          index = end + 1;
          continue;
        }
      }
    }

    if (value.startsWith('[^', index)) {
      const labelEnd = value.indexOf(']', index + 2);
      if (labelEnd > index) {
        const key = normalizeMarkdownFootnoteKey(value.slice(index + 2, labelEnd));
        const footnoteContext = options.footnotes;
        const footnote = footnoteContext?.definitions.get(key);
        if (footnoteContext && footnote) {
          html += renderMarkdownFootnoteReference(footnote, footnoteContext);
          index = labelEnd + 1;
          continue;
        }
      }
    }

    if (value.startsWith('[', index)) {
      const labelEnd = value.indexOf(']', index + 1);
      if (labelEnd > index && value[labelEnd + 1] === '(') {
        const urlEnd = findClosingParen(value, labelEnd + 2);
        if (urlEnd > labelEnd) {
          const label = value.slice(index + 1, labelEnd);
          const url = value.slice(labelEnd + 2, urlEnd).trim();
          html += isSafeUrl(url)
            ? `<a href="${escapeAttribute(url)}">${renderInlineMarkdown(label, options)}</a>`
            : escapeHtml(value.slice(index, urlEnd + 1));
          index = urlEnd + 1;
          continue;
        }
      }
    }

    if (value.startsWith('**', index)) {
      const end = findInlineEnd(value, index + 2, '**');
      if (end > index) {
        html += `<strong>${renderInlineMarkdown(value.slice(index + 2, end), options)}</strong>`;
        index = end + 2;
        continue;
      }
    }

    if (value.startsWith('*', index)) {
      const end = findInlineEnd(value, index + 1, '*');
      if (end > index) {
        html += `<em>${renderInlineMarkdown(value.slice(index + 1, end), options)}</em>`;
        index = end + 1;
        continue;
      }
    }

    if (
      value[index] === '\\' &&
      index + 1 < value.length &&
      /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(value[index + 1])
    ) {
      html += escapeHtml(value[index + 1]);
      index += 2;
      continue;
    }

    html += escapeHtml(value[index]);
    index += 1;
  }
  return html;
}

function renderList(items: string[], ordered: boolean, options: MarkdownHtmlOptions) {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${items.map((item) => `<li>${renderInlineMarkdown(item, options)}</li>`).join('')}</${tag}>`;
}

function splitMarkdownTableCells(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return [];
  const normalized = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let cell = '';
  let escaped = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (escaped) {
      cell += char === '|' ? '|' : `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '|') {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += char;
  }

  if (escaped) {
    cell += '\\';
  }

  cells.push(cell.trim());
  return cells;
}

function markdownTableAlignment(value: string): MarkdownTableAlignmentParseResult {
  const trimmed = value.trim();
  if (!/^:?-+:?$/.test(trimmed)) return 'invalid';
  if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
  if (trimmed.startsWith(':')) return 'left';
  if (trimmed.endsWith(':')) return 'right';
  return null;
}

function tableAlignmentStyle(alignment: MarkdownTableAlignment) {
  if (!alignment) return '';
  return ` style="text-align: ${alignment};"`;
}

function parseMarkdownTableRows(lines: string[], startIndex: number) {
  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];
  if (typeof separatorLine !== 'string') return null;

  const headerCells = splitMarkdownTableCells(headerLine);
  const separatorCells = splitMarkdownTableCells(separatorLine);
  if (headerCells.length < 2 || headerCells.length !== separatorCells.length) return null;

  const alignments = separatorCells.map(markdownTableAlignment);
  if (alignments.some((alignment) => alignment === 'invalid')) return null;

  const rows: string[][] = [];
  let nextIndex = startIndex + 2;
  while (nextIndex < lines.length) {
    const rowLine = lines[nextIndex];
    if (!rowLine.trim()) break;
    const cells = splitMarkdownTableCells(rowLine);
    if (cells.length < 2) break;
    rows.push(cells);
    nextIndex += 1;
  }

  return {
    headerCells,
    alignments: alignments as MarkdownTableAlignment[],
    rows,
    nextIndex,
  };
}

function renderMarkdownTable(
  headerCells: string[],
  alignments: MarkdownTableAlignment[],
  rows: string[][],
  options: MarkdownHtmlOptions,
) {
  const columnCount = Math.max(
    headerCells.length,
    alignments.length,
    ...rows.map((row) => row.length),
  );
  const columns = Array.from({ length: columnCount }, (_, index) => ({
    alignment: alignments[index] || null,
  }));

  const renderCells = (cells: string[], tagName: 'th' | 'td') =>
    columns
      .map((column, index) => {
        const value = cells[index] || '';
        return `<${tagName}${tableAlignmentStyle(column.alignment)}>${renderInlineMarkdown(value, options)}</${tagName}>`;
      })
      .join('');

  return [
    '<table>',
    `<thead><tr>${renderCells(headerCells, 'th')}</tr></thead>`,
    rows.length ? `<tbody>${rows.map((row) => `<tr>${renderCells(row, 'td')}</tr>`).join('')}</tbody>` : '<tbody></tbody>',
    '</table>',
  ].join('');
}

function collectMarkdownBlockquoteLines(lines: string[], startIndex: number) {
  const quoteLines: string[] = [];
  let nextIndex = startIndex;

  while (nextIndex < lines.length) {
    const rawLine = lines[nextIndex];
    const line = rawLine.replace(/\s+$/, '');
    const quote = line.match(/^\s{0,3}>\s?(.*)$/);
    if (quote) {
      if (quote[1].length > 0) {
        quoteLines.push(quote[1]);
      } else if (quoteLines.length) {
        quoteLines.push('');
      }
      nextIndex += 1;
      continue;
    }

    if (!line.trim()) {
      let lookahead = nextIndex + 1;
      while (lookahead < lines.length && !lines[lookahead].trim()) lookahead += 1;
      if (
        lookahead < lines.length &&
        /^\s{0,3}>\s?(.*)$/.test(lines[lookahead].replace(/\s+$/, ''))
      ) {
        if (quoteLines.length) quoteLines.push('');
        nextIndex += 1;
        continue;
      }
    }

    break;
  }

  while (quoteLines.length && quoteLines[0] === '') quoteLines.shift();
  while (quoteLines.length && quoteLines[quoteLines.length - 1] === '') quoteLines.pop();
  return { quoteLines, nextIndex };
}

function renderMarkdownBlockquote(lines: string[], options: MarkdownHtmlOptions) {
  const inner = markdownToHtml(lines.join('\n'), options).trim();
  return `<blockquote>${inner}</blockquote>`;
}

function isStandaloneBreakHtml(value: string) {
  return /^<br\s*\/?>$/i.test(value.trim());
}

function renderMarkdownFootnoteBody(
  footnote: MarkdownFootnoteDefinition,
  options: MarkdownHtmlOptions,
) {
  const html: string[] = [];
  let paragraph: string[] = [];
  const inlineOptions: MarkdownHtmlOptions = {
    deferMath: options.deferMath,
  };
  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(' '), inlineOptions)}</p>`);
    paragraph = [];
  };

  footnote.lines.forEach((line) => {
    if (!line.trim()) {
      flushParagraph();
      return;
    }
    paragraph.push(line.trim());
  });
  flushParagraph();
  return html.join('');
}

function markdownFootnoteBackrefs(
  footnote: MarkdownFootnoteDefinition,
  context: MarkdownFootnoteContext,
) {
  const count = context.referenceCounts.get(footnote.key) || 0;
  if (!count) return '';
  const links = Array.from({ length: count }, (_, index) => {
    const refNumber = index + 1;
    const refId = refNumber === 1 ? footnote.refBaseId : `${footnote.refBaseId}-${refNumber}`;
    return [
      `<a href="#${escapeAttribute(refId)}" class="rin-footnote-backref"`,
      ` aria-label="返回正文脚注 ${footnote.number}${count > 1 ? `-${refNumber}` : ''}">`,
      '&#8617;',
      '</a>',
    ].join('');
  });
  return links.join(' ');
}

function renderMarkdownFootnotes(
  context: MarkdownFootnoteContext,
  options: MarkdownHtmlOptions,
) {
  if (!context.definitions.size) return '';
  const items = Array.from(context.definitions.values())
    .map((footnote) => {
      const body = renderMarkdownFootnoteBody(footnote, options);
      const backrefs = markdownFootnoteBackrefs(footnote, context);
      return `<li id="${escapeAttribute(footnote.id)}">${body}${backrefs}</li>`;
    })
    .join('');
  return [
    '<section class="rin-footnotes" aria-label="脚注">',
    '<ol>',
    items,
    '</ol>',
    '</section>',
  ].join('');
}

export function markdownToHtml(markdown: string, options: MarkdownHtmlOptions = {}) {
  const normalizedLines = normalizeMarkdownWhitespaceEntities(markdown).split('\n');
  const extractedFootnotes = options.footnotes
    ? { lines: normalizedLines, footnotes: options.footnotes }
    : extractMarkdownFootnotes(normalizedLines);
  const lines = extractedFootnotes.lines;
  const renderOptions: MarkdownHtmlOptions = {
    ...options,
    footnotes: extractedFootnotes.footnotes,
  };
  const html: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let orderedList = false;
  let listPendingBlank = false;
  let codeFence = '';
  let codeFenceLanguage = '';
  let codeLines: string[] = [];
  let mathFence: '$$' | '\\]' | '' = '';
  let mathLines: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(' '), renderOptions)}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    html.push(renderList(listItems, orderedList, renderOptions));
    listItems = [];
    listPendingBlank = false;
  };
  const flushDisplayMath = () => {
    const rendered = renderDisplayMath(mathLines.join('\n'), renderOptions);
    if (rendered) html.push(rendered);
    mathFence = '';
    mathLines = [];
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.replace(/\s+$/, '');
    if (codeFence) {
      if (line.startsWith(codeFence)) {
        html.push(renderCodeBlock(codeLines.join('\n'), codeFenceLanguage));
        codeFence = '';
        codeFenceLanguage = '';
        codeLines = [];
      } else {
        codeLines.push(rawLine);
      }
      continue;
    }

    if (mathFence) {
      const trimmed = line.trim();
      if (mathFence === '$$' && isDollarDisplayFenceLine(trimmed)) {
        flushDisplayMath();
        continue;
      }
      if (trimmed === mathFence) {
        flushDisplayMath();
        continue;
      }
      if (mathFence === '$$' && /\${2,}\s*$/.test(trimmed)) {
        const beforeFence = removeTrailingDollarDisplayFence(line);
        if (beforeFence.trim()) mathLines.push(beforeFence);
        flushDisplayMath();
        continue;
      }
      if (trimmed.endsWith(mathFence)) {
        mathLines.push(line.slice(0, line.lastIndexOf(mathFence)));
        flushDisplayMath();
        continue;
      }
      mathLines.push(rawLine);
      continue;
    }

    const fenceMatch = line.match(/^(```+|~~~+)\s*([^\s`~]*)?/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      codeFence = fenceMatch[1];
      codeFenceLanguage = fenceMatch[2] || '';
      codeLines = [];
      continue;
    }

    const trimmedLine = line.trim();
    if (/^<!--\s*rin-quiver\b[\s\S]*-->$/.test(trimmedLine)) {
      flushParagraph();
      flushList();
      continue;
    }

    if (isStandaloneBreakHtml(trimmedLine)) {
      flushParagraph();
      flushList();
      html.push('<br />');
      continue;
    }

    if (trimmedLine.startsWith('$$')) {
      const end = findInlineEnd(trimmedLine, 2, '$$');
      flushParagraph();
      flushList();
      if (isDollarDisplayFenceLine(trimmedLine)) {
        mathFence = '$$';
        mathLines = [];
        continue;
      }
      const trailingAfterEnd = end > 1 ? trimmedLine.slice(end + 2).trim() : '';
      if (end > 1 && (!trailingAfterEnd || /^\$+$/.test(trailingAfterEnd))) {
        const rendered = renderDisplayMath(trimmedLine.slice(2, end), renderOptions);
        if (rendered) html.push(rendered);
        continue;
      }
      mathFence = '$$';
      const firstLine = removeLeadingDollarDisplayFence(trimmedLine);
      if (firstLine) mathLines.push(firstLine);
      continue;
    }

    const bracketDisplayEnd = trimmedLine.startsWith('\\[')
      ? findInlineEnd(trimmedLine, 2, '\\]')
      : -1;
    if (
      trimmedLine === '\\[' ||
      (bracketDisplayEnd > 1 && bracketDisplayEnd + 2 === trimmedLine.length)
    ) {
      flushParagraph();
      flushList();
      if (bracketDisplayEnd > 1) {
        const rendered = renderDisplayMath(
          trimmedLine.slice(2, bracketDisplayEnd),
          renderOptions,
        );
        if (rendered) html.push(rendered);
        continue;
      }
      mathFence = '\\]';
      const firstLine = trimmedLine.slice(2);
      if (firstLine) mathLines.push(firstLine);
      continue;
    }

    if (!line.trim()) {
      if (paragraph.length && looksLikeRecoverableDisplayMathParagraph(paragraph)) {
        const nextLineIndex = nextNonBlankMarkdownLineIndex(lines, lineIndex + 1);
        if (nextLineIndex >= 0 && isDollarDisplayFenceLine(lines[nextLineIndex])) {
          const rendered = renderDisplayMath(paragraph.join('\n'), renderOptions);
          if (rendered) html.push(rendered);
          paragraph = [];
          lineIndex = nextLineIndex;
          continue;
        }
      }
      flushParagraph();
      if (listItems.length) listPendingBlank = true;
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const listContinuation =
      listItems.length && !unordered && !ordered && /^\s{2,}\S/.test(line);
    if (listContinuation) {
      const lastIndex = listItems.length - 1;
      const previous = listItems[lastIndex];
      listItems[lastIndex] = `${previous}${previous.endsWith('\\') ? '\n' : ' '}${trimmedLine}`;
      listPendingBlank = false;
      continue;
    }

    if (unordered || ordered) {
      flushParagraph();
      const nextOrdered = Boolean(ordered);
      if (listItems.length && nextOrdered !== orderedList) flushList();
      orderedList = nextOrdered;
      listItems.push((unordered?.[1] || ordered?.[1] || '').trim());
      listPendingBlank = false;
      continue;
    }

    if (listPendingBlank) flushList();

    const table = parseMarkdownTableRows(lines, lineIndex);
    if (table) {
      flushParagraph();
      flushList();
      html.push(renderMarkdownTable(table.headerCells, table.alignments, table.rows, renderOptions));
      lineIndex = table.nextIndex - 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      html.push(`<h${heading[1].length}>${renderInlineMarkdown(heading[2].trim(), renderOptions)}</h${heading[1].length}>`);
      continue;
    }

    if (/^[-*_]\s*[-*_]\s*[-*_][\s-*_]*$/.test(line.trim())) {
      flushParagraph();
      flushList();
      html.push('<hr />');
      continue;
    }

    if (/^!\[[^\]]*]\([^)]+\)$/.test(trimmedLine)) {
      flushParagraph();
      flushList();
      html.push(renderInlineMarkdown(trimmedLine, renderOptions));
      continue;
    }

    const quote = line.match(/^\s{0,3}>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      const blockquote = collectMarkdownBlockquoteLines(lines, lineIndex);
      html.push(renderMarkdownBlockquote(blockquote.quoteLines, renderOptions));
      lineIndex = blockquote.nextIndex - 1;
      continue;
    }

    paragraph.push(line.trim());
  }

  if (codeFence) {
    html.push(renderCodeBlock(codeLines.join('\n'), codeFenceLanguage));
  }
  if (mathFence) {
    flushDisplayMath();
  }
  flushParagraph();
  flushList();
  if (!options.footnotes) {
    const footnotes = renderMarkdownFootnotes(extractedFootnotes.footnotes, renderOptions);
    if (footnotes) html.push(footnotes);
  }
  return html.join('\n');
}

export function commentMarkdownToHtml(markdown: string) {
  return markdownToHtml(markdown, { socialTokens: true });
}

export function markdownSourceFile(post: PostDetail) {
  const legacySource = post.markdownSource || markdownBlogSourceFile(post.body);
  if (legacySource) return legacySource;
  const repositorySource = post.repositorySource;
  if (!repositorySource?.entrypoint || !repositorySource.url) return null;
  const filename = repositorySource.entrypoint.split('/').at(-1) || 'content.md';
  return { filename, mime: 'text/markdown', url: repositorySource.url };
}

export function giteaSourceFilePageUrl(sourceUrl: string) {
  const raw = sourceUrl.trim();
  if (!raw) return '';
  try {
    const relative = raw.startsWith('/');
    const parsed = new URL(raw, relative ? 'https://rinspace.local' : undefined);
    const match = parsed.pathname.match(/^(.+)\/raw\/(commit|branch|tag)\/(.+)$/);
    if (!match) return '';
    parsed.pathname = `${match[1]}/src/${match[2]}/${match[3]}`;
    parsed.pathname = canonicalGiteaPathname(parsed.pathname) || parsed.pathname;
    return relative ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.toString();
  } catch {
    return '';
  }
}

export function giteaSourceFolderPageUrl(sourceUrl: string) {
  const fileUrl = giteaSourceFilePageUrl(sourceUrl);
  if (!fileUrl) return '';
  try {
    const relative = fileUrl.startsWith('/');
    const parsed = new URL(fileUrl, relative ? 'https://rinspace.local' : undefined);
    const folderPath = parsed.pathname.replace(/\/[^/]+$/, '');
    if (folderPath === parsed.pathname) return '';
    parsed.pathname = folderPath;
    return relative ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.toString();
  } catch {
    return '';
  }
}
