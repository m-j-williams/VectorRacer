# Vector Racer

An online classroom version of the paper-and-pencil Racetrack game for teaching vectors, velocity, and acceleration.

## Local setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL, anon key, and service role key.
3. Run the SQL in `supabase/migrations/20260610000000_initial_schema.sql`.
4. Install dependencies and start Next.js:

```bash
npm install
npm run dev
```

## Classroom flow

- Instructors upload a course CSV, start a race, and share the short race code. No account is required.
- Students join with that code, choose a display name, and select an acceleration vector each step.
- Each round gives students 20 seconds to lock in an acceleration vector.
- When every active student has selected, or the countdown expires, all cars move together.
- Students who do not select before the deadline receive acceleration `(0,0)` for that round.
- Each move updates position by adding acceleration to velocity, then adding velocity to position.

## Course CSV

Course files can be uploaded as a spreadsheet-style grid. Leave out-of-bounds cells blank and label each in-bounds grid point with one of these values:

```csv
,,o,o,o,o,s,o,o
,o,o,o,o,o,s,o,o
o,o,o,,,,s,o,o
u,u,o,,,,o,r,r
```

- `o` marks an ordinary in-bounds point.
- `s` marks the start/finish line. The `s` cells must form one horizontal or vertical line; the middle `s` is the start point and the endpoints are the finish gate.
- `u`, `r`, `l`, and `d` mark hill points that push up, right, left, or down. Repeating a letter increases the push, up to 3 units.
- Empty cells are out of bounds.
- The older coordinate-column format with `x,y,start,finish,hill_x,hill_y` remains supported.
- A lap finishes when a racer crosses the gate toward the side containing the start point.

The board infers its coordinate range from the listed track points. In-bounds points are rendered using the diamond and center-fill construction.

Course coloring is implemented by the reusable `LatticeRegion` component. Finish and hill regions use the same diamond and center-fill rules with distinct colors; hill points also render directional arrowheads.

Movement crashes are determined from the complete line segment between the old and new positions. The server samples the segment against the same diamond-and-center-fill course region. A move crashes if any sampled point leaves the region, even when both endpoints are in bounds. The car is returned to the track point nearest its first out-of-bounds position with zero velocity. Recovery takes `max(0, floor(speed) - 1)` resolved rounds, using the impact velocity.

The current MVP uses uploaded lattice tracks and server-side move validation. It is structured for Vercel deployment with Supabase as the database and realtime backend.
