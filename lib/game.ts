export type Point = { x: number; y: number };
export type Velocity = { x: number; y: number };
export type HillPoint = Point & { push: Velocity };

export type TrackConfig = {
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  points: Point[];
  start: Point;
  finish: [Point, Point];
  hills?: HillPoint[];
};

export type RaceState = {
  id: string;
  code: string;
  status: 'lobby' | 'running' | 'finished';
  track_config: TrackConfig;
  participants: ParticipantState[];
  moves: MoveState[];
  turn_number: number;
  turn_duration_seconds: number;
  turn_deadline: string | null;
  paused_turn_seconds: number | null;
  started_at: string | null;
  turn_resolving: boolean;
  submitted_participant_ids: string[];
};

export type MoveState = {
  id: string;
  participant_id: string;
  turn_index: number;
  from_x: number;
  from_y: number;
  to_x: number;
  to_y: number;
  valid: boolean;
};

export type ParticipantState = {
  id: string;
  display_name: string;
  color: string;
  position_x: number;
  position_y: number;
  velocity_x: number;
  velocity_y: number;
  turn_count: number;
  recovery_turns_remaining: number;
  status: 'racing' | 'crashed' | 'finished';
};

export const PLAYER_COLORS = [
  '#e11d48',
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#4f46e5'
];

export function pointKey(point: Point) {
  return `${point.x},${point.y}`;
}

export function latticeSegmentPoints(a: Point, b: Point) {
  const deltaX = b.x - a.x;
  const deltaY = b.y - a.y;
  const gcd = (left: number, right: number): number => (right === 0 ? Math.abs(left) : gcd(right, left % right));
  const steps = gcd(deltaX, deltaY);
  if (steps === 0) return [a];
  return Array.from({ length: steps + 1 }, (_, index) => ({
    x: a.x + (deltaX / steps) * index,
    y: a.y + (deltaY / steps) * index
  }));
}

export function createRaceCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i += 1) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

export function validateTrackConfig(value: unknown): value is TrackConfig {
  if (!value || typeof value !== 'object') return false;
  const track = value as Partial<TrackConfig>;
  const bounds = track.bounds;
  if (
    !bounds ||
    !isFiniteInteger(bounds.minX) ||
    !isFiniteInteger(bounds.maxX) ||
    !isFiniteInteger(bounds.minY) ||
    !isFiniteInteger(bounds.maxY) ||
    bounds.minX >= bounds.maxX ||
    bounds.minY >= bounds.maxY
  ) {
    return false;
  }

  if (!Array.isArray(track.points) || track.points.length === 0) return false;
  if (!track.points.every((point) => isFiniteInteger(point?.x) && isFiniteInteger(point?.y))) return false;
  if (!track.start || !isFiniteInteger(track.start.x) || !isFiniteInteger(track.start.y)) return false;
  if (
    track.hills !== undefined &&
    (!Array.isArray(track.hills) ||
      !track.hills.every(
        (hill) =>
          isFiniteInteger(hill?.x) &&
          isFiniteInteger(hill?.y) &&
          isFiniteInteger(hill?.push?.x) &&
          isFiniteInteger(hill?.push?.y) &&
          Math.abs(hill.push.x) <= 3 &&
          Math.abs(hill.push.y) <= 3 &&
          (hill.push.x !== 0 || hill.push.y !== 0)
      ))
  ) {
    return false;
  }
  if (
    !Array.isArray(track.finish) ||
    track.finish.length !== 2 ||
    !track.finish.every((point) => isFiniteInteger(point?.x) && isFiniteInteger(point?.y))
  ) {
    return false;
  }

  const selected = new Set(track.points.map(pointKey));
  return (
    selected.has(pointKey(track.start)) &&
    track.finish.every((point) => selected.has(pointKey(point))) &&
    (track.hills || []).every((hill) => selected.has(pointKey(hill)))
  );
}

export function hillPushAt(track: TrackConfig, point: Point): Velocity {
  const hill = (track.hills || []).find((candidate) => candidate.x === point.x && candidate.y === point.y);
  return hill?.push || { x: 0, y: 0 };
}

export type FillPolygon = Point[];

