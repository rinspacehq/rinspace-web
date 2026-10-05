import { useEffect, useMemo, useState, type FocusEvent } from 'react';
import { Link } from 'react-router-dom';

import AvatarImage from '@/components/AvatarImage';
import AvatarName, { type AvatarNameSize } from '@/components/AvatarName';
import CultivationBadge from '@/components/CultivationBadge';
import {
  AnimateButton,
  AnimateHoverCard,
  AnimateHoverCardContent,
  AnimateHoverCardTrigger,
} from '@/components/ui/animate';
import type { AnswerUserInfo } from '@/services/feed';
import { messageFromError } from '@/services/errors';
import { cleanUserId, profilePath as routeProfilePath } from '@/utils/routes';

export type UserIdentityVariant = 'compact' | 'default' | 'prominent';

export type UserIdentityProps = {
  name: string;
  username?: string;
  userId?: string;
  imageUrl?: string;
  rank?: number;
  size?: AvatarNameSize;
  variant?: UserIdentityVariant;
  className?: string;
  title?: string;
};

const profilePromiseCache = new Map<string, Promise<AnswerUserInfo>>();

function cachedProfile(identity: string) {
  const key = cleanUserId(identity).toLocaleLowerCase();
  const existing = profilePromiseCache.get(key);
  if (existing) return existing;
  const request = import('@/services/domains/identity')
    .then(({ loadPersonalUserInfo }) => loadPersonalUserInfo(identity))
    .catch((error: unknown) => {
      profilePromiseCache.delete(key);
      throw error;
    });
  profilePromiseCache.set(key, request);
  return request;
}

function initialsFor(name: string) {
  const letters = Array.from(name.trim().replace(/\s+/g, ''));
  return (letters.slice(0, 2).join('') || 'R').toUpperCase();
}

function profileWebsiteHref(website: string) {
  const normalized = website.trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `https://${normalized}`;
}

function sameIdentity(left: string | undefined, right: string | undefined) {
  const a = cleanUserId(left).toLocaleLowerCase();
  const b = cleanUserId(right).toLocaleLowerCase();
  return Boolean(a && b && a === b);
}

type UserProfileHoverCardProps = {
  fallback: {
    name: string;
    username: string;
    imageUrl?: string;
    rank?: number;
  };
  identity: string;
  profile: AnswerUserInfo | null;
  loading: boolean;
  loadError: string;
  followBusy: boolean;
  followError: string;
  isOwnProfile: boolean;
  onToggleFollow(): void;
};

function UserProfileHoverCard({
  fallback,
  identity,
  profile,
  loading,
  loadError,
  followBusy,
  followError,
  isOwnProfile,
  onToggleFollow,
}: UserProfileHoverCardProps) {
  const username = cleanUserId(profile?.username || fallback.username || identity);
  const displayName = profile?.display_name || fallback.name || username;
  const avatar = profile?.avatar || fallback.imageUrl;
  const rank = profile?.rank ?? fallback.rank;
  const websiteHref = profileWebsiteHref(profile?.website || '');

  return (
    <section className="user-profile-hover-card" aria-label={`${displayName} 的个人资料预览`}>
      <div className="user-profile-hover-cover">
        {profile?.cover_url ? <img src={profile.cover_url} alt="" /> : null}
        <span>@{username}</span>
      </div>
      <div className="user-profile-hover-body">
        <div className="user-profile-hover-avatar" aria-hidden="true">
          <AvatarImage src={avatar} fallback={<span>{initialsFor(displayName)}</span>} />
        </div>
        <div className="user-profile-hover-heading">
          <div>
            <strong>{displayName}</strong>
            <span>@{username}</span>
          </div>
          <CultivationBadge rank={rank} />
        </div>

        {loading ? (
          <div className="user-profile-hover-skeleton" aria-label="正在加载用户资料">
            <span />
            <span />
          </div>
        ) : null}

        {!loading && loadError ? <p className="user-profile-hover-error" role="status">{loadError}</p> : null}

        {profile ? (
          <>
            {profile.bio ? <p className="user-profile-hover-bio">{profile.bio}</p> : null}
            {profile.location || websiteHref ? (
              <div className="user-profile-hover-meta">
                {profile.location ? <span>{profile.location}</span> : null}
                {websiteHref ? (
                  <a href={websiteHref} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                    {profile.website}
                  </a>
                ) : null}
              </div>
            ) : null}
            <div className="user-profile-hover-footer">
              <div className="user-profile-hover-stats" aria-label="用户关系">
                <span><strong>{profile.following_count}</strong> 关注</span>
                <span><strong>{profile.follow_count}</strong> 粉丝</span>
              </div>
              {!isOwnProfile ? (
                <AnimateButton
                  className="user-profile-hover-follow"
                  size="sm"
                  variant={profile.is_follower ? 'secondary' : 'primary'}
                  disabled={followBusy}
                  aria-pressed={profile.is_follower}
                  onClick={onToggleFollow}
                >
                  {followBusy ? '处理中…' : profile.is_follower ? '取消关注' : '关注'}
                </AnimateButton>
              ) : null}
            </div>
          </>
        ) : null}

        {followError ? <p className="user-profile-hover-error" role="status">{followError}</p> : null}
      </div>
    </section>
  );
}

