import { render, screen } from '@testing-library/react';
import { Crepe } from '@milkdown/crepe';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import AvatarImage from '@/components/AvatarImage';
import MathText from '@/components/MathText';
import cloudbase from '@/services/cloudbaseVendor';

describe('React 19 compatibility surface', () => {
  it('mounts the retained router and Markdown/math renderer', () => {
    render(
      <MemoryRouter initialEntries={['/spike/42']}>
        <Routes>
          <Route path="/spike/:id" element={<MathText text={'中文 Latin $x^2$'} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/中文 Latin/)).toBeTruthy();
    expect(document.querySelector('.math-fragment')).not.toBeNull();
  });

  it('loads editor, file UI and CloudBase adapter entry points', () => {
    expect(typeof Crepe).toBe('function');
    expect(typeof AvatarImage).toBe('function');
    expect(typeof cloudbase.init).toBe('function');
  });
});