export function getCenterFillPolygon(selected: Set<string>, x: number, y: number): FillPolygon | null {
  const bl = selected.has(`${x},${y}`);
  const br = selected.has(`${x + 1},${y}`);
  const tr = selected.has(`${x + 1},${y + 1}`);
  const tl = selected.has(`${x},${y + 1}`);
  const count = [bl, br, tr, tl].filter(Boolean).length;
  const bottom = { x: x + 0.5, y };
  const right = { x: x + 1, y: y + 0.5 };
  const top = { x: x + 0.5, y: y + 1 };
  const left = { x, y: y + 0.5 };
  const center = { x: x + 0.5, y: y + 0.5 };

  if (count >= 3 || (bl && tr) || (br && tl)) return [bottom, right, top, left];
  if (count <= 1) return null;
  if (bl && br) return [left, bottom, right, center];
  if (br && tr) return [bottom, right, top, center];
  if (tr && tl) return [right, top, left, center];
  if (tl && bl) return [top, left, bottom, center];
  return null;
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isPointOnTrack(track: TrackConfig, point: Point) {
  const selected = new Set(track.points.map(pointKey));
  const nearestX = Math.round(point.x);
  const nearestY = Math.round(point.y);

  for (let x = nearestX - 1; x <= nearestX + 1; x += 1) {
    for (let y = nearestY - 1; y <= nearestY + 1; y += 1) {
      if (selected.has(`${x},${y}`) && Math.abs(point.x - x) + Math.abs(point.y - y) <= 0.500001) {
        return true;
      }
    }
  }

  const cellX = Math.floor(point.x);
  const cellY = Math.floor(point.y);
  for (let x = cellX - 1; x <= cellX + 1; x += 1) {
    for (let y = cellY - 1; y <= cellY + 1; y += 1) {
      const polygon = getCenterFillPolygon(selected, x, y);
      if (polygon && pointInPolygon(point, polygon)) return true;
    }
  }
  return false;
}

export function segmentStaysOnTrack(track: TrackConfig, from: Point, to: Point) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1) * 48;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (
      !isPointOnTrack(track, {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t
      })
    ) {
      return false;
    }
  }
  return true;
}

export function firstTrackExit(track: TrackConfig, from: Point, to: Point) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1) * 96;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t
    };
    if (!isPointOnTrack(track, point)) return point;
  }
  return to;
}

export function nearestTrackPoint(track: TrackConfig, point: Point) {
  return track.points.reduce((nearest, candidate) => {
    const candidateDistance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    const nearestDistance = (nearest.x - point.x) ** 2 + (nearest.y - point.y) ** 2;
    return candidateDistance < nearestDistance ? candidate : nearest;
  });
}

export function recoveryTurnsForVelocity(velocity: Velocity) {
  return Math.max(0, Math.floor(Math.hypot(velocity.x, velocity.y)) - 1);
}

export function applyAcceleration(position: Point, velocity: Velocity, acceleration: Velocity) {
  const nextVelocity = {
    x: velocity.x + acceleration.x,
    y: velocity.y + acceleration.y
  };
  return {
    velocity: nextVelocity,
    position: {
      x: position.x + nextVelocity.x,
      y: position.y + nextVelocity.y
    }
  };
}

export function isLegalAcceleration(acceleration: Velocity) {
  return (
    Number.isInteger(acceleration.x) &&
    Number.isInteger(acceleration.y) &&
    acceleration.x >= -2 &&
    acceleration.x <= 2 &&
    acceleration.y >= -2 &&
    acceleration.y <= 2 &&
    Math.abs(acceleration.x) + Math.abs(acceleration.y) <= 2
  );
}

function sideOfLine(a: Point, b: Point, point: Point) {
  return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const abC = sideOfLine(a, b, c);
  const abD = sideOfLine(a, b, d);
  const cdA = sideOfLine(c, d, a);
  const cdB = sideOfLine(c, d, b);
  const overlaps =
    Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
    Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
  return overlaps && abC * abD <= 0 && cdA * cdB <= 0;
}

export function crossesFinish(track: TrackConfig, from: Point, to: Point, turnCount: number) {
  if (turnCount < 2) return false;
  const [finishA, finishB] = track.finish;
  if (!segmentsIntersect(from, to, finishA, finishB)) return false;

  const startSide = Math.sign(sideOfLine(finishA, finishB, track.start));
  const fromSide = Math.sign(sideOfLine(finishA, finishB, from));
  const toSide = Math.sign(sideOfLine(finishA, finishB, to));
  const finishSide = startSide || 1;
  return fromSide === -finishSide && (toSide === finishSide || toSide === 0);
}

export function getPossibleMoves(position: Point, velocity: Velocity, baseAcceleration: Velocity = { x: 0, y: 0 }) {
  const moves: { acceleration: Velocity; velocity: Velocity; position: Point }[] = [];
  for (let ay = -2; ay <= 2; ay += 1) {
    for (let ax = -2; ax <= 2; ax += 1) {
      if (Math.abs(ax) + Math.abs(ay) > 2) continue;
      const result = applyAcceleration(position, velocity, {
        x: ax + baseAcceleration.x,
        y: ay + baseAcceleration.y
      });
      moves.push({ acceleration: { x: ax, y: ay }, ...result });
    }
  }
  return moves;
}

export function colorForIndex(index: number) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}
