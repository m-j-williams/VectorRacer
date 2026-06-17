import { copyFile } from 'node:fs/promises';

await copyFile(
  new URL('./example-course-grid.csv', import.meta.url),
  new URL('../public/course-example.csv', import.meta.url)
);
