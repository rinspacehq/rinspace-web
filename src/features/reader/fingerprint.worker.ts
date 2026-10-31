import { fingerprintPdf } from './fingerprint';

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    self.postMessage({ version: await fingerprintPdf(event.data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Cannot identify PDF' });
  }
};
