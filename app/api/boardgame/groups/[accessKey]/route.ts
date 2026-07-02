import { NextResponse } from 'next/server';
import { calculateBoardgameRatings, type BoardgameMatch } from '@/lib/boardgame-elo';
import { createAdminClient } from '@/lib/supabase-admin';

type Context = { params: Promise<{ accessKey: string }> };

async function findGroup(accessKey: string) {
  return createAdminClient()
    .from('boardgame_groups')
    .select('id, name, created_at, elo_starting_score, elo_sensitivity')
    .eq('access_key', accessKey)
    .maybeSingle();
}

export async function GET(_request: Request, context: Context) {
  const { accessKey } = await context.params;
  const { data: group, error: groupError } = await findGroup(accessKey);
  if (groupError || !group) {
    return NextResponse.json({ error: 'Group not found. Check that the full link was copied.' }, { status: 404 });
  }

  const admin = createAdminClient();
  const [playersResult, gamesResult, matchesResult] = await Promise.all([
    admin.from('boardgame_players').select('id, name, created_at').eq('group_id', group.id).order('name'),
    admin.from('boardgame_games').select('id, name').eq('group_id', group.id).order('name'),
    admin.from('boardgame_matches').select(`
      id, played_at, length_hours, notes, game_id,
      game:boardgame_games(name),
      participants:boardgame_match_participants(player_id, rank, score, player:boardgame_players(name))
    `).eq('group_id', group.id).order('played_at', { ascending: false })
  ]);

  const error = playersResult.error || gamesResult.error || matchesResult.error;
  if (error) {
    console.error('Unable to load board-game group', error);
    return NextResponse.json({ error: 'Unable to load this group.' }, { status: 500 });
  }

  const matches = (matchesResult.data ?? []) as unknown as BoardgameMatch[];
  return NextResponse.json({
    group,
    players: playersResult.data ?? [],
    games: gamesResult.data ?? [],
    matches,
    ratings: calculateBoardgameRatings(matches, group.elo_starting_score, group.elo_sensitivity)
  });
}

export async function PATCH(request: Request, context: Context) {
  const { accessKey } = await context.params;
  const { data: group } = await findGroup(accessKey);
  if (!group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const starting = Number(body.eloStartingScore);
  const sensitivity = Number(body.eloSensitivity);
  if (!name || name.length > 80 || !Number.isInteger(starting) || starting < 0 || starting > 10000 ||
      !Number.isInteger(sensitivity) || sensitivity < 1 || sensitivity > 200) {
    return NextResponse.json({ error: 'Check the group name and Elo values.' }, { status: 400 });
  }

  const { error } = await createAdminClient().from('boardgame_groups').update({
    name,
    elo_starting_score: starting,
    elo_sensitivity: sensitivity
  }).eq('id', group.id);
  if (error) return NextResponse.json({ error: 'Unable to save settings.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
