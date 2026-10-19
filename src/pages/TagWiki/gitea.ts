import { giteaPath } from '../../utils/giteaPaths';

type SourceFileLike = {
  filename?: string | null;
};

type TagWikiGiteaTarget = string | {
  id?: string | number | null;
  tagId?: string | number | null;
  slug?: string | null;
  slugName?: string | null;
  name?: string | null;
  displayName?: string | null;
  wikiSourceFile?: SourceFileLike | null;
  wikiPublication?: {
    repositoryOwner: string;
    repositoryName: string;
    sourceCommit: string;
    entrypoint: string;
  };
};

function cleanText(value: string | number | undefined | null) {
  return String(value || '').trim();
}

function repositoryTarget(target: TagWikiGiteaTarget) {
  const publication = typeof target === 'string' ? undefined : target.wikiPublication;
  if (publication) {
    const { repositoryOwner: owner, repositoryName: name, sourceCommit: commit, entrypoint } = publication;
    const parts = entrypoint.split('/');
    if (owner !== 'tags' || !/^[1-9]\d*$/.test(name) || !/^[a-f0-9]{40}([a-f0-9]{24})?$/.test(commit)
      || parts.some((part) => !part || part === '.' || part === '..' || /[\\\r\n\0]/.test(part))) return null;
    return { owner, name, commit, parts };
  }
  const id = typeof target === 'string' ? target.trim() : cleanText(target.tagId) || cleanText(target.id);
  if (!/^[1-9]\d*$/.test(id)) return null;
  // Persisted old source folders are not repository identities. Renaming a
  // tag must never send source access back to the retired shared repository.
  return { owner: 'tags', name: id, commit: '', parts: [] as string[] };
}

export function tagWikiGiteaSourcePath(target: TagWikiGiteaTarget) {
  const repository = repositoryTarget(target);
  if (!repository) return '';
  return repository.commit
    ? giteaPath(repository.owner, repository.name, 'src', 'commit', repository.commit, ...repository.parts)
    : giteaPath(repository.owner, repository.name, 'src', 'branch', 'main');
}

export function tagWikiGiteaHistoryPath(target: TagWikiGiteaTarget) {
  const repository = repositoryTarget(target);
  if (!repository) return '';
  return repository.commit
    ? giteaPath(repository.owner, repository.name, 'commits', 'commit', repository.commit)
    : giteaPath(repository.owner, repository.name, 'commits', 'branch', 'main');
}
