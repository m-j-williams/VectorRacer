'use client';

import { useEffect, useState } from 'react';

type TurnStatusProps = {
  turnNumber: number;
  deadline: string | null;
  ready: number;
  total: number;
  resolving: boolean;
  status: 'lobby' | 'running' | 'finished';
  hasStarted: boolean;
};

export function TurnStatus({ turnNumber, deadline, ready, total, resolving, status, hasStarted }: TurnStatusProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  const seconds = deadline && now ? Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000)) : null;
  const timeLabel =
    status === 'finished'
      ? 'Ended'
      : status === 'lobby'
        ? hasStarted
          ? 'Paused'
          : 'Waiting'
        : resolving
            ? 'Moving'
            : seconds === null
              ? '--'
              : `${seconds}s`;

  return (
    <div className="stat-grid turn-status-grid">
      <div className="stat">
        <span className="muted">Round</span>
        <strong>{turnNumber}</strong>
      </div>
      <div className="stat">
        <span className="muted">Ready</span>
        <strong>
          {ready}/{total}
        </strong>
      </div>
      <div className="stat">
        <span className="muted">Time</span>
        <strong>{timeLabel}</strong>
      </div>
    </div>
  );
}
