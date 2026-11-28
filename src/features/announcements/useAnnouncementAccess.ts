import { useCallback, useEffect, useState } from 'react';

import { loadCurrentUserInfo } from '@/services/domains/identity';
import { getStoredSession } from '@/services/phoneAuth';

function sessionKey() {
  const session = getStoredSession();
  return session ? JSON.stringify([session.sub, session.session_epoch, session.identity_version]) : '';
}

type Access = 'anonymous' | 'loading' | 'allowed' | 'denied' | 'unavailable';

export function useAnnouncementAccess(enabled = true) {
  const [key, setKey] = useState(sessionKey);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; state: Access } | null>(null);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const onSessionChange = () => setKey(sessionKey());
    window.addEventListener('rinspace-session-changed', onSessionChange);
    onSessionChange();
    return () => window.removeEventListener('rinspace-session-changed', onSessionChange);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !key) return;
    let active = true;
    void loadCurrentUserInfo(attempt > 0)
      .then(user => {
        if (!active || sessionKey() !== key) return;
        setResult({ key, attempt, state: user?.canManageAnnouncements ? 'allowed' : user ? 'denied' : 'anonymous' });
      })
      .catch(() => {
        if (active && sessionKey() === key) setResult({ key, attempt, state: 'unavailable' });
      });
    return () => { active = false; };
  }, [attempt, enabled, key]);

  const state: Access = !enabled || !key ? 'anonymous' : result?.key === key && result.attempt === attempt ? result.state : 'loading';
  return { state, retry, accountKey: key };
}
