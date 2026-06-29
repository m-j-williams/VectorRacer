'use client';

import { useState } from 'react';
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
  Download,
  Plus,
  RotateCcw,
  Upload
} from 'lucide-react';
import { TrackBoard } from '@/components/TrackBoard';
import { parseCourseCsv } from '@/lib/course-csv';
import { getInstructorKey } from '@/lib/instructor-key';
import { readJsonResponse } from '@/lib/http';
import {
  applyAcceleration,
  colorForIndex,
  crossesCheckpoint,
  crossesFinish,
  finishFraction,
  firstTrackExit,
  hillPushAt,
  isLegalAcceleration,
  nearestTrackPoint,
  recoveryTurnsForVelocity,
  segmentStaysOnTrack,
  type MoveState,
  type ParticipantState,
  type TrackConfig,
  type Velocity
} from '@/lib/game';

const testDriverId = 'test-driver';

const accelButtons = [
  { axis: 'y', value: 1, icon: ChevronUp, doubleIcon: ChevronsUp, label: 'Up', className: 'accel-up' },
  { axis: 'x', value: -1, icon: ChevronLeft, doubleIcon: ChevronsLeft, label: 'Left', className: 'accel-left' },
  { axis: 'x', value: 1, icon: ChevronRight, doubleIcon: ChevronsRight, label: 'Right', className: 'accel-right' },
  { axis: 'y', value: -1, icon: ChevronDown, doubleIcon: ChevronsDown, label: 'Down', className: 'accel-down' }
] as const;

type TestDriveState = {
  participant: ParticipantState;
  moves: MoveState[];
  draftAcceleration: Velocity;
  message: string;
};

function createTestDriveState(track: TrackConfig): TestDriveState {
  return {
    participant: {
      id: testDriverId,
      display_name: 'Test',
      color: colorForIndex(0),
      position_x: track.start.x,
      position_y: track.start.y,
      velocity_x: 0,
      velocity_y: 0,
      turn_count: 0,
      recovery_turns_remaining: 0,
      checkpoint_crossed: false,
      finish_turns: null,
      status: 'racing'
    },
    moves: [],
    draftAcceleration: { x: 0, y: 0 },
    message: 'Use the controls to test the course before starting a real race.'
  };
}

