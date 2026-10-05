import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function identity(text) {
  const match = text.match(/^\s*(.+?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (!match) throw Error('Invalid DCO identity');
  return `${match[1].trim().replace(/\s+/g, ' ').toLowerCase()} <${match[2].toLowerCase()}>`;
}

export function checkDco(commits) {
  if (!Array.isArray(commits) || !commits.length || commits.length > 250) throw Error('DCO requires the complete bounded PR commit list');
  for (const item of commits) {
    if (!/^[a-f0-9]{40}$/.test(item.sha) || typeof item.commit?.message !== 'string' || item.commit.message.length > 1024 * 1024 || typeof item.commit.author?.name !== 'string' || typeof item.commit.author?.email !== 'string') throw Error('Invalid PR commit metadata');
    // Git parses the actual trailer block; a sign-off mentioned in body text does
    // not satisfy DCO. No PR checkout, hook or candidate script is executed.
    const trailers = execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'interpret-trailers', '--parse'], { input: item.commit.message, encoding: 'utf8', maxBuffer: 1024 * 1024 });
    const signed = new Set();
    const authors = new Set([identity(`${item.commit.author.name} <${item.commit.author.email}>`)]);
    for (const line of trailers.split('\n')) {
      const match = line.match(/^(Signed-off-by|Co-authored-by):\s*(.+)$/i);
      if (!match) continue;
      const person = identity(match[2]);
      (match[1].toLowerCase() === 'signed-off-by' ? signed : authors).add(person);
    }
    for (const author of authors) if (!signed.has(author)) throw Error(`Commit ${item.sha} lacks an author/co-author DCO sign-off`);
  }
  return commits.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const bytes = fs.readFileSync(0);
    if (bytes.length > 8 * 1024 * 1024) throw Error('PR metadata exceeds the DCO limit');
    console.log(`DCO passed for ${checkDco(JSON.parse(bytes))} PR commits.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
