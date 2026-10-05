import type { CreateWritingInteractionsOptions } from '@rinspacehq/markdown-writer/interactions';
import { createWritingInteractions } from '@rinspacehq/markdown-writer/interactions';

import {
  diagramIdFromImageUrl,
  isRepositoryQuiverImageUrl,
  loadTikzcdDiagramSource,
  tikzcdDiagramSourceText,
} from './quiver';

type CreateMilkdownInteractionsOptions = CreateWritingInteractionsOptions & {
  openQuiver: (options?: { source?: string; replacingImageSrc?: string }) => void;
  onQuiverSourceError: (error: unknown) => void;
  loadQuiverSource?: (imageSrc: string, diagramID: string) => Promise<string>;
};

/** Rinspace-only Quiver adapter around the reusable writing interactions. */
export function createMilkdownInteractions(options: CreateMilkdownInteractionsOptions) {
  const { host, readOnlyRef, openQuiver, onQuiverSourceError, loadQuiverSource } = options;
  let destroyed = false;
  let attached = false;

  const syncQuiverImageBlocks = () => {
    host.querySelectorAll('img[data-type="image-block"]').forEach((image) => {
      if (!(image instanceof HTMLElement)) return;
      const block = image.closest('.milkdown-image-block');
      if (!(block instanceof HTMLElement)) return;
      const imageSource = image.getAttribute('src') || '';
      const isQuiverImage = Boolean(diagramIdFromImageUrl(imageSource));
      block.classList.toggle('rin-quiver-image-block', isQuiverImage);
      image.classList.toggle('rin-quiver-image', isQuiverImage);
      image.dataset.rinQuiverUrl = '';
    });
  };

  const openExistingQuiverImage = (event: PointerEvent) => {
    if (readOnlyRef.current) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const block = target.closest('.rin-quiver-image-block');
    if (!(block instanceof HTMLElement)) return;
    if (
      target.closest('.operation, .operation-item, .image-resize-handle, figcaption, .caption') ||
      target.closest('button, input, textarea, select, a')
    ) return;
    const image = block.querySelector('img[data-type="image-block"].rin-quiver-image');
    if (!(image instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();

    const imageSource = image.getAttribute('src') || '';
    const diagramID = diagramIdFromImageUrl(imageSource);
    if (!diagramID) return;
    const sourceRequest = loadQuiverSource && isRepositoryQuiverImageUrl(imageSource)
      ? loadQuiverSource(imageSource, diagramID)
      : loadTikzcdDiagramSource(diagramID).then(tikzcdDiagramSourceText);
    void sourceRequest
      .then((source) => {
        if (destroyed) return;
        openQuiver({ source, replacingImageSrc: imageSource });
      })
      .catch((error) => {
        if (!destroyed) onQuiverSourceError(error);
      });
  };

  const writing = createWritingInteractions({
    ...options,
    onSynchronized: () => {
      syncQuiverImageBlocks();
      options.onSynchronized?.();
    },
  });

  return {
    attach: () => {
      if (attached || destroyed) return;
      attached = true;
      writing.attach();
      host.addEventListener('pointerdown', openExistingQuiverImage, true);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      if (attached) host.removeEventListener('pointerdown', openExistingQuiverImage, true);
      writing.destroy();
    },
    synchronize: writing.synchronize,
  };
}