export function InstructorDashboard() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [course, setCourse] = useState<TrackConfig | null>(null);
  const [courseName, setCourseName] = useState('');
  const [testDrive, setTestDrive] = useState<TestDriveState | null>(null);

  async function startRace() {
    if (!course) {
      setMessage('Upload a valid course CSV before starting the race.');
      return;
    }
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/races', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructorKey: getInstructorKey(), trackConfig: course })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.code) {
        setMessage(payload.error || 'Unable to start race.');
        return;
      }

      window.location.href = `/tools/vector-racer/instructor/race/${payload.code}`;
    } catch {
      setMessage('Unable to reach the race server. Check that the dev server is running.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadCourse(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      loadCourse(await file.text(), file.name);
    } catch (error) {
      setCourse(null);
      setCourseName('');
      setTestDrive(null);
      setMessage(error instanceof Error ? error.message : 'Unable to read the course CSV.');
    }
  }

  function loadCourse(csv: string, name: string) {
    const parsedCourse = parseCourseCsv(csv);
    setCourse(parsedCourse);
    setCourseName(name);
    setTestDrive(createTestDriveState(parsedCourse));
    setMessage('');
  }

  async function loadExampleCourse() {
    try {
      const response = await fetch('/course-example.csv');
      loadCourse(await response.text(), 'course-example.csv');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load the example course.');
    }
  }

  function resetTestDrive() {
    if (!course) return;
    setTestDrive(createTestDriveState(course));
  }

  function selectTestAcceleration(acceleration: Velocity) {
    if (!testDrive || testDrive.participant.status !== 'racing') return;
    if (testDrive.participant.recovery_turns_remaining > 0) return;
    if (!isLegalAcceleration(acceleration)) return;
    setTestDrive((current) => (current ? { ...current, draftAcceleration: acceleration } : current));
  }

  function toggleTestAcceleration(axis: 'x' | 'y', value: -1 | 1) {
    if (!testDrive) return;
    const current = testDrive.draftAcceleration;
    const currentAxis = current[axis];
    const otherAxis = axis === 'x' ? 'y' : 'x';

    if (Math.sign(currentAxis) === value && Math.abs(currentAxis) === 1) {
      selectTestAcceleration({ x: 0, y: 0, [axis]: value * 2 });
      return;
    }
    if (Math.sign(currentAxis) === value && Math.abs(currentAxis) === 2) {
      selectTestAcceleration({ ...current, [axis]: 0 });
      return;
    }

    const otherValue = current[otherAxis];
    selectTestAcceleration({
      ...current,
      [axis]: value,
      [otherAxis]: Math.abs(otherValue) === 2 ? Math.sign(otherValue) : otherValue
    });
  }

  function applyTestMove() {
    if (!course || !testDrive) return;

    const participant = testDrive.participant;
    if (participant.status === 'finished') return;

    if (participant.recovery_turns_remaining > 0) {
      setTestDrive((current) => {
        if (!current) return current;
        const remaining = Math.max(0, current.participant.recovery_turns_remaining - 1);
        return {
          ...current,
          participant: {
            ...current.participant,
            turn_count: current.participant.turn_count + 1,
            recovery_turns_remaining: remaining
          },
          draftAcceleration: { x: 0, y: 0 },
          message:
            remaining > 0
              ? `Recovering for ${remaining} more turn${remaining === 1 ? '' : 's'}.`
              : 'Recovered. Choose an acceleration for the next turn.'
        };
      });
      return;
    }

    const from = { x: participant.position_x, y: participant.position_y };
    const velocity = { x: participant.velocity_x, y: participant.velocity_y };
    const hillPush = hillPushAt(course, from);
    const acceleration = {
      x: testDrive.draftAcceleration.x + hillPush.x,
      y: testDrive.draftAcceleration.y + hillPush.y
    };
    const result = applyAcceleration(from, velocity, acceleration);
    const valid = segmentStaysOnTrack(course, from, result.position);
    const move: MoveState = {
      id: `test:${testDrive.moves.length + 1}`,
      participant_id: testDriverId,
      turn_index: participant.turn_count,
      from_x: from.x,
      from_y: from.y,
      to_x: result.position.x,
      to_y: result.position.y,
      valid
    };

    if (!valid) {
      const exitPoint = firstTrackExit(course, from, result.position);
      const resetPoint = nearestTrackPoint(course, exitPoint);
      const recoveryTurns = recoveryTurnsForVelocity(result.velocity);
      setTestDrive({
        ...testDrive,
        participant: {
          ...participant,
          position_x: resetPoint.x,
          position_y: resetPoint.y,
          velocity_x: 0,
          velocity_y: 0,
          turn_count: participant.turn_count + 1,
          recovery_turns_remaining: recoveryTurns,
          checkpoint_crossed: participant.checkpoint_crossed,
          finish_turns: participant.finish_turns
        },
        moves: [...testDrive.moves, move],
        draftAcceleration: { x: 0, y: 0 },
        message:
          recoveryTurns > 0
            ? `Wall hit. Reset to (${resetPoint.x}, ${resetPoint.y}) with ${recoveryTurns} recovery turn${recoveryTurns === 1 ? '' : 's'}.`
            : `Wall hit. Reset to (${resetPoint.x}, ${resetPoint.y}) with zero velocity.`
      });
      return;
    }

    const checkpointCrossed = participant.checkpoint_crossed || crossesCheckpoint(course, from, result.position);
    const finished = checkpointCrossed && crossesFinish(course, from, result.position, participant.turn_count + 1);
    const finishSegmentFraction = finished
      ? finishFraction(course, from, result.position, participant.turn_count + 1)
      : null;
    setTestDrive({
      ...testDrive,
      participant: {
        ...participant,
        position_x: result.position.x,
        position_y: result.position.y,
        velocity_x: result.velocity.x,
        velocity_y: result.velocity.y,
        turn_count: participant.turn_count + 1,
        checkpoint_crossed: checkpointCrossed,
        finish_turns: finishSegmentFraction === null ? null : participant.turn_count + finishSegmentFraction,
        status: finished ? 'finished' : 'racing'
      },
      moves: [...testDrive.moves, move],
      draftAcceleration: { x: 0, y: 0 },
      message: finished
        ? 'Finished. Reset the test drive to try another route.'
        : checkpointCrossed && !participant.checkpoint_crossed && course.checkpoint
          ? 'Checkpoint crossed. The finish line is now active.'
          : 'Move applied.'
    });
  }

  const testHillPush =
    course && testDrive
      ? hillPushAt(course, {
          x: testDrive.participant.position_x,
          y: testDrive.participant.position_y
        })
      : { x: 0, y: 0 };
  const hasTestHillPush = testHillPush.x !== 0 || testHillPush.y !== 0;

  return (
    <div className="stack">
      <section className="band stack">
        <div>
          <h1>Instructor Dashboard</h1>
          <p className="lead">Upload a lattice course, start a race, and share the short code.</p>
        </div>
        <div className="row">
          <label className="label" htmlFor="course-file">
            Course CSV
          </label>
          <label className="button secondary" htmlFor="course-file">
            <Upload size={18} />
            Choose CSV
          </label>
          <a className="button secondary" download href="/course-example.csv">
            <Download size={18} />
            Download example
          </a>
          <button className="button secondary" onClick={loadExampleCourse} type="button">
            Load example
          </button>
          <input
            accept=".csv,text/csv"
            id="course-file"
            onChange={uploadCourse}
            style={{ display: 'none' }}
            type="file"
          />
        </div>
        {course ? (
          <div className="stack">
            <div className="row">
              <strong>{courseName}</strong>
              <span className="muted">{course.points.length} in-bounds points</span>
              {(course.hills?.length || 0) > 0 ? (
                <span className="muted">{course.hills?.length} hill points</span>
              ) : null}
              {(course.regions?.length || 0) > 0 ? (
                <span className="muted">{course.regions?.length} colored regions</span>
              ) : null}
              {(course.obstacles?.length || 0) > 0 ? (
                <span className="muted">{course.obstacles?.length} obstacle regions</span>
              ) : null}
            </div>
            <TrackBoard
              track={course}
              participants={testDrive ? [testDrive.participant] : []}
              moves={testDrive?.moves || []}
              activeParticipantId={testDrive?.participant.status === 'racing' ? testDriverId : undefined}
              previewAcceleration={
                testDrive?.participant.status === 'racing' && testDrive.participant.recovery_turns_remaining === 0
                  ? testDrive.draftAcceleration
                  : undefined
              }
              showMoveOptions={
                testDrive?.participant.status === 'racing' && testDrive.participant.recovery_turns_remaining === 0
              }
            />
            {testDrive ? (
              <div className="test-drive stack">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2>Test race</h2>
                  <button className="button secondary" onClick={resetTestDrive} type="button">
                    <RotateCcw size={18} />
                    Reset test
                  </button>
                </div>
                <div className="stat-grid">
                  <div className="stat">
                    <span className="muted">Position</span>
                    <strong>
                      ({testDrive.participant.position_x}, {testDrive.participant.position_y})
                    </strong>
                  </div>
                  <div className="stat">
                    <span className="muted">Velocity</span>
                    <strong>
                      ({testDrive.participant.velocity_x}, {testDrive.participant.velocity_y})
                    </strong>
                  </div>
                  <div className="stat">
                    <span className="muted">Turns</span>
                    <strong>{testDrive.participant.turn_count}</strong>
                  </div>
                </div>
                <div className="row">
                  <div className="accel-grid">
                    {accelButtons.map(({ axis, value, icon: Icon, doubleIcon: DoubleIcon, label, className }) => {
                      const amount = testDrive.draftAcceleration[axis];
                      const selected = Math.sign(amount) === value;
                      const DisplayIcon = selected && Math.abs(amount) === 2 ? DoubleIcon : Icon;
                      return (
                        <button
                          aria-label={label}
                          aria-pressed={selected}
                          className={`button secondary cardinal-control ${className} ${selected ? 'selected' : ''}`}
                          disabled={
                            testDrive.participant.status !== 'racing' ||
                            testDrive.participant.recovery_turns_remaining > 0
                          }
                          key={`${axis}:${value}`}
                          onClick={() => toggleTestAcceleration(axis, value)}
                          title={`${label} acceleration`}
                          type="button"
                        >
                          <DisplayIcon aria-hidden="true" size={30} strokeWidth={3} />
                        </button>
                      );
                    })}
                    <button
                      aria-label="Zero acceleration"
                      aria-pressed={testDrive.draftAcceleration.x === 0 && testDrive.draftAcceleration.y === 0}
                      className={`button secondary cardinal-control accel-zero ${
                        testDrive.draftAcceleration.x === 0 && testDrive.draftAcceleration.y === 0 ? 'selected' : ''
                      }`}
                      disabled={
                        testDrive.participant.status !== 'racing' ||
                        testDrive.participant.recovery_turns_remaining > 0
                      }
                      onClick={() => selectTestAcceleration({ x: 0, y: 0 })}
                      title="Zero acceleration"
                      type="button"
                    >
                      <Circle aria-hidden="true" size={24} strokeWidth={2.5} />
                    </button>
                  </div>
                  <div className="stack test-drive-actions">
                    <button
                      className="button"
                      disabled={testDrive.participant.status === 'finished'}
                      onClick={applyTestMove}
                      type="button"
                    >
                      {testDrive.participant.recovery_turns_remaining > 0 ? 'Apply recovery turn' : 'Apply test move'}
                    </button>
                    <span className="muted">
                      Selected acceleration: ({testDrive.draftAcceleration.x}, {testDrive.draftAcceleration.y})
                    </span>
                    {hasTestHillPush ? (
                      <span className="muted">
                        Hill push: ({testHillPush.x}, {testHillPush.y})
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="message">{testDrive.message}</div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="row">
          <button className="button" disabled={busy || !course} onClick={startRace} type="button">
            <Plus size={18} />
            Start new race
          </button>
        </div>
        {message ? <div className="message error">{message}</div> : null}
      </section>
    </div>
  );
}
