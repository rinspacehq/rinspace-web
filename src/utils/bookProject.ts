import {
  fileFromRinArchiveInfo,
  type RinArchiveInfo,
  type RinProject,
  type RinProjectFile,
} from '@/utils/rinWriter';

export type BookMatter = 'front' | 'main' | 'appendix' | 'back';

export type BookStructureNode = {
  id: string;
  title: string;
  command: 'part' | 'chapter' | 'section' | 'subsection' | 'subsubsection';
  level: number;
  matter: BookMatter;
  path: string;
  line: number;
  label?: string;
  parentId?: string;
  fileNode: boolean;
};

export type BookSupportFile = {
  path: string;
  kind: string;
  role: 'bibliography' | 'style' | 'asset' | 'tex' | 'other';
};

export type BookProjectIndex = {
  mainFile: string;
  nodes: BookStructureNode[];
  supportFiles: BookSupportFile[];
  diagnostics: string[];
};

type ProjectImportResponse = {
  title?: string;
  mainFile?: string;
  files?: RinProjectFile[];
  diagnostics?: string[];
};

export function extractMarkedSection(body: string, marker: string) {
  const startMarker = `[[${marker}]]`;
  const endMarker = `[[/${marker}]]`;
  const start = body.indexOf(startMarker);
  if (start < 0) return '';
  const end = body.indexOf(endMarker, start + startMarker.length);
  if (end < 0) return '';
  return body.slice(start + startMarker.length, end).trim();
}

export function rinArchiveFromBody(body: string): RinArchiveInfo | null {
  const raw = extractMarkedSection(body, 'RIN_ARCHIVE');
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return null;
    if (typeof value.url !== 'string' || typeof value.filename !== 'string') return null;
    return {
      url: value.url,
      filename: value.filename,
      mime: typeof value.mime === 'string' ? value.mime : 'application/zip',
      bytes: typeof value.bytes === 'number' ? value.bytes : undefined,
    };
  } catch {
    return null;
  }
}

const headingCommands = new Set(['part', 'chapter', 'section', 'subsection', 'subsubsection']);
const inputCommands = new Set(['input', 'include', 'subfile', 'subfileinclude', 'import', 'subimport']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseProjectFile(value: unknown): RinProjectFile | null {
  if (!isRecord(value)) return null;
  if (typeof value.path !== 'string' || typeof value.kind !== 'string') return null;
  return {
    path: value.path,
    kind: value.kind,
    body: typeof value.body === 'string' ? value.body : '',
  };
}

function parseImportResponse(value: unknown): ProjectImportResponse {
  if (!isRecord(value)) return {};
  return {
    title: typeof value.title === 'string' ? value.title : undefined,
    mainFile: typeof value.mainFile === 'string' ? value.mainFile : undefined,
    files: Array.isArray(value.files)
      ? value.files.map(parseProjectFile).filter((file): file is RinProjectFile => file !== null)
      : undefined,
    diagnostics: Array.isArray(value.diagnostics)
      ? value.diagnostics.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

function normalizePath(value: string) {
  const parts: string[] = [];
  String(value || '')
    .replaceAll('\\', '/')
    .split('/')
    .forEach((part) => {
      if (!part || part === '.') return;
      if (part === '..') {
        parts.pop();
        return;
      }
      parts.push(part);
    });
  return parts.join('/');
}

export function normalizeBookProjectPath(value: string) {
  return normalizePath(value);
}

function parentFolder(path: string) {
  const parts = normalizePath(path).split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function withoutTexExtension(path: string) {
  return normalizePath(path).replace(/\.(tex|ltx)$/i, '');
}

function lineNumberAt(source: string, index: number) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

function stripComments(source: string) {
  return String(source || '')
    .split(/\r?\n/)
    .map((line) => {
      let escaped = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '\\') {
          escaped = !escaped;
          continue;
        }
        if (char === '%' && !escaped) return line.slice(0, index);
        escaped = false;
      }
      return line;
    })
    .join('\n');
}

function skipSpaces(source: string, index: number) {
  let cursor = index;
  while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
  return cursor;
}

function readCommand(source: string, index: number) {
  if (source[index] !== '\\') return null;
  let cursor = index + 1;
  if (!/[A-Za-z]/.test(source[cursor] || '')) {
    return { name: source[cursor] || '', nextIndex: cursor + 1 };
  }
  while (cursor < source.length && /[A-Za-z]/.test(source[cursor])) cursor += 1;
  return { name: source.slice(index + 1, cursor), nextIndex: cursor };
}

function readBraceGroup(source: string, index: number) {
  let cursor = skipSpaces(source, index);
  if (source[cursor] !== '{') return null;
  let depth = 0;
  for (let scan = cursor; scan < source.length; scan += 1) {
    const char = source[scan];
    if (char === '\\') {
      scan += 1;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          value: source.slice(cursor + 1, scan),
          nextIndex: scan + 1,
        };
      }
    }
  }
  return null;
}

