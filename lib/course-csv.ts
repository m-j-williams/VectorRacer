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
  if (!headers.includes('x') || !headers.includes('y')) return parseGridCourseCsv(lines);

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

function parseGridCourseCsv(lines: string[]): TrackConfig {
  const grid = lines.map(parseCsvLine);
  const rows = grid.length;
  const points: Point[] = [];
  const starts: Point[] = [];
  const hills: { x: number; y: number; push: { x: number; y: number } }[] = [];

  grid.forEach((row, rowIndex) => {
    row.forEach((rawCell, columnIndex) => {
      const cell = rawCell.toLowerCase().replace(/\s+/g, '');
      if (!cell) return;
      if (!/^[osurld]+$/.test(cell)) {
        throw new Error(`Grid cell ${columnIndex + 1},${rowIndex + 1} uses an unknown label: ${rawCell}`);
      }

      const point = { x: columnIndex, y: rows - 1 - rowIndex };
      points.push(point);
      if (cell.includes('s')) starts.push(point);

      const push = {
        x: [...cell].filter((char) => char === 'r').length - [...cell].filter((char) => char === 'l').length,
        y: [...cell].filter((char) => char === 'u').length - [...cell].filter((char) => char === 'd').length
      };
      if (Math.abs(push.x) > 3 || Math.abs(push.y) > 3) {
        throw new Error(`Grid cell ${columnIndex + 1},${rowIndex + 1} has too much hill push.`);
      }
      if (push.x !== 0 || push.y !== 0) hills.push({ ...point, push });
    });
  });

  if (points.length === 0) throw new Error('Mark at least one grid cell with o, s, u, r, l, or d.');
  if (starts.length < 2) throw new Error('Mark at least two grid cells with s for the start/finish line.');

  const sameX = starts.every((point) => point.x === starts[0].x);
  const sameY = starts.every((point) => point.y === starts[0].y);
  if (!sameX && !sameY) throw new Error('The s cells must form a horizontal or vertical start/finish line.');

  const sortedStarts = starts.slice().sort((a, b) => (sameX ? a.y - b.y : a.x - b.x));
  const start = sortedStarts[Math.floor(sortedStarts.length / 2)];
  const finish = [sortedStarts[0], sortedStarts[sortedStarts.length - 1]] as [Point, Point];
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
    start,
    finish,
    hills
  };

  if (!validateTrackConfig(track)) throw new Error('The grid course data is invalid.');
  return track;
}
