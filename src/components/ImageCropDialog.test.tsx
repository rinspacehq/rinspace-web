import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ImageCropDialog from './ImageCropDialog';

vi.mock('react-easy-crop', () => ({
  default: ({ aspect }: { aspect: number }) => (
    <div data-testid="cropper" data-aspect={String(aspect)} />
  ),
}));

describe('ImageCropDialog', () => {
  it('keeps the dialog geometry stable while the cropper measures its viewport', () => {
    render(
      <ImageCropDialog
        open
        imageUrl="blob:cover"
        title="裁剪文章封面"
        aspect={16 / 9}
        outputWidth={1600}
        outputHeight={900}
        outputFileName="cover.png"
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );

    expect(screen.getByRole('dialog').getAttribute('data-rin-stable-layout')).toBe('true');
    expect(screen.getByTestId('cropper').getAttribute('data-aspect')).toBe(String(16 / 9));
  });
});
