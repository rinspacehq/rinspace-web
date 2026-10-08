import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const styles = await Promise.all([
  '../src/styles/product-families/knowledge.css',
  '../src/styles/latexml-reader.css',
  '../src/styles/renderer-content.css',
].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  for (const width of [1280, 390]) {
    for (const shell of ['detail-blog blog-detail-article', 'book-reader-shell']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.setContent(`<style>${styles.join('\n')}</style>
        <main class="${shell.split(' ')[0]}"><article class="${shell.split(' ')[1] || ''}"><div class="rin-writer-html rin-renderer-content">
          <ul class="ordinary"><li>Ordinary bullet</li></ul>
          <ol class="ltx_enumerate rin-list rin-list-enumerate rin-enumerate-parenthesized">
            <li class="ltx_item rin-list-item"><span class="ltx_tag_item rin-list-marker">(iv)</span>
              <div class="ltx_para"><p class="ltx_p">Custom renderer label</p></div></li></ol>
          <div class="ltx_theorem rin-env"><h6 class="ltx_title_theorem ltx_runin rin-env-title">Lemma 7.</h6>
            <div class="ltx_para"><p class="ltx_p">Native run-in statement.</p></div></div>
          <p><span class="ltx_font_bold">Native bold</span> <span class="ltx_font_italic">Native italic</span></p>
          <table class="ltx_equation ltx_eqn_table rin-equation rin-equation-table"><tbody><tr class="ltx_eqn_row">
            <td class="ltx_eqn_cell ltx_align_center">x = y</td><td class="ltx_eqn_eqno ltx_align_right">(9)</td></tr></tbody></table>
          <section class="ltx_bibliography"><ul class="ltx_biblist">
            <li id="bib.reference" class="ltx_bibitem"><span class="ltx_tag ltx_tag_bibitem">[1]</span>
              <span class="ltx_bibblock">A long reference with its native number and
              <a href="#citation">citation backlink</a>.</span></li></ul></section>
          <figure class="ltx_figure rin-float"><div class="rin-tikz">
            <div class="rin-tikz-svg"><svg xmlns="http://www.w3.org/2000/svg"
              width="1000" height="1200" viewBox="0 0 1000 1200">
              <rect width="1000" height="1200" fill="lightblue"/>
              <text x="20" y="1190">Bottom of tall diagram</text></svg></div></div>
            <figcaption>Caption below the complete SVG</figcaption></figure>
        </div></article></main>`);
      await page.locator('figure').scrollIntoViewIfNeeded();
      const result = await page.evaluate(() => {
        const figure = document.querySelector('figure');
        const svg = figure.querySelector('svg');
        const svgRect = svg.getBoundingClientRect();
        const caption = figure.querySelector('figcaption').getBoundingClientRect();
        return {
          nativeListMarker: getComputedStyle(document.querySelector('.ltx_item')).listStyleType,
          generatedListLabel: getComputedStyle(document.querySelector('.ltx_item'), '::before').content,
          nativeListLabel: document.querySelector('.ltx_tag_item').textContent,
          runin: getComputedStyle(document.querySelector('.ltx_runin')).display,
          runinParagraph: getComputedStyle(document.querySelector('.ltx_runin + .ltx_para > .ltx_p')).display,
          bold: getComputedStyle(document.querySelector('.ltx_font_bold')).fontWeight,
          italic: getComputedStyle(document.querySelector('.ltx_font_italic')).fontStyle,
          equationTable: getComputedStyle(document.querySelector('.ltx_eqn_table')).display,
          equationAlignment: getComputedStyle(document.querySelector('.ltx_eqn_eqno')).textAlign,
          equationLabel: document.querySelector('.ltx_eqn_eqno').textContent,
          bibliographyMarker: getComputedStyle(document.querySelector('.ltx_bibitem')).listStyleType,
          ordinaryMarker: getComputedStyle(document.querySelector('.ordinary li')).listStyleType,
          label: document.querySelector('.ltx_tag_bibitem').textContent,
          backlink: document.querySelector('.ltx_bibitem a').getAttribute('href'),
          svgHeight: svgRect.height,
          svgBottom: svgRect.bottom,
          captionTop: caption.top,
          panes: [figure, ...figure.querySelectorAll('div')].map(node => ({
            overflowY: getComputedStyle(node).overflowY,
            clientHeight: node.clientHeight,
            scrollHeight: node.scrollHeight,
          })),
        };
      });
      assert.equal(result.bibliographyMarker, 'none');
      assert.equal(result.nativeListMarker, 'none');
      assert.equal(result.generatedListLabel, 'none');
      assert.equal(result.nativeListLabel, '(iv)');
      assert.equal(result.runin, 'inline');
      assert.equal(result.runinParagraph, 'inline');
      assert.equal(result.bold, '700');
      assert.equal(result.italic, 'italic');
      assert.equal(result.equationTable, 'table');
      assert.equal(result.equationAlignment, 'right');
      assert.equal(result.equationLabel, '(9)');
      assert.equal(result.ordinaryMarker, 'disc');
      assert.equal(result.label, '[1]');
      assert.equal(result.backlink, '#citation');
      assert.ok(result.svgHeight > 360, 'Tall SVG must retain its natural height');
      assert.ok(result.captionTop >= result.svgBottom - 1, 'Caption must follow full SVG');
      for (const pane of result.panes) {
        assert.ok(!['auto', 'scroll'].includes(pane.overflowY));
        assert.ok(pane.scrollHeight <= pane.clientHeight + 1, 'Tall diagram must not be clipped');
      }
      console.log(`PASS ${shell} at ${width}px: native labels, full SVG height ${result.svgHeight}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
