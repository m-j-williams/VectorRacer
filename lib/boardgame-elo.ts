export type BoardgameParticipant = {
  player_id: string;
  rank: number;
  score: number | null;
  player: { name: string } | null;
};

export type BoardgameMatch = {
  id: string;
  played_at: string;
  length_hours: number | null;
  notes: string | null;
  game_id: string;
  game: { name: string } | null;
  participants: BoardgameParticipant[];
};

export type BoardgameRating = {
  playerId: string;
  playerName: string;
  gameId: string;
  gameName: string;
  elo: number;
  gamesPlayed: number;
};

export function calculateBoardgameRatings(
  matches: BoardgameMatch[],
  startingElo = 1000,
  kFactor = 32
) {
  const ratings = new Map<string, BoardgameRating>();
  const ordered = [...matches].sort(
    (a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime()
  );

  for (const match of ordered) {
    const players = match.participants.map((participant) => {
      const key = `${match.game_id}:${participant.player_id}`;
      const current = ratings.get(key) ?? {
        playerId: participant.player_id,
        playerName: participant.player?.name ?? 'Unknown player',
        gameId: match.game_id,
        gameName: match.game?.name ?? 'Unknown game',
        elo: startingElo,
        gamesPlayed: 0
      };
      ratings.set(key, current);
      return { key, participant, current };
    });

    const deltas = new Map(players.map(({ key }) => [key, 0]));
    for (let i = 0; i < players.length; i += 1) {
      for (let j = i + 1; j < players.length; j += 1) {
        const a = players[i];
        const b = players[j];
        const actualA = a.participant.rank === b.participant.rank
          ? 0.5
          : a.participant.rank < b.participant.rank ? 1 : 0;
        const expectedA = 1 / (1 + 10 ** ((b.current.elo - a.current.elo) / 400));
        const change = kFactor * (actualA - expectedA);
        deltas.set(a.key, (deltas.get(a.key) ?? 0) + change);
        deltas.set(b.key, (deltas.get(b.key) ?? 0) - change);
      }
    }

    for (const { key, current } of players) {
      ratings.set(key, {
        ...current,
        elo: current.elo + (deltas.get(key) ?? 0),
        gamesPlayed: current.gamesPlayed + 1
      });
    }
  }

  return [...ratings.values()].sort((a, b) => b.elo - a.elo);
}