export default function UserIdentity({
  name,
  username,
  userId,
  imageUrl,
  rank,
  size,
  variant = 'default',
  className = '',
  title,
}: UserIdentityProps) {
  const identity = cleanUserId(username || userId || name);
  const resolvedSize = size || (variant === 'prominent' ? 'md' : 'sm');
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<AnswerUserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState('');
  const [viewer, setViewer] = useState<{ id?: string; username?: string } | null>(null);
  const destination = routeProfilePath(identity);
  const fallback = useMemo(
    () => ({ name, username: cleanUserId(username || identity), imageUrl, rank }),
    [identity, imageUrl, name, rank, username],
  );

  useEffect(() => {
    setProfile(null);
    setLoadError('');
    setFollowError('');
    setViewer(null);
  }, [identity]);

  useEffect(() => {
    if (!open || !identity || profile) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    void Promise.all([
      cachedProfile(identity),
      import('@/services/profile')
        .then(({ getCurrentUser }) => getCurrentUser())
        .catch(() => null),
    ])
      .then(([nextProfile, currentUser]) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setViewer(currentUser);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(messageFromError(error, 'identity.userIdentityLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identity, open, profile]);

  const isOwnProfile = Boolean(
    profile && viewer && (sameIdentity(profile.id, viewer.id) || sameIdentity(profile.username, viewer.username)),
  );

  const toggleFollow = async () => {
    if (!profile || followBusy || isOwnProfile) return;
    setFollowBusy(true);
    setFollowError('');
    try {
      const { followTarget } = await import('@/services/domains/identity');
      const result = await followTarget({
        targetType: 'user',
        targetId: profile.id,
        isCancel: profile.is_follower,
      });
      const nextProfile = {
        ...profile,
        is_follower: result.following,
        follow_count: result.followerCount,
      };
      setProfile(nextProfile);
      profilePromiseCache.set(cleanUserId(identity).toLocaleLowerCase(), Promise.resolve(nextProfile));
    } catch (error: unknown) {
      setFollowError(messageFromError(error, 'identity.profileFollowFailed'));
    } finally {
      setFollowBusy(false);
    }
  };

  const closeAfterFocusLeaves = (event: FocusEvent<HTMLAnchorElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    window.setTimeout(() => setOpen(false), 180);
  };

  return (
    <AnimateHoverCard open={open} openDelay={400} closeDelay={180} onOpenChange={setOpen}>
      <AnimateHoverCardTrigger asChild>
        <Link
          className={`identity-link user-identity user-identity-${variant} ${className}`.trim()}
          data-user-identity={identity}
          to={destination}
          title={title}
          onFocus={() => setOpen(true)}
          onBlur={closeAfterFocusLeaves}
        >
          <AvatarName name={name} imageUrl={imageUrl} rank={rank} size={resolvedSize} />
        </Link>
      </AnimateHoverCardTrigger>
      <AnimateHoverCardContent className="user-profile-hover-positioner" side="bottom" align="start">
        <UserProfileHoverCard
          fallback={fallback}
          identity={identity}
          profile={profile}
          loading={loading}
          loadError={loadError}
          followBusy={followBusy}
          followError={followError}
          isOwnProfile={isOwnProfile}
          onToggleFollow={() => { void toggleFollow(); }}
        />
      </AnimateHoverCardContent>
    </AnimateHoverCard>
  );
}
