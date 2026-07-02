import { ArrowRight, CalendarDays, CloudSun, Dices, Flag, Orbit, Spade } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="stack home-stack">
      <section className="hero hub-hero stack">
        <span className="eyebrow">Classroom Tools</span>
        <div>
          <h1>Small tools for active classrooms.</h1>
          <p>
            A growing collection of interactive activities for teaching, exploring, and learning
            together.
          </p>
        </div>
      </section>

      <section className="stack" aria-labelledby="tools-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Explore</span>
            <h2 id="tools-heading">Choose a tool</h2>
          </div>
          <p className="muted">More classroom experiments are on the way.</p>
        </div>

        <div className="tool-grid">
          <Link className="tool-card climate-tool-card" href="/tools/climate-model">
            <div className="tool-card-icon" aria-hidden="true"><CloudSun size={28} /></div>
            <div className="stack tool-card-copy"><div><span className="tool-status">Interactive model</span><h3>Earth Energy Balance</h3></div><p>Trace sunlight and heat through a one-layer atmosphere, then change albedo and greenhouse strength.</p></div>
            <span className="tool-card-link">Open model <ArrowRight size={18} /></span>
          </Link>
          <Link className="tool-card" href="/tools/vector-racer">
            <div className="tool-card-icon" aria-hidden="true">
              <Flag size={28} />
            </div>
            <div className="stack tool-card-copy">
              <div>
                <span className="tool-status">Available now</span>
                <h3>Vector Racer</h3>
              </div>
              <p>
                Steer with acceleration vectors and watch velocity, displacement, and motion come
                alive on the track.
              </p>
            </div>
            <span className="tool-card-link">
              Open tool <ArrowRight size={18} />
            </span>
          </Link>

          <Link className="tool-card solar-tool-card" href="/tools/solar-system">
            <div className="tool-card-icon" aria-hidden="true">
              <Orbit size={28} />
            </div>
            <div className="stack tool-card-copy">
              <div>
                <span className="tool-status">Live view</span>
                <h3>Solar System Now</h3>
              </div>
              <p>
                See the current positions of the Sun, Moon, Earth, and the five naked-eye planets.
              </p>
            </div>
            <span className="tool-card-link">
              Open tool <ArrowRight size={18} />
            </span>
          </Link>

          <Link className="tool-card calendar-tool-card" href="/tools/dot-calendar">
            <div className="tool-card-icon" aria-hidden="true">
              <CalendarDays size={28} />
            </div>
            <div className="stack tool-card-copy">
              <div>
                <span className="tool-status">Available now</span>
                <h3>Dot Calendar</h3>
              </div>
              <p>
                Turn any stretch of time into a seven-day-wide field, with one dot for every day.
              </p>
            </div>
            <span className="tool-card-link">
              Open tool <ArrowRight size={18} />
            </span>
          </Link>

          <Link className="tool-card cribbage-tool-card" href="/tools/next-move-cribbage">
            <div className="tool-card-icon" aria-hidden="true">
              <Spade size={28} />
            </div>
            <div className="stack tool-card-copy">
              <div>
                <span className="tool-status">New hand daily</span>
                <h3>Next Move — Cribbage</h3>
              </div>
              <p>Choose two cards for the crib, then compare your move with the crowd and the book.</p>
            </div>
            <span className="tool-card-link">Play today’s hand <ArrowRight size={18} /></span>
          </Link>

          <Link className="tool-card boardgame-tool-card" href="/tools/boardgame-leaderboard">
            <div className="tool-card-icon" aria-hidden="true"><Dices size={28} /></div>
            <div className="stack tool-card-copy"><div><span className="tool-status">Private by link</span><h3>Boardgame Leaderboard</h3></div><p>Record game-night results, follow Elo ratings, and settle the table’s most important arguments.</p></div>
            <span className="tool-card-link">Create a group <ArrowRight size={18} /></span>
          </Link>

        </div>
      </section>
    </div>
  );
}
