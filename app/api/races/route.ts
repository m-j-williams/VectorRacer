import { NextResponse } from 'next/server';
import { createRaceCode, validateTrackConfig } from '@/lib/game';
import { createAdminClient } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const instructorKey = String(body?.instructorKey || '').trim();
    const trackConfig = body?.trackConfig;

    if (instructorKey.length < 24) {
      return NextResponse.json({ error: 'Missing instructor key.' }, { status: 400 });
    }
    if (!validateTrackConfig(trackConfig)) {
      return NextResponse.json({ error: 'Upload a valid course CSV.' }, { status: 400 });
    }

    const admin = createAdminClient();
    let code = createRaceCode();
    let attempts = 0;

    while (attempts < 6) {
      const { data, error } = await admin
        .from('races')
        .insert({
          code,
          instructor_key: instructorKey,
          track_config: trackConfig,
          status: 'lobby',
          turn_number: 1,
          turn_duration_seconds: 20,
          turn_deadline: null,
          paused_turn_seconds: 20,
          started_at: null,
          turn_resolving: false,
          show_current_velocity: false,
          show_potential_endpoints: false,
          show_chosen_velocity: false
        })
        .select('code')
        .single();

      if (!error && data) {
        return NextResponse.json({ code: data.code });
      }

      if (error?.code !== '23505') {
        return NextResponse.json({ error: error?.message || 'Unable to create race.' }, { status: 400 });
      }

      code = createRaceCode();
      attempts += 1;
    }

    return NextResponse.json({ error: 'Unable to create a unique race code.' }, { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create race.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
