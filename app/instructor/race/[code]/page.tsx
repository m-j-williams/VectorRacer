import Link from 'next/link';
import { InstructorRaceClient } from '@/components/InstructorRaceClient';
import { getRaceStateByCode } from '@/lib/race-data';

export const dynamic = 'force-dynamic';

export default async function InstructorRacePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const race = await getRaceStateByCode(code);

  if (!race) {
    return (
      <section className="band stack">
        <h1>Race not found</h1>
        <Link className="button" href="/instructor">
          Back to dashboard
        </Link>
      </section>
    );
  }

  return <InstructorRaceClient initialRace={race} />;
}
