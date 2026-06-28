'use client';

import type { ReactNode } from 'react';
import { LatticeRegion } from '@/components/LatticeRegion';
import type { HillPoint, Point } from '@/lib/game';

type HillOverlayProps = {
  hills: HillPoint[];
  mapPoint: (point: Point) => Point;
};

const arrowWidth = 0.1;
const arrowDepth = 0.17;
const arrowHeight = 0.1;
const arrowSpacing = 0.1;

function Arrowheads({ hill, mapPoint }: { hill: HillPoint; mapPoint: (point: Point) => Point }) {
  const center = mapPoint(hill);
  const arrows: ReactNode[] = [];

  const addArrows = (direction: 'up' | 'down' | 'left' | 'right', count: number) => {
    for (let index = 0; index < count; index += 1) {
      const offset = index * arrowSpacing;
      const pointsByDirection = {
        up: [
          { x: center.x - arrowWidth, y: center.y - arrowDepth - offset },
          { x: center.x, y: center.y - arrowDepth - arrowHeight - offset },
          { x: center.x + arrowWidth, y: center.y - arrowDepth - offset }
        ],
        right: [
          { x: center.x + arrowDepth + offset, y: center.y - arrowWidth },
          { x: center.x + arrowDepth + arrowHeight + offset, y: center.y },
          { x: center.x + arrowDepth + offset, y: center.y + arrowWidth }
        ],
        down: [
          { x: center.x - arrowWidth, y: center.y + arrowDepth + offset },
          { x: center.x, y: center.y + arrowDepth + arrowHeight + offset },
          { x: center.x + arrowWidth, y: center.y + arrowDepth + offset }
        ],
        left: [
          { x: center.x - arrowDepth - offset, y: center.y - arrowWidth },
          { x: center.x - arrowDepth - arrowHeight - offset, y: center.y },
          { x: center.x - arrowDepth - offset, y: center.y + arrowWidth }
        ]
      };
      const points = pointsByDirection[direction].map((point) => `${point.x},${point.y}`).join(' ');
      arrows.push(
        <polyline
          fill="none"
          key={`${direction}:${index}`}
          points={points}
          stroke="#172033"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="0.075"
        />
      );
    }
  };

  if (hill.push.y > 0) addArrows('up', hill.push.y);
  if (hill.push.y < 0) addArrows('down', Math.abs(hill.push.y));
  if (hill.push.x > 0) addArrows('right', hill.push.x);
  if (hill.push.x < 0) addArrows('left', Math.abs(hill.push.x));
  return <>{arrows}</>;
}

export function HillOverlay({ hills, mapPoint }: HillOverlayProps) {
  if (hills.length === 0) return null;
  const hillGroups = new Map<string, HillPoint[]>();
  for (const hill of hills) {
    const color = hill.color || '#ef4444';
    hillGroups.set(color, [...(hillGroups.get(color) || []), hill]);
  }

  return (
    <g>
      {[...hillGroups.entries()].map(([color, group]) => (
        <LatticeRegion key={color} points={group} fill={color} mapPoint={mapPoint} opacity={0.24} />
      ))}
      {hills.map((hill) => (
        <Arrowheads hill={hill} key={`${hill.x},${hill.y}`} mapPoint={mapPoint} />
      ))}
    </g>
  );
}