function readBracketGroup(source: string, index: number) {
  const cursor = skipSpaces(source, index);
  if (source[cursor] !== '[') return null;
  let depth = 0;
  for (let scan = cursor; scan < source.length; scan += 1) {
    const char = source[scan];
    if (char === '\\') {
      scan += 1;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return {
          value: source.slice(cursor + 1, scan),
          nextIndex: scan + 1,
        };
      }
    }
  }
  return null;
}

function cleanupTitle(value: string) {
  return String(value || '')
    .replace(/\\texorpdfstring\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:textbf|textit|emph|textsc|texttt|mathrm|mathbf)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\[A-Za-z]+\*?(?:\[[^\]]*\])?(?:\{([^{}]*)\})?/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function headingLevel(command: BookStructureNode['command']) {
  return {
    part: 0,
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
  }[command];
}

function nodeId(path: string, line: number, command: string) {
  return `${normalizePath(path)}:${line}:${command}`;
}

function resolveTexPath(rawRef: string, ownerPath: string, byPath: Map<string, RinProjectFile>) {
  const cleaned = normalizePath(rawRef);
  if (!cleaned) return '';
  const ownerDir = parentFolder(ownerPath);
  const candidates = [
    cleaned,
    `${cleaned}.tex`,
    `${cleaned}.ltx`,
    ownerDir ? `${ownerDir}/${cleaned}` : cleaned,
    ownerDir ? `${ownerDir}/${cleaned}.tex` : `${cleaned}.tex`,
    ownerDir ? `${ownerDir}/${cleaned}.ltx` : `${cleaned}.ltx`,
  ].map(normalizePath);
  return candidates.find((candidate) => byPath.has(candidate)) || '';
}

function readInputReference(source: string, tokenName: string, index: number) {
  let cursor = skipSpaces(source, index);
  if (tokenName === 'import' || tokenName === 'subimport') {
    const folder = readBraceGroup(source, cursor);
    if (!folder) return null;
    cursor = folder.nextIndex;
    const file = readBraceGroup(source, cursor);
    if (!file) return null;
    return normalizePath(`${folder.value}/${file.value}`);
  }
  const group = readBraceGroup(source, cursor);
  return group ? normalizePath(group.value) : null;
}

function parseHeading(source: string, tokenName: BookStructureNode['command'], tokenEnd: number) {
  let cursor = skipSpaces(source, tokenEnd);
  if (source[cursor] === '*') cursor = skipSpaces(source, cursor + 1);
  const optional = readBracketGroup(source, cursor);
  if (optional) cursor = skipSpaces(source, optional.nextIndex);
  const title = readBraceGroup(source, cursor);
  if (!title) return null;
  let label = '';
  const afterTitle = skipSpaces(source, title.nextIndex);
  if (source.startsWith('\\label', afterTitle)) {
    const labelToken = readCommand(source, afterTitle);
    const labelGroup = readBraceGroup(source, labelToken?.nextIndex || afterTitle);
    label = labelGroup?.value.trim() || '';
  }
  return {
    title: cleanupTitle(optional?.value || title.value) || `${tokenName} ${lineNumberAt(source, tokenEnd)}`,
    label,
    nextIndex: title.nextIndex,
  };
}

