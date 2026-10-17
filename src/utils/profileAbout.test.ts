import { describe, expect, it } from 'vitest';
import { profileAboutSrcDoc } from './profileAbout';

describe('profile About sandbox document', () => {
  it.each([false, true])('preserves authored layout and styles in mode dark=%s', dark => {
    const css = 'body{margin:0;background:linear-gradient(red,blue)}.stem{position:absolute;z-index:-1}';
    const source = `<!doctype html><html><head><style>${css}</style></head><body><div class="stem">stem</div></body></html>`;
    const result = profileAboutSrcDoc(source, dark, 'Empty');
    const document = new DOMParser().parseFromString(result, 'text/html');
    expect(document.body.innerHTML).toBe('<div class="stem">stem</div>');
    expect(result).toContain(`<style>${css}</style>`);
    expect(result).not.toContain('!important');
    expect(result).not.toContain('padding:1rem');
    const styles = [...document.querySelectorAll('style')];
    expect(styles[0].textContent).toBe(`:where(html){color-scheme:${dark ? 'dark' : 'light'}}`);
    expect(styles[1].textContent).toBe(css);
    expect(document.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain("script-src 'none'");
    expect(document.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain("connect-src 'none'");
  });

  it.each(['<p>Fragment</p>', '<html><body><p>Fragment</p></body></html>', '<html><head><p>Fragment</p>'])('secures documents without requiring a complete head: %s', source => {
    const result = profileAboutSrcDoc(source, false, 'Empty');
    expect(result).toContain("script-src 'none'");
    expect(result).toContain('Fragment');
    expect(result).toContain('<base target="_blank">');
  });

  it('escapes the themed empty fallback without enabling scripts or frames', () => {
    const result = profileAboutSrcDoc(' ', true, '<script>bad</script>');
    expect(result).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(result).toContain('background:#0b1218');
    expect(result).toContain("frame-src 'none'");
  });
});
