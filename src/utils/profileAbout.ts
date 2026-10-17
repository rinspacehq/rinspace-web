const aboutFrameCSP = [
  "default-src 'none'", "script-src 'none'", "connect-src 'none'",
  "form-action 'none'", "base-uri 'none'", "object-src 'none'", "frame-src 'none'",
  "img-src https: data:", "style-src 'unsafe-inline' https:",
  "font-src https: data:", "media-src https: data:",
].join('; ');

function defaultAboutHTML(dark: boolean, emptyText: string) {
  const color = dark ? '#a8b6c2' : '#64748b';
  const background = dark ? '#0b1218' : '#fff';
  const escapedText = emptyText
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<main style="min-height:100vh;display:grid;place-items:center;margin:0;font:16px system-ui;color:${color};background:${background};"><p>${escapedText}</p></main>`;
}

/** Preserve author-owned HTML/CSS. Isolation belongs to the host iframe/CSP. */
export function profileAboutSrcDoc(source: string, dark: boolean, emptyText: string) {
  const html = source.trim() || defaultAboutHTML(dark, emptyText);
  const csp = `<meta http-equiv="Content-Security-Policy" content="${aboutFrameCSP.replace(/"/g, '&quot;')}">`;
  const scheme = dark ? 'dark' : 'light';
  // This supplies UA defaults only. No body background, padding, typography or
  // stacking context may mask an author's gradient or negative-z decorations.
  const theme = `<style data-rin-profile-theme="${scheme}">:where(html){color-scheme:${scheme}}</style>`;
  const prefix = `${csp}<base target="_blank">${theme}`;
  const headPattern = /<head(\s[^>]*)?>/i;
  if (headPattern.test(html)) return html.replace(headPattern, match => `${match}${prefix}`);
  if (/<html(\s[^>]*)?>/i.test(html)) {
    return html.replace(/<html(\s[^>]*)?>/i, match => `${match}<head>${prefix}</head>`);
  }
  return `<!doctype html><html><head>${prefix}</head><body>${html}</body></html>`;
}
