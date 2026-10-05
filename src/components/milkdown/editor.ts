import type { Ctx } from '@milkdown/kit/ctx';
import {
  appendWriterQuiverTopBar,
  createWriterEditor,
} from '@rinspacehq/markdown-writer/writer';

type HeadingOption = { label: string; level: number | null };

type CreateRinMilkdownEditorOptions = {
  root: HTMLElement;
  defaultValue: string;
  headingOptions: HeadingOption[];
  placeholder: string | false;
  openMath: (ctx: Ctx) => void;
  openQuiver: () => void;
  uploadImage: (file: File) => Promise<string>;
  imageCaptionPlaceholder: string;
  imageUploadPlaceholder: string;
  mathLabel?: string;
  quiverLabel?: string;
};

/** Rinspace-only image and Quiver adapter around the public editor source. */
export function createRinMilkdownEditor({
  openQuiver, quiverLabel, ...options
}: CreateRinMilkdownEditorOptions) {
  return createWriterEditor({
    ...options,
    mathTrust: true,
    extendTopBar: (builder) => appendWriterQuiverTopBar(builder, openQuiver, quiverLabel),
  });
}
