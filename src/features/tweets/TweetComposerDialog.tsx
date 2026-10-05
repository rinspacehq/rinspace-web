import {
  Dialog,
  DialogBody,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "components/ui";
import { useMemo, useState } from "react";

import {
  RinspaceTweetComposer,
  resolveTweetComposerMessages,
  useTweetComposerController,
} from "@/components/shared/RinspaceTweetComposer";
import { useResolvedLocale } from "@/i18n/LanguageProvider";
import { createOuterTweetComposerAdapter, tweetPublishedEvent } from "@/services/mastodonSocial";

import "@/styles/rinspace-tweet-composer.css";
import "./tweet-composer-dialog.css";

interface TweetComposerDialogProps {
  open: boolean;
  displayName: string;
  avatarUrl?: string;
  onClose(): void;
}

export default function TweetComposerDialog({
  open,
  displayName,
  avatarUrl,
  onClose,
}: TweetComposerDialogProps) {
  const locale = useResolvedLocale();
  const messages = useMemo(() => resolveTweetComposerMessages(locale), [locale]);
  const adapter = useMemo(() => createOuterTweetComposerAdapter(), []);
  const [published, setPublished] = useState<{ url: string; message: string } | null>(null);
  const controller = useTweetComposerController({
    adapter,
    enabled: open,
    messages,
    onPublished(result) {
      setPublished({ url: result.url, message: messages.published });
      window.dispatchEvent(new CustomEvent(tweetPublishedEvent, { detail: result }));
    },
  });

  const close = () => {
    if (controller.dirty) {
      const confirmed = window.confirm(
        locale === "zh-CN" ? "放弃尚未发布的推文？" : "Discard this unpublished tweet?",
      );
      if (!confirmed) return;
    }
    setPublished(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) close(); }}>
      <DialogPortal>
        <DialogOverlay className="rin-ui-overlay" />
        <DialogBody
          className="rin-tweet-dialog"
          aria-describedby={published ? "rin-tweet-published" : undefined}
        >
          <DialogTitle className="rin-visually-hidden">{messages.title}</DialogTitle>
          {published ? (
            <p className="rin-tweet-dialog__published" id="rin-tweet-published" role="status">
              <span>{published.message}</span>
              <a href={published.url}>{locale === "zh-CN" ? "打开推文" : "Open tweet"}</a>
            </p>
          ) : null}
          <RinspaceTweetComposer
            {...controller.composerProps}
            account={{ displayName, avatarUrl }}
            autoFocus
            messages={messages}
            role="document"
            onRequestClose={close}
          />
        </DialogBody>
      </DialogPortal>
    </Dialog>
  );
}
