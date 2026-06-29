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
  Circle,
  Clock3,
  Flag,
  Pause,
  Play,
  RotateCcw,
  UserPlus
} from 'lucide-react';
import { TrackBoard } from '@/components/TrackBoard';
import { TurnStatus } from '@/components/TurnStatus';
import { createBrowserSupabaseClient } from '@/lib/supabase-browser';
import { readJsonResponse } from '@/lib/http';
import { getInstructorKey } from '@/lib/instructor-key';
import type { RaceState, Velocity } from '@/lib/game';

type VisualAidField =
  | 'show_current_velocity'
  | 'show_potential_endpoints'
  | 'show_chosen_velocity';

const visualAidOptions: { field: VisualAidField; label: string }[] = [
  { field: 'show_current_velocity', label: 'Current velocity vector' },
  { field: 'show_potential_endpoints', label: 'Potential endpoints' },
  { field: 'show_chosen_velocity', label: 'New velocity vector' }
];

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

export function InstructorRaceClient({ initialRace }: { initialRace: RaceState }) {
  const [race, setRace] = useState(initialRace);
  const [message, setMessage] = useState('');
  const [duration, setDuration] = useState(String(initialRace.turn_duration_seconds));
  const [busy, setBusy] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverParticipantId, setDriverParticipantId] = useState<string | null>(null);
  const [driverDraft, setDriverDraft] = useState<Velocity>({ x: 0, y: 0 });
  const [driverDraftTurnNumber, setDriverDraftTurnNumber] = useState(initialRace.turn_number);
  const [driverBusy, setDriverBusy] = useState(false);
  const [driverSaving, setDriverSaving] = useState(false);
  const [driverMessage, setDriverMessage] = useState('');

  const driverParticipant = useMemo(
    () => race.participants.find((participant) => participant.id === driverParticipantId),
    [driverParticipantId, race.participants]
  );
  const driverHasSubmitted = driverParticipant
    ? race.submitted_participant_ids.includes(driverParticipant.id)
    : false;

  useEffect(() => {
    queueMicrotask(() => {
      setDriverParticipantId(window.localStorage.getItem(`vector-racer:${race.code}`));
    });
  }, [race.code]);

  useEffect(() => {
    queueMicrotask(() => {
      setDriverDraft({ x: 0, y: 0 });
      setDriverDraftTurnNumber(race.turn_number);
    });
  }, [race.turn_number]);

  useEffect(() => {
    if (!driverParticipantId || driverParticipant) return;
    queueMicrotask(() => {
      window.localStorage.removeItem(`vector-racer:${race.code}`);
      setDriverParticipantId(null);
    });
  }, [driverParticipant, driverParticipantId, race.code]);

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

  async function setVisualAid(field: VisualAidField, visible: boolean) {
    setBusy(true);
    setMessage('');
    const response = await fetch(`/api/races/${race.code}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instructorKey: getInstructorKey(),
        action: 'set-visibility',
        field,
        visible
      })
    });
    const payload = await readJsonResponse(response);
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error || 'Unable to update visual aids.');
      return;
    }
    setRace((current) => ({ ...current, [field]: visible }));
    await refreshRace();
  }

  async function joinAsDriver(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDriverBusy(true);
    setDriverMessage('');
    try {
      const response = await fetch(`/api/races/${race.code}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: driverName })
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        setDriverMessage(payload.error || 'Unable to join the race.');
        return;
      }

      window.localStorage.setItem(`vector-racer:${race.code}`, payload.participant.id);
      setDriverParticipantId(payload.participant.id);
      setRace((current) => ({
        ...current,
        participants: [...current.participants, payload.participant]
      }));
      await refreshRace();
    } finally {
      setDriverBusy(false);
    }
  }

  async function selectDriverAcceleration(acceleration: Velocity) {
    if (
      !driverParticipant ||
      driverHasSubmitted ||
      driverParticipant.recovery_turns_remaining > 0 ||
      driverParticipant.turn_count >= race.turn_number
    ) {
      return;
    }
    setDriverDraft(acceleration);
    setDriverDraftTurnNumber(race.turn_number);
    setDriverSaving(true);
    setDriverMessage('');
    try {
      const response = await fetch(`/api/participants/${driverParticipant.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceleration, submitted: false })
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) setDriverMessage(payload.error || 'Unable to save acceleration.');
    } finally {
      setDriverSaving(false);
    }
  }

  function toggleDriverAcceleration(axis: 'x' | 'y', value: -1 | 1) {
    const currentAxis = driverDraft[axis];
    const otherAxis = axis === 'x' ? 'y' : 'x';

    if (Math.sign(currentAxis) === value && Math.abs(currentAxis) === 1) {
      void selectDriverAcceleration({ x: 0, y: 0, [axis]: value * 2 });
      return;
    }
    if (Math.sign(currentAxis) === value && Math.abs(currentAxis) === 2) {
      void selectDriverAcceleration({ ...driverDraft, [axis]: 0 });
      return;
    }

    const otherValue = driverDraft[otherAxis];
    void selectDriverAcceleration({
      ...driverDraft,
      [axis]: value,
      [otherAxis]: Math.abs(otherValue) === 2 ? Math.sign(otherValue) : otherValue
    });
  }

  async function submitDriverMove() {
    if (
      !driverParticipant ||
      driverHasSubmitted ||
      driverDraftTurnNumber !== race.turn_number ||
      driverParticipant.turn_count >= race.turn_number
    ) {
      return;
    }
    setDriverBusy(true);
    setDriverMessage('');
    try {
      const response = await fetch(`/api/participants/${driverParticipant.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceleration: driverDraft, submitted: true })
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        setDriverMessage(payload.error || 'Move rejected.');
        return;
      }
      setRace((current) => ({
        ...current,
        submitted_participant_ids: [...new Set([...current.submitted_participant_ids, driverParticipant.id])]
      }));
      setDriverMessage(payload.message || 'Acceleration locked in.');
      await refreshRace();
    } finally {
      setDriverBusy(false);
    }
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

      <div className="grid-2 race-layout">
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
            <span className="muted race-control-note">
              {race.status === 'running' ? 'Changing the time restarts the current countdown.' : 'Used when play resumes.'}
            </span>
          </section>
          <section className="band stack">
            <span className="label">Student visual aids</span>
            <div className="visual-aid-list">
              {visualAidOptions.map(({ field, label }) => (
                <label className="toggle-row" key={field}>
                  <input
                    checked={race[field]}
                    disabled={busy || race.status === 'finished'}
                    onChange={(event) => setVisualAid(field, event.target.checked)}
                    type="checkbox"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
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
          <TrackBoard
            track={race.track_config}
            participants={race.participants}
            moves={race.moves}
            activeParticipantId={driverParticipantId || undefined}
            showCurrentVelocity={
              race.show_current_velocity &&
              race.status === 'running' &&
              Boolean(driverParticipant) &&
              driverParticipant!.turn_count < race.turn_number &&
              driverParticipant?.recovery_turns_remaining === 0
            }
            showMoveOptions={
              race.show_potential_endpoints &&
              race.status === 'running' &&
              driverParticipant?.status === 'racing' &&
              driverParticipant.turn_count < race.turn_number &&
              driverParticipant.recovery_turns_remaining === 0 &&
              !driverHasSubmitted
            }
            previewAcceleration={
              race.show_chosen_velocity &&
              race.status === 'running' &&
              Boolean(driverParticipant) &&
              driverDraftTurnNumber === race.turn_number &&
              driverParticipant!.turn_count < race.turn_number &&
              driverParticipant?.recovery_turns_remaining === 0
                ? driverDraft
                : undefined
            }
          />
        </section>
        <aside className="stack">
          <section className="band stack">
            <span className="label">Student code</span>
            <span className="code">{race.code}</span>
            <p className="muted">Students join at /race/{race.code}</p>
            {!driverParticipant && race.status !== 'finished' ? (
              <form className="stack" onSubmit={joinAsDriver}>
                <div>
                  <label className="label" htmlFor="instructor-driver-name">
                    Instructor driver name
                  </label>
                  <input
                    className="input"
                    id="instructor-driver-name"
                    maxLength={24}
                    onChange={(event) => setDriverName(event.target.value)}
                    required
                    value={driverName}
                  />
                </div>
                <button className="button secondary" disabled={driverBusy} type="submit">
                  <UserPlus size={18} />
                  Join as driver
                </button>
              </form>
            ) : null}
          </section>
          {driverParticipant ? (
            <section className="band stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2>Instructor driver</h2>
                <strong>{driverParticipant.display_name}</strong>
              </div>
              <div className="stat-grid">
                <div className="stat">
                  <span className="muted">Position</span>
                  <strong>
                    ({driverParticipant.position_x}, {driverParticipant.position_y})
                  </strong>
                </div>
                <div className="stat">
                  <span className="muted">Velocity</span>
                  <strong>
                    ({driverParticipant.velocity_x}, {driverParticipant.velocity_y})
                  </strong>
                </div>
                <div className="stat">
                  <span className="muted">Turns</span>
                  <strong>{driverParticipant.turn_count}</strong>
                </div>
              </div>
              <div className="accel-grid">
                {accelButtons.map(({ axis, value, icon: Icon, doubleIcon: DoubleIcon, label, className }) => {
                  const amount = driverDraft[axis];
                  const selected = Math.sign(amount) === value;
                  const DisplayIcon = selected && Math.abs(amount) === 2 ? DoubleIcon : Icon;
                  return (
                    <button
                      aria-label={label}
                      aria-pressed={selected}
                      className={`button secondary cardinal-control ${className} ${selected ? 'selected' : ''}`}
                      disabled={
                        driverBusy ||
                        driverSaving ||
                        driverHasSubmitted ||
                        race.status !== 'running' ||
                        race.turn_resolving ||
                        driverParticipant.turn_count >= race.turn_number ||
                        driverParticipant.recovery_turns_remaining > 0 ||
                        driverParticipant.status !== 'racing'
                      }
                      key={`${axis}:${value}`}
                      onClick={() => toggleDriverAcceleration(axis, value)}
                      title={`${label} acceleration`}
                      type="button"
                    >
                      <DisplayIcon aria-hidden="true" size={30} strokeWidth={3} />
                    </button>
                  );
                })}
                <button
                  aria-label="Zero acceleration"
                  aria-pressed={driverDraft.x === 0 && driverDraft.y === 0}
                  className={`button secondary cardinal-control accel-zero ${
                    driverDraft.x === 0 && driverDraft.y === 0 ? 'selected' : ''
                  }`}
                  disabled={
                    driverBusy ||
                    driverSaving ||
                    driverHasSubmitted ||
                    race.status !== 'running' ||
                    race.turn_resolving ||
                    driverParticipant.turn_count >= race.turn_number ||
                    driverParticipant.recovery_turns_remaining > 0 ||
                    driverParticipant.status !== 'racing'
                  }
                  onClick={() => selectDriverAcceleration({ x: 0, y: 0 })}
                  title="Zero acceleration"
                  type="button"
                >
                  <Circle aria-hidden="true" size={24} strokeWidth={2.5} />
                </button>
              </div>
              {!driverHasSubmitted && driverParticipant.status === 'racing' ? (
                <button
                  className="button"
                  disabled={
                    driverBusy ||
                    driverSaving ||
                    race.status !== 'running' ||
                    race.turn_resolving ||
                    driverDraftTurnNumber !== race.turn_number ||
                    driverParticipant.turn_count >= race.turn_number ||
                    driverParticipant.recovery_turns_remaining > 0
                  }
                  onClick={submitDriverMove}
                  type="button"
                >
                  Submit acceleration
                </button>
              ) : null}
              {driverHasSubmitted ? <div className="message">Acceleration locked. Waiting for the round.</div> : null}
              {driverParticipant.recovery_turns_remaining > 0 ? (
                <div className="message recovery-message">
                  Recovering for {driverParticipant.recovery_turns_remaining} more round
                  {driverParticipant.recovery_turns_remaining === 1 ? '' : 's'}. Velocity is zero.
                </div>
              ) : null}
              {driverMessage ? <div className="message">{driverMessage}</div> : null}
            </section>
          ) : null}
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
