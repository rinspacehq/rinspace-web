import { expect, test } from '@playwright/test';

const luminance = (color: string) => {
  const values = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!values || values.length !== 3) throw new Error(`Unexpected color: ${color}`);
  const [red, green, blue] = values.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

test('Rin and user message text stays readable in both themes', async ({ page }, testInfo) => {
  const theme = testInfo.project.name === 'desktop-dark' ? 'dark' : 'light';
  test.skip(!['desktop-light', 'desktop-dark'].includes(testInfo.project.name));
  await page.addInitScript((value) => localStorage.setItem('rinspace-theme-v2', value), theme);
  await page.clock.install();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root')).toHaveAttribute('data-rin-interactive', 'true');
  await page.clock.fastForward(16_000); // The chat component loads after the first page paint.
  await expect(page.locator('link[rel="stylesheet"][href*="RinAssistant"]')).toHaveCount(1);
  await page.locator('body').evaluate((body) => {
    body.insertAdjacentHTML('beforeend', `
      <section id="rin-chat-contrast-fixture" class="rin-assistant-messages">
        <article class="rin-assistant-message is-me"><div><div class="rin-assistant-bubble"><div class="math-text"><p>用户消息 $x$</p></div></div></div></article>
        <article class="rin-assistant-message is-rin"><div><div class="rin-assistant-bubble"><div class="math-text"><p>琳的回答 $x$</p></div></div></div></article>
      </section>
    `);
  });

  for (const side of ['is-me', 'is-rin']) {
    const bubble = page.locator(`#rin-chat-contrast-fixture .${side} .rin-assistant-bubble`);
    const colors = await bubble.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      text: getComputedStyle(element.querySelector('p')!).color,
    }));
    const a = luminance(colors.background);
    const b = luminance(colors.text);
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
