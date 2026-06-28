'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  ChevronUp,
  Circle
} from 'lucide-react';
import { TrackBoard } from '@/components/TrackBoard';
import { TurnStatus } from '@/components/TurnStatus';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { readJsonResponse } from '@/lib/http';
import type { RaceState, Velocity } from '@/lib/game';

const accelButtons = [
  { axis: 'y', value: 1, icon: ChevronUp, doubleIcon: ChevronsUp, label: 'Up', className: 'accel-up' },
  { axis: 'x', value: -1, icon: ChevronLeft, doubleIcon: ChevronsLeft, label: 'Left', className: 'accel-left' },
  { axis: 'x', value: 1, icon: ChevronRight, doubleIcon: ChevronsRight, label: 'Right', className: 'accel-right' },
  { axis: 'y', value: -1, icon: ChevronDown, doubleIcon: ChevronsDown, label: 'Down', className: 'accel-down' }
] as const;

function formatFinishTurns(finishTurns: number | null) {
  if (finishTurns === null) return '';
  return `${finishTurns.toFixed(2)} turns`;
}

export function RaceClient({ initialRace }: { initialRace: RaceState }) {
  const [race, setRace] = useState(initialRace);
  const [name, setName] = useState('');
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [draftAcceleration, setDraftAcceleration] = useState<Velocity | null>(null);

  const participant = useMemo(
    () => race.participants.find((item) => item.id === participantId),
    [participantId, race.participants]
  );
  const activeParticipants = race.participants.filter((item) => item.status === 'racing');
  const selectableParticipants = activeParticipants.filter((item) => item.recovery_turns_remaining === 0);
  const hasSubmitted = participant ? race.submitted_participant_ids.includes(participant.id) : false;

  useEffect(() => {
    queueMicrotask(() => {
      setParticipantId(window.localStorage.getItem(`vector-racer:${race.code}`));
    });
  }, [race.code]);

  useEffect(() => {
    queueMicrotask(() => {
      setDraftAcceleration(
        participant?.status === 'racing' && participant.recovery_turns_remaining === 0 ? { x: 0, y: 0 } : null
      );
    });
  }, [participant?.id, participant?.recovery_turns_remaining, participant?.status, race.started_at, race.turn_number]);

  useEffect(() => {
    if (!participantId || participant) return;
    queueMicrotask(() => {
      window.localStorage.removeItem(`vector-racer:${race.code}`);
      setParticipantId(null);
      setMessage('The instructor reset the race. Join again for the new heat.');
    });
  }, [participant, participantId, race.code]);

  const refreshRace = useCallback(async () => {
    try {
      const response = await fetch(`/api/races/${race.code}`);
      if (response.ok) {
        setRace(await response.json());
      }
    } catch {
      // Background polling will try again after a temporary disconnect.
    }
  }, [race.code]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`race:${race.id}`)
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

  async function joinRace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    const response = await fetch(`/api/races/${race.code}/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: name })
    });
    const payload = await readJsonResponse(response);
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error || 'Unable to join the race.');
      return;
    }

    window.localStorage.setItem(`vector-racer:${race.code}`, payload.participant.id);
    setRace((current) => ({
      ...current,
      participants: [...current.participants, payload.participant]
    }));
    setParticipantId(payload.participant.id);
    await refreshRace();
  }

  async function submitMove() {
    if (!participant || !draftAcceleration || hasSubmitted) return;
    setBusy(true);
    setMessage('');

    const response = await fetch(`/api/participants/${participant.id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acceleration: draftAcceleration, submitted: true })
    });
    const payload = await readJsonResponse(response);
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error || 'Move rejected.');
      return;
    }

    setRace((current) => ({
      ...current,
      submitted_participant_ids: [...new Set([...current.submitted_participant_ids, participant.id])]
    }));
    setMessage(payload.message || 'Acceleration locked in.');
    await refreshRace();
  }

  async function selectAcceleration(acceleration: Velocity) {
    if (!participant || hasSubmitted || participant.recovery_turns_remaining > 0) return;
    setDraftAcceleration(acceleration);
    setSavingSelection(true);
    setMessage('');

    const response = await fetch(`/api/participants/${participant.id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acceleration, submitted: false })
    });
    const payload = await readJsonResponse(response);
    setSavingSelection(false);

    if (!response.ok) {
      setMessage(payload.error || 'Unable to save acceleration.');
    }
  }

  function toggleAcceleration(axis: 'x' | 'y', value: -1 | 1) {
    const current = draftAcceleration || { x: 0, y: 0 };
    const currentAxis = current[axis];
    const otherAxis = axis === 'x' ? 'y' : 'x';

    if (Math.sign(currentAxis) === value && Math.abs(currentAxis) === 1) {
      void selectAcceleration({ x: 0, y: 0, [axis]: value * 2 });
      return;
    }
    if (Math.sign(currentAxis) === value && Math.abs(currentAxis) === 2) {
      void selectAcceleration({ ...current, [axis]: 0 });
      return;
    }

    const otherValue = current[otherAxis];
    void selectAcceleration({
      ...current,
      [axis]: value,
      [otherAxis]: Math.abs(otherValue) === 2 ? Math.sign(otherValue) : otherValue
    });
  }

  function resetAcceleration() {
    void selectAcceleration({ x: 0, y: 0 });
  }

  return (
    <div className="grid-2 race-layout">
      <section className="stack">
        <TrackBoard
          track={race.track_config}
          participants={race.participants}
          moves={race.moves}
          activeParticipantId={participantId || undefined}
          showCurrentVelocity={
            race.show_current_velocity &&
            race.status === 'running' &&
            Boolean(participant) &&
            participant?.recovery_turns_remaining === 0
          }
          showMoveOptions={
            race.show_potential_endpoints &&
            race.status === 'running' &&
            Boolean(participant) &&
            participant?.recovery_turns_remaining === 0 &&
            !hasSubmitted
          }
          previewAcceleration={
            race.show_chosen_velocity &&
            race.status === 'running' &&
            participant?.recovery_turns_remaining === 0
              ? draftAcceleration || undefined
              : undefined
          }
        />
      </section>

      <aside className="stack">
        <section className="band stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h1>Race {race.code}</h1>
            <span className="muted">{race.status}</span>
          </div>

          <TurnStatus
            turnNumber={race.turn_number}
            deadline={race.turn_deadline}
            ready={race.submitted_participant_ids.length}
            total={selectableParticipants.length}
            resolving={race.turn_resolving}
            status={race.status}
            hasStarted={Boolean(race.started_at)}
          />

          {!participant ? (
            <form className="stack" onSubmit={joinRace}>
              <div>
                <label className="label" htmlFor="display-name">
                  Display name
                </label>
                <input
                  className="input"
                  id="display-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={24}
                  required
                />
              </div>
              <button className="button" disabled={busy} type="submit">
                Join race
              </button>
            </form>
          ) : (
            <div className="stack">
              <div className="stat-grid">
                <div className="stat">
                  <span className="muted">Position</span>
                  <strong>
                    ({participant.position_x}, {participant.position_y})
                  </strong>
                </div>
                <div className="stat">
                  <span className="muted">Velocity</span>
                  <strong>
                    ({participant.velocity_x}, {participant.velocity_y})
                  </strong>
                </div>
                <div className="stat">
                  <span className="muted">Turns</span>
                  <strong>{participant.turn_count}</strong>
                </div>
              </div>
              <div className="accel-grid">
                {accelButtons.map(({ axis, value, icon: Icon, doubleIcon: DoubleIcon, label, className }) => {
                  const amount = draftAcceleration?.[axis] || 0;
                  const selected = Math.sign(amount) === value;
                  const DisplayIcon = selected && Math.abs(amount) === 2 ? DoubleIcon : Icon;
                  return (
                  <button
                    aria-label={label}
                    aria-pressed={selected}
                    className={`button secondary cardinal-control ${className} ${selected ? 'selected' : ''}`}
                    disabled={
                      busy ||
                      savingSelection ||
                      hasSubmitted ||
                      race.status !== 'running' ||
                      race.turn_resolving ||
                      participant.recovery_turns_remaining > 0 ||
                      participant.status !== 'racing'
                    }
                    key={`${axis}:${value}`}
                    onClick={() => toggleAcceleration(axis, value)}
                    title={`${label} acceleration`}
                    type="button"
                  >
                    <DisplayIcon aria-hidden="true" size={30} strokeWidth={3} />
                  </button>
                  );
                })}
                <button
                  aria-label="Zero acceleration"
                  aria-pressed={draftAcceleration?.x === 0 && draftAcceleration?.y === 0}
                  className={`button secondary cardinal-control accel-zero ${
                    (draftAcceleration?.x === 0 && draftAcceleration?.y === 0) ||
                    participant.recovery_turns_remaining > 0
                      ? 'selected'
                      : ''
                  }`}
                  disabled={
                    busy ||
                    savingSelection ||
                    hasSubmitted ||
                    race.status !== 'running' ||
                    race.turn_resolving ||
                    participant.recovery_turns_remaining > 0 ||
                    participant.status !== 'racing'
                  }
                  onClick={resetAcceleration}
                  title="Zero acceleration"
                  type="button"
                >
                  <Circle aria-hidden="true" size={24} strokeWidth={2.5} />
                </button>
              </div>
              {!hasSubmitted ? (
                <button
                  className="button"
                  disabled={
                    !draftAcceleration ||
                    busy ||
                    savingSelection ||
                    race.status !== 'running' ||
                    race.turn_resolving ||
                    participant.recovery_turns_remaining > 0 ||
                    participant.status !== 'racing'
                  }
                  onClick={submitMove}
                  type="button"
                >
                  Submit acceleration
                </button>
              ) : null}
              {hasSubmitted ? <div className="message">Acceleration locked. Waiting for the round.</div> : null}
              {!hasSubmitted && savingSelection ? <div className="muted">Saving selection...</div> : null}
              {race.status === 'lobby' ? (
                <div className="message">The race is paused. Waiting for the instructor.</div>
              ) : null}
              {participant.recovery_turns_remaining > 0 ? (
                <div className="message recovery-message">
                  Recovering for {participant.recovery_turns_remaining} more round
                  {participant.recovery_turns_remaining === 1 ? '' : 's'}. Velocity is zero.
                </div>
              ) : null}
            </div>
          )}

          {message ? <div className={`message ${message.includes('rejected') ? 'error' : ''}`}>{message}</div> : null}
        </section>

        <section className="band stack">
          <h2>Standings</h2>
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
              .map((item, index) => (
                <li key={item.id}>
                  <span className="rank">{item.status === 'finished' ? index + 1 : '-'}</span>
                  <span>{item.display_name}</span>
                  <span className="muted">
                    {item.status === 'finished'
                      ? formatFinishTurns(item.finish_turns)
                      : item.recovery_turns_remaining > 0
                        ? `recovering (${item.recovery_turns_remaining})`
                        : item.status}
                  </span>
                  <span className="dot" style={{ background: item.color }} />
                </li>
              ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
