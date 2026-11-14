import { loadReaderVADModel, readerVoiceAssetBase } from '@/services/domains/readerVoiceAssets';
import type { FrameProcessorEvent } from '@ricky0123/vad-web/dist/frame-processor';

export type ReaderVADCallbacks = {
  onSpeechStart(): void;
  onSpeechEnd(samples: Float32Array): void;
  onVADMisfire(): void;
  onFrameProcessed(frame: Float32Array): void;
  onError(error: unknown): void;
};
export type ReaderVAD = { readonly listening: boolean; start(stream: MediaStream): void; pause(): Promise<void>; destroy(): Promise<void> };

/** The host owns devices and context. Upstream owns Silero inference and turn
 * segmentation. All used modules, worklet messages and assets are pinned. */
export async function createReaderVAD(context: AudioContext, callbacks: ReaderVADCallbacks, signal: AbortSignal): Promise<ReaderVAD> {
  const [ort, { FrameProcessor, Message }, { Silero }] = await Promise.all([
    import('onnxruntime-web/wasm'), import('@ricky0123/vad-web'), import('@ricky0123/vad-web/dist/models'),
  ]);
  signal.throwIfAborted();
  const base = readerVoiceAssetBase();
  ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.wasmPaths = base; ort.env.logLevel = 'error';
  await context.audioWorklet.addModule(base + 'vad.worklet.bundle.min.js');
  signal.throwIfAborted();
  const model = await Silero.new(ort, () => loadReaderVADModel(signal));
  if (signal.aborted) { await model.release(); signal.throwIfAborted(); }
  const processor = new FrameProcessor(model.process, model.reset_state, {
    positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35,
    preSpeechPadMs: 200, minSpeechMs: 250, redemptionMs: 600, submitUserSpeechOnPause: true,
  }, 32);
  let node: AudioWorkletNode | undefined, source: MediaStreamAudioSourceNode | undefined;
  let accepting = false, destroyed = false, processing: Promise<void> | undefined;
  const queue: Float32Array[] = [];
  const event = (value: FrameProcessorEvent) => {
    if (destroyed || signal.aborted) { if ('audio' in value) value.audio.fill(0); return; }
    switch (value.msg) {
      case Message.SpeechStart: callbacks.onSpeechStart(); break;
      case Message.SpeechEnd: callbacks.onSpeechEnd(value.audio); break;
      case Message.VADMisfire: callbacks.onVADMisfire(); break;
      case Message.FrameProcessed: callbacks.onFrameProcessed(value.frame); break;
    }
  };
  const disconnect = () => {
    accepting = false;
    source?.disconnect(); source = undefined;
    if (node) { node.port.postMessage(Message.SpeechStop); node.port.onmessage = null; node.disconnect(); node.port.close(); node = undefined; }
  };
  const clearQueue = () => { queue.forEach(frame => frame.fill(0)); queue.length = 0; };
  const drain = async () => {
    try {
      while (queue.length && !destroyed && !signal.aborted) await processor.process(queue.shift()!, event);
    } catch (error) { disconnect(); clearQueue(); callbacks.onError(error); }
    finally { processing = undefined; }
  };
  return {
    get listening() { return accepting; },
    start(stream) {
      signal.throwIfAborted();
      if (destroyed || accepting) throw new Error('语音输入状态无效。');
      node = new AudioWorkletNode(context, 'vad-helper-worklet', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { frameSamples: 512 } });
      source = context.createMediaStreamSource(stream);
      node.port.onmessage = (message: MessageEvent<unknown>) => {
        const value = message.data;
        if (!accepting || destroyed || signal.aborted) return;
        if (!value || typeof value !== 'object' || !('message' in value) || value.message !== Message.AudioFrame || !('data' in value) || !(value.data instanceof ArrayBuffer) || value.data.byteLength !== 512 * 4) {
          disconnect(); callbacks.onError(new Error('麦克风音频无效。')); return;
        }
        const frame = new Float32Array(value.data);
        // Never silently drop audio under load. Bound the unprocessed backlog
        // to one second and surface a retry if the device cannot keep up.
        if (queue.length >= 32) { frame.fill(0); disconnect(); clearQueue(); callbacks.onError(new Error('当前设备无法及时处理语音，请重试。')); return; }
        queue.push(frame);
        processing ||= drain();
      };
      processor.resume(); accepting = true;
      node.port.postMessage(Message.SpeechStart);
      source.connect(node); node.connect(context.destination);
    },
    async pause() {
      disconnect();
      await processing;
      if (signal.aborted) processor.setOptions({ submitUserSpeechOnPause: false });
      processor.pause(event); clearQueue();
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true; disconnect(); clearQueue(); await processing;
      processor.setOptions({ submitUserSpeechOnPause: false }); processor.pause(event);
      await model.release();
    },
  };
}
