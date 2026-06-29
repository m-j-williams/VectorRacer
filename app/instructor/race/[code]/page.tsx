import { redirect } from 'next/navigation';

export default async function LegacyInstructorRacePage({
  params
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  redirect(`/tools/vector-racer/instructor/race/${code}`);
}
