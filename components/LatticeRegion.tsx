'use client';

import { useMemo } from 'react';
import { getCenterFillPolygon, pointKey, type Point } from '@/lib/game';

type LatticeRegionProps = {
  points: Point[];
  fill: string;
  mapPoint: (point: Point) => Point;
};

export function LatticeRegion({ points, fill, mapPoint }: LatticeRegionProps) {
  const fillPolygons = useMemo(() => {
    if (points.length === 0) return [];
    const selected = new Set(points.map(pointKey));
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const polygons: Point[][] = [];

    for (let x = Math.min(...xs) - 1; x <= Math.max(...xs); x += 1) {
      for (let y = Math.min(...ys) - 1; y <= Math.max(...ys); y += 1) {
        const polygon = getCenterFillPolygon(selected, x, y);
        if (polygon) polygons.push(polygon);
      }
    }
    return polygons;
  }, [points]);

  const polygonPoints = (polygon: Point[]) =>
    polygon
      .map(mapPoint)
      .map((point) => `${point.x},${point.y}`)
      .join(' ');

  return (
    <g>
      {points.map((point) => (
        <polygon
          key={`diamond:${pointKey(point)}`}
          points={polygonPoints([
            { x: point.x - 0.5, y: point.y },
            { x: point.x, y: point.y + 0.5 },
            { x: point.x + 0.5, y: point.y },
            { x: point.x, y: point.y - 0.5 }
          ])}
          fill={fill}
        />
      ))}
      {fillPolygons.map((polygon, index) => (
        <polygon key={`fill:${index}`} points={polygonPoints(polygon)} fill={fill} />
      ))}
    </g>
  );
}
