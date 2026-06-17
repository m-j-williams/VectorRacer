import { NextResponse } from 'next/server';
import { getRaceStateByCode } from '@/lib/race-data';
import { resolveTurnByCode } from '@/lib/resolve-turn';

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  await resolveTurnByCode(code);
  const race = await getRaceStateByCode(code);
  if (!race) {
    return NextResponse.json({ error: 'Race not found.' }, { status: 404 });
  }

  return NextResponse.json(race);
}
