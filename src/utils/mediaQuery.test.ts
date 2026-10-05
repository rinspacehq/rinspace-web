import { describe, expect, it, vi } from 'vitest';

import { subscribeToMediaQuery, type MediaQueryChangeListener } from './mediaQuery';

describe('subscribeToMediaQuery', () => {
  it('uses the modern change event API when available', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const addListener = vi.fn();
    const media = {
      addEventListener,
      removeEventListener,
      addListener,
    } as unknown as MediaQueryList;
    const listener = vi.fn() as MediaQueryChangeListener;

    const unsubscribe = subscribeToMediaQuery(media, listener);

    expect(addEventListener).toHaveBeenCalledWith('change', listener);
    expect(addListener).not.toHaveBeenCalled();
    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith('change', listener);
  });

  it('falls back to the legacy listener API used by older mobile browsers', () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    const media = {
      addListener,
      removeListener,
    } as unknown as MediaQueryList;
    const listener = vi.fn() as MediaQueryChangeListener;

    const unsubscribe = subscribeToMediaQuery(media, listener);

    expect(addListener).toHaveBeenCalledWith(listener);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(listener);
  });
});
