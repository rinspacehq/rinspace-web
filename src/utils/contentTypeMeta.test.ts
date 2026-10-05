import { describe, expect, it } from 'vitest';

import { contentTypeMetaChar } from './contentTypeMeta';

describe('contentTypeMetaChar', () => {
  it('uses article and notice initials for blog and announcement metadata', () => {
    expect(contentTypeMetaChar('blog', 'b')).toBe('a');
    expect(contentTypeMetaChar('announcement', 'a')).toBe('n');
  });

  it('keeps the established initials for the other content types', () => {
    expect(contentTypeMetaChar('question', 'x')).toBe('q');
    expect(contentTypeMetaChar('discussion', 'x')).toBe('d');
    expect(contentTypeMetaChar('dynamic', 'x')).toBe('s');
    expect(contentTypeMetaChar('book', 'x')).toBe('b');
    expect(contentTypeMetaChar('tag', 'x')).toBe('t');
  });

  it('preserves a caller-provided fallback for an unknown content type', () => {
    expect(contentTypeMetaChar('unknown', 'u')).toBe('u');
  });
});