function supportRole(file: RinProjectFile): BookSupportFile['role'] {
  if (/\.bib$/i.test(file.path) || file.kind === 'bib') return 'bibliography';
  if (/\.(sty|cls|clo|cfg|bst|bbx|cbx|ldf|fd)$/i.test(file.path)) return 'style';
  if (/\.(png|jpe?g|gif|webp|svg|pdf|eps|ps|epsi)$/i.test(file.path) || file.kind === 'asset') return 'asset';
  if (/\.(tex|ltx)$/i.test(file.path)) return 'tex';
  return 'other';
}

function cloneProject(project: RinProject): RinProject {
  return {
    ...project,
    files: (project.files || []).map((file) => ({ ...file })),
  };
}

function fileExtension(path: string) {
  const match = /\.([^.\/]+)$/.exec(path);
  return match?.[1]?.toLowerCase() || '';
}

function kindForPath(path: string) {
  const ext = fileExtension(path);
  if (ext === 'tex' || ext === 'ltx') return 'tex';
  if (ext === 'bib') return 'bib';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'eps', 'ps', 'epsi'].includes(ext)) return 'asset';
  return ext || 'file';
}

function safeLatexText(value: string) {
  return String(value || '').replace(/[{}]/g, '').trim();
}

function slug(value: string, fallback: string) {
  return String(value || '')
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || fallback;
}

function uniqueProjectPath(files: RinProjectFile[], preferredPath: string) {
  const clean = normalizePath(preferredPath);
  const ext = clean.includes('.') ? clean.slice(clean.lastIndexOf('.')) : '';
  const base = ext ? clean.slice(0, -ext.length) : clean;
  const used = new Set(files.map((file) => normalizePath(file.path)));
  if (!used.has(clean)) return clean;
  for (let index = 2; index < 1000; index += 1) {
    const next = `${base}-${index}${ext}`;
    if (!used.has(next)) return next;
  }
  throw new Error(`无法生成唯一文件路径：${clean}`);
}

function insertBeforeDocumentEnd(source: string, insertion: string) {
  const trimmed = source.trimEnd();
  const end = '\\end{document}';
  const endIndex = trimmed.lastIndexOf(end);
  if (endIndex < 0) return `${trimmed}\n\n${insertion}\n`;
  return `${trimmed.slice(0, endIndex).trimEnd()}\n\n${insertion}\n\n${trimmed.slice(endIndex)}`;
}

function insertMatterInput(source: string, inputCommand: string, matter: BookMatter): string {
  if (matter === 'front') {
    const markers = ['\\mainmatter', '\\appendix', '\\backmatter', '\\end{document}'];
    const indexes = markers
      .map((marker) => source.indexOf(marker))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right);
    if (!indexes.length) return `${source.trimEnd()}\n\n${inputCommand}\n`;
    const index = indexes[0];
    return `${source.slice(0, index).trimEnd()}\n\n${inputCommand}\n\n${source.slice(index).trimStart()}`;
  }
  if (matter === 'appendix') {
    const appendixIndex = source.indexOf('\\appendix');
    const afterAppendix = appendixIndex >= 0 ? appendixIndex + '\\appendix'.length : -1;
    const markers = ['\\backmatter', '\\end{document}'];
    const indexes = markers
      .map((marker) => source.indexOf(marker, Math.max(0, afterAppendix)))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right);
    if (afterAppendix < 0) return insertMatterInput(source, `\\appendix\n${inputCommand}`, 'back');
    if (!indexes.length) return `${source.trimEnd()}\n\n${inputCommand}\n`;
    const index = indexes[0];
    return `${source.slice(0, index).trimEnd()}\n\n${inputCommand}\n\n${source.slice(index).trimStart()}`;
  }
  if (matter === 'back') {
    const backIndex = source.indexOf('\\backmatter');
    const endIndex = source.indexOf('\\end{document}', Math.max(0, backIndex));
    if (backIndex < 0) return insertBeforeDocumentEnd(source, `\\backmatter\n${inputCommand}`);
    if (endIndex < 0) return `${source.trimEnd()}\n\n${inputCommand}\n`;
    return `${source.slice(0, endIndex).trimEnd()}\n\n${inputCommand}\n\n${source.slice(endIndex).trimStart()}`;
  }
  const markers = ['\\appendix', '\\backmatter', '\\end{document}'];
  const indexes = markers
    .map((marker) => source.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right);
  if (!indexes.length) return `${source.trimEnd()}\n\n${inputCommand}\n`;
  const index = indexes[0];
  return `${source.slice(0, index).trimEnd()}\n\n${inputCommand}\n\n${source.slice(index).trimStart()}`;
}

