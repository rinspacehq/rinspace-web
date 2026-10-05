export type RinspacePublicEnv = Readonly<{
  publicBasePath: string;
  basePath: string;
  cloudbaseEnvId: string;
  cloudbaseRegion: string;
  cloudbaseAccessKey: string;
  adminPhoneSha256: string;
  giteaBasePath: string;
  typstCreateEnabled: boolean;
  localRealClient?: boolean;
}>;

declare const __RINSPACE_PUBLIC_ENV__: RinspacePublicEnv;

export const publicEnv: RinspacePublicEnv = Object.freeze(__RINSPACE_PUBLIC_ENV__);

export function publicAsset(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${publicEnv.publicBasePath.replace(/\/$/, '')}${path}`;
}
