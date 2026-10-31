export type ReaderFileHandle = {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
};

export type ReaderProgress = {
  pageIndex: number;
  pageOffsetRatio: number;
  zoom: number | 'fit-page' | 'fit-width';
  revision: number;
};

export type ReaderDocument = {
  id: string;
  title: string;
  size: number;
  lastModified: number;
  contentVersion: string;
  handle?: ReaderFileHandle;
  pageCount?: number;
  lastOpenedAt?: number;
  shelfAddedAt?: number;
  progress?: ReaderProgress;
};

export type ReaderThumbnail = { documentId: string; blob: Blob; lastUsedAt: number };
export type ReaderFileSelection = { file: File; handle?: ReaderFileHandle };
