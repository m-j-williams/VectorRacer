import { writeFile } from 'node:fs/promises';

const bounds = { minX: -10, maxX: 10, minY: -7, maxY: 7 };
const start = { x: 8, y: 0 };
const finish = new Set(['6,0', '9,0']);
const rows = ['x,y,start,finish,hill_x,hill_y'];

for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    const insideOuter = Math.abs(x) <= 9 && Math.abs(y) <= 5;
    const insideHole = Math.abs(x) <= 5 && Math.abs(y) <= 2;
    const inBounds = insideOuter && !insideHole;
    if (inBounds) {
      const onHill = y >= 3 && y <= 5 && x >= -3 && x <= 2;
      rows.push(
        [
          x,
          y,
          x === start.x && y === start.y ? 1 : 0,
          finish.has(`${x},${y}`) ? 1 : 0,
          onHill ? 1 : 0,
          0
        ].join(',')
      );
    }
  }
}

await writeFile(new URL('../public/course-example.csv', import.meta.url), `${rows.join('\n')}\n`);
