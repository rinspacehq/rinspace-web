import type { BundledLanguage, Highlighter } from 'shiki';

export const rinCodeTheme = 'github-light';
export const rinCodeDarkTheme = 'github-dark';
export type RinCodeLanguage = BundledLanguage | '';

export const rinCodeLanguageAliases: Record<string, RinCodeLanguage> = {
  'c': 'c',
  'c++': 'cpp',
  'cplusplus': 'cpp',
  'cpp': 'cpp',
  'c#': 'csharp',
  'cs': 'csharp',
  'csharp': 'csharp',
  'h': 'c',
  'hpp': 'cpp',
  'm': 'objective-c',
  'mm': 'objective-cpp',
  'objc': 'objective-c',
  'obj-c': 'objective-c',
  'objectivec': 'objective-c',
  'objective-c': 'objective-c',
  'objective-cpp': 'objective-cpp',
  'js': 'javascript',
  'jsx': 'jsx',
  'ts': 'typescript',
  'tsx': 'tsx',
  'shell': 'shellscript',
  'sh': 'shellscript',
  'bash': 'bash',
  'zsh': 'shellscript',
  'console': 'shellscript',
  'py': 'python',
  'rb': 'ruby',
  'rs': 'rust',
  'go': 'go',
  'golang': 'go',
  'java': 'java',
  'kt': 'kotlin',
  'kotlin': 'kotlin',
  'php': 'php',
  'sql': 'sql',
  'html': 'html',
  'xml': 'xml',
  'css': 'css',
  'scss': 'scss',
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'toml': 'toml',
  'md': 'markdown',
  'markdown': 'markdown',
  'tex': 'tex',
  'latex': 'latex',
  'lua': 'lua',
  'text': '',
  'txt': '',
  'plain': '',
};

export function normalizeRinCodeLanguage(value: string | undefined | null): RinCodeLanguage {
  const token = (value || '')
    .trim()
    .replace(/^language-/, '')
    .replace(/^\{?\.?/, '')
    .replace(/\}?$/, '')
    .toLowerCase();
  return rinCodeLanguageAliases[token] || '';
}

let rinCodeHighlighterPromise: Promise<Highlighter> | null = null;

export function rinCodeHighlighter() {
  if (!rinCodeHighlighterPromise) {
    rinCodeHighlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: [rinCodeTheme, rinCodeDarkTheme],
        langs: [
          'bash',
          'c',
          'cpp',
          'csharp',
          'css',
          'go',
          'html',
          'java',
          'javascript',
          'json',
          'jsx',
          'kotlin',
          'latex',
          'lua',
          'markdown',
          'objective-c',
          'objective-cpp',
          'php',
          'python',
          'ruby',
          'rust',
          'scss',
          'shellscript',
          'sql',
          'tex',
          'toml',
          'tsx',
          'typescript',
          'xml',
          'yaml',
        ],
      }),
    );
  }
  return rinCodeHighlighterPromise;
}

/** Post-process Shiki's dual-theme output into a clean <pre> (no inline bg, our class). */
export function cleanShikiPreHtml(highlighted: string, lang: string): string {
  const document = new DOMParser().parseFromString(highlighted, 'text/html');
  const pre = document.body.querySelector<HTMLPreElement>('pre');
  if (!pre) return highlighted;
  pre.classList.add('rin-code-pre');
  pre.removeAttribute('style');
  if (lang) pre.dataset.rinCodeLanguage = lang;
  return pre.outerHTML;
}

/** Build a plain (unhighlighted) <pre> with line spans, safe against HTML in source. */
export function plainRinCodePreHtml(source: string): string {
  const pre = document.createElement('pre');
  pre.className = 'rin-code-pre';
  pre.dataset.rinCodeLanguage = 'text';
  const code = document.createElement('code');
  const lines = source.split('\n');
  (lines.length ? lines : ['']).forEach((lineText) => {
    const line = document.createElement('span');
    line.className = 'line';
    line.textContent = lineText;
    code.appendChild(line);
  });
  pre.appendChild(code);
  return pre.outerHTML;
}

/** Inject per-line numbers into Shiki/plain code, matching the reading rail style. */
export function addLineNumbersToHighlightedCode(code: HTMLElement) {
  const lines = Array.from(code.querySelectorAll<HTMLElement>('.line'));
  if (!lines.length) {
    const sourceLines = (code.textContent || '').split('\n');
    code.replaceChildren();
    sourceLines.forEach((lineText) => {
      const line = document.createElement('span');
      line.className = 'line';
      line.textContent = lineText;
      code.appendChild(line);
      lines.push(line);
    });
  }
  lines.forEach((line, index) => {
    if (line.querySelector(':scope > .rin-code-line-number')) return;
    const content = document.createElement('span');
    content.className = 'rin-code-line-content';
    while (line.firstChild) {
      content.appendChild(line.firstChild);
    }
    const number = document.createElement('span');
    number.className = 'rin-code-line-number';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = String(index + 1);
    line.append(number, content);
  });
}
