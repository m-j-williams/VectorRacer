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
    const { data, error } = await admin
      .from('races')
      .update({
        status: 'finished',
        turn_deadline: null,
        paused_turn_seconds: null,
        turn_resolving: false,
        updated_at: new Date().toISOString()
      })
      .eq('code', code.toUpperCase())
      .eq('instructor_key', instructorKey)
      .select('code')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Unable to end this race from this browser.' }, { status: 403 });
    }

    return NextResponse.json({ code: data.code });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to end race.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
