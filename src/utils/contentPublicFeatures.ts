type Publication = { type?: string; repositoryStatus?: string; sourceVisibility?: string };

export function isPrivatePublication(content: Publication | null | undefined) {
  return content?.repositoryStatus === 'private' || content?.repositoryStatus === 'draft';
}

export function canLoadPublicBookFeatures(content: Publication | null | undefined) {
  return content?.type === 'book' && !isPrivatePublication(content);
}
