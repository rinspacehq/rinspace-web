import { useEffect, useState } from 'react';
import { getCurrentAuthUser } from '@/services/phoneAuth';

type Session = { status: 'loading' } | { status: 'anonymous' } | { status: 'error' } | { status: 'ready'; uid: string };
export function useWalletSession() {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = 0;
    const restore = () => {
      const request = ++current;
      setSession({ status: 'loading' });
      void getCurrentAuthUser().then(user => {
        if (request === current) setSession(user?.id ? { status: 'ready', uid: user.id } : user ? { status: 'error' } : { status: 'anonymous' });
      }).catch(() => { if (request === current) setSession({ status: 'error' }); });
    };
    window.addEventListener('rinspace-session-changed', restore);
    restore();
    return () => { current++; window.removeEventListener('rinspace-session-changed', restore); };
  }, [revision]);
  return { session, retry: () => setRevision(value => value + 1) };
}
