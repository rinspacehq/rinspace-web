export type VoiceTranscriptCommitOptions = {
  currentDraft(): string;
  persistDraft(draft: string): Promise<void>;
  releaseTranscript(): Promise<void>;
  active(): void;
};

/**
 * Keep one final STT result bound to one draft append while persistence or
 * native cleanup is retried. The confirmed text is never sent from here; the
 * user still submits the ordinary Reader draft explicitly.
 */
export function createVoiceTranscriptCommit(options: VoiceTranscriptCommitOptions) {
  let pending: { text: string; draft: string; persisted: boolean } | undefined;

  return async (text: string): Promise<string> => {
    options.active();
    const confirmed = text.trim();
    if (!confirmed) throw new Error('请确认语音文字。');

    if (pending && pending.text !== confirmed) {
      throw new Error('这段文字已进入保存流程，请先完成确认。');
    }
    if (!pending) {
      const previous = options.currentDraft();
      const draft = previous ? `${previous}\n${confirmed}` : confirmed;
      if (draft.length > 8000) throw new Error('消息过长，请分段提问。');
      pending = { text: confirmed, draft, persisted: false };
    }

    if (!pending.persisted) {
      await options.persistDraft(pending.draft);
      options.active();
      pending.persisted = true;
    }
    const draft = pending.draft;
    pending = undefined;
    try {
      // Expose the already durable draft before the native release request
      // finishes. dismissTranscript closes the review UI synchronously, while
      // its remote cleanup can take seconds; awaiting it here left the message
      // box empty during that whole interval and made Send look broken.
      void options.releaseTranscript().then(() => options.active()).catch(() => {});
    } catch {
      // The Reader draft is already durable. The voice controller keeps the
      // original consume intent and exposes cleanupPending for its own
      // idempotent retry; do not hide or append the saved text again.
    }
    return draft;
  };
}