export function createDefaultBookProject(title: string): RinProject {
  const safeTitle = safeLatexText(title) || 'Rinspace Book';
  return {
    title: safeTitle,
    mode: 'book',
    renderer: 'katex',
    mainFile: 'main.tex',
    activePath: 'main.tex',
    folders: ['frontmatter', 'chapters', 'backmatter', 'figures'],
    files: [
      {
        path: 'main.tex',
        kind: 'tex',
        body: [
          '\\documentclass[11pt,openany]{book}',
          '\\usepackage{amsmath,amssymb,amsthm}',
          '\\usepackage{graphicx}',
          '\\usepackage{float}',
          '\\usepackage{hyperref}',
          '\\graphicspath{{figures/}}',
          '',
          `\\title{${safeTitle}}`,
          '\\author{}',
          '\\date{}',
          '',
          '\\newtheorem{theorem}{Theorem}[section]',
          '\\newtheorem{lemma}[theorem]{Lemma}',
          '\\newtheorem{proposition}[theorem]{Proposition}',
          '\\newtheorem{corollary}[theorem]{Corollary}',
          '\\theoremstyle{definition}',
          '\\newtheorem{definition}[theorem]{Definition}',
          '\\newtheorem{example}[theorem]{Example}',
          '\\theoremstyle{remark}',
          '\\newtheorem{remark}[theorem]{Remark}',
          '',
          '\\begin{document}',
          '\\frontmatter',
          '\\maketitle',
          '\\tableofcontents',
          '',
          '\\mainmatter',
          '',
          '\\backmatter',
          '',
          '\\bibliographystyle{plain}',
          '\\bibliography{refs}',
          '',
          '\\end{document}',
        ].join('\n'),
      },
      {
        path: 'refs.bib',
        kind: 'bib',
        body: '% 在这里添加 BibTeX 参考文献条目。',
      },
    ],
  };
}

export function addBookChapter(project: RinProject, title: string, matter: BookMatter = 'main'): RinProject {
  const next = cloneProject(project);
  const files = next.files || [];
  const mainFile = normalizePath(next.mainFile || 'main.tex');
  const main = files.find((file) => normalizePath(file.path) === mainFile);
  if (!main) throw new Error(`找不到主文件 ${mainFile}`);
  const chapterCount = buildBookProjectIndex(next).nodes.filter((node) => node.command === 'chapter' && node.matter === matter).length;
  const number = String(chapterCount + 1).padStart(2, '0');
  const safeTitle = safeLatexText(title) || `第 ${chapterCount + 1} 章`;
  const folder = matter === 'front' ? 'frontmatter' : matter === 'back' ? 'backmatter' : matter === 'appendix' ? 'appendices' : 'chapters';
  const prefix = matter === 'front' ? 'front' : matter === 'back' ? 'back' : matter === 'appendix' ? 'appendix' : 'chapter';
  const path = uniqueProjectPath(files, `${folder}/${prefix}-${number}.tex`);
  files.push({
    path,
    kind: 'tex',
    body: [`\\chapter{${safeTitle}}`, `\\label{chap:${slug(safeTitle, `chapter-${number}`)}}`, ''].join('\n'),
  });
  main.body = insertMatterInput(main.body || '', `\\include{${withoutTexExtension(path)}}`, matter);
  next.activePath = path;
  return next;
}

export function addBookSection(project: RinProject, chapterPath: string, title: string): RinProject {
  const next = cloneProject(project);
  const files = next.files || [];
  const normalizedChapterPath = normalizePath(chapterPath);
  const chapter = files.find((file) => normalizePath(file.path) === normalizedChapterPath);
  if (!chapter) throw new Error(`找不到章节文件 ${normalizedChapterPath}`);
  const base = withoutTexExtension(normalizedChapterPath);
  const sectionCount = buildBookProjectIndex(next).nodes.filter((node) => node.path.startsWith(`${base}/`) && node.command === 'section').length;
  const number = String(sectionCount + 1).padStart(2, '0');
  const safeTitle = safeLatexText(title) || `第 ${sectionCount + 1} 节`;
  const path = uniqueProjectPath(files, `${base}/section-${number}.tex`);
  files.push({
    path,
    kind: 'tex',
    body: [`\\section{${safeTitle}}`, `\\label{sec:${slug(safeTitle, `section-${number}`)}}`, '', ''].join('\n'),
  });
  chapter.body = `${String(chapter.body || '').trimEnd()}\n\n\\input{${withoutTexExtension(path)}}\n`;
  next.activePath = path;
  return next;
}

