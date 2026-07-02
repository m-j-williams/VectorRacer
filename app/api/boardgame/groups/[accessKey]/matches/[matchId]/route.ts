import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

type Context = { params: Promise<{ accessKey: string; matchId: string }> };

export async function DELETE(_request: Request, context: Context) {
  const { accessKey, matchId } = await context.params;
  const admin = createAdminClient();
  const { data: group } = await admin.from('boardgame_groups').select('id').eq('access_key', accessKey).maybeSingle();
  if (!group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
  const { error } = await admin.from('boardgame_matches').delete().eq('id', matchId).eq('group_id', group.id);
  if (error) return NextResponse.json({ error: 'Unable to delete the match.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
