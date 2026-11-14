import { createReaderVoiceInput, type ReaderVoiceControls, type ReaderVoiceState } from './voiceInput';
import { createReaderVoicePlayback, type ReaderPlaybackState } from './voicePlayback';
import type { NarrationSource } from './voicePlaybackProtocol';
import type { LearningVoicePlayback } from './learningSession';

export type ReaderVoiceSessionControls = Omit<ReaderVoiceControls, 'snapshot'> & {
  snapshot(): ReaderVoiceState & { playback: ReaderPlaybackState };
  confirmTranscript(text: string): Promise<string>;
  play(sources: NarrationSource[], regenerate?: boolean): Promise<void>;
  stopPlayback(): Promise<void>;
  setFollow(follow: boolean): void;
  evidencePages(refs: string[]): number[];
};
type Options = Parameters<typeof createReaderVoiceInput>[0] & {
  runPlayback<T>(signal: AbortSignal, operation: (playback: LearningVoicePlayback) => Promise<T>): Promise<T>;
  resumeSource?: NarrationSource;
  persistResume?(source: NarrationSource | undefined): Promise<void>;
  evidencePages(refs: string[]): number[];
  confirmTranscript(text: string, release: () => Promise<void>): Promise<string>;
};

export function createReaderVoiceSession(options: Options): ReaderVoiceSessionControls & { dispose(): Promise<void> } {
  const input = createReaderVoiceInput(options);
  const playback = createReaderVoicePlayback({ accountId: options.accountId, active: options.active, notify: options.notify, openAudio: input.openAudio,
    run: options.runPlayback, resumeSource: options.resumeSource, persistResume: options.persistResume });
  return {
    ...input,
    snapshot: () => ({ ...input.snapshot(), playback: playback.snapshot() }),
    confirmTranscript(text) {
      if (input.snapshot().input !== 'review') throw new Error('当前没有待确认的语音文字。');
      return options.confirmTranscript(text, input.dismissTranscript);
    },
    async startInput() { await playback.cancel(); return input.startInput(); },
    async cancelInput() { await input.cancelInput(); await playback.cancel(); },
    play(sources, regenerate) {
      const current = input.snapshot();
      if (!['idle', 'error'].includes(current.input) || current.cleanupPending) throw new Error('请先确认或取消当前语音。');
      if (['loading', 'playing', 'stopping'].includes(playback.snapshot().state)) return playback.cancel().then(() => playback.play(sources, regenerate));
      return playback.play(sources, regenerate);
    },
    stopPlayback: playback.cancel, setFollow: playback.setFollow,
    evidencePages: refs => { options.active(); return options.evidencePages(refs); },
    async dispose() {
      // Both methods synchronously stop their physical sources before their
      // first await; cleanup failures cannot leave a device/player running.
      const results = await Promise.allSettled([playback.dispose(), input.dispose()]);
      const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
      if (errors.length) throw new AggregateError(errors, '语音清理尚未完成。');
    },
  };
}