type InputEntry = {
  ownerPath: string;
  targetPath: string;
  start: number;
  end: number;
  text: string;
};

function inputEntries(project: RinProject): InputEntry[] {
  const files = project.files || [];
  const byPath = new Map(files.map((file) => [normalizePath(file.path), file]));
  const entries: InputEntry[] = [];
  for (const file of files.filter((item) => /\.(tex|ltx)$/i.test(item.path))) {
    const ownerPath = normalizePath(file.path);
    const source = String(file.body || '');
    const pattern = /\\(?:input|include|subfile|subfileinclude)\s*\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const targetPath = resolveTexPath(match[1] || '', ownerPath, byPath);
      if (!targetPath) continue;
      entries.push({
        ownerPath,
        targetPath,
        start: match.index,
        end: pattern.lastIndex,
        text: match[0],
      });
    }
  }
  return entries;
}

export function moveBookNode(project: RinProject, path: string, direction: 'up' | 'down'): RinProject {
  const normalized = normalizePath(path);
  const next = cloneProject(project);
  const files = next.files || [];
  const entriesByOwner = new Map<string, InputEntry[]>();
  inputEntries(next).forEach((entry) => {
    const existing = entriesByOwner.get(entry.ownerPath) || [];
    existing.push(entry);
    entriesByOwner.set(entry.ownerPath, existing);
  });
  let moved = false;
  entriesByOwner.forEach((entries, ownerPath) => {
    if (moved) return;
    const index = entries.findIndex((entry) => entry.targetPath === normalized);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= entries.length) return;
    const owner = files.find((file) => normalizePath(file.path) === ownerPath);
    if (!owner) return;
    const left = entries[Math.min(index, swapIndex)];
    const right = entries[Math.max(index, swapIndex)];
    owner.body = [
      owner.body.slice(0, left.start),
      right.text,
      owner.body.slice(left.end, right.start),
      left.text,
      owner.body.slice(right.end),
    ].join('');
    next.activePath = normalized;
    moved = true;
  });
  if (moved) return next;
  throw new Error('这个节点暂时不能排序。只有由 \\input 或 \\include 引入的独立文件可以排序。');
}

