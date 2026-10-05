import { motion } from 'motion/react';
import { Link } from 'react-router-dom';

import AvatarImage from '@/components/AvatarImage';

import {
  AnimateTooltip,
  AnimateTooltipContent,
  AnimateTooltipPortal,
  AnimateTooltipProvider,
  AnimateTooltipTrigger,
} from './overlay';

export type UserPresenceAvatarItem = {
  id: string;
  name: string;
  imageUrl?: string;
  profilePath: string;
};

function initialsFor(name: string) {
  return Array.from(name.trim().replace(/\s+/g, '')).slice(0, 1).join('').toUpperCase() || 'R';
}

/**
 * Compact linked avatar group adapted from Animate UI's User Presence Avatar.
 * Source basis: imskyleen/animate-ui@efeb96ffd7a3b7a4868667e4ac3c346620fb3044.
 * Rinspace intentionally omits online/offline state because sponsor records do
 * not establish a user's current presence.
 */
export function UserPresenceAvatar({
  users,
  label,
}: {
  users: UserPresenceAvatarItem[];
  label: string;
}) {
  if (!users.length) return null;

  return (
    <AnimateTooltipProvider delayDuration={120}>
      <div className="rin-user-presence-avatar-group" aria-label={label}>
        {users.map((user, index) => (
          <AnimateTooltip key={user.id}>
            <AnimateTooltipTrigger asChild>
              <Link
                className="rin-user-presence-avatar-link"
                to={user.profilePath}
                aria-label={user.name}
                style={{ zIndex: users.length - index }}
              >
                <motion.span
                  className="rin-user-presence-avatar"
                  whileHover={{ y: -4, scale: 1.04 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                >
                  <AvatarImage
                    src={user.imageUrl}
                    alt=""
                    className="rin-user-presence-avatar-image"
                    fallback={(
                      <span className="rin-user-presence-avatar-fallback" aria-hidden="true">
                        {initialsFor(user.name)}
                      </span>
                    )}
                  />
                </motion.span>
              </Link>
            </AnimateTooltipTrigger>
            <AnimateTooltipPortal>
              <AnimateTooltipContent
                className="rin-ui-panel rin-ui-tooltip rin-user-presence-avatar-tooltip"
                sideOffset={7}
              >
                {user.name}
              </AnimateTooltipContent>
            </AnimateTooltipPortal>
          </AnimateTooltip>
        ))}
      </div>
    </AnimateTooltipProvider>
  );
}
