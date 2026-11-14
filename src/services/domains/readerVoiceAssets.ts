import { publicAsset } from '@/app/config/env';
import assets from '../../../contracts/reader/voice-assets.json';

export function readerVoiceAssetBase(): string {
  return new URL(publicAsset(`/assets/reader-voice/${assets.directory}/`), location.origin).href;
}

/** A fixed same-origin model asset, never an arbitrary fetch URL or CDN. */
export async function loadReaderVADModel(signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(readerVoiceAssetBase() + 'silero_vad_v5.onnx', { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error('语音组件暂时无法加载。');
  const buffer = await response.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (buffer.byteLength !== 2327524 || digest !== assets.model.sha256) throw new Error('语音组件校验失败。');
  return buffer;
}