function replaceRange(source: string, start: number, end: number, replacement: string) {
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

function inputInsertionText(text: string) {
  return `\n${text.trim()}\n`;
}

export function moveBookNodeNear(project: RinProject, path: string, targetPath: string, placement: 'before' | 'after'): RinProject {
  const normalized = normalizePath(path);
  const normalizedTarget = normalizePath(targetPath);
  if (!normalized || !normalizedTarget || normalized === normalizedTarget) return cloneProject(project);

  const next = cloneProject(project);
  const files = next.files || [];
  const entries = inputEntries(next);
  const sourceEntry = entries.find((entry) => entry.targetPath === normalized);
  const targetEntry = entries.find((entry) => entry.targetPath === normalizedTarget);
  if (!sourceEntry || !targetEntry) {
    throw new Error('这个节点暂时不能拖拽排序。只有由 \\input 或 \\include 引入的独立文件可以排序。');
  }

  const sourceOwner = files.find((file) => normalizePath(file.path) === sourceEntry.ownerPath);
  const targetOwner = files.find((file) => normalizePath(file.path) === targetEntry.ownerPath);
  if (!sourceOwner || !targetOwner) throw new Error('找不到需要排序的源文件。');

  const movingText = sourceEntry.text;
  if (sourceEntry.ownerPath === targetEntry.ownerPath) {
    const removedLength = sourceEntry.end - sourceEntry.start;
    let insertAt = placement === 'before' ? targetEntry.start : targetEntry.end;
    if (sourceEntry.start < insertAt) insertAt -= removedLength;
    const removed = replaceRange(String(sourceOwner.body || ''), sourceEntry.start, sourceEntry.end, '');
    sourceOwner.body = replaceRange(removed, insertAt, insertAt, inputInsertionText(movingText));
  } else {
    sourceOwner.body = replaceRange(String(sourceOwner.body || ''), sourceEntry.start, sourceEntry.end, '');
    const targetBody = String(targetOwner.body || '');
    const insertAt = placement === 'before' ? targetEntry.start : targetEntry.end;
    targetOwner.body = replaceRange(targetBody, insertAt, insertAt, inputInsertionText(movingText));
  }
  next.activePath = normalized;
  return next;
}

export function moveBookChapterToMatter(project: RinProject, path: string, matter: BookMatter): RinProject {
  const normalized = normalizePath(path);
  const index = buildBookProjectIndex(project);
  const node = index.nodes.find((item) => normalizePath(item.path) === normalized);
  if (!node || node.command !== 'chapter') {
    throw new Error('只有独立章节文件可以移动到其他分区。');
  }

  const next = cloneProject(project);
  const files = next.files || [];
  const entries = inputEntries(next);
  const sourceEntry = entries.find((entry) => entry.targetPath === normalized);
  if (!sourceEntry) {
    throw new Error('这个章节暂时不能移动。只有由 \\input 或 \\include 引入的独立文件可以移动。');
  }
  const sourceOwner = files.find((file) => normalizePath(file.path) === sourceEntry.ownerPath);
  const mainFile = normalizePath(next.mainFile || index.mainFile || 'main.tex');
  const main = files.find((file) => normalizePath(file.path) === mainFile);
  if (!sourceOwner || !main) throw new Error('找不到主文件或章节引用。');

  const movingText = sourceEntry.text;
  sourceOwner.body = replaceRange(String(sourceOwner.body || ''), sourceEntry.start, sourceEntry.end, '');
  main.body = insertMatterInput(String(main.body || ''), movingText, matter);
  next.activePath = normalized;
  return next;
}

function textProjectExtension(path: string) {
  return /\.(tex|ltx|bib|sty|cls|clo|cfg|bst|bbx|cbx|ldf|fd|bbl|ind|gls|nls|txt)$/i.test(path);
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

export async function projectFileFromUpload(file: File, preferredPath = ''): Promise<RinProjectFile> {
  const rawPath = normalizePath(preferredPath || file.name);
  const role = supportRole({ path: rawPath, kind: kindForPath(rawPath), body: '' });
  const path = rawPath.includes('/')
    ? rawPath
    : role === 'asset'
      ? `figures/${rawPath}`
      : rawPath;
  if (textProjectExtension(path)) {
    return {
      path,
      kind: kindForPath(path),
      body: await file.text(),
      mime: file.type || undefined,
    };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    path,
    kind: kindForPath(path),
    body: base64FromBytes(bytes),
    encoding: 'base64',
    mime: file.type || undefined,
  };
}

export function upsertProjectFile(project: RinProject, file: RinProjectFile): RinProject {
  const next = cloneProject(project);
  const files = next.files || [];
  const normalized = normalizePath(file.path);
  const index = files.findIndex((item) => normalizePath(item.path) === normalized);
  const nextFile = { ...file, path: normalized };
  if (index >= 0) {
    files[index] = nextFile;
  } else {
    files.push(nextFile);
  }
  next.files = files;
  next.activePath = normalized;
  return next;
}

export async function importBookProjectArchive(archive: RinArchiveInfo): Promise<RinProject> {
  const file = await fileFromRinArchiveInfo(archive, 'rin-source.tar.gz');
  const form = new FormData();
  form.append('source', file, file.name || archive.filename || 'rin-source.tar.gz');
  const response = await fetch('/rin/api/projects/import', {
    method: 'POST',
    body: form,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === 'string'
      ? payload.error
      : '无法解析 Rin 源包。';
    throw new Error(message);
  }
  const parsed = parseImportResponse(payload);
  return {
    title: parsed.title,
    mode: 'book',
    mainFile: parsed.mainFile || parsed.files?.[0]?.path || 'main.tex',
    activePath: parsed.mainFile || parsed.files?.[0]?.path || 'main.tex',
    folders: [],
    files: parsed.files || [],
  };
}

export function buildBookProjectIndex(project: RinProject | null): BookProjectIndex {
  const files = project?.files || [];
  const mainFile = normalizePath(project?.mainFile || files[0]?.path || 'main.tex');
  const byPath = new Map(files.map((file) => [normalizePath(file.path), file]));
  const nodes: BookStructureNode[] = [];
  const diagnostics: string[] = [];
  const visited = new Set<string>();
  let matter: BookMatter = 'main';

  function walk(path: string, parentStack: BookStructureNode[], depth = 0) {
    const normalized = normalizePath(path);
    const file = byPath.get(normalized);
    if (!file || visited.has(normalized) || depth > 80) return;
    visited.add(normalized);
    const source = stripComments(file.body || '');
    let cursor = 0;
    const localStack = [...parentStack];
    while (cursor < source.length) {
      const slash = source.indexOf('\\', cursor);
      if (slash < 0) break;
      const token = readCommand(source, slash);
      if (!token) {
        cursor = slash + 1;
        continue;
      }
      if (token.name === 'frontmatter') {
        matter = 'front';
        cursor = token.nextIndex;
        continue;
      }
      if (token.name === 'mainmatter') {
        matter = 'main';
        cursor = token.nextIndex;
        continue;
      }
      if (token.name === 'backmatter') {
        matter = 'back';
        cursor = token.nextIndex;
        continue;
      }
      if (token.name === 'appendix') {
        matter = 'appendix';
        cursor = token.nextIndex;
        continue;
      }
      if (inputCommands.has(token.name)) {
        const ref = readInputReference(source, token.name, token.nextIndex);
        const resolved = ref ? resolveTexPath(ref, normalized, byPath) : '';
        if (resolved) {
          walk(resolved, localStack, depth + 1);
        } else if (ref) {
          diagnostics.push(`找不到 ${normalized} 中引用的 ${ref}`);
        }
        cursor = token.nextIndex;
        continue;
      }
      if (!headingCommands.has(token.name)) {
        cursor = token.nextIndex;
        continue;
      }
      const command = token.name as BookStructureNode['command'];
      const heading = parseHeading(source, command, token.nextIndex);
      if (!heading) {
        cursor = token.nextIndex;
        continue;
      }
      const level = headingLevel(command);
      while (localStack.length && localStack[localStack.length - 1].level >= level) {
        localStack.pop();
      }
      const parent = localStack[localStack.length - 1];
      const line = lineNumberAt(source, slash);
      const id = nodeId(normalized, line, command);
      const fileHeadingCount = nodes.filter((node) => node.path === normalized).length;
      const node: BookStructureNode = {
        id,
        title: heading.title,
        command,
        level,
        matter,
        path: normalized,
        line,
        label: heading.label || undefined,
        parentId: parent?.id,
        fileNode: fileHeadingCount === 0,
      };
      nodes.push(node);
      localStack.push(node);
      cursor = heading.nextIndex;
    }
  }

  if (byPath.has(mainFile)) {
    walk(mainFile, []);
  } else {
    diagnostics.push(`找不到主文件 ${mainFile}`);
  }

  if (!nodes.length) {
    for (const file of files.filter((item) => /\.(tex|ltx)$/i.test(item.path))) {
      const title = withoutTexExtension(file.path).split('/').pop() || file.path;
      nodes.push({
        id: nodeId(file.path, 1, 'section'),
        title,
        command: file.path === mainFile ? 'chapter' : 'section',
        level: file.path === mainFile ? 1 : 2,
        matter: 'main',
        path: normalizePath(file.path),
        line: 1,
        fileNode: true,
      });
    }
  }

  const nodePaths = new Set(nodes.map((node) => node.path));
  const supportFiles = files
    .map((file) => {
      const path = normalizePath(file.path);
      return {
        path,
        kind: file.kind,
        role: supportRole(file),
      };
    })
    .filter((file) => file.path !== mainFile && !(file.role === 'tex' && nodePaths.has(file.path)))
    .sort((left, right) => {
      if (left.role !== right.role) return left.role.localeCompare(right.role);
      return left.path.localeCompare(right.path);
    });

  return {
    mainFile,
    nodes,
    supportFiles,
    diagnostics,
  };
}
