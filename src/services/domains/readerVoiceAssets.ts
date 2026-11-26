import { publicAsset } from '@/app/config/env';
import assets from '../../../contracts/reader/voice-assets.json';

export function readerVoiceAssetBase(): string {
  return new URL(publicAsset(`/assets/reader-voice/${assets.directory}/`), location.origin).href;
}
