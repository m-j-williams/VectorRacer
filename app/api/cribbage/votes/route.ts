import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

type VoteRow = { discard_key: string };

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

function validOwner(value: string) {
  return value === 'player' || value === 'opponent';
}

function validKey(value: string, max: number) {
  return value.length > 0 && value.length <= max && /^[A2-9JQK10♠♥♦♣,\-]+$/.test(value);
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function aggregate(rows: VoteRow[]) {
  const counts: Record<string, number> = {};
  rows.forEach((row) => { counts[row.discard_key] = (counts[row.discard_key] ?? 0) + 1; });
  return { counts, total: rows.length };
}

async function readVotes(day: string, handKey: string, cribOwner: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('cribbage_votes')
    .select('discard_key')
    .eq('challenge_date', day)
    .eq('hand_key', handKey)
    .eq('crib_owner', cribOwner);

  if (error) throw error;
  return aggregate((data ?? []) as VoteRow[]);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const day = searchParams.get('day') ?? '';
    const handKey = searchParams.get('hand') ?? '';
    const cribOwner = searchParams.get('owner') ?? '';
    if (!validDate(day) || !validKey(handKey, 64) || !validOwner(cribOwner)) {
      return NextResponse.json({ error: 'Invalid challenge.' }, { status: 400 });
    }
    return NextResponse.json(await readVotes(day, handKey, cribOwner));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load votes.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const day = String(body?.day ?? '');
    const handKey = String(body?.handKey ?? '');
    const cribOwner = String(body?.cribOwner ?? '');
    const discardKey = String(body?.discardKey ?? '');
    const voterId = String(body?.voterId ?? '');

    if (!validDate(day) || !validKey(handKey, 64) || !validOwner(cribOwner) || !validKey(discardKey, 16) || !validUuid(voterId)) {
      return NextResponse.json({ error: 'Invalid vote.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('cribbage_votes').upsert({
      challenge_date: day,
      hand_key: handKey,
      crib_owner: cribOwner,
      discard_key: discardKey,
      voter_id: voterId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'challenge_date,hand_key,crib_owner,voter_id' });

    if (error) throw error;
    return NextResponse.json(await readVotes(day, handKey, cribOwner));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save vote.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
