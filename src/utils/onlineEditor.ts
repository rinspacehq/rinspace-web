import { publicEnv } from '@/app/config/env';

export function onlineEditorProjectPath(owner: 'a' | 'b' | 'tags', repository: string | number) {
  const query = new URLSearchParams({ mode: 'managed', owner, repository: String(repository) });
  const origin = publicEnv.localRealClient ? 'https://rinspace.com' : '';
  return `${origin}/editor/?${query}`;
}

export function openOnlineEditorProject(owner: 'a' | 'b' | 'tags', repository: string | number) {
  window.location.assign(onlineEditorProjectPath(owner, repository));
}
