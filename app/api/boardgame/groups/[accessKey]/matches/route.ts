import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

type Context = { params: Promise<{ accessKey: string }> };
type InputParticipant = { name?: unknown; rank?: unknown; score?: unknown };

export async function POST(request: Request, context: Context) {
  const { accessKey } = await context.params;
  const body = await request.json().catch(() => ({}));
  const gameName = typeof body.gameName === 'string' ? body.gameName.trim() : '';
  const participants = Array.isArray(body.participants) ? body.participants as InputParticipant[] : [];
  const normalized = participants.map((item) => ({
    name: typeof item.name === 'string' ? item.name.trim() : '',
    rank: Number(item.rank),
    score: item.score === '' || item.score == null ? null : Number(item.score)
  }));
  if (!gameName || normalized.length < 2 || normalized.some((p) => !p.name || !Number.isInteger(p.rank) || p.rank < 1)) {
    return NextResponse.json({ error: 'Enter a game and at least two players with valid ranks.' }, { status: 400 });
  }
  if (new Set(normalized.map((p) => p.name.toLocaleLowerCase())).size !== normalized.length) {
    return NextResponse.json({ error: 'Each player can appear only once in a match.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: group } = await admin.from('boardgame_groups').select('id').eq('access_key', accessKey).maybeSingle();
  if (!group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });

  let { data: game } = await admin.from('boardgame_games').select('id').eq('group_id', group.id).ilike('name', gameName).maybeSingle();
  if (!game) {
    const result = await admin.from('boardgame_games').insert({ group_id: group.id, name: gameName }).select('id').single();
    if (result.error) return NextResponse.json({ error: 'Unable to create the game.' }, { status: 500 });
    game = result.data;
  }

  const playerIds: string[] = [];
  for (const participant of normalized) {
    let { data: player } = await admin.from('boardgame_players').select('id').eq('group_id', group.id).ilike('name', participant.name).maybeSingle();
    if (!player) {
      const result = await admin.from('boardgame_players').insert({ group_id: group.id, name: participant.name }).select('id').single();
      if (result.error) return NextResponse.json({ error: `Unable to add ${participant.name}.` }, { status: 500 });
      player = result.data;
    }
    playerIds.push(player.id);
  }

  const playedAt = typeof body.playedAt === 'string' && body.playedAt ? new Date(body.playedAt) : new Date();
  if (Number.isNaN(playedAt.getTime())) return NextResponse.json({ error: 'Enter a valid date.' }, { status: 400 });
  const lengthHours = body.lengthHours === '' || body.lengthHours == null ? null : Number(body.lengthHours);
  if (lengthHours !== null && (!Number.isFinite(lengthHours) || lengthHours < 0)) {
    return NextResponse.json({ error: 'Duration must be a positive number.' }, { status: 400 });
  }

  const { data: match, error: matchError } = await admin.from('boardgame_matches').insert({
    group_id: group.id,
    game_id: game.id,
    played_at: playedAt.toISOString(),
    length_hours: lengthHours,
    notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
  }).select('id').single();
  if (matchError) return NextResponse.json({ error: 'Unable to record the match.' }, { status: 500 });

  const { error: participantsError } = await admin.from('boardgame_match_participants').insert(
    normalized.map((participant, index) => ({
      match_id: match.id,
      player_id: playerIds[index],
      rank: participant.rank,
      score: participant.score
    }))
  );
  if (participantsError) {
    await admin.from('boardgame_matches').delete().eq('id', match.id);
    return NextResponse.json({ error: 'Unable to save match results.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
