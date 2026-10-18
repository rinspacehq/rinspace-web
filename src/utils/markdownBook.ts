import { excerptFromMarkdown, extractMarkedSection, markdownToHtml } from '@/utils/blogBody';
import { firstMarkdownHeading, markdownWithTitle } from '@/utils/markdownTitle';

export type MarkdownBookLevel = 2 | 3 | 4 | 5 | 6 | 7;

function bookLevel(value: unknown): MarkdownBookLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= 7 ? value as MarkdownBookLevel : 2;
}

export type MarkdownBookFile = {
  id: string;
  path: string;
  title: string;
  body: string;
  level: MarkdownBookLevel;
  parentId?: string;
};

export type MarkdownBookPage = {
  id: string;
  text: string;
  level: MarkdownBookLevel;
  html: string;
};

export type MarkdownBookTocItem = {
  id: string;
  text: string;
  level: MarkdownBookLevel;
};

export type MarkdownBookProject = {
  version: '0.1';
  title: string;
  files: MarkdownBookFile[];
  toc: MarkdownBookTocItem[];
  pages: MarkdownBookPage[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function slugify(value: string, fallback: string) {
  const slug = value
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function normalizePath(value: string) {
  return value
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

export function markdownBookFileId(title: string, index: number) {
  return `md-${String(index + 1).padStart(3, '0')}-${slugify(title, 'chapter')}`;
}

export function markdownBookPath(title: string, index: number) {
  return `${String(index + 1).padStart(2, '0')}-${slugify(title, 'chapter')}.md`;
}

function markdownBookSectionId(parent: MarkdownBookFile, title: string, index: number) {
  return `${parent.id}-sec-${String(index + 1).padStart(3, '0')}-${slugify(title, 'section')}`;
}

function markdownBookSectionPath(parent: MarkdownBookFile, title: string, index: number) {
  const parentStem = normalizePath(parent.path).replace(/\.md$/i, '') || parent.id;
  return `${parentStem}/${String(index + 1).padStart(2, '0')}-${slugify(title, 'section')}.md`;
}

export function markdownBookFileTitle(file: Pick<MarkdownBookFile, 'title' | 'body'>, index: number) {
  return firstMarkdownHeading(file.body) || file.title.trim() || `第 ${index + 1} 章`;
}

function emptyMarkdownBookProject(title: string): MarkdownBookProject {
  return {
    version: '0.1',
    title: title.trim() || 'Markdown 书籍',
    files: [],
    toc: [],
    pages: [],
  };
}

function pageForFile(file: MarkdownBookFile, index: number, existing?: MarkdownBookPage): MarkdownBookPage {
  const text = markdownBookFileTitle(file, index);
  const source = markdownWithTitle(file.body, text);
  return {
    id: file.id,
    text,
    level: file.level,
    html: existing && existing.id === file.id ? existing.html : markdownToHtml(source),
  };
}

function tocItemForFile(file: MarkdownBookFile, index: number): MarkdownBookTocItem {
  return {
    id: file.id,
    text: markdownBookFileTitle(file, index),
    level: file.level,
  };
}

export function normalizeMarkdownBookProject(
  project: Partial<MarkdownBookProject>,
  title: string,
): MarkdownBookProject {
  const bookTitle = title.trim() || project.title?.trim() || 'Markdown 书籍';
  const existingPages = new Map((project.pages || []).map((page) => [page.id, page]));
  const usedIds = new Set<string>();
  const rawFiles = project.files || [];
  const rawIds = new Set(rawFiles.map((file) => file.id.trim()).filter(Boolean));
  const files = rawFiles.map((file, index) => {
    const fileTitle = markdownBookFileTitle(file, index);
    let id = file.id.trim() || markdownBookFileId(fileTitle, index);
    if (usedIds.has(id)) id = markdownBookFileId(fileTitle, index);
    usedIds.add(id);
    const parentId = file.parentId?.trim();
    const level: MarkdownBookLevel = file.level > 2 && parentId && rawIds.has(parentId) ? bookLevel(file.level) : 2;
    return {
      id,
      path: normalizePath(file.path || markdownBookPath(fileTitle, index)),
      title: fileTitle,
      body: String(file.body || ''),
      level,
      parentId: level > 2 ? parentId : undefined,
    };
  });
  const toc = files.map(tocItemForFile);
  const pages = files.map((file, index) => pageForFile(file, index, existingPages.get(file.id)));
  return {
    version: '0.1',
    title: bookTitle,
    files,
    toc,
    pages,
  };
}

export function markdownBookProjectFromBody(body: string, title: string): MarkdownBookProject {
  const raw = extractMarkedSection(body, 'RIN_MARKDOWN_BOOK');
  if (!raw) return emptyMarkdownBookProject(title);
  try {
    const payload: unknown = JSON.parse(raw);
    if (!isRecord(payload)) return emptyMarkdownBookProject(title);
    const files = Array.isArray(payload.files)
      ? payload.files
          .map((item): MarkdownBookFile | null => {
            if (!isRecord(item) || typeof item.body !== 'string') return null;
            return {
              id: typeof item.id === 'string' ? item.id : '',
              path: typeof item.path === 'string' ? item.path : '',
              title: typeof item.title === 'string' ? item.title : '',
              body: item.body,
              level: bookLevel(item.level),
              parentId: typeof item.parentId === 'string' ? item.parentId : undefined,
            };
          })
          .filter((item): item is MarkdownBookFile => item !== null)
      : [];
    const pages = Array.isArray(payload.pages)
      ? payload.pages
          .map((item): MarkdownBookPage | null => {
            if (!isRecord(item)) return null;
            if (typeof item.id !== 'string' || typeof item.html !== 'string') return null;
            return {
              id: item.id,
              text: typeof item.text === 'string' ? item.text : '',
              level: bookLevel(item.level),
              html: item.html,
            };
          })
          .filter((item): item is MarkdownBookPage => item !== null)
      : [];
    return normalizeMarkdownBookProject(
      {
        version: '0.1',
        title,
        files,
        pages,
      },
      title,
    );
  } catch {
    return emptyMarkdownBookProject(title);
  }
}

export function addMarkdownBookFile(project: MarkdownBookProject, title: string) {
  const nextTitle = title.trim();
  if (!nextTitle) return project;
  const index = project.files.length;
  const file: MarkdownBookFile = {
    id: markdownBookFileId(nextTitle, index),
    path: markdownBookPath(nextTitle, index),
    title: nextTitle,
    body: markdownWithTitle('', nextTitle),
    level: 2,
  };
  return normalizeMarkdownBookProject(
    {
      ...project,
      files: [...project.files, file],
    },
    project.title,
  );
}

export function addMarkdownBookSection(
  project: MarkdownBookProject,
  parentId: string,
  title: string,
) {
  const nextTitle = title.trim();
  const parent = project.files.find((file) => file.id === parentId && file.level === 2);
  if (!nextTitle || !parent) return project;
  const childCount = project.files.filter((file) => file.parentId === parent.id).length;
  const file: MarkdownBookFile = {
    id: markdownBookSectionId(parent, nextTitle, childCount),
    path: markdownBookSectionPath(parent, nextTitle, childCount),
    title: nextTitle,
    body: markdownWithTitle('', nextTitle),
    level: 3,
    parentId: parent.id,
  };
  const parentIndex = project.files.findIndex((item) => item.id === parent.id);
  let insertIndex = parentIndex + 1;
  while (insertIndex < project.files.length && project.files[insertIndex].parentId === parent.id) {
    insertIndex += 1;
  }
  return normalizeMarkdownBookProject(
    {
      ...project,
      files: [
        ...project.files.slice(0, insertIndex),
        file,
        ...project.files.slice(insertIndex),
      ],
    },
    project.title,
  );
}

function markdownBookSubtreeSize(files: MarkdownBookFile[], startIndex: number) {
  const root = files[startIndex];
  if (!root) return 1;
  let size = 1;
  for (let index = startIndex + 1; index < files.length; index += 1) {
    if (files[index].level <= root.level) break;
    size += 1;
  }
  return size;
}

export function moveMarkdownBookFileNear(
  project: MarkdownBookProject,
  fromId: string,
  toId: string,
  placement: 'before' | 'after',
) {
  if (!fromId || !toId || fromId === toId) return project;
  const fromIndex = project.files.findIndex((file) => file.id === fromId);
  const toIndex = project.files.findIndex((file) => file.id === toId);
  const from = project.files[fromIndex];
  const to = project.files[toIndex];
  if (!from || !to) return project;
  if (from.level !== to.level || (from.parentId || '') !== (to.parentId || '')) return project;

  const movingSize = markdownBookSubtreeSize(project.files, fromIndex);
  const movingIds = new Set(project.files.slice(fromIndex, fromIndex + movingSize).map((file) => file.id));
  if (movingIds.has(to.id)) return project;
  const moving = project.files.slice(fromIndex, fromIndex + movingSize);
  const remaining = [
    ...project.files.slice(0, fromIndex),
    ...project.files.slice(fromIndex + movingSize),
  ];
  const nextToIndex = remaining.findIndex((file) => file.id === toId);
  if (nextToIndex < 0) return project;
  const toSize = placement === 'after' ? markdownBookSubtreeSize(remaining, nextToIndex) : 0;
  const insertIndex = nextToIndex + toSize;
  return normalizeMarkdownBookProject(
    {
      ...project,
      files: [
        ...remaining.slice(0, insertIndex),
        ...moving,
        ...remaining.slice(insertIndex),
      ],
    },
    project.title,
  );
}

export function updateMarkdownBookFile(
  project: MarkdownBookProject,
  fileId: string,
  nextTitle: string,
  nextBody: string,
) {
  const normalizedTitle = nextTitle.trim();
  const files = project.files.map((file) => {
    if (file.id !== fileId) return file;
    const body = markdownWithTitle(nextBody, normalizedTitle || file.title);
    return {
      ...file,
      title: markdownBookFileTitle({ ...file, title: normalizedTitle || file.title, body }, 0),
      body,
    };
  });
  const existingPages = project.pages.map((page): MarkdownBookPage => {
    if (page.id !== fileId) return page;
    const file = files.find((item) => item.id === fileId);
    if (!file) return page;
    const title = markdownBookFileTitle(file, 0);
    const source = markdownWithTitle(file.body ?? '', title);
    return {
      id: file.id,
      text: title,
      level: file.level,
      html: markdownToHtml(source),
    };
  });
  return normalizeMarkdownBookProject(
    {
      ...project,
      files,
      pages: existingPages,
    },
    project.title,
  );
}

export function bodyFromMarkdownBookProject(project: MarkdownBookProject) {
  const normalized = normalizeMarkdownBookProject(project, project.title);
  const combinedMarkdown = normalized.files.map((file) => file.body).join('\n\n').trim();
  const combinedHtml = normalized.pages.map((page) => page.html).join('\n');
  return [
    '[[RIN_MARKDOWN]]',
    combinedHtml,
    '[[/RIN_MARKDOWN]]',
    '',
    '[[RIN_MARKDOWN_SOURCE]]',
    combinedMarkdown,
    '[[/RIN_MARKDOWN_SOURCE]]',
    '',
    '[[RIN_MARKDOWN_BOOK]]',
    JSON.stringify(normalized),
    '[[/RIN_MARKDOWN_BOOK]]',
  ].join('\n');
}

export function markdownBookExcerpt(project: MarkdownBookProject) {
  return excerptFromMarkdown(project.files.map((file) => file.body).join('\n\n'));
}
