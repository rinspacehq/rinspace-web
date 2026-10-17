export type ArticleEditorPreference = 'online' | 'git';

export const articleEditorPreferenceKey = 'rinspace-article-editor-preference-v1';

export function readArticleEditorPreference(
  fallback: ArticleEditorPreference = 'online',
): ArticleEditorPreference {
  try {
    return window.localStorage.getItem(articleEditorPreferenceKey) === 'git' ? 'git' : 'online';
  } catch {
    // A blocked device preference must not prevent creating or opening a project.
    return fallback;
  }
}

export function writeArticleEditorPreference(preference: ArticleEditorPreference) {
  try {
    window.localStorage.setItem(articleEditorPreferenceKey, preference);
  } catch {
    // The current dialog still uses its in-memory selection when storage is unavailable.
  }
}
