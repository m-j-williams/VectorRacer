'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock3, Flag, Pause, Play, RotateCcw } from 'lucide-react';
import { TrackBoard } from '@/components/TrackBoard';
import { TurnStatus } from '@/components/TurnStatus';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { readJsonResponse } from '@/lib/http';
import { getInstructorKey } from '@/lib/instructor-key';
import type { RaceState } from '@/lib/game';

function formatFinishTurns(finishTurns: number | null) {
  if (finishTurns === null) return '';
  return `${finishTurns.toFixed(2)} turns`;
}

export function InstructorRaceClient({ initialRace }: { initialRace: RaceState }) {
  const [race, setRace] = useState(initialRace);
  const [message, setMessage] = useState('');
  const [duration, setDuration] = useState(String(initialRace.turn_duration_seconds));
  const [busy, setBusy] = useState(false);

  const refreshRace = useCallback(async () => {
    try {
      const response = await fetch(`/api/races/${race.code}`);
      if (response.ok) setRace(await response.json());
    } catch {
      // Background polling will try again after a temporary disconnect.
    }
  }, [race.code]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`instructor-race:${race.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `race_id=eq.${race.id}` },
        () => refreshRace()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moves', filter: `race_id=eq.${race.id}` },
        () => refreshRace()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [race.id, refreshRace]);

  useEffect(() => {
    const interval = window.setInterval(refreshRace, 2000);
    return () => window.clearInterval(interval);
  }, [refreshRace]);

  async function endRace() {
    setMessage('');
    const response = await fetch(`/api/races/${race.code}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructorKey: getInstructorKey() })
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      setMessage(payload.error || 'Unable to end race.');
      return;
    }

    await refreshRace();
  }

  async function resetRace() {
    const shouldReset = window.confirm(
      'Reset this race? This keeps the current students and join code, but clears every move and returns all cars to the start.'
    );
    if (!shouldReset) return;

    setMessage('');
    const response = await fetch(`/api/races/${race.code}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructorKey: getInstructorKey() })
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      setMessage(payload.error || 'Unable to reset race.');
      return;
    }

    await refreshRace();
  }

  async function controlRace(action: 'start' | 'pause' | 'set-duration') {
    setBusy(true);
    setMessage('');
    const response = await fetch(`/api/races/${race.code}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instructorKey: getInstructorKey(),
        action,
        duration: action === 'set-duration' ? Number(duration) : undefined
      })
    });
    const payload = await readJsonResponse(response);
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error || 'Unable to update race controls.');
      return;
    }
    await refreshRace();
  }

  return (
    <div className="stack">
      <section className="band row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Live Race</h1>
          <p className="lead">Project this screen while students choose acceleration vectors.</p>
        </div>
        <div className="row">
          <button
            className="button"
            disabled={busy || race.status === 'finished'}
            onClick={() => controlRace(race.status === 'running' ? 'pause' : 'start')}
            type="button"
          >
            {race.status === 'running' ? <Pause size={18} /> : <Play size={18} />}
            {race.status === 'running' ? 'Pause' : race.started_at ? 'Resume' : 'Start race'}
          </button>
          <button className="button secondary" onClick={resetRace} type="button">
            <RotateCcw size={18} />
            Reset race
          </button>
          <button className="button danger" onClick={endRace} type="button">
            <Flag size={18} />
            End race
          </button>
        </div>
        {message ? <div className="message error">{message}</div> : null}
      </section>

      <div className="grid-2">
        <section className="stack">
          <section className="band race-controls">
            <div>
              <span className="label">Turn timer</span>
              <div className="row timer-control">
                <Clock3 size={18} />
                <input
                  aria-label="Turn duration in seconds"
                  className="input"
                  max={300}
                  min={5}
                  onChange={(event) => setDuration(event.target.value)}
                  type="number"
                  value={duration}
                />
                <span className="muted">seconds</span>
                <button
                  className="button secondary"
                  disabled={busy || Number(duration) === race.turn_duration_seconds}
                  onClick={() => controlRace('set-duration')}
                  type="button"
                >
                  Apply
                </button>
              </div>
            </div>
            <span className="muted">
              {race.status === 'running' ? 'Changing the time restarts the current countdown.' : 'Used when play resumes.'}
            </span>
          </section>
          <TurnStatus
            turnNumber={race.turn_number}
            deadline={race.turn_deadline}
            ready={race.submitted_participant_ids.length}
            total={
              race.participants.filter(
                (participant) => participant.status === 'racing' && participant.recovery_turns_remaining === 0
              ).length
            }
            resolving={race.turn_resolving}
            status={race.status}
            hasStarted={Boolean(race.started_at)}
          />
          <TrackBoard track={race.track_config} participants={race.participants} moves={race.moves} />
        </section>
        <aside className="stack">
          <section className="band stack">
            <span className="label">Student code</span>
            <span className="code">{race.code}</span>
            <p className="muted">Students join at /race/{race.code}</p>
          </section>
          <section className="band stack">
            <h2>Leaderboard</h2>
            <ul className="leaderboard ranking-list">
              {race.participants
                .slice()
                .sort((a, b) => {
                  if (a.status === 'finished' && b.status !== 'finished') return -1;
                  if (b.status === 'finished' && a.status !== 'finished') return 1;
                  if (a.status === 'finished' && b.status === 'finished') {
                    return (a.finish_turns ?? Number.POSITIVE_INFINITY) - (b.finish_turns ?? Number.POSITIVE_INFINITY);
                  }
                  return b.turn_count - a.turn_count;
                })
                .map((participant, index) => (
                  <li key={participant.id}>
                    <span className="rank">{participant.status === 'finished' ? index + 1 : '-'}</span>
                    <span>{participant.display_name}</span>
                    <span className="muted">
                      {participant.status === 'finished'
                        ? formatFinishTurns(participant.finish_turns)
                        : participant.recovery_turns_remaining > 0
                          ? `recovering ${participant.recovery_turns_remaining}`
                          : `v=(${participant.velocity_x}, ${participant.velocity_y})`}
                    </span>
                    <span className="dot" style={{ background: participant.color }} />
                  </li>
                ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
