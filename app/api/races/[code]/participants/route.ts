import { NextResponse } from 'next/server';
import { colorForIndex } from '@/lib/game';
import { createAdminClient } from '@/lib/supabase-admin';
import { getRaceStateByCode } from '@/lib/race-data';

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = await request.json().catch(() => null);
  const displayName = String(body?.displayName || '').trim().slice(0, 24);

  if (displayName.length < 1) {
    return NextResponse.json({ error: 'Enter a display name.' }, { status: 400 });
  }

  const race = await getRaceStateByCode(code);
  if (!race || race.status === 'finished') {
    return NextResponse.json({ error: 'Race is not open.' }, { status: 404 });
  }

  if (race.participants.some((participant) => participant.display_name.toLowerCase() === displayName.toLowerCase())) {
    return NextResponse.json({ error: 'That name is already taken in this race.' }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('participants')
    .insert({
      race_id: race.id,
      display_name: displayName,
      color: colorForIndex(race.participants.length),
      position_x: race.track_config.start.x,
      position_y: race.track_config.start.y,
      velocity_x: 0,
      velocity_y: 0,
      checkpoint_crossed: false,
      finish_turns: null
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (race.status === 'running' && !race.turn_deadline) {
    await admin
      .from('races')
      .update({
        turn_deadline: new Date(Date.now() + race.turn_duration_seconds * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', race.id)
      .is('turn_deadline', null);
  }

  return NextResponse.json({ participant: data });
}
