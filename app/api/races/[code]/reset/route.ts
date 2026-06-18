import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await request.json().catch(() => null);
    const instructorKey = String(body?.instructorKey || '').trim();

    if (instructorKey.length < 24) {
      return NextResponse.json({ error: 'Missing instructor key.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: race, error: raceError } = await admin
      .from('races')
      .select('id, code, track_config, turn_duration_seconds, participants(id)')
      .eq('code', code.toUpperCase())
      .eq('instructor_key', instructorKey)
      .single();

    if (raceError || !race) {
      return NextResponse.json({ error: 'Unable to reset this race from this browser.' }, { status: 403 });
    }

    const { error: moveError } = await admin.from('moves').delete().eq('race_id', race.id);
    if (moveError) {
      return NextResponse.json({ error: moveError.message }, { status: 400 });
    }

    const { error: selectionError } = await admin.from('turn_selections').delete().eq('race_id', race.id);
    if (selectionError) {
      return NextResponse.json({ error: selectionError.message }, { status: 400 });
    }

    const { error: participantError } = await admin
      .from('participants')
      .update({
        position_x: race.track_config.start.x,
        position_y: race.track_config.start.y,
        velocity_x: 0,
        velocity_y: 0,
        turn_count: 0,
        recovery_turns_remaining: 0,
        checkpoint_crossed: false,
        finish_turns: null,
        status: 'racing',
        finished_at: null
      })
      .eq('race_id', race.id);

    if (participantError) {
      return NextResponse.json({ error: participantError.message }, { status: 400 });
    }

    const { error: raceUpdateError } = await admin
      .from('races')
      .update({
        status: 'lobby',
        turn_number: 1,
        turn_deadline: null,
        paused_turn_seconds: race.turn_duration_seconds,
        started_at: null,
        turn_resolving: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', race.id);

    if (raceUpdateError) {
      return NextResponse.json({ error: raceUpdateError.message }, { status: 400 });
    }

    return NextResponse.json({ code: race.code });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reset race.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
