import { useEffect, useState } from 'react';
import type { Session } from '../../../shared/types';

export function useSessions(): Session[] {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    let disposed = false;

    void window.api.listSessions().then((nextSessions) => {
      if (!disposed) setSessions(sortSessions(nextSessions));
    });

    const syncSession = (session: Session): void => {
      setSessions((current) => upsertSession(current, session));
    };
    const offCreated = window.api.onSessionCreated(syncSession);
    const offUpdated = window.api.onSessionUpdated(syncSession);

    return () => {
      disposed = true;
      offCreated();
      offUpdated();
    };
  }, []);

  return sessions;
}

function upsertSession(sessions: Session[], session: Session): Session[] {
  const next = sessions.filter((candidate) => candidate.sessionId !== session.sessionId);
  next.push(session);
  return sortSessions(next);
}

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
