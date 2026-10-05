const contentTypeMetaChars: Readonly<Record<string, string>> = {
  blog: 'a',
  question: 'q',
  discussion: 'd',
  announcement: 'n',
  dynamic: 's',
  book: 'b',
  tag: 't',
  answer: 'a',
  comment: 'c',
  tweet: 's',
};

export function contentTypeMetaChar(type: string, fallback: string) {
  return contentTypeMetaChars[type] || fallback;
}
