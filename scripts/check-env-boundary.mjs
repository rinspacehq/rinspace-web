import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'src');
const allowed = new Set([
  path.join(root, 'app/config/env.ts'),
]);
const findings = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !allowed.has(absolute)) {
      const source = fs.readFileSync(absolute, 'utf8');
      if (/process\.env|import\.meta\.env/.test(source)) {
        findings.push(path.relative(root, absolute));
      }
    }
  }
}

walk(root);
if (findings.length) {
  throw new Error(`Direct environment access is forbidden outside app/config/env.ts:\n${findings.join('\n')}`);
}
console.log('Environment boundary check passed.');
