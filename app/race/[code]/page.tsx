import { redirect } from 'next/navigation';

export default async function LegacyStudentRacePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/tools/vector-racer/race/${code}`);
}
