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

Course files use these columns:

```csv
x,y,start,finish,hill_x,hill_y
-9,-4,0,0,0,0
9,0,1,0,0,0
6,0,0,1,0,0
9,0,0,1,0,0
-3,5,0,0,1,0
```

- `x` and `y` are integer lattice coordinates.
- Every listed coordinate is an in-bounds course point; omitted coordinates are out of bounds.
- Older files with an `in` column remain supported.
- Exactly one in-bounds row must have `start=1`.
- Exactly two in-bounds rows must have `finish=1`; those points are the endpoints of an invisible finish gate.
- The start may lie on the finish gate. In that case, endpoint order defines the finishing direction: crossing toward the left side of the directed line counts.
- Optional `hill_x` and `hill_y` values from `-3` through `3` define an automatic acceleration applied when a racer starts a turn on that point. For example, `1,0` pushes right, `-1,1` pushes left and up, and `0,3` applies a three-unit upward push. Omit both columns for courses without hills.
- A lap finishes when a racer crosses the gate toward the side containing the start point.

The board infers its coordinate range from the listed track points. In-bounds points are rendered using the diamond and center-fill construction.

Course coloring is implemented by the reusable `LatticeRegion` component. Finish and hill regions use the same diamond and center-fill rules with distinct colors; hill points also render directional arrowheads.

Movement crashes are determined from the complete line segment between the old and new positions. The server samples the segment against the same diamond-and-center-fill course region. A move crashes if any sampled point leaves the region, even when both endpoints are in bounds. The car is returned to the track point nearest its first out-of-bounds position with zero velocity. Recovery takes `max(0, floor(speed) - 1)` resolved rounds, using the impact velocity.

The current MVP uses uploaded lattice tracks and server-side move validation. It is structured for Vercel deployment with Supabase as the database and realtime backend.
