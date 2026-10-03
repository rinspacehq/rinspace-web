import type {
  DemoBlobRecord,
  DemoCommentEntity,
  DemoContentEntity,
  DemoEntityRecord,
  DemoNotificationEntity,
  DemoPreferenceRecord,
  DemoRelationRecord,
  DemoRepository,
  DemoUserEntity,
} from '@/demo/repository';
import {
  demoInterfacePreferenceKey,
  demoMemberId,
  demoNotificationPreferenceKey,
  demoProfilePreferenceKey,
} from '@/demo/identity';

import {
  DemoRequestError,
  paginateDemoItems,
  readDemoPagination,
  stableDemoSort,
} from './request';

const fallbackClock = '2026-06-01T12:00:00.000Z';
const demoMemberWebsite = 'https://orbit-reader.example/notes';

type JsonObject = Readonly<Record<string, unknown>>;

type IdentitySnapshot = Readonly<{
  entities: readonly DemoEntityRecord[];
  relations: readonly DemoRelationRecord[];
  blobs: readonly DemoBlobRecord[];
  preferences: readonly DemoPreferenceRecord[];
  users: readonly DemoUserEntity[];
  content: readonly DemoContentEntity[];
  notifications: readonly DemoNotificationEntity[];
  clock: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function seconds(value: string): number {
  return Math.floor(new Date(value).getTime() / 1_000);
}

function memberRequest(request: Request): boolean {
  return request.headers.get('x-rinspace-demo-persona') === 'member';
}

function requireMember(request: Request): void {
  if (!memberRequest(request)) {
    throw new DemoRequestError(401, 'authentication.required', 'Demo member persona is required.');
  }
}

async function readSnapshot(repository: DemoRepository): Promise<IdentitySnapshot> {
  const value = await repository.transaction(
    ['entities', 'relations', 'blobs', 'preferences'],
    'readonly',
    async (transaction) => ({
      entities: await transaction.getAll('entities'),
      relations: await transaction.getAll('relations'),
      blobs: await transaction.getAll('blobs'),
      preferences: await transaction.getAll('preferences'),
      clock: await transaction.get('preferences', 'demo.seed.feature-clock'),
    }),
  );
  const entities = stableDemoSort(value.entities, (left, right) => left.key.localeCompare(right.key));
  return Object.freeze({
    entities,
    relations: stableDemoSort(value.relations, (left, right) => left.key.localeCompare(right.key)),
    blobs: stableDemoSort(value.blobs, (left, right) => left.key.localeCompare(right.key)),
    preferences: stableDemoSort(value.preferences, (left, right) => left.key.localeCompare(right.key)),
    users: entities.filter((entity): entity is DemoUserEntity => entity.kind === 'user'),
    content: stableDemoSort(
      entities.filter((entity): entity is DemoContentEntity => entity.kind === 'content'),
      (left, right) => left.data.sortOrder - right.data.sortOrder || left.key.localeCompare(right.key),
    ),
    notifications: stableDemoSort(
      entities.filter((entity): entity is DemoNotificationEntity => entity.kind === 'notification'),
      (left, right) => right.data.createdAt.localeCompare(left.data.createdAt) || left.key.localeCompare(right.key),
    ),
    clock: typeof value.clock?.value === 'string' ? value.clock.value : fallbackClock,
  });
}

function preference(snapshot: IdentitySnapshot, key: string): JsonObject | null {
  const value = snapshot.preferences.find((entry) => entry.key === key)?.value;
  return isRecord(value) ? value : null;
}

function svgDataUrl(blob: DemoBlobRecord | undefined): string {
  if (!blob || blob.type !== 'image/svg+xml') return '';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new TextDecoder().decode(blob.bytes))}`;
}

function asset(snapshot: IdentitySnapshot, reference: string | null): string {
  if (!reference) return '';
  if (/^(?:data|blob):/i.test(reference)) return reference;
  return svgDataUrl(snapshot.blobs.find((blob) => blob.key === reference.replace(/^demo-asset:/, '')));
}

function publicUserId(user: DemoUserEntity, snapshot: IdentitySnapshot): string {
  const index = snapshot.users.findIndex((entry) => entry.id === user.id);
  return index >= 0 ? String(101 + index) : user.id;
}

function publicContentId(content: DemoContentEntity, _snapshot: IdentitySnapshot): string {
  return String(1_000 + content.data.sortOrder);
}

function resolveUser(reference: string, snapshot: IdentitySnapshot): DemoUserEntity | null {
  const normalized = decodeURIComponent(reference).trim().replace(/^@+/, '');
  const direct = snapshot.users.find((user) => (
    user.id === normalized
    || user.data.username === normalized
    || publicUserId(user, snapshot) === normalized
  ));
  if (direct) return direct;
  const storedMemberUsername = optionalString(preference(snapshot, demoProfilePreferenceKey)?.username);
  return storedMemberUsername === normalized
    ? snapshot.users.find((user) => user.id === demoMemberId) ?? null
    : null;
}

function resolveContent(reference: string, snapshot: IdentitySnapshot): DemoContentEntity | null {
  const normalized = decodeURIComponent(reference).trim();
  return snapshot.content.find((content) => (
    content.id === normalized
    || content.data.slug === normalized
    || publicContentId(content, snapshot) === normalized
  )) ?? null;
}

function profileData(snapshot: IdentitySnapshot): JsonObject {
  return preference(snapshot, demoProfilePreferenceKey) ?? {};
}

function interfaceData(snapshot: IdentitySnapshot): JsonObject {
  return preference(snapshot, demoInterfacePreferenceKey) ?? {};
}

function memberProfilePayload(snapshot: IdentitySnapshot) {
  const member = resolveUser(demoMemberId, snapshot);
  if (!member) throw new DemoRequestError(500, 'demo.identity.member_missing', 'Demo member identity is unavailable.');
  const stored = profileData(snapshot);
  const avatar = optionalString(stored.avatarDataUrl, asset(snapshot, member.data.avatarUrl));
  return {
    uid: member.id,
    handle: optionalString(stored.username, member.data.username),
    username: optionalString(stored.username, member.data.username),
    nickname: optionalString(stored.nickname, member.data.displayName),
    rank: 17,
    avatarDataUrl: avatar,
    coverUrl: optionalString(stored.coverUrl),
    bio: optionalString(stored.bio, member.data.bio),
    website: optionalString(stored.website, demoMemberWebsite),
    location: optionalString(stored.location),
    aboutHtml: optionalString(stored.aboutHtml, `<p>${member.data.headline}</p>`),
    updatedAt: optionalString(stored.updatedAt, member.updatedAt),
    createdAt: '2026-05-01T00:00:00.000Z',
  };
}

function userInfoPayload(user: DemoUserEntity, snapshot: IdentitySnapshot) {
  const isMember = user.id === demoMemberId;
  const stored = isMember ? memberProfilePayload(snapshot) : null;
  const following = snapshot.relations.filter((relation) => relation.kind === 'follow' && relation.sourceId === user.id);
  const followers = snapshot.relations.filter((relation) => relation.kind === 'follow' && relation.targetId === user.id);
  const questions = snapshot.content.filter((content) => content.data.authorId === user.id && content.data.type === 'question');
  return {
    id: publicUserId(user, snapshot),
    created_at: seconds('2026-05-01T00:00:00.000Z'),
    last_login_date: seconds(snapshot.clock),
    username: stored?.username ?? user.data.username,
    follow_count: followers.length,
    following_count: following.length,
    answer_count: 0,
    question_count: questions.length,
    rank: isMember ? 17 : user.data.locale === 'zh-CN' ? 14 : 11,
    display_name: stored?.nickname ?? user.data.displayName,
    avatar: stored?.avatarDataUrl ?? asset(snapshot, user.data.avatarUrl),
    cover_url: stored?.coverUrl ?? '',
    mobile: '',
    bio: stored?.bio ?? user.data.bio,
    bio_html: `<p>${stored?.bio ?? user.data.bio}</p>`,
    website: stored?.website ?? '',
    location: stored?.location ?? '',
    about_html: stored?.aboutHtml ?? `<p>${user.data.headline}</p>`,
    status: 'normal',
    suspended_until: 0,
    is_follower: snapshot.relations.some((relation) => (
      relation.kind === 'follow' && relation.sourceId === demoMemberId && relation.targetId === user.id
    )),
  };
}

function currentUserPayload(snapshot: IdentitySnapshot) {
  const publicInfo = userInfoPayload(
    resolveUser(demoMemberId, snapshot) as DemoUserEntity,
    snapshot,
  );
  const profile = memberProfilePayload(snapshot);
  const interfaceConfig = interfaceData(snapshot);
  return {
    id: demoMemberId,
    created_at: publicInfo.created_at,
    last_login_date: publicInfo.last_login_date,
    username: profile.username,
    display_name: profile.nickname,
    avatar: { type: 'custom', gravatar: '', custom: profile.avatarDataUrl },
    cover_url: profile.coverUrl,
    mobile: '',
    bio: profile.bio,
    bio_html: `<p>${profile.bio}</p>`,
    website: profile.website,
    location: profile.location,
    about_html: profile.aboutHtml,
    language: optionalString(interfaceConfig.language, 'zh-CN'),
    color_scheme: optionalString(interfaceConfig.color_scheme, 'system'),
    access_token: '',
    role_id: 1,
    role_name: 'member',
    rank: 17,
    status: 'normal',
    have_password: false,
    visit_token: '',
    suspended_until: 0,
  };
}

async function putPreference(
  repository: DemoRepository,
  key: string,
  value: JsonObject,
  updatedAt: string,
): Promise<void> {
  await repository.transaction(['preferences'], 'readwrite', async (transaction) => {
    await transaction.put('preferences', {
      key,
      value: value as DemoPreferenceRecord['value'],
      updatedAt,
    });
  });
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const value: unknown = await request.json().catch(() => null);
  if (!isRecord(value)) throw new DemoRequestError(422, 'validation.invalid_body', 'A JSON object is required.');
  return value;
}

export async function demoPublicUserInfo(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const reference = new URL(request.url).searchParams.get('username') ?? '';
  const user = resolveUser(reference, snapshot);
  if (!user) throw new DemoRequestError(404, 'identity.user_not_found', 'The requested demo user does not exist.');
  return userInfoPayload(user, snapshot);
}

export async function demoCurrentUserInfo(request: Request, repository: DemoRepository) {
  if (request.method === 'GET' && !memberRequest(request)) return null;
  requireMember(request);
  if (request.method === 'PUT') {
    const body = await jsonBody(request);
    const snapshot = await readSnapshot(repository);
    const current = memberProfilePayload(snapshot);
    const avatar = isRecord(body.avatar) ? optionalString(body.avatar.custom, current.avatarDataUrl) : current.avatarDataUrl;
    const next = {
      ...current,
      username: optionalString(body.username, current.username).trim().replace(/^@+/, ''),
      handle: optionalString(body.username, current.username).trim().replace(/^@+/, ''),
      nickname: optionalString(body.display_name, current.nickname).trim(),
      avatarDataUrl: avatar,
      coverUrl: optionalString(body.cover_url, current.coverUrl),
      bio: optionalString(body.bio, current.bio),
      website: optionalString(body.website, current.website),
      location: optionalString(body.location, current.location),
      aboutHtml: optionalString(body.about_html, current.aboutHtml),
      updatedAt: snapshot.clock,
    };
    if (next.username.length < 3 || next.nickname.length < 2) {
      throw new DemoRequestError(422, 'validation.profile', 'The demo profile fields are invalid.');
    }
    await putPreference(repository, demoProfilePreferenceKey, next, snapshot.clock);
  }
  return currentUserPayload(await readSnapshot(repository));
}

export async function demoPrivateProfile(request: Request, repository: DemoRepository) {
  requireMember(request);
  if (request.method === 'POST') {
    const body = await jsonBody(request);
    const snapshot = await readSnapshot(repository);
    const current = memberProfilePayload(snapshot);
    const next = {
      ...current,
      username: optionalString(body.username, current.username).trim().replace(/^@+/, ''),
      handle: optionalString(body.username, current.username).trim().replace(/^@+/, ''),
      nickname: optionalString(body.nickname, current.nickname).trim(),
      avatarDataUrl: optionalString(body.avatarDataUrl, current.avatarDataUrl),
      coverUrl: optionalString(body.coverUrl, current.coverUrl),
      bio: optionalString(body.bio, current.bio),
      website: optionalString(body.website, current.website),
      location: optionalString(body.location, current.location),
      aboutHtml: optionalString(body.aboutHtml, current.aboutHtml),
      updatedAt: snapshot.clock,
    };
    await putPreference(repository, demoProfilePreferenceKey, next, snapshot.clock);
  }
  return memberProfilePayload(await readSnapshot(repository));
}

export async function demoUserRelations(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const url = new URL(request.url);
  const user = resolveUser(url.searchParams.get('username') ?? '', snapshot);
  if (!user) throw new DemoRequestError(404, 'identity.user_not_found', 'The requested demo user does not exist.');
  const relation = url.searchParams.get('relation') === 'followers' ? 'followers' : 'following';
  const matches = snapshot.relations.filter((entry) => (
    entry.kind === 'follow'
    && (relation === 'following' ? entry.sourceId === user.id : entry.targetId === user.id)
    && entry.targetKind === 'user'
  ));
  const users = matches.flatMap((entry) => {
    const otherId = relation === 'following' ? entry.targetId : entry.sourceId;
    const other = snapshot.users.find((candidate) => candidate.id === otherId);
    if (!other) return [];
    return [{ relation: entry, user: other }];
  });
  const pagination = readDemoPagination(new URLSearchParams({
    page: url.searchParams.get('page') ?? '1',
    size: url.searchParams.get('page_size') ?? '20',
  }));
  const page = paginateDemoItems(users, pagination);
  return {
    count: users.length,
    page: page.page,
    page_size: page.pageSize,
    items: page.items.map(({ relation: entry, user: other }) => ({
      id: publicUserId(other, snapshot),
      username: other.data.username,
      display_name: other.data.displayName,
      avatar: asset(snapshot, other.data.avatarUrl),
      rank: other.data.locale === 'zh-CN' ? 14 : 11,
      bio: other.data.bio,
      followed_at: seconds(entry.createdAt),
      is_following: snapshot.relations.some((candidate) => (
        candidate.kind === 'follow' && candidate.sourceId === demoMemberId && candidate.targetId === other.id
      )),
    })),
  };
}

function questionSummary(content: DemoContentEntity, snapshot: IdentitySnapshot) {
  return {
    id: publicContentId(content, snapshot),
    question_id: publicContentId(content, snapshot),
    title: content.data.title,
    url_title: content.data.slug,
    description: content.data.summary,
    vote_count: 2,
    tags: content.data.tags.map((tagId) => {
      const tag = snapshot.entities.find((entry) => entry.kind === 'tag' && entry.id === tagId);
      return tag?.kind === 'tag'
        ? {
          tag_id: tag.id,
          slug: tag.data.slug,
          name: tag.data.name,
          displayName: tag.data.name,
          postCount: snapshot.content.filter((candidate) => candidate.data.tags.includes(tag.id)).length,
          usage_excerpt: tag.data.description,
        }
        : { slug: tagId, name: tagId, displayName: tagId, postCount: 0, usage_excerpt: '' };
    }),
    view_count: 48,
    answer_count: 1,
    collection_count: 0,
    created_at: seconds(content.data.createdAt),
    accepted_answer_id: '',
    status: 'published',
  };
}

export async function demoPersonalQuestions(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const url = new URL(request.url);
  const user = resolveUser(url.searchParams.get('username') ?? demoMemberId, snapshot);
  const all = user
    ? snapshot.content.filter((content) => content.data.authorId === user.id && content.data.type === 'question')
    : [];
  const pagination = readDemoPagination(new URLSearchParams({
    page: url.searchParams.get('page') ?? '1', size: url.searchParams.get('page_size') ?? '20',
  }));
  const page = paginateDemoItems(all, pagination);
  return { count: all.length, items: page.items.map((content) => questionSummary(content, snapshot)) };
}

export async function demoPersonalAnswers() {
  return { count: 0, items: [] };
}

export async function demoPersonalComments(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const url = new URL(request.url);
  const user = resolveUser(url.searchParams.get('username') ?? demoMemberId, snapshot);
  const comments = snapshot.entities.filter((entry): entry is DemoCommentEntity => (
    entry.kind === 'comment' && entry.data.authorId === user?.id
  ));
  return {
    count: comments.length,
    items: comments.slice(0, Number(url.searchParams.get('page_size') ?? 20)).map((comment) => {
      const target = snapshot.content.find((content) => content.id === comment.data.targetId);
      return {
        comment_id: comment.id,
        created_at: seconds(comment.data.createdAt),
        object_id: target ? publicContentId(target, snapshot) : comment.data.targetId,
        question_id: target?.data.type === 'question' ? publicContentId(target, snapshot) : '',
        answer_id: '',
        object_type: target?.data.type ?? 'content',
        title: target?.data.title ?? 'Demo content',
        url_title: target?.data.slug ?? '',
        content: comment.data.body,
      };
    }),
  };
}

export async function demoPersonalQATop(request: Request, repository: DemoRepository) {
  const questions = await demoPersonalQuestions(request, repository);
  return { question: questions.items.slice(0, 3), answer: [] };
}

export async function demoPersonalFollows(request: Request, repository: DemoRepository) {
  requireMember(request);
  const snapshot = await readSnapshot(repository);
  const questions = snapshot.content.filter((content) => content.data.type === 'question').slice(0, 1);
  return { count: questions.length, items: questions.map((content) => questionSummary(content, snapshot)) };
}

export async function demoPersonalVotes(request: Request, repository: DemoRepository) {
  requireMember(request);
  const snapshot = await readSnapshot(repository);
  const question = snapshot.content.find((content) => content.data.type === 'question');
  if (!question) return { count: 0, items: [] };
  return {
    count: 1,
    items: [{
      answer_id: '',
      content: question.data.summary,
      created_at: seconds(snapshot.clock),
      object_id: publicContentId(question, snapshot),
      object_type: 'question',
      question_id: publicContentId(question, snapshot),
      title: question.data.title,
      url_title: question.data.slug,
      vote_type: 'up_vote',
    }],
  };
}

const demoBadge = Object.freeze({
  id: 'demo-badge-reproducible-reader',
  name: '可复现读者',
  icon: 'award',
  award_count: 1,
  earned: true,
  level: 1,
  earned_count: 1,
});

export async function demoBadges() {
  return [{ group_name: '演示里程碑', badges: [demoBadge] }];
}

export async function demoBadgeInfo(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (id !== demoBadge.id) throw new DemoRequestError(404, 'identity.badge_not_found', 'The requested demo badge does not exist.');
  return { ...demoBadge, description: '完成一次可复现的本地阅读流程。', is_single: true };
}

export async function demoBadgeAwards(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const user = resolveUser(demoMemberId, snapshot) ?? snapshot.users[0];
  if (!user) return { count: 0, items: [] };
  const question = snapshot.content.find((content) => content.data.type === 'question');
  const publicUser = userInfoPayload(user, snapshot);
  return {
    count: 1,
    items: [{
      created_at: seconds(snapshot.clock),
      author_user_info: {
        id: publicUser.id,
        username: publicUser.username,
        rank: publicUser.rank,
        display_name: publicUser.display_name,
        avatar: publicUser.avatar,
        status: publicUser.status,
      },
      object_type: question ? 'question' : 'user',
      object_id: question ? publicContentId(question, snapshot) : publicUser.id,
      url_title: question?.data.slug ?? '',
      question_id: question ? publicContentId(question, snapshot) : '',
      answer_id: '',
      comment_id: '',
    }],
  };
}

export async function demoUserBadgeAwards(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const user = resolveUser(new URL(request.url).searchParams.get('username') ?? '', snapshot);
  const items = user?.id === demoMemberId
    ? [demoBadge]
    : [];
  return { count: items.length, items };
}

function notificationSection(notification: DemoNotificationEntity): 'inbox' | 'achievement' {
  return notification.data.type === 'content_collected' ? 'achievement' : 'inbox';
}

function notificationAction(notification: DemoNotificationEntity): string {
  if (notification.data.type === 'comment_created') return 'comment';
  if (notification.data.type === 'user_followed') return 'follow';
  if (notification.data.type === 'content_collected') return 'achievement';
  return notification.data.type;
}

function notificationPagePayload(notification: DemoNotificationEntity, snapshot: IdentitySnapshot) {
  const actor = resolveUser(notification.data.actorId, snapshot);
  const targetContent = resolveContent(notification.data.targetId, snapshot);
  const targetUser = resolveUser(notification.data.targetId, snapshot);
  const targetId = targetContent
    ? publicContentId(targetContent, snapshot)
    : targetUser
      ? publicUserId(targetUser, snapshot)
      : notification.data.targetId;
  const targetType = targetContent?.data.type ?? notification.data.targetType;
  return {
    id: notification.id,
    user_info: actor ? {
      id: publicUserId(actor, snapshot),
      username: actor.data.username,
      display_name: actor.data.displayName,
      avatar: asset(snapshot, actor.data.avatarUrl),
    } : undefined,
    object_info: {
      title: targetContent?.data.title ?? targetUser?.data.displayName ?? 'Rinspace Demo',
      object_id: targetId,
      object_map: {},
      object_type: targetType,
      excerpt: notification.data.excerpt,
    },
    rank: 11,
    notification_action: notificationAction(notification),
    is_read: notification.data.readAt !== null,
    update_time: seconds(notification.data.createdAt),
    type: notificationSection(notification),
    target_type: targetType,
    target_id: targetId,
    message: notification.data.excerpt,
  };
}

function notificationStatusPayload(snapshot: IdentitySnapshot) {
  const unread = snapshot.notifications.filter((notification) => notification.data.readAt === null);
  return {
    inbox: unread.filter((notification) => notificationSection(notification) === 'inbox').length,
    achievement: unread.filter((notification) => notificationSection(notification) === 'achievement').length,
    revision: 0,
    can_revision: false,
    badge_award: null,
  };
}

export async function demoNotifications(request: Request, repository: DemoRepository) {
  requireMember(request);
  const snapshot = await readSnapshot(repository);
  return {
    items: snapshot.notifications.map((notification, index) => ({
      id: 501 + index,
      actor: resolveUser(notification.data.actorId, snapshot)?.data.displayName ?? 'Rinspace Demo',
      type: notification.data.type,
      targetType: notification.data.targetType,
      targetId: notification.data.targetId,
      excerpt: notification.data.excerpt,
      readAt: notification.data.readAt ?? undefined,
      createdAt: notification.data.createdAt,
    })),
  };
}

export async function demoNotificationPage(request: Request, repository: DemoRepository) {
  requireMember(request);
  const snapshot = await readSnapshot(repository);
  const url = new URL(request.url);
  const section = url.searchParams.get('type') === 'achievement' ? 'achievement' : 'inbox';
  const items = snapshot.notifications.filter((notification) => notificationSection(notification) === section);
  const pagination = readDemoPagination(new URLSearchParams({
    page: url.searchParams.get('page') ?? '1', size: url.searchParams.get('page_size') ?? '12',
  }));
  const page = paginateDemoItems(items, pagination);
  return {
    count: items.length,
    page: page.page,
    page_size: page.pageSize,
    items: page.items.map((notification) => notificationPagePayload(notification, snapshot)),
  };
}

export async function demoNotificationStatus(request: Request, repository: DemoRepository) {
  requireMember(request);
  return notificationStatusPayload(await readSnapshot(repository));
}

async function markNotifications(
  repository: DemoRepository,
  predicate: (notification: DemoNotificationEntity) => boolean,
): Promise<void> {
  await repository.transaction(['entities', 'preferences'], 'readwrite', async (transaction) => {
    const entities = await transaction.getAll('entities');
    const clock = await transaction.get('preferences', 'demo.seed.feature-clock');
    const readAt = typeof clock?.value === 'string' ? clock.value : fallbackClock;
    for (const entity of entities) {
      if (entity.kind !== 'notification' || !predicate(entity) || entity.data.readAt !== null) continue;
      await transaction.put('entities', {
        ...entity,
        updatedAt: readAt,
        data: { ...entity.data, readAt },
      });
    }
  });
}

export async function demoMarkNotificationRead(request: Request, repository: DemoRepository) {
  requireMember(request);
  const body = await jsonBody(request);
  const id = optionalString(body.id);
  await markNotifications(repository, (notification) => notification.id === id);
  const snapshot = await readSnapshot(repository);
  return {
    read_count: snapshot.notifications.filter((notification) => notification.data.readAt !== null).length,
    unread_count: snapshot.notifications.filter((notification) => notification.data.readAt === null).length,
  };
}

export async function demoMarkAllNotificationsRead(request: Request, repository: DemoRepository) {
  requireMember(request);
  const body = await jsonBody(request);
  const section = body.type === 'achievement' ? 'achievement' : 'inbox';
  await markNotifications(repository, (notification) => notificationSection(notification) === section);
  const snapshot = await readSnapshot(repository);
  return {
    read_count: snapshot.notifications.filter((notification) => notification.data.readAt !== null).length,
    unread_count: snapshot.notifications.filter((notification) => notification.data.readAt === null).length,
  };
}

function defaultNotificationConfig() {
  return {
    inbox: { key: 'site', enable: true },
    all_new_question: { key: 'site', enable: false },
    all_new_question_for_following_tags: { key: 'site', enable: true },
  };
}

export async function demoUserNotificationConfig(request: Request, repository: DemoRepository) {
  requireMember(request);
  const snapshot = await readSnapshot(repository);
  if (request.method === 'PUT') {
    const body = await jsonBody(request);
    const next = {
      inbox: isRecord(body.inbox) ? body.inbox : defaultNotificationConfig().inbox,
      all_new_question: isRecord(body.all_new_question) ? body.all_new_question : defaultNotificationConfig().all_new_question,
      all_new_question_for_following_tags: isRecord(body.all_new_question_for_following_tags)
        ? body.all_new_question_for_following_tags
        : defaultNotificationConfig().all_new_question_for_following_tags,
    };
    await putPreference(repository, demoNotificationPreferenceKey, next, snapshot.clock);
  }
  return preference(await readSnapshot(repository), demoNotificationPreferenceKey) ?? defaultNotificationConfig();
}

export async function demoUserInterfaceConfig(request: Request, repository: DemoRepository) {
  requireMember(request);
  const snapshot = await readSnapshot(repository);
  const body = await jsonBody(request);
  const next = {
    language: optionalString(body.language, optionalString(interfaceData(snapshot).language, 'zh-CN')),
    color_scheme: optionalString(body.color_scheme, optionalString(interfaceData(snapshot).color_scheme, 'system')),
  };
  await putPreference(repository, demoInterfacePreferenceKey, next, snapshot.clock);
  return next;
}

function activityRevision(content: DemoContentEntity, snapshot: IdentitySnapshot, revision: 1 | 2) {
  const author = snapshot.users.find((user) => user.id === content.data.authorId);
  const tags = content.data.tags.flatMap((tagId) => {
    const tag = snapshot.entities.find((entry) => entry.kind === 'tag' && entry.id === tagId);
    return tag?.kind === 'tag' ? [{
      slug_name: tag.data.slug,
      display_name: tag.data.name,
      main_tag_slug_name: tag.data.slug,
      recommend: true,
      reserved: false,
    }] : [];
  });
  const body = revision === 1 ? content.data.summary : content.data.body;
  return {
    id: `${publicContentId(content, snapshot)}-revision-${revision}`,
    author: author?.data.displayName ?? 'Rinspace Demo',
    user_id: author ? publicUserId(author, snapshot) : '',
    object_id: publicContentId(content, snapshot),
    object_type: content.data.type,
    reason: revision === 1 ? '创建内容' : '补充可复现示例',
    status: 1,
    created_at: seconds(content.data.createdAt) + revision,
    updated_at: seconds(content.updatedAt),
    title: content.data.title,
    tags,
    original_text: body,
    excerpt: content.data.summary,
    slug_name: content.data.slug,
    main_tag_slug_name: tags[0]?.slug_name ?? '',
  };
}

export async function demoActivityTimeline(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const reference = new URL(request.url).searchParams.get('object_id') ?? '';
  const content = resolveContent(reference, snapshot) ?? snapshot.content[0];
  if (!content) return { object_info: null, timeline: [] };
  const author = snapshot.users.find((user) => user.id === content.data.authorId);
  return {
    object_info: {
      title: content.data.title,
      object_type: content.data.type,
      question_id: content.data.type === 'question' ? publicContentId(content, snapshot) : '',
      answer_id: '',
      username: author?.data.username ?? '',
      display_name: author?.data.displayName ?? '',
      main_tag_slug_name: '',
    },
    timeline: [2, 1].map((revision) => ({
      activity_id: `${publicContentId(content, snapshot)}-activity-${revision}`,
      revision_id: `${publicContentId(content, snapshot)}-revision-${revision}`,
      created_at: seconds(content.data.createdAt) + revision,
      activity_type: revision === 1 ? 'created' : 'edited',
      comment: revision === 1 ? '创建了内容' : '补充了演示说明',
      object_id: publicContentId(content, snapshot),
      object_type: content.data.type,
      cancelled: false,
      cancelled_at: 0,
      user_info: author ? {
        id: publicUserId(author, snapshot), username: author.data.username, rank: 14,
        display_name: author.data.displayName, avatar: asset(snapshot, author.data.avatarUrl), status: 'normal',
      } : undefined,
    })),
  };
}

export async function demoActivityTimelineDetail(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const url = new URL(request.url);
  const newId = url.searchParams.get('new_revision_id') ?? '';
  const content = snapshot.content.find((entry) => newId.startsWith(publicContentId(entry, snapshot))) ?? snapshot.content[0];
  if (!content) return { new_revision: null, old_revision: null };
  return {
    new_revision: activityRevision(content, snapshot, newId.endsWith('-1') ? 1 : 2),
    old_revision: newId.endsWith('-1') ? null : activityRevision(content, snapshot, 1),
  };
}
