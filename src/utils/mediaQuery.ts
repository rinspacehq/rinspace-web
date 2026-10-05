export type MediaQueryChangeListener = (event: MediaQueryListEvent) => void;

export function subscribeToMediaQuery(
  media: MediaQueryList,
  listener: MediaQueryChangeListener,
) {
  if (
    typeof media.addEventListener === 'function'
    && typeof media.removeEventListener === 'function'
  ) {
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }

  media.addListener(listener);
  return () => media.removeListener(listener);
}
