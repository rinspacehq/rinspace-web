import type { Crepe } from '@milkdown/crepe';

import { registerWritingEnhancements } from '@rinspacehq/markdown-writer';

/** Product adapter; the ordered plugin implementation lives in the public package. */
export function registerRinMilkdownPlugins(crepe: Crepe) {
  registerWritingEnhancements(crepe);
}
