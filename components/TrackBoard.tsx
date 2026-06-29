'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LatticeRegion } from '@/components/LatticeRegion';
import { HillOverlay } from '@/components/HillOverlay';
import {
  applyAcceleration,
  getPossibleMoves,
  hillPushAt,
  isPointOnTrack,
  latticeSegmentPoints,
  pointKey,
  type MoveState,
  type ParticipantState,
  type Point,
  type TrackConfig,
  type Velocity
} from '@/lib/game';

type TrackBoardProps = {
  track: TrackConfig;
  participants: ParticipantState[];
  moves?: MoveState[];
  activeParticipantId?: string;
  showCurrentVelocity?: boolean;
  showMoveOptions?: boolean;
  previewAcceleration?: Velocity;
};

export function TrackBoard({
  track,
  participants,
  moves = [],
  activeParticipantId,
  showCurrentVelocity = false,
  showMoveOptions = false,
  previewAcceleration
}: TrackBoardProps) {
  const seenMoveIds = useRef(new Set<string>());
  const movesInitialized = useRef(false);
  const animationTimeouts = useRef<number[]>([]);
  const [animatingMoveIds, setAnimatingMoveIds] = useState<Set<string>>(new Set());

  useLayoutEffect(() => {
    if (!movesInitialized.current) {
      seenMoveIds.current = new Set(moves.map((move) => move.id));
      movesInitialized.current = true;
      return;
    }

    const newMoveIds = moves
      .filter((move) => !seenMoveIds.current.has(move.id))
      .map((move) => move.id);
    if (newMoveIds.length === 0) return;

    for (const moveId of newMoveIds) seenMoveIds.current.add(moveId);
    setAnimatingMoveIds((current) => new Set([...current, ...newMoveIds]));
    const timeout = window.setTimeout(() => {
      setAnimatingMoveIds((current) => {
        const next = new Set(current);
        for (const moveId of newMoveIds) next.delete(moveId);
        return next;
      });
    }, 900);
    animationTimeouts.current.push(timeout);
  }, [moves]);

  useEffect(
    () => () => {
      for (const timeout of animationTimeouts.current) window.clearTimeout(timeout);
    },
    []
  );

  const isAnimatingRound = animatingMoveIds.size > 0;
  const animatingMovesByParticipant = useMemo(() => {
    const result = new Map<string, MoveState>();
    for (const move of moves) {
      if (animatingMoveIds.has(move.id)) result.set(move.participant_id, move);
    }
    return result;
  }, [animatingMoveIds, moves]);
  const active = participants.find((participant) => participant.id === activeParticipantId);
  const activePosition = active ? { x: active.position_x, y: active.position_y } : null;
  const activeHillPush = activePosition ? hillPushAt(track, activePosition) : { x: 0, y: 0 };
  const currentVelocityMove =
    active && showCurrentVelocity && !isAnimatingRound
      ? applyAcceleration(
          activePosition!,
          { x: active.velocity_x, y: active.velocity_y },
          activeHillPush
        )
      : null;
  const possibleMoves =
    active && showMoveOptions && !isAnimatingRound
      ? getPossibleMoves(
          activePosition!,
          { x: active.velocity_x, y: active.velocity_y },
          activeHillPush
        ).filter((move) => isPointOnTrack(track, move.position))
      : [];
  const previewMove =
    active && previewAcceleration && !isAnimatingRound
      ? applyAcceleration(
          activePosition!,
          { x: active.velocity_x, y: active.velocity_y },
          {
            x: previewAcceleration.x + activeHillPush.x,
            y: previewAcceleration.y + activeHillPush.y
          }
        )
      : null;
  const finishRegionPoints = useMemo(
    () => latticeSegmentPoints(track.finish[0], track.finish[1]),
    [track.finish]
  );

  const geometry = useMemo(() => {
    const padding = 1;
    const width = track.bounds.maxX - track.bounds.minX + padding * 2;
    const height = track.bounds.maxY - track.bounds.minY + padding * 2;
    const lattice: Point[] = [];

    for (let x = track.bounds.minX; x <= track.bounds.maxX; x += 1) {
      for (let y = track.bounds.minY; y <= track.bounds.maxY; y += 1) {
        lattice.push({ x, y });
      }
    }

    return {
      width,
      height,
      lattice,
      map(point: Point) {
        return {
          x: point.x - track.bounds.minX + padding,
          y: track.bounds.maxY - point.y + padding
        };
      }
    };
  }, [track]);

  return (
    <div className="track-wrap">
      <svg className="track-svg" viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img">
        <rect width={geometry.width} height={geometry.height} fill="#ffffff" />

        <LatticeRegion points={track.points} fill="#d5d8dc" mapPoint={geometry.map} />
        {(track.regions || []).map((region) => (
          <LatticeRegion
            fill={region.color}
            key={region.id}
            mapPoint={geometry.map}
            opacity={0.48}
            points={region.points}
          />
        ))}
        {(track.obstacles || []).map((obstacle) => (
          <LatticeRegion
            fill={obstacle.color}
            key={`obstacle:${obstacle.id}`}
            mapPoint={geometry.map}
            opacity={0.68}
            points={obstacle.points}
          />
        ))}
        <LatticeRegion points={finishRegionPoints} fill="#fde68a" mapPoint={geometry.map} />
        <HillOverlay hills={track.hills || []} mapPoint={geometry.map} />

        {geometry.lattice.map((point) => {
          const mapped = geometry.map(point);
          return <circle key={`lattice:${pointKey(point)}`} cx={mapped.x} cy={mapped.y} r="0.065" fill="#a8adb5" />;
        })}

        {track.points.map((point) => {
          const mapped = geometry.map(point);
          return <circle key={`selected:${pointKey(point)}`} cx={mapped.x} cy={mapped.y} r="0.08" fill="#343a40" />;
        })}

        {(() => {
          const start = geometry.map(track.start);
          return <circle cx={start.x} cy={start.y} r="0.24" fill="none" stroke="#0f766e" strokeWidth="0.09" />;
        })()}

        {moves.map((move) => {
          const participant = participants.find((item) => item.id === move.participant_id);
          if (!participant) return null;
          const animating = animatingMoveIds.has(move.id);
          const isActiveParticipant = move.participant_id === activeParticipantId;
          const from = geometry.map({ x: move.from_x, y: move.from_y });
          const to = geometry.map({ x: move.to_x, y: move.to_y });
          return (
            <line
              className={animating ? 'move-path move-path-animating' : 'move-path'}
              key={move.id}
              pathLength="1"
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={participant.color}
              strokeDasharray={animating || move.valid ? undefined : '0.18 0.12'}
              strokeLinecap="round"
              strokeWidth={isActiveParticipant ? 0.18 : 0.12}
            />
          );
        })}

        {moves.map((move) => {
          if (!move.valid) return null;
          const participant = participants.find((item) => item.id === move.participant_id);
          if (!participant) return null;
          const isActiveParticipant = move.participant_id === activeParticipantId;
          const stop = geometry.map({ x: move.to_x, y: move.to_y });
          return (
            <circle
              className={animatingMoveIds.has(move.id) ? 'stop-dot stop-dot-animating' : 'stop-dot'}
              key={`stop:${move.id}`}
              cx={stop.x}
              cy={stop.y}
              r={isActiveParticipant ? 0.2 : 0.15}
              fill={participant.color}
              stroke="white"
              strokeWidth={isActiveParticipant ? 0.05 : 0.04}
            />
          );
        })}

        {active && currentVelocityMove ? (
          <g opacity="0.62">
            <line
              x1={geometry.map(activePosition!).x}
              y1={geometry.map(activePosition!).y}
              x2={geometry.map(currentVelocityMove.position).x}
              y2={geometry.map(currentVelocityMove.position).y}
              stroke="#334155"
              strokeLinecap="round"
              strokeWidth="0.12"
            />
            <circle
              cx={geometry.map(currentVelocityMove.position).x}
              cy={geometry.map(currentVelocityMove.position).y}
              r="0.18"
              fill="white"
              stroke="#334155"
              strokeWidth="0.08"
            />
          </g>
        ) : null}

        {possibleMoves.map((move) => {
          const mapped = geometry.map(move.position);
          return (
            <circle
              key={`${move.acceleration.x}:${move.acceleration.y}`}
              cx={mapped.x}
              cy={mapped.y}
              r="0.18"
              fill="#0f766e"
              opacity="0.5"
            />
          );
        })}

        {active && previewMove ? (
          <g opacity="0.5">
            <line
              x1={geometry.map({ x: active.position_x, y: active.position_y }).x}
              y1={geometry.map({ x: active.position_x, y: active.position_y }).y}
              x2={geometry.map(previewMove.position).x}
              y2={geometry.map(previewMove.position).y}
              stroke={active.color}
              strokeDasharray="0.16 0.12"
              strokeLinecap="round"
              strokeWidth="0.15"
            />
            <circle
              cx={geometry.map(previewMove.position).x}
              cy={geometry.map(previewMove.position).y}
              r="0.25"
              fill={active.color}
            />
          </g>
        ) : null}

        {participants.map((participant) => {
          const animatingMove = animatingMovesByParticipant.get(participant.id);
          const position = geometry.map(
            animatingMove
              ? { x: animatingMove.from_x, y: animatingMove.from_y }
              : { x: participant.position_x, y: participant.position_y }
          );
          return (
            <g key={participant.id}>
              <circle
                cx={position.x}
                cy={position.y}
                r={participant.id === activeParticipantId ? 0.28 : 0.22}
                fill={participant.color}
                stroke="white"
                strokeWidth="0.08"
              />
              <text
                x={position.x + 0.32}
                y={position.y - 0.22}
                fontSize="0.48"
                fontWeight="700"
                fill="#172033"
              >
                {participant.display_name.slice(0, 10)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
