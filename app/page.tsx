import { ArrowRight, Flag, Orbit, Plus } from 'lucide-react';
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

          <div className="tool-card tool-card-placeholder">
            <div className="tool-card-icon" aria-hidden="true">
              <Plus size={28} />
            </div>
            <div className="stack tool-card-copy">
              <div>
                <span className="tool-status">Growing collection</span>
                <h3>Your next tool</h3>
              </div>
              <p>
                New activities can share this design system, Supabase project, and Vercel
                deployment.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
