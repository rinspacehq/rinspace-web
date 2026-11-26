import { readerVoiceAssetBase } from '@/services/domains/readerVoiceAssets';

const frameSamples = 512;
const worklets = new WeakMap<AudioContext, Promise<void>>();

export function loadMicrophoneWorklet(context: AudioContext): Promise<void> {
  let loaded = worklets.get(context);
  if (!loaded) {
    loaded = context.audioWorklet.addModule(readerVoiceAssetBase() + 'vad.worklet.bundle.min.js').catch(error => {
      worklets.delete(context);
      throw error;
    });
    worklets.set(context, loaded);
  }
  return loaded;
}

/** Use the pinned worklet's 16 kHz resampler without running voice detection. */
export function connectMicrophoneFrames(
  context: AudioContext,
  stream: MediaStream,
  onFrame: (frame: Float32Array) => void,
  onError: (error: Error) => void,
): () => void {
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'vad-helper-worklet', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { frameSamples },
  });
  const fail = () => onError(new Error('麦克风音频无效。'));
  const disconnect = () => {
    node.onprocessorerror = null;
    node.port.onmessage = null;
    node.port.onmessageerror = null;
    node.port.close();
    source.disconnect();
    node.disconnect();
  };
  node.onprocessorerror = fail;
  node.port.onmessageerror = fail;
  node.port.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (!data || typeof data !== 'object' || !('message' in data) || data.message !== 'AUDIO_FRAME' ||
        !('data' in data) || !(data.data instanceof ArrayBuffer) || data.data.byteLength !== frameSamples * Float32Array.BYTES_PER_ELEMENT) {
      fail();
      return;
    }
    const frame = new Float32Array(data.data);
    try { onFrame(frame); } finally { frame.fill(0); }
  };
  try {
    // The worklet copies samples to its message port and emits silence.
    node.port.postMessage('SPEECH_START');
    source.connect(node).connect(context.destination);
  } catch (error) {
    disconnect();
    throw error;
  }
  return disconnect;
}
