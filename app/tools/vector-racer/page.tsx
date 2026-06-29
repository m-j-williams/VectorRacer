import { ArrowRight, Flag, Gauge } from 'lucide-react';
import Link from 'next/link';

export const metadata = {
  title: 'Vector Racer | Classroom Tools',
  description: 'A classroom vector racing game for physics instruction.'
};

export default function VectorRacerHome() {
  return (
    <div className="grid-2">
      <section className="hero stack">
        <span className="eyebrow">Classroom Tools / Vector Racer</span>
        <div>
          <h1>Vector racing for the physics classroom.</h1>
          <p>
            Students steer by choosing acceleration. The app turns each choice into velocity,
            displacement, and a visible path around the track.
          </p>
        </div>
        <div className="row">
          <Link className="button" href="/tools/vector-racer/instructor">
            <Flag size={18} />
            Start a race
          </Link>
          <a className="button secondary" href="#join">
            <Gauge size={18} />
            Join with code
          </a>
        </div>
      </section>

      <section id="join" className="band stack">
        <h2>Student Join</h2>
        <form action="/tools/vector-racer/race" className="stack">
          <div>
            <label className="label" htmlFor="code">
              Race code
            </label>
            <input
              className="input"
              id="code"
              name="code"
              placeholder="ABCDE"
              maxLength={5}
              required
            />
          </div>
          <button className="button" type="submit">
            <ArrowRight size={18} />
            Enter race
          </button>
        </form>
      </section>
    </div>
  );
}
