import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const sourceDirectory = process.argv[2];
const outputPath = process.argv[3] ?? 'data/snow-ice-frames.json';
const SOURCE_YEAR = 2023;
const SOURCE_SIZE = 1024;
const SCALE = 4;
const SIZE = SOURCE_SIZE / SCALE;
const CELL_SIZE = 23684.997;
const MIN_X = -12126597;
const MIN_Y = -12126840;
const EARTH_RADIUS = 6371200;
const TRUE_SCALE_LATITUDE = 60 * Math.PI / 180;
const CENTRAL_MERIDIAN = -80 * Math.PI / 180;
const DAYS = Array.from({ length: 46 }, (_, index) => 1 + index * 8);

if (!sourceDirectory) {
  throw new Error('Pass the directory containing the 46 gzipped IMS 24 km ASCII files.');
}

function readMask(day) {
  const dayText = String(day).padStart(3, '0');
  const filePath = path.join(
    sourceDirectory,
    `ims${SOURCE_YEAR}${dayText}_00UTC_24km_v1.3.asc.gz`
  );
  const text = zlib.gunzipSync(fs.readFileSync(filePath)).toString('ascii');
  const rows = text.split(/\r?\n/).filter((line) => /^[0-4]{1024}$/.test(line));
  if (rows.length !== SOURCE_SIZE) {
    throw new Error(`Expected ${SOURCE_SIZE} data rows in ${filePath}; found ${rows.length}.`);
  }

  const downsampled = Array.from({ length: SIZE }, () => new Uint8Array(SIZE));
  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      let covered = 0;
      for (let y = 0; y < SCALE; y += 1) {
        for (let x = 0; x < SCALE; x += 1) {
          const value = rows[row * SCALE + y].charCodeAt(column * SCALE + x) - 48;
          if (value === 3 || value === 4) covered += 1;
        }
      }
      downsampled[row][column] = covered >= 5 ? 1 : 0;
    }
  }

  const smoothed = Array.from({ length: SIZE }, () => new Uint8Array(SIZE));
  for (let row = 1; row < SIZE - 1; row += 1) {
    for (let column = 1; column < SIZE - 1; column += 1) {
      let neighbors = 0;
      for (let y = -1; y <= 1; y += 1) {
        for (let x = -1; x <= 1; x += 1) neighbors += downsampled[row + y][column + x];
      }
      smoothed[row][column] = neighbors >= (downsampled[row][column] ? 4 : 6) ? 1 : 0;
    }
  }
  return smoothed;
}

function edgeKey([x, y]) {
  return `${x},${y}`;
}

function traceLoops(mask) {
  const edges = [];
  const addEdge = (start, end) => edges.push({ start, end, used: false });

  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      if (!mask[row][column]) continue;
      if (row === 0 || !mask[row - 1][column]) addEdge([column, row], [column + 1, row]);
      if (column === SIZE - 1 || !mask[row][column + 1]) {
        addEdge([column + 1, row], [column + 1, row + 1]);
      }
      if (row === SIZE - 1 || !mask[row + 1][column]) {
        addEdge([column + 1, row + 1], [column, row + 1]);
      }
      if (column === 0 || !mask[row][column - 1]) addEdge([column, row + 1], [column, row]);
    }
  }

  const outgoing = new Map();
  edges.forEach((edge, index) => {
    const key = edgeKey(edge.start);
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key).push(index);
  });

  const loops = [];
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    if (edges[edgeIndex].used) continue;
    const firstEdge = edges[edgeIndex];
    firstEdge.used = true;
    const loop = [firstEdge.start, firstEdge.end];
    let previous = firstEdge.start;
    let current = firstEdge.end;

    while (edgeKey(current) !== edgeKey(loop[0])) {
      const candidates = (outgoing.get(edgeKey(current)) ?? []).filter((index) => !edges[index].used);
      if (candidates.length === 0) break;
      const incoming = [current[0] - previous[0], current[1] - previous[1]];
      candidates.sort((leftIndex, rightIndex) => {
        const turn = (candidateIndex) => {
          const next = edges[candidateIndex].end;
          const outgoingVector = [next[0] - current[0], next[1] - current[1]];
          const cross = incoming[0] * outgoingVector[1] - incoming[1] * outgoingVector[0];
          const dot = incoming[0] * outgoingVector[0] + incoming[1] * outgoingVector[1];
          return (Math.atan2(cross, dot) + Math.PI * 2) % (Math.PI * 2);
        };
        return turn(leftIndex) - turn(rightIndex);
      });
      const nextEdge = edges[candidates[0]];
      nextEdge.used = true;
      previous = current;
      current = nextEdge.end;
      loop.push(current);
      if (loop.length > edges.length) break;
    }

    if (loop.length >= 4 && edgeKey(loop[0]) === edgeKey(loop[loop.length - 1])) loops.push(loop);
  }
  return loops;
}

function inversePolarStereographic(gridX, gridY) {
  const x = MIN_X + gridX * SCALE * CELL_SIZE;
  const y = MIN_Y + gridY * SCALE * CELL_SIZE;
  const polarDistance = Math.hypot(x, y);
  const latitude =
    Math.PI / 2 -
    2 * Math.atan(polarDistance / (EARTH_RADIUS * (1 + Math.sin(TRUE_SCALE_LATITUDE))));
  const longitude = CENTRAL_MERIDIAN + Math.atan2(x, -y);
  const radius = latitude >= 0 ? Math.cos(latitude) : 1 - Math.sin(latitude);
  return [radius * Math.cos(longitude), -radius * Math.sin(longitude)];
}

function pointLineDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy);
}

function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointLineDistance(points[index], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, splitIndex + 1), tolerance);
  const right = simplify(points.slice(splitIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function simplifyLoop(loop) {
  const points = loop.slice(0, -1).map(([x, y]) => inversePolarStereographic(x, y));
  let farthestIndex = 1;
  let farthestDistance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const distance = Math.hypot(points[index][0] - points[0][0], points[index][1] - points[0][1]);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }
  const firstHalf = simplify(points.slice(0, farthestIndex + 1), 0.0035);
  const secondHalf = simplify([...points.slice(farthestIndex), points[0]], 0.0035);
  return [...firstHalf.slice(0, -1), ...secondHalf];
}

function signedArea(points) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function framePath(day) {
  return traceLoops(readMask(day))
    .map(simplifyLoop)
    .filter((loop) => loop.length >= 4 && Math.abs(signedArea(loop)) > 0.00004)
    .map((loop) =>
      loop.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(4)} ${y.toFixed(4)}`).join(' ') + ' Z'
    )
    .join(' ');
}

const frames = DAYS.map((day) => framePath(day));
fs.writeFileSync(
  outputPath,
  JSON.stringify({
    source: 'NOAA IMS Daily Northern Hemisphere Snow and Ice Analysis, 24 km',
    sourceUrl: 'https://nsidc.org/data/g02156',
    sourceYear: SOURCE_YEAR,
    days: DAYS,
    frames
  })
);

console.log(`Wrote ${frames.length} unified snow-and-ice vector frames to ${outputPath}`);
