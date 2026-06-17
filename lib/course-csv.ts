import { pointKey, validateTrackConfig, type Point, type TrackConfig } from '@/lib/game';

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

export function parseCourseCsv(csv: string): TrackConfig {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new Error('The CSV must include a header and at least one point.');

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const required = ['x', 'y', 'start', 'finish'];
  for (const header of required) {
    if (!headers.includes(header)) throw new Error(`Missing required column: ${header}`);
  }
  const hasHillX = headers.includes('hill_x');
  const hasHillY = headers.includes('hill_y');
  if (hasHillX !== hasHillY) throw new Error('Include both hill_x and hill_y columns.');

  const rows = lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    const x = Number(record.x);
    const y = Number(record.y);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error(`Row ${rowIndex + 2} has a non-integer x or y value.`);
    }
    for (const field of ['start', 'finish']) {
      if (record[field] !== '0' && record[field] !== '1') {
        throw new Error(`Row ${rowIndex + 2} must use 0 or 1 for ${field}.`);
      }
    }
    if (record.in && record.in !== '0' && record.in !== '1') {
      throw new Error(`Row ${rowIndex + 2} must use 0 or 1 for in.`);
    }
    const hillX = hasHillX && record.hill_x !== '' ? Number(record.hill_x) : 0;
    const hillY = hasHillY && record.hill_y !== '' ? Number(record.hill_y) : 0;
    if (
      !Number.isInteger(hillX) ||
      !Number.isInteger(hillY) ||
      Math.abs(hillX) > 3 ||
      Math.abs(hillY) > 3
    ) {
      throw new Error(`Row ${rowIndex + 2} must use hill components from -3 through 3.`);
    }
    return {
      x,
      y,
      inBounds: record.in ? record.in === '1' : true,
      start: record.start === '1',
      finish: record.finish === '1',
      hillX,
      hillY
    };
  });

  const uniqueCoordinates = new Set<string>();
  for (const row of rows) {
    const key = pointKey(row);
    if (uniqueCoordinates.has(key)) throw new Error(`Duplicate coordinate: ${key}`);
    uniqueCoordinates.add(key);
  }

  const points = rows.filter((row) => row.inBounds).map(({ x, y }) => ({ x, y }));
  const starts = rows.filter((row) => row.start).map(({ x, y }) => ({ x, y }));
  const finishes = rows.filter((row) => row.finish).map(({ x, y }) => ({ x, y }));
  const hills = rows
    .filter((row) => row.inBounds && (row.hillX !== 0 || row.hillY !== 0))
    .map(({ x, y, hillX, hillY }) => ({ x, y, push: { x: hillX, y: hillY } }));
  const selected = new Set(points.map(pointKey));

  if (starts.length !== 1) throw new Error('Mark exactly one in-bounds row with start=1.');
  if (finishes.length !== 2) throw new Error('Mark exactly two in-bounds rows with finish=1.');
  if (!selected.has(pointKey(starts[0]))) throw new Error('The start point must also have in=1.');
  if (!finishes.every((point) => selected.has(pointKey(point)))) {
    throw new Error('Both finish endpoints must also have in=1.');
  }
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const track: TrackConfig = {
    bounds: {
      minX: Math.min(...xValues),
      maxX: Math.max(...xValues),
      minY: Math.min(...yValues),
      maxY: Math.max(...yValues)
    },
    points,
    start: starts[0],
    finish: finishes as [Point, Point],
    hills
  };

  if (!validateTrackConfig(track)) throw new Error('The course data is invalid.');
  return track;
}
