import type { TFunction } from 'i18next';

import { formatDate } from '@/i18n/format';
import type { LocaleId } from '@/i18n/types';

export type IdentityTranslation = TFunction<'identity'>;

const objectTypeKeys: Record<string, string> = {
  question: 'objects.question',
  answer: 'objects.answer',
  comment: 'objects.comment',
  tag: 'objects.tag',
  post: 'objects.post',
  content: 'objects.content',
  blog: 'objects.blog',
  book: 'objects.book',
  discussion: 'objects.discussion',
  forum: 'objects.discussion',
  dynamic: 'objects.dynamic',
  status: 'objects.dynamic',
  moderation_submission: 'objects.moderationSubmission',
  user: 'objects.user',
  report: 'objects.report',
  wallet: 'objects.wallet',
};

const activityKeys: Record<string, string> = {
  create: 'activities.create',
  update: 'activities.update',
  rollback: 'activities.rollback',
  review: 'activities.review',
  asked: 'activities.asked',
  answered: 'activities.answered',
  commented: 'activities.commented',
  created: 'activities.created',
  edited: 'activities.edited',
  closed: 'activities.closed',
  reopened: 'activities.reopened',
  deleted: 'activities.deleted',
  undeleted: 'activities.undeleted',
  accepted: 'activities.accepted',
};

const notificationActionKeys: Record<string, string> = {
  achievement: 'notifications.actions.achievement',
  answer: 'notifications.actions.answer',
  badge: 'notifications.actions.badge',
  comment: 'notifications.actions.comment',
  mention: 'notifications.actions.mention',
  reply: 'notifications.actions.reply',
  follow: 'notifications.actions.follow',
  invite: 'notifications.actions.invite',
  question: 'notifications.actions.question',
  repost: 'notifications.actions.repost',
  vote: 'notifications.actions.vote',
  like: 'notifications.actions.like',
  collection: 'notifications.actions.collection',
  publication_failed: 'notifications.actions.publicationFailed',
  moderation_first_review: 'notifications.actions.moderation',
  moderation_second_review_passed: 'notifications.actions.moderation',
  moderation_second_review_manual: 'notifications.actions.moderation',
  moderation_manual_review_approved: 'notifications.actions.moderation',
  moderation_manual_review_rejected: 'notifications.actions.moderation',
  report_resolved: 'notifications.actions.reportResolved',
  wallet_tip_received: 'notifications.actions.walletTip',
  wallet_recharge_completed: 'notifications.actions.walletRecharge',
  wallet_conversion_completed: 'notifications.actions.walletConversion',
};

export function identityObjectTypeLabel(t: IdentityTranslation, value: string) {
  const key = objectTypeKeys[value];
  return key ? t(key) : value || t('objects.object');
}

export function identityActivityLabel(t: IdentityTranslation, value: string) {
  const key = activityKeys[value];
  return key ? t(key) : value || t('activities.activity');
}

export function identityNotificationActionLabel(t: IdentityTranslation, value: string) {
  const key = notificationActionKeys[value];
  return key ? t(key) : value || t('notifications.fallback');
}

export function identityDateLabel(locale: LocaleId, seconds: number) {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return formatDate(locale, date, {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function identityCultivationRealmLabel(
  t: IdentityTranslation,
  cultivation: { className: string; phaseClass?: string },
) {
  const realm = t(`cultivation.realms.${cultivation.className}`);
  if (!cultivation.phaseClass) return realm;
  return t('cultivation.realmWithPhase', {
    realm,
    phase: t(`cultivation.phases.${cultivation.phaseClass}`),
  });
}
