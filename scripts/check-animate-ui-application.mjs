import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Application-only checks. Raw catalog/provenance review stays in the private repository.
export function checkAnimateUiApplication(uiRoot) {
  const failures = [];
  function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(?:ts|tsx|css)$/.test(entry.name) ? [full] : [];
    });
  }
  for (const file of walk(path.join(uiRoot, 'src'))) {
    const relative = path.relative(uiRoot, file);
    const source = fs.readFileSync(file, 'utf8');
    if (/https?:\/\/[^'"\s]*animate-ui/i.test(source)) failures.push(`runtime Animate UI URL in ${relative}`);
    if (/from ['"]@radix-ui\//.test(source) && !relative.startsWith('src/components/ui/') && !relative.startsWith('src/components/animate-ui/')) failures.push(`raw Radix import outside owned boundary: ${relative}`);
    const operationsConsoleSource = relative.startsWith('src/features/operations/') || relative.startsWith('src/pages/Operations/');
    if (operationsConsoleSource && /from ['"](?:lucide-react|@\/components\/animate-ui|components\/animate-ui)/.test(source)) failures.push(`operations console bypasses the stable Animate UI boundary: ${relative}`);
    if (operationsConsoleSource && /<svg(?:\s|>)/i.test(source)) failures.push(`page-level SVG in operations console: ${relative}`);
    if (operationsConsoleSource && /\p{Extended_Pictographic}/u.test(source)) failures.push(`emoji icon in operations console: ${relative}`);
    if (operationsConsoleSource && /\bIcon\s+name=/.test(source)) failures.push(`legacy icon wrapper in operations console: ${relative}`);
  }
  const wrapper = fs.readFileSync(path.join(uiRoot, 'src/components/ui/animate.ts'), 'utf8');
  for (const name of ['AnimateButton', 'AnimateIconButton', 'AnimateTabs', 'AnimateSidebar', 'AnimateSidebarProvider', 'AnimateSidebarTrigger', 'AnimateCheckbox', 'AnimateSwitch', 'AnimateProgress', 'AnimateFiles', 'AnimateCodeTabs', 'AnimateHoverCard', 'AnimateImageZoom', 'AnimatePreviewLinkCard', 'AnimateScrollProgress', 'AnimateAvatarGroup', 'UserPresenceAvatar', 'AnimateGithubStars', 'AnimateThemeToggler', 'AnimateLayoutDashboard', 'AnimateChartSpline', 'AnimatePanelLeft', 'AnimateFilter', 'AnimateShieldCheck', 'AnimateHistory', 'AnimateGitCommit', 'AnimateRefresh', 'AnimateMore', 'AnimateCross']) {
    if (!wrapper.includes(name)) failures.push(`stable application wrapper does not export ${name}`);
  }

  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = checkAnimateUiApplication(path.resolve(import.meta.dirname, '..'));
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('Animate UI application gate passed: source boundaries and stable application exports verified.');
}
