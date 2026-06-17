import { NextResponse } from 'next/server';
import { isLegalAcceleration } from '@/lib/game';
import { resolveTurnByCode } from '@/lib/resolve-turn';
import { createAdminClient } from '@/lib/supabase-admin';

type SelectionParticipant = {
  id: string;
  race_id: string;
  recovery_turns_remaining: number;
  status: 'racing' | 'crashed' | 'finished';
  races: {
    code: string;
    status: 'lobby' | 'running' | 'finished';
    turn_number: number;
    turn_resolving: boolean;
  };
};

export async function POST(request: Request, { params }: { params: Promise<{ participantId: string }> }) {
  const { participantId } = await params;
  const body = await request.json().catch(() => null);
  const acceleration = body?.acceleration;
  const submitted = body?.submitted !== false;

  if (!isLegalAcceleration(acceleration)) {
    return NextResponse.json(
      { error: 'Acceleration may use at most two total units across both axes.' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: participant, error } = await admin
    .from('participants')
    .select('id,race_id,status,recovery_turns_remaining,races(code,status,turn_number,turn_resolving)')
    .eq('id', participantId)
    .single<SelectionParticipant>();

  if (error || !participant) {
    return NextResponse.json({ error: 'Driver not found.' }, { status: 404 });
  }
  if (
    participant.status !== 'racing' ||
    participant.recovery_turns_remaining > 0 ||
    participant.races.status !== 'running' ||
    participant.races.turn_resolving
  ) {
    return NextResponse.json({ error: 'This driver cannot select a move right now.' }, { status: 400 });
  }

  const { error: selectionError } = await admin.from('turn_selections').upsert(
    {
      race_id: participant.race_id,
      participant_id: participant.id,
      turn_number: participant.races.turn_number,
      acceleration_x: acceleration.x,
      acceleration_y: acceleration.y,
      submitted
    },
    { onConflict: 'participant_id,turn_number' }
  );

  if (selectionError) {
    return NextResponse.json({ error: selectionError.message }, { status: 400 });
  }

  if (submitted) await resolveTurnByCode(participant.races.code);
  return NextResponse.json({ message: submitted ? 'Acceleration locked in.' : 'Acceleration selected.' });
}
