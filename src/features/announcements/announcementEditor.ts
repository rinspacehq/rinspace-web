import { $remark } from '@milkdown/kit/utils';
import { createWriterEditor } from '@rinspacehq/markdown-writer/writer';

type MarkdownNode = {
  type: string;
  children?: MarkdownNode[];
  title?: string | null;
  alt?: string | null;
};

function preserveImageCaptions(node: MarkdownNode) {
  // Crepe stores image width in Markdown alt text and the caption in the title.
  if ((node.type === 'image' || node.type === 'image-block') &&
      !node.title && node.alt && !/^\d+(?:\.\d+)?$/.test(node.alt)) {
    node.title = node.alt;
  }
  node.children?.forEach(preserveImageCaptions);
}

const announcementImageCaptions = $remark('announcementImageCaptions', () => () => tree => {
  preserveImageCaptions(tree as MarkdownNode);
});

export function createAnnouncementEditor(options: Parameters<typeof createWriterEditor>[0]) {
  const editor = createWriterEditor(options);
  editor.editor.use(announcementImageCaptions);
  return editor;
}
