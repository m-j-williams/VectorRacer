'use client';

import { useMemo } from 'react';
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
  showMoveOptions?: boolean;
  previewAcceleration?: Velocity;
};

export function TrackBoard({
  track,
  participants,
  moves = [],
  activeParticipantId,
  showMoveOptions = false,
  previewAcceleration
}: TrackBoardProps) {
  const active = participants.find((participant) => participant.id === activeParticipantId);
  const activePosition = active ? { x: active.position_x, y: active.position_y } : null;
  const activeHillPush = activePosition ? hillPushAt(track, activePosition) : { x: 0, y: 0 };
  const possibleMoves =
    active && showMoveOptions
      ? getPossibleMoves(
          activePosition!,
          { x: active.velocity_x, y: active.velocity_y },
          activeHillPush
        ).filter((move) => isPointOnTrack(track, move.position))
      : [];
  const previewMove =
    active && previewAcceleration
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
        <LatticeRegion points={finishRegionPoints} fill="#79bdb7" mapPoint={geometry.map} />
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
          const from = geometry.map({ x: move.from_x, y: move.from_y });
          const to = geometry.map({ x: move.to_x, y: move.to_y });
          return (
            <line
              key={move.id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={participant.color}
              strokeDasharray={move.valid ? undefined : '0.18 0.12'}
              strokeLinecap="round"
              strokeWidth="0.12"
            />
          );
        })}

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
          const position = geometry.map({ x: participant.position_x, y: participant.position_y });
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
