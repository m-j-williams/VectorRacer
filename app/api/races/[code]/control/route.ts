import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

type ControlAction = 'start' | 'pause' | 'set-duration';

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await request.json().catch(() => null);
    const instructorKey = String(body?.instructorKey || '').trim();
    const action = body?.action as ControlAction;

    if (instructorKey.length < 24) {
      return NextResponse.json({ error: 'Missing instructor key.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: race, error } = await admin
      .from('races')
      .select('id,code,status,turn_duration_seconds,turn_deadline,paused_turn_seconds,started_at,turn_resolving')
      .eq('code', code.toUpperCase())
      .eq('instructor_key', instructorKey)
      .single();

    if (error || !race) {
      return NextResponse.json({ error: 'Unable to control this race from this browser.' }, { status: 403 });
    }
    if (race.status === 'finished') {
      return NextResponse.json({ error: 'This race has ended.' }, { status: 400 });
    }
    if (race.turn_resolving) {
      return NextResponse.json({ error: 'Cars are moving. Try again in a moment.' }, { status: 409 });
    }

    const now = Date.now();
    let updates: Record<string, unknown>;

    if (action === 'start') {
      const seconds = Math.max(1, race.paused_turn_seconds || race.turn_duration_seconds);
      updates = {
        status: 'running',
        turn_deadline: new Date(now + seconds * 1000).toISOString(),
        paused_turn_seconds: null,
        started_at: race.started_at || new Date(now).toISOString(),
        turn_resolving: false
      };
    } else if (action === 'pause') {
      if (race.status !== 'running') {
        return NextResponse.json({ error: 'The race is already paused.' }, { status: 400 });
      }
      const remaining = race.turn_deadline
        ? Math.max(1, Math.ceil((new Date(race.turn_deadline).getTime() - now) / 1000))
        : race.turn_duration_seconds;
      updates = {
        status: 'lobby',
        turn_deadline: null,
        paused_turn_seconds: remaining,
        turn_resolving: false
      };
    } else if (action === 'set-duration') {
      const duration = Number(body?.duration);
      if (!Number.isInteger(duration) || duration < 5 || duration > 300) {
        return NextResponse.json({ error: 'Turn time must be between 5 and 300 seconds.' }, { status: 400 });
      }
      updates = {
        turn_duration_seconds: duration,
        ...(race.status === 'running'
          ? { turn_deadline: new Date(now + duration * 1000).toISOString() }
          : { paused_turn_seconds: duration })
      };
    } else {
      return NextResponse.json({ error: 'Unknown race control.' }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from('races')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', race.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    return NextResponse.json({ code: race.code });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to control race.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
