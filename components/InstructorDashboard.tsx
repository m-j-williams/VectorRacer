'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Plus, Trophy, Upload } from 'lucide-react';
import { TrackBoard } from '@/components/TrackBoard';
import { parseCourseCsv } from '@/lib/course-csv';
import { getInstructorKey } from '@/lib/instructor-key';
import { readJsonResponse } from '@/lib/http';
import type { TrackConfig } from '@/lib/game';

type LocalRace = {
  code: string;
  createdAt: string;
};

const racesStorageKey = 'vector-racer:instructor-races';

function readLocalRaces() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(racesStorageKey) || '[]') as LocalRace[];
  } catch {
    return [];
  }
}

function writeLocalRaces(races: LocalRace[]) {
  window.localStorage.setItem(racesStorageKey, JSON.stringify(races));
}

export function InstructorDashboard() {
  const [races, setRaces] = useState<LocalRace[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [course, setCourse] = useState<TrackConfig | null>(null);
  const [courseName, setCourseName] = useState('');

  useEffect(() => {
    queueMicrotask(() => {
      setRaces(readLocalRaces());
    });
  }, []);

  async function startRace() {
    if (!course) {
      setMessage('Upload a valid course CSV before starting the race.');
      return;
    }
    setBusy(true);
    setMessage('');

    try {
      const response = await fetch('/api/races', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructorKey: getInstructorKey(), trackConfig: course })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok || !payload.code) {
        setMessage(payload.error || 'Unable to start race.');
        return;
      }

      const nextRaces = [{ code: payload.code, createdAt: new Date().toISOString() }, ...races].slice(0, 12);
      writeLocalRaces(nextRaces);
      window.location.href = `/instructor/race/${payload.code}`;
    } catch {
      setMessage('Unable to reach the race server. Check that the dev server is running.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadCourse(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      loadCourse(await file.text(), file.name);
    } catch (error) {
      setCourse(null);
      setCourseName('');
      setMessage(error instanceof Error ? error.message : 'Unable to read the course CSV.');
    }
  }

  function loadCourse(csv: string, name: string) {
    const parsedCourse = parseCourseCsv(csv);
    setCourse(parsedCourse);
    setCourseName(name);
    setMessage('');
  }

  async function loadExampleCourse() {
    try {
      const response = await fetch('/course-example.csv');
      loadCourse(await response.text(), 'course-example.csv');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load the example course.');
    }
  }

  return (
    <div className="stack">
      <section className="band stack">
        <div>
          <h1>Instructor Dashboard</h1>
          <p className="lead">Upload a lattice course, start a race, and share the short code.</p>
        </div>
        <div className="row">
          <label className="label" htmlFor="course-file">
            Course CSV
          </label>
          <label className="button secondary" htmlFor="course-file">
            <Upload size={18} />
            Choose CSV
          </label>
          <a className="button secondary" download href="/course-example.csv">
            <Download size={18} />
            Download example
          </a>
          <button className="button secondary" onClick={loadExampleCourse} type="button">
            Load example
          </button>
          <input
            accept=".csv,text/csv"
            id="course-file"
            onChange={uploadCourse}
            style={{ display: 'none' }}
            type="file"
          />
        </div>
        {course ? (
          <div className="stack">
            <div className="row">
              <strong>{courseName}</strong>
              <span className="muted">{course.points.length} in-bounds points</span>
              {(course.hills?.length || 0) > 0 ? (
                <span className="muted">{course.hills?.length} hill points</span>
              ) : null}
            </div>
            <TrackBoard track={course} participants={[]} moves={[]} />
          </div>
        ) : null}
        <div className="row">
          <button className="button" disabled={busy || !course} onClick={startRace} type="button">
            <Plus size={18} />
            Start new race
          </button>
        </div>
        {message ? <div className="message error">{message}</div> : null}
      </section>

      <section className="band stack">
        <h2>Recent races on this device</h2>
        <ul className="leaderboard">
          {races.map((race) => (
            <li key={race.code}>
              <Trophy size={15} />
              <Link href={`/instructor/race/${race.code}`}>{race.code}</Link>
              <span className="muted">{new Date(race.createdAt).toLocaleDateString()}</span>
            </li>
          ))}
          {!races.length ? <p className="muted">No races started on this device yet.</p> : null}
        </ul>
      </section>
    </div>
  );
}
