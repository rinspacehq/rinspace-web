import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'public/fonts/library/rinspace-fonts.css');
const target = path.join(root, 'public/fonts/library/rinspace-core-fonts.css');
const families = new Set([
  'IBM Plex Sans',
  'IBM Plex Mono',
  'Rinspace Newsreader',
  'Rinspace Noto Sans SC',
  'Rinspace Noto Serif SC',
]);
const blocks = fs.readFileSync(source, 'utf8').match(/@font-face\s*\{[\s\S]*?\}/g) || [];
const selected = blocks.filter((block) => {
  const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
  return family && families.has(family);
}).map((block) => {
  const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
  const variableWeightBlock = family?.includes('Noto ')
    ? block.replace(/font-weight:\s*\d+;/, 'font-weight: 400 900;')
    : block;
  return variableWeightBlock.replace('font-display: swap;', 'font-display: block;');
});
const unique = [...new Set(selected)];
if (!unique.length) throw new Error('Core self-hosted font faces were not found.');
fs.writeFileSync(target, `/* Generated from the pinned offline font library. */\n${unique.join('\n\n')}\n`);
console.log(`Core font CSS generated: ${unique.length} faces.`);
