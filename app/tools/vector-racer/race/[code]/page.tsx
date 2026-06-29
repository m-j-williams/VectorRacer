import Link from 'next/link';
import { RaceClient } from '@/components/RaceClient';
import { getRaceStateByCode } from '@/lib/race-data';

export const dynamic = 'force-dynamic';

export default async function StudentRacePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const race = await getRaceStateByCode(code);

  if (!race) {
    return (
      <section className="band stack">
        <h1>Race not found</h1>
        <p className="lead">Check the code with your instructor.</p>
        <Link className="button" href="/tools/vector-racer">
          Back to Vector Racer
        </Link>
      </section>
    );
  }

  return <RaceClient initialRace={race} />;
}
