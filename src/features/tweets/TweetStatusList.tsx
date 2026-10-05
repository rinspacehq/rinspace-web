import { Icon } from "components/ui";
import DOMPurify from "dompurify";

import { formatDate, formatNumber } from "@/i18n/format";
import type { LocaleId } from "@/i18n/types";
import type { MastodonStatusSummary } from "@/services/mastodonSocial";

import "./tweet-status-list.css";

interface TweetStatusListProps {
  items: MastodonStatusSummary[];
  locale: LocaleId;
  emptyText: string;
  contentWarningLabel: string;
  repliesLabel: string;
  repostsLabel: string;
  likesLabel: string;
}

export function mastodonStatusPlainText(content: string) {
  return DOMPurify.sanitize(content, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

export default function TweetStatusList({
  items,
  locale,
  emptyText,
  contentWarningLabel,
  repliesLabel,
  repostsLabel,
  likesLabel,
}: TweetStatusListProps) {
  if (!items.length) return <div className="state-strip">{emptyText}</div>;

  return (
    <div className="profile-tweet-list">
      {items.map((item) => {
        const href = `/p/${encodeURIComponent(item.id)}`;
        const content = DOMPurify.sanitize(item.content, {
          ALLOWED_TAGS: ["p", "br", "a", "span"],
          ALLOWED_ATTR: ["href", "rel", "class"],
        });
        return (
          <article className="profile-tweet" key={item.id}>
            <header>
              <a href={href}>
                <time dateTime={item.createdAt}>
                  {formatDate(locale, new Date(item.createdAt), {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </a>
              <span>{item.visibility}</span>
            </header>
            {item.spoilerText ? (
              <details className="profile-tweet__warning">
                <summary>{contentWarningLabel}: {item.spoilerText}</summary>
                <div className="profile-tweet__content" dangerouslySetInnerHTML={{ __html: content }} />
              </details>
            ) : (
              <div className="profile-tweet__content" dangerouslySetInnerHTML={{ __html: content }} />
            )}
            {item.media.length ? (
              <div className="profile-tweet__media">
                {item.media.map((media) => (
                  <a href={media.url} key={media.id}>
                    {media.type === "image" || media.type.startsWith("image/") ? (
                      <img src={media.previewUrl || media.url} alt={media.description || ""} loading="lazy" />
                    ) : (
                      <span>{media.description || media.type}</span>
                    )}
                  </a>
                ))}
              </div>
            ) : null}
            <footer>
              <a href={href} aria-label={`${repliesLabel}: ${item.repliesCount}`}><Icon name="chat-dots" /><span>{formatNumber(locale, item.repliesCount)}</span></a>
              <a href={href} aria-label={`${repostsLabel}: ${item.reblogsCount}`}><Icon name="arrow-repeat" /><span>{formatNumber(locale, item.reblogsCount)}</span></a>
              <a href={href} aria-label={`${likesLabel}: ${item.favouritesCount}`}><Icon name="heart" /><span>{formatNumber(locale, item.favouritesCount)}</span></a>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
