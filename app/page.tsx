import { ArrowRight, Flag, Gauge } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="grid-2">
      <section className="hero stack">
        <div>
          <h1>Vector racing for the physics classroom.</h1>
          <p>
            Students steer by choosing acceleration. The app turns each choice into velocity,
            displacement, and a visible path around the track.
          </p>
        </div>
        <div className="row">
          <Link className="button" href="/instructor">
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
        <form action="/race" className="stack">
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
