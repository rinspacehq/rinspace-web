import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const chunksDirectory = path.join(root, 'build/static/js');
const evidencePath = path.join(root, 'build/reports/translation-bundle-budget.json');
const namespaces = ['discovery', 'reader', 'creation', 'creator', 'identity', 'admin', 'settings', 'legal', 'wallet'];
const perChunkBudgetBytes = 12 * 1024;
const baseFeatureBudgetBytes = 72 * 1024;
// Markdown account-draft recovery and publication failure notices require both
// locales. The measured increase is 328 gzip bytes; reserve 1 KiB for this
// safety copy while retaining the per-chunk 12 KiB ceiling.
const markdownDraftRecoveryBudgetBytes = 1024;
const totalBudgetBytes = baseFeatureBudgetBytes + markdownDraftRecoveryBudgetBytes;
// The wallet owns a
// separate 4 KiB two-locale read-flow budget. The newly implemented confirmation,
// storage failure and unknown-result recovery flow owns an additional 1 KiB;
// the work/recipient tip confirmation and cross-page recovery add 1 KiB.
// manual refund request/cancel and immutable receipt states add 1 KiB.
// the wallet ceiling stays separate from the retained feature ceiling.
const walletReadBudgetBytes = 4 * 1024;
const walletConversionBudgetBytes = 1024;
const walletTipBudgetBytes = 1024;
const walletRefundBudgetBytes = 1024;
const walletBudgetBytes = walletReadBudgetBytes + walletConversionBudgetBytes + walletTipBudgetBytes + walletRefundBudgetBytes;

if (!fs.existsSync(chunksDirectory)) {
  throw new Error('Production build not found. Run pnpm build before checking translation chunks.');
}

const emittedFiles = fs.readdirSync(chunksDirectory);
const resources = namespaces.flatMap((namespace) => {
  const candidates = emittedFiles
    .filter((name) => name.startsWith(`${namespace}.`) && name.endsWith('.chunk.js'))
    .map((name) => {
      const file = path.join(chunksDirectory, name);
      const source = fs.readFileSync(file);
      const text = source.toString('utf8');
      return {
        namespace,
        file: name,
        bytes: source.byteLength,
        gzipBytes: gzipSync(source).byteLength,
        isResource: !/\bfrom"\.\//.test(text) && /export\{[^}]*default/.test(text),
      };
    })
    .filter(({ isResource }) => isResource)
    .map(({ isResource: _isResource, ...candidate }) => candidate);

  if (candidates.length !== 2) {
    throw new Error(`${namespace}: expected one feature translation chunk per locale, found ${candidates.length}.`);
  }
  return candidates;
});

const oversized = resources.filter(({ gzipBytes }) => gzipBytes > perChunkBudgetBytes);
const totalGzipBytes = resources.reduce((sum, resource) => sum + resource.gzipBytes, 0);
if (oversized.length > 0) {
  throw new Error(`Translation chunk budget exceeded: ${oversized.map(({ file, gzipBytes }) => `${file}=${gzipBytes}`).join(', ')}`);
}
const walletGzipBytes = resources.filter(({ namespace }) => namespace === 'wallet').reduce((sum, resource) => sum + resource.gzipBytes, 0);
if (totalGzipBytes - walletGzipBytes > totalBudgetBytes || walletGzipBytes > walletBudgetBytes) {
  throw new Error(`Translation budgets exceeded: retained=${totalGzipBytes - walletGzipBytes}/${totalBudgetBytes}, wallet=${walletGzipBytes}/${walletBudgetBytes} gzip bytes.`);
}

const report = {
  profile: 'two locales; feature namespaces only; core shell namespaces excluded',
  budgets: { perChunkGzipBytes: perChunkBudgetBytes, baseFeatureGzipBytes: baseFeatureBudgetBytes, markdownDraftRecoveryGzipBytes: markdownDraftRecoveryBudgetBytes, retainedFeatureGzipBytes: totalBudgetBytes, walletReadGzipBytes: walletReadBudgetBytes, walletConversionGzipBytes: walletConversionBudgetBytes, walletTipGzipBytes: walletTipBudgetBytes, walletRefundGzipBytes: walletRefundBudgetBytes, walletGzipBytes: walletBudgetBytes, totalFeatureGzipBytes: totalBudgetBytes + walletBudgetBytes },
  actual: { totalFeatureGzipBytes: totalGzipBytes, chunks: resources },
};
fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
fs.writeFileSync(evidencePath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Translation bundle budget passed: ${resources.length} chunks, ${totalGzipBytes} gzip bytes.`);
