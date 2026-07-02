import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80) {
    return NextResponse.json({ error: 'Enter a group name (80 characters or fewer).' }, { status: 400 });
  }

  const accessKey = randomBytes(24).toString('base64url');
  const { error } = await createAdminClient().from('boardgame_groups').insert({
    name,
    access_key: accessKey
  });
  if (error) {
    console.error('Unable to create board-game group', error);
    return NextResponse.json({ error: 'Unable to create the group.' }, { status: 500 });
  }

  return NextResponse.json({ accessKey }, { status: 201 });
}
