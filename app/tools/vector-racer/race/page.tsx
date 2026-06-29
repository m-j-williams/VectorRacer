import { redirect } from 'next/navigation';

export default async function RaceRedirect({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code: rawCode } = await searchParams;
  const code = rawCode?.trim().toUpperCase();
  redirect(code ? `/tools/vector-racer/race/${code}` : '/tools/vector-racer');
}
