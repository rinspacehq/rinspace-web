import type { ReaderDocument, ReaderFileSelection } from './types';

const openFiles = new Map<string, File>();

export function rememberReaderFile(id: string, file: File) { openFiles.clear(); openFiles.set(id, file); }
export function forgetReaderFile(id: string) { openFiles.delete(id); }
export function clearReaderFiles() { openFiles.clear(); }

export async function resolveReaderFile(document: ReaderDocument, requestPermission = false): Promise<File | null> {
  const existing = openFiles.get(document.id);
  if (existing) return existing;
  if (!document.handle) return null;
  const permission = requestPermission
    ? await document.handle.requestPermission({ mode: 'read' })
    : await document.handle.queryPermission({ mode: 'read' });
  if (permission !== 'granted') return null;
  return document.handle.getFile();
}

export function identifyReaderFile(file: File, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const worker = new Worker(new URL('./fingerprint.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ version?: string; error?: string }>) => {
      cleanup();
      if (event.data.version) resolve(event.data.version);
      else reject(new Error(event.data.error || 'Cannot identify PDF'));
    };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message)); };
    worker.postMessage(file);
  });
}

export async function chooseReaderPdf(): Promise<ReaderFileSelection | null> {
  const pickerWindow = window as Window & {
    showOpenFilePicker?: (options: {
      multiple: false;
      types: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<NonNullable<ReaderDocument['handle']>[]>;
  };
  if (pickerWindow.showOpenFilePicker) {
    try {
      const [handle] = await pickerWindow.showOpenFilePicker({
        multiple: false, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
      return handle ? { file: await handle.getFile(), handle } : null;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      throw error;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.pdf,application/pdf'; input.hidden = true;
    const finish = (file?: File) => { input.remove(); resolve(file ? { file } : null); };
    input.addEventListener('change', () => finish(input.files?.[0]), { once: true });
    input.addEventListener('cancel', () => finish(), { once: true });
    document.body.append(input);
    input.click();
  });
}
